const crypto = require('crypto');
const pool = require('../db');
const { hashPassword } = require('../utils/password');
const { addError, hasErrors, isPositiveNumber } = require('../utils/validation');

const GUEST_COOKIE = 'guest_session_id';
const GUEST_PAYMENT_METHODS = [
  { id: 'cash_on_delivery', type: 'cash_on_delivery', label: 'Cash on Delivery' },
  { id: 'credit_card', type: 'credit_card', label: 'Credit Card' },
  { id: 'bank_transfer', type: 'bank_transfer', label: 'Bank Transfer' }
];

function isMissingSchemaError(err) {
  return Boolean(err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR'));
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set(rows.map((row) => row.Field || row.COLUMN_NAME));
}

function toAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

function buildOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${datePart}-${randomPart}`;
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
}

function getGuestSessionId(req, res) {
  const existing = req.cookies?.[GUEST_COOKIE];
  if (existing && typeof existing === 'string') {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  res.cookie(GUEST_COOKIE, sessionId, cookieOptions());
  return sessionId;
}

async function getOrCreateGuestCart(connection, sessionId) {
  const [rows] = await connection.query(
    `SELECT id, status
     FROM carts
     WHERE session_id = ? AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [sessionId]
  );
  if (rows[0]) {
    return rows[0];
  }
  const [result] = await connection.query(
    `INSERT INTO carts (session_id, status)
     VALUES (?, 'active')`,
    [sessionId]
  );
  return { id: result.insertId, status: 'active' };
}

async function listCartItems(connection, cartId) {
  const productColumns = await getTableColumns(connection, 'products');
  const cartItemColumns = await getTableColumns(connection, 'cart_items');
  const variantIdSelect = cartItemColumns.has('variant_id') ? 'ci.variant_id' : 'NULL AS variant_id';
  const skuSelect = productColumns.has('sku') ? 'p.sku AS sku' : 'NULL AS sku';
  const statusSelect = productColumns.has('status') ? 'p.status AS product_status' : `'active' AS product_status`;
  const [rows] = await connection.query(
    `SELECT
       ci.id,
       ci.cart_id,
       ci.product_id,
       ${variantIdSelect},
       ci.merchant_id,
       ci.branch_id,
       ci.quantity,
       ci.unit_price,
       ci.subtotal,
       p.name AS product_name,
       ${skuSelect},
       ${statusSelect}
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id ASC`,
    [cartId]
  );
  return rows;
}

function summarizeCart(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      acc.item_count += 1;
      acc.total_quantity += Number(item.quantity || 0);
      acc.total_amount = toAmount(acc.total_amount + Number(item.subtotal || 0));
      return acc;
    },
    { item_count: 0, total_quantity: 0, total_amount: 0 }
  );
}

async function buildCartResponse(connection, sessionId) {
  const cart = await getOrCreateGuestCart(connection, sessionId);
  const items = await listCartItems(connection, cart.id);
  const summary = summarizeCart(items);

  return {
    cart_id: cart.id,
    status: cart.status,
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      merchant_id: item.merchant_id,
      branch_id: item.branch_id,
      name: item.product_name || `Product #${item.product_id}`,
      sku: item.sku || null,
      quantity: Number(item.quantity || 0),
      unit_price: toAmount(item.unit_price),
      subtotal: toAmount(item.subtotal)
    })),
    ...summary
  };
}

async function loadProductForOrdering(connection, productId) {
  const productColumns = await getTableColumns(connection, 'products');
  const selectParts = [
    'p.id',
    productColumns.has('name') ? 'p.name' : 'NULL AS name',
    productColumns.has('sku') ? 'p.sku' : 'NULL AS sku',
    productColumns.has('base_price') ? 'p.base_price' : '0 AS base_price',
    productColumns.has('min_order_quantity') ? 'p.min_order_quantity' : '1 AS min_order_quantity',
    productColumns.has('max_order_quantity') ? 'p.max_order_quantity' : 'NULL AS max_order_quantity',
    productColumns.has('branch_id') ? 'p.branch_id' : 'NULL AS branch_id',
    productColumns.has('merchant_id') ? 'p.merchant_id' : 'NULL AS merchant_id',
    productColumns.has('status') ? 'p.status' : `'active' AS status`,
    productColumns.has('is_active') ? 'p.is_active' : '1 AS is_active'
  ];
  const [rows] = await connection.query(
    `SELECT
       ${selectParts.join(',\n       ')}
     FROM products p
     WHERE p.id = ?
     LIMIT 1`,
    [productId]
  );
  const product = rows[0] || null;
  if (!product) {
    return null;
  }
  let merchantId = product.merchant_id ? Number(product.merchant_id) : null;
  if (!merchantId && product.branch_id) {
    const [branchRows] = await connection.query(
      'SELECT merchant_id FROM branches WHERE id = ? LIMIT 1',
      [product.branch_id]
    );
    merchantId = branchRows[0]?.merchant_id ? Number(branchRows[0].merchant_id) : null;
  }
  return {
    ...product,
    merchant_id: merchantId
  };
}

async function ensureGuestBuyer(connection, sessionId, payload = {}) {
  const fallbackEmail = `guest-${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}@guest.local`;
  const email = String(payload.email || fallbackEmail).trim().toLowerCase();
  const firstName = String(payload.first_name || 'Guest').trim().slice(0, 120) || 'Guest';
  const lastName = String(payload.last_name || 'Checkout').trim().slice(0, 120) || 'Checkout';
  const companyName = String(payload.company_name || `${firstName} ${lastName}`).trim().slice(0, 255) || 'Guest Checkout';

  const [buyerRows] = await connection.query(
    'SELECT id FROM buyers WHERE email = ? LIMIT 1',
    [email]
  );
  let buyerId = buyerRows[0]?.id || null;
  if (!buyerId) {
    const [buyerResult] = await connection.query(
      `INSERT INTO buyers
       (company_name, email, phone, status)
       VALUES (?, ?, ?, 'active')`,
      [companyName, email, payload.phone ? String(payload.phone).trim() : null]
    );
    buyerId = buyerResult.insertId;
  }

  const roleName = 'Guest Buyer';
  const [roleRows] = await connection.query(
    'SELECT id FROM buyer_roles WHERE buyer_id = ? AND name = ? LIMIT 1',
    [buyerId, roleName]
  );
  let roleId = roleRows[0]?.id || null;
  if (!roleId) {
    const [roleResult] = await connection.query(
      `INSERT INTO buyer_roles (buyer_id, name, description, is_system)
       VALUES (?, ?, ?, 1)`,
      [buyerId, roleName, 'System role for guest checkout']
    );
    roleId = roleResult.insertId;
  }

  const [userRows] = await connection.query(
    'SELECT id FROM buyer_users WHERE email = ? LIMIT 1',
    [email]
  );
  let buyerUserId = userRows[0]?.id || null;
  if (!buyerUserId) {
    const passwordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
    const [userResult] = await connection.query(
      `INSERT INTO buyer_users
       (buyer_id, first_name, last_name, email, password_hash, phone, role_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [buyerId, firstName, lastName, email, passwordHash, payload.phone ? String(payload.phone).trim() : null, roleId]
    );
    buyerUserId = userResult.insertId;
  }

  return { buyerId, buyerUserId, email };
}

async function listProducts(req, res, next) {
  try {
    const connection = await pool.getConnection();
    try {
      const [productColumnsRows] = await connection.query('SHOW COLUMNS FROM products');
      const [imageTableRows] = await connection.query("SHOW TABLES LIKE 'product_images'");
      const hasProductImages = Array.isArray(imageTableRows) && imageTableRows.length > 0;
      const imageColumnsRows = hasProductImages
        ? (await connection.query('SHOW COLUMNS FROM product_images'))[0]
        : [];
      const productColumns = new Set(productColumnsRows.map((row) => row.Field));
      const imageColumns = new Set(imageColumnsRows.map((row) => row.Field));

      const productSelect = [
        'p.id',
        productColumns.has('name') ? 'p.name' : `CONCAT('Product #', p.id) AS name`,
        productColumns.has('slug') ? 'p.slug' : 'NULL AS slug',
        productColumns.has('description') ? 'p.description' : 'NULL AS description',
        productColumns.has('base_price') ? 'p.base_price' : '0 AS base_price',
        productColumns.has('provider_name') ? 'p.provider_name' : 'NULL AS provider_name',
        productColumns.has('branch_id') ? 'p.branch_id' : 'NULL AS branch_id',
        'b.name AS branch_name',
        'b.merchant_id',
        'm.name AS merchant_name',
        productColumns.has('status') ? 'p.status' : `'active' AS status`,
        productColumns.has('is_active') ? 'p.is_active' : '1 AS is_active',
        'pi.url AS image_url'
      ];

      const imageWhere = ['product_id = p.id'];
      if (imageColumns.has('is_active')) {
        imageWhere.push('is_active = 1');
      }

      const imageOrder = [];
      if (imageColumns.has('is_primary')) {
        imageOrder.push('is_primary DESC');
      }
      if (imageColumns.has('sort_order')) {
        imageOrder.push('sort_order ASC');
      } else if (imageColumns.has('position')) {
        imageOrder.push('position ASC');
      }
      imageOrder.push('id ASC');

      const imageJoin = hasProductImages
        ? `LEFT JOIN product_images pi
             ON pi.id = (
               SELECT id
               FROM product_images
               WHERE ${imageWhere.join(' AND ')}
               ORDER BY ${imageOrder.join(', ')}
               LIMIT 1
             )`
        : 'LEFT JOIN (SELECT NULL AS id, NULL AS url) pi ON 1 = 0';

      const query = `
        SELECT
          ${productSelect.join(',\n          ')}
        FROM products p
        JOIN branches b ON b.id = p.branch_id
        JOIN merchants m ON m.id = b.merchant_id
        ${imageJoin}
        ORDER BY p.id DESC
      `;

      const [rows] = await connection.query(query);
      return res.json(rows);
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(err);
  }
}

async function listPaymentMethods(req, res) {
  return res.json(GUEST_PAYMENT_METHODS);
}

async function getCart(req, res, next) {
  const sessionId = getGuestSessionId(req, res);
  const connection = await pool.getConnection();
  try {
    const cart = await buildCartResponse(connection, sessionId);
    return res.json(cart);
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return res.json({
        cart_id: null,
        status: 'unavailable',
        items: [],
        item_count: 0,
        total_quantity: 0,
        total_amount: 0
      });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

async function addCartItem(req, res, next) {
  const sessionId = getGuestSessionId(req, res);
  const payload = req.body || {};
  const errors = {};
  const productId = Number(payload.product_id);
  const quantity = Number(payload.quantity || 1);
  if (!isPositiveNumber(productId)) {
    addError(errors, 'product_id', 'product_id is required and must be positive');
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    addError(errors, 'quantity', 'quantity must be an integer >= 1');
  }
  if (hasErrors(errors)) {
    return res.status(400).json({ errors });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cartItemColumns = await getTableColumns(connection, 'cart_items');
    const product = await loadProductForOrdering(connection, productId);
    if (!product) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }
    if (String(product.status || '').toLowerCase() !== 'active' || !Boolean(product.is_active ?? true)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product is not available for ordering' });
    }
    const unitPrice = toAmount(product.base_price);
    if (unitPrice <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product does not have a valid price' });
    }
    if (!product.merchant_id || !product.branch_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product merchant/branch configuration is invalid' });
    }

    const cart = await getOrCreateGuestCart(connection, sessionId);
    const [existingCartRows] = await connection.query(
      `SELECT merchant_id, branch_id
       FROM cart_items
       WHERE cart_id = ?
       LIMIT 1`,
      [cart.id]
    );
    if (existingCartRows[0]) {
      const existingMerchantId = Number(existingCartRows[0].merchant_id || 0);
      const existingBranchId = Number(existingCartRows[0].branch_id || 0);
      if (existingMerchantId !== Number(product.merchant_id) || existingBranchId !== Number(product.branch_id)) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Cart supports one merchant branch at a time. Clear the cart before adding this item.'
        });
      }
    }

    const minQty = Number(product.min_order_quantity || 1);
    const maxQty = product.max_order_quantity ? Number(product.max_order_quantity) : null;
    const existingLineQuery = cartItemColumns.has('variant_id')
      ? `SELECT id, quantity
         FROM cart_items
         WHERE cart_id = ? AND product_id = ? AND variant_id IS NULL
         LIMIT 1`
      : `SELECT id, quantity
         FROM cart_items
         WHERE cart_id = ? AND product_id = ?
         LIMIT 1`;
    const [lineRows] = await connection.query(existingLineQuery, [cart.id, productId]);
    const existingLine = lineRows[0] || null;
    const nextQuantity = Number(existingLine?.quantity || 0) + quantity;
    if (nextQuantity < minQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Minimum order quantity is ${minQty}` });
    }
    if (maxQty && nextQuantity > maxQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Maximum order quantity is ${maxQty}` });
    }

    const nextSubtotal = toAmount(nextQuantity * unitPrice);
    if (existingLine) {
      await connection.query(
        `UPDATE cart_items
         SET quantity = ?, unit_price = ?, subtotal = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextQuantity, unitPrice, nextSubtotal, existingLine.id]
      );
    } else {
      const insertColumns = ['cart_id', 'product_id', 'merchant_id', 'branch_id', 'quantity', 'unit_price', 'subtotal'];
      const insertValues = [cart.id, productId, Number(product.merchant_id), Number(product.branch_id), nextQuantity, unitPrice, nextSubtotal];
      if (cartItemColumns.has('variant_id')) {
        insertColumns.splice(2, 0, 'variant_id');
        insertValues.splice(2, 0, null);
      }
      const placeholders = insertColumns.map(() => '?').join(', ');
      await connection.query(
        `INSERT INTO cart_items
         (${insertColumns.join(', ')})
         VALUES (${placeholders})`,
        insertValues
      );
    }

    await connection.commit();
    const cartResponse = await buildCartResponse(connection, sessionId);
    return res.status(201).json(cartResponse);
  } catch (err) {
    await connection.rollback();
    if (isMissingSchemaError(err)) {
      return res.status(400).json({ error: 'Cart is not available yet. Please ask admin to run DB migration.' });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

async function updateCartItem(req, res, next) {
  const sessionId = getGuestSessionId(req, res);
  const itemId = Number(req.params?.id);
  const quantity = Number(req.body?.quantity);
  if (!isPositiveNumber(itemId)) {
    return res.status(400).json({ error: 'Invalid cart item id' });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'quantity must be an integer >= 1' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cart = await getOrCreateGuestCart(connection, sessionId);
    const [rows] = await connection.query(
      `SELECT ci.id, ci.product_id, ci.unit_price, p.min_order_quantity, p.max_order_quantity
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = ? AND ci.cart_id = ?
       LIMIT 1`,
      [itemId, cart.id]
    );
    const item = rows[0];
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cart item not found' });
    }
    const minQty = Number(item.min_order_quantity || 1);
    const maxQty = item.max_order_quantity ? Number(item.max_order_quantity) : null;
    if (quantity < minQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Minimum order quantity is ${minQty}` });
    }
    if (maxQty && quantity > maxQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Maximum order quantity is ${maxQty}` });
    }
    await connection.query(
      `UPDATE cart_items
       SET quantity = ?, subtotal = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [quantity, toAmount(Number(item.unit_price || 0) * quantity), itemId]
    );
    await connection.commit();
    const cartResponse = await buildCartResponse(connection, sessionId);
    return res.json(cartResponse);
  } catch (err) {
    await connection.rollback();
    if (isMissingSchemaError(err)) {
      return res.status(400).json({ error: 'Cart is not available yet. Please ask admin to run DB migration.' });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

async function removeCartItem(req, res, next) {
  const sessionId = getGuestSessionId(req, res);
  const itemId = Number(req.params?.id);
  if (!isPositiveNumber(itemId)) {
    return res.status(400).json({ error: 'Invalid cart item id' });
  }
  const connection = await pool.getConnection();
  try {
    const cart = await getOrCreateGuestCart(connection, sessionId);
    const [result] = await connection.query(
      'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
      [itemId, cart.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Cart item not found' });
    }
    const cartResponse = await buildCartResponse(connection, sessionId);
    return res.json(cartResponse);
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return res.status(400).json({ error: 'Cart is not available yet. Please ask admin to run DB migration.' });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

async function checkout(req, res, next) {
  const sessionId = getGuestSessionId(req, res);
  const payload = req.body || {};
  const selectedPayment = String(payload.payment_method || '').trim().toLowerCase();
  if (!selectedPayment || !GUEST_PAYMENT_METHODS.some((method) => method.id === selectedPayment)) {
    return res.status(400).json({ error: 'Valid payment_method is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cart = await getOrCreateGuestCart(connection, sessionId);
    const cartItems = await listCartItems(connection, cart.id);
    if (!cartItems.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const merchantId = Number(cartItems[0].merchant_id || 0);
    const branchId = Number(cartItems[0].branch_id || 0);
    const mixedSource = cartItems.some(
      (item) => Number(item.merchant_id || 0) !== merchantId || Number(item.branch_id || 0) !== branchId
    );
    if (!merchantId || !branchId || mixedSource) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cart contains items from different branches/merchants' });
    }

    const { buyerId, buyerUserId, email } = await ensureGuestBuyer(connection, sessionId, payload);
    const subtotal = toAmount(cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
    const totalAmount = subtotal;
    const orderNumber = buildOrderNumber();
    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'pending', 'pending', ?)`,
      [
        orderNumber,
        buyerId,
        buyerUserId,
        merchantId,
        branchId,
        subtotal,
        totalAmount,
        `Guest checkout (${email})${payload.notes ? ` - ${String(payload.notes).trim()}` : ''}`
      ]
    );
    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      await connection.query(
        `INSERT INTO order_items
         (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price, subtotal, tax_amount)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0)`,
        [
          orderId,
          Number(item.product_id),
          item.variant_id || null,
          item.product_name || `Product #${item.product_id}`,
          item.sku || null,
          Number(item.quantity),
          toAmount(item.unit_price),
          toAmount(item.subtotal)
        ]
      );
    }

    await connection.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by_type, changed_by_id)
       VALUES (?, 'pending', 'Order created from guest checkout', 'buyer', ?)`,
      [orderId, buyerUserId]
    );

    await connection.query(
      `INSERT INTO payments
       (order_id, buyer_id, payment_method_id, amount, currency, status, payment_gateway)
       VALUES (?, ?, NULL, ?, 'USD', 'pending', ?)`,
      [orderId, buyerId, selectedPayment]
    );

    await connection.query(
      `UPDATE carts
       SET status = 'converted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cart.id]
    );
    await connection.query(
      `INSERT INTO carts (session_id, status)
       VALUES (?, 'active')`,
      [sessionId]
    );

    await connection.commit();
    const [orderRows] = await pool.query(
      `SELECT id, order_number, total_amount, currency, status, payment_status, created_at
       FROM orders
       WHERE id = ?`,
      [orderId]
    );
    return res.status(201).json(orderRows[0] || null);
  } catch (err) {
    await connection.rollback();
    if (isMissingSchemaError(err)) {
      return res.status(400).json({ error: 'Checkout is not available yet. Please ask admin to run DB migration.' });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  listProducts,
  listPaymentMethods,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  checkout
};
