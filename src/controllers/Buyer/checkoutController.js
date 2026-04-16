const pool = require('../../db');
const { sendEmail } = require('../../utils/mailer');
const { addError, hasErrors, isPositiveNumber } = require('../../utils/validation');

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

async function resolveBuyerEmailProfile(buyerUserId, fallbackEmail) {
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, email
     FROM buyer_users
     WHERE id = ?
     LIMIT 1`,
    [buyerUserId]
  );
  const profile = rows[0] || null;
  return {
    first_name: String(profile?.first_name || '').trim() || 'Customer',
    last_name: String(profile?.last_name || '').trim() || '',
    email: String(profile?.email || fallbackEmail || '').trim().toLowerCase()
  };
}

async function sendBuyerOrderConfirmationEmail({ order, buyerUserId, fallbackEmail }) {
  const profile = await resolveBuyerEmailProfile(buyerUserId, fallbackEmail);
  if (!profile.email) {
    return;
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  const orderNumber = order?.order_number || `#${order?.id || ''}`;
  const total = toAmount(order?.total_amount);
  const currency = order?.currency || 'USD';
  const subject = `Order Confirmation - ${orderNumber}`;
  const text = [
    `Thank you for your order, ${fullName || 'Customer'}!`,
    '',
    `Order: ${orderNumber}`,
    `Total: ${currency} ${total.toFixed(2)}`,
    `Status: ${order?.status || 'pending'}`,
    '',
    'We received your order and will notify you on updates.'
  ].join('\n');

  await sendEmail({
    to: profile.email,
    subject,
    text,
    html: `<p>Thank you for your order, ${fullName || 'Customer'}.</p>
<p><strong>Order:</strong> ${orderNumber}<br/>
<strong>Total:</strong> ${currency} ${total.toFixed(2)}<br/>
<strong>Status:</strong> ${order?.status || 'pending'}</p>
<p>We received your order and will notify you on updates.</p>`
  });
}

async function getOrCreateActiveCart(connection, buyerId, buyerUserId) {
  const [cartRows] = await connection.query(
    `SELECT id, status
     FROM carts
     WHERE buyer_id = ? AND buyer_user_id = ? AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [buyerId, buyerUserId]
  );
  if (cartRows[0]) {
    return cartRows[0];
  }

  const [insertResult] = await connection.query(
    `INSERT INTO carts (buyer_id, buyer_user_id, status)
     VALUES (?, ?, 'active')`,
    [buyerId, buyerUserId]
  );
  return {
    id: insertResult.insertId,
    status: 'active'
  };
}

async function listCartItems(connection, cartId) {
  const [rows] = await connection.query(
    `SELECT
       ci.id,
       ci.cart_id,
       ci.product_id,
       ci.variant_id,
       ci.merchant_id,
       ci.branch_id,
       ci.quantity,
       ci.unit_price,
       ci.subtotal,
       p.name AS product_name,
       p.sku AS sku,
       p.status AS product_status
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id ASC`,
    [cartId]
  );
  return rows;
}

function summarizeCart(items) {
  const totals = (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      acc.item_count += 1;
      acc.total_quantity += Number(item.quantity || 0);
      acc.total_amount = toAmount(acc.total_amount + Number(item.subtotal || 0));
      return acc;
    },
    { item_count: 0, total_quantity: 0, total_amount: 0 }
  );
  return totals;
}

async function buildCartResponse(connection, buyerId, buyerUserId) {
  const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
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
  const [rows] = await connection.query(
    `SELECT
       p.id,
       p.name,
       p.sku,
       p.base_price,
       p.min_order_quantity,
       p.max_order_quantity,
       p.branch_id,
       p.merchant_id,
       p.status
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

async function createOrderFromItems(connection, {
  buyerId,
  buyerUserId,
  items,
  paymentMethodId,
  notes
}) {
  const orderItems = Array.isArray(items) ? items : [];
  if (orderItems.length === 0) {
    throw new Error('Cart is empty');
  }

  const first = orderItems[0];
  const merchantId = Number(first.merchant_id || 0);
  const branchId = Number(first.branch_id || 0);
  if (!merchantId || !branchId) {
    throw new Error('Cart merchant/branch configuration is invalid');
  }

  const mixedSource = orderItems.some(
    (item) =>
      Number(item.merchant_id || 0) !== merchantId || Number(item.branch_id || 0) !== branchId
  );
  if (mixedSource) {
    throw new Error('Cart contains items from multiple branches or merchants');
  }

  if (!paymentMethodId) {
    throw new Error('payment_method_id is required');
  }
  const [methodRows] = await connection.query(
    `SELECT id, type, is_default
     FROM buyer_payment_methods
     WHERE id = ? AND buyer_id = ?`,
    [paymentMethodId, buyerId]
  );
  const paymentMethod = methodRows[0] || null;
  if (!paymentMethod) {
    throw new Error('Selected payment method is invalid');
  }

  const subtotal = toAmount(
    orderItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const totalAmount = subtotal;
  const orderNumber = buildOrderNumber();

  const [orderResult] = await connection.query(
    `INSERT INTO orders
     (order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderNumber,
      buyerId,
      buyerUserId,
      merchantId,
      branchId,
      subtotal,
      totalAmount,
      'USD',
      'pending',
      'pending',
      notes ? String(notes).trim() : null
    ]
  );
  const orderId = orderResult.insertId;

  for (const item of orderItems) {
    await connection.query(
      `INSERT INTO order_items
       (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price, subtotal, tax_amount)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0)`,
      [
        orderId,
        Number(item.product_id),
        item.variant_id || null,
        item.product_name || item.name || `Product #${item.product_id}`,
        item.sku || null,
        Number(item.quantity),
        toAmount(item.unit_price),
        toAmount(item.subtotal)
      ]
    );
  }

  await connection.query(
    `INSERT INTO order_status_history (order_id, status, notes, changed_by_type, changed_by_id)
     VALUES (?, ?, ?, 'buyer', ?)`,
    [orderId, 'pending', 'Order created', buyerUserId]
  );

  await connection.query(
    `INSERT INTO payments
     (order_id, buyer_id, payment_method_id, amount, currency, status, payment_gateway)
     VALUES (?, ?, ?, ?, 'USD', 'pending', ?)`,
    [orderId, buyerId, paymentMethod.id, totalAmount, paymentMethod.type]
  );

  const [orderRows] = await connection.query(
    `SELECT id, order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, created_at
     FROM orders WHERE id = ?`,
    [orderId]
  );
  return orderRows[0] || null;
}

async function listPaymentMethods(req, res, next) {
  try {
    const buyerId = req.buyerUser?.buyer_id;
    if (!buyerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const [rows] = await pool.query(
      `SELECT id, type, is_default, card_brand, card_last4, expiry_date, billing_address_id, created_at, updated_at
       FROM buyer_payment_methods
       WHERE buyer_id = ?
       ORDER BY is_default DESC, id DESC`,
      [buyerId]
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}

async function createPaymentMethod(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  if (!buyerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const errors = {};
  const allowedTypes = new Set(['credit_card', 'bank_transfer', 'paypal', 'manual']);
  const type = allowedTypes.has(payload.type) ? payload.type : 'manual';
  const isDefault = Boolean(payload.is_default);
  const cardLast4 = payload.card_last4 ? String(payload.card_last4).trim() : null;

  if (type === 'credit_card') {
    if (!cardLast4 || !/^\d{4}$/.test(cardLast4)) {
      addError(errors, 'card_last4', 'card_last4 is required for credit_card and must be 4 digits');
    }
  }
  if (payload.billing_address_id !== undefined && payload.billing_address_id !== null && payload.billing_address_id !== '') {
    if (!isPositiveNumber(payload.billing_address_id)) {
      addError(errors, 'billing_address_id', 'billing_address_id must be a positive number');
    }
  }
  if (hasErrors(errors)) {
    return res.status(400).json({ errors });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (isDefault) {
      await connection.query('UPDATE buyer_payment_methods SET is_default = 0 WHERE buyer_id = ?', [buyerId]);
    }
    const [result] = await connection.query(
      `INSERT INTO buyer_payment_methods
       (buyer_id, type, is_default, card_brand, card_last4, payment_gateway_token, expiry_date, billing_address_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        buyerId,
        type,
        isDefault ? 1 : 0,
        payload.card_brand ? String(payload.card_brand).trim() : null,
        cardLast4,
        payload.payment_gateway_token ? String(payload.payment_gateway_token).trim() : null,
        payload.expiry_date ? String(payload.expiry_date).trim() : null,
        payload.billing_address_id ? Number(payload.billing_address_id) : null
      ]
    );
    await connection.commit();

    const [rows] = await pool.query(
      `SELECT id, type, is_default, card_brand, card_last4, expiry_date, billing_address_id, created_at, updated_at
       FROM buyer_payment_methods
       WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json(rows[0] || null);
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

async function deletePaymentMethod(req, res, next) {
  try {
    const buyerId = req.buyerUser?.buyer_id;
    const id = Number(req.params?.id);
    if (!buyerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid payment method id' });
    }
    const [result] = await pool.query('DELETE FROM buyer_payment_methods WHERE id = ? AND buyer_id = ?', [id, buyerId]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function listOrders(req, res, next) {
  try {
    const buyerId = req.buyerUser?.buyer_id;
    if (!buyerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const [rows] = await pool.query(
      `SELECT id, order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, created_at
       FROM orders
       WHERE buyer_id = ?
       ORDER BY id DESC`,
      [buyerId]
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}

async function getCart(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const connection = await pool.getConnection();
  try {
    const cart = await buildCartResponse(connection, buyerId, buyerUserId);
    return res.json(cart);
  } catch (err) {
    return next(err);
  } finally {
    connection.release();
  }
}

async function addCartItem(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
    const product = await loadProductForOrdering(connection, productId);
    if (!product) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }
    if (String(product.status || '').toLowerCase() !== 'active') {
      await connection.rollback();
      return res.status(400).json({ error: 'Product is not available for ordering' });
    }

    const unitPrice = toAmount(product.base_price);
    if (unitPrice <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product does not have a valid base_price' });
    }
    if (!product.merchant_id || !product.branch_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product merchant/branch configuration is invalid' });
    }

    const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
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
      if (
        existingMerchantId !== Number(product.merchant_id) ||
        existingBranchId !== Number(product.branch_id)
      ) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Cart supports one merchant branch at a time. Clear the cart before adding this item.'
        });
      }
    }

    const minQty = Number(product.min_order_quantity || 1);
    const maxQty = product.max_order_quantity ? Number(product.max_order_quantity) : null;

    const [lineRows] = await connection.query(
      `SELECT id, quantity
       FROM cart_items
       WHERE cart_id = ? AND product_id = ? AND variant_id IS NULL
       LIMIT 1`,
      [cart.id, productId]
    );
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
      await connection.query(
        `INSERT INTO cart_items
         (cart_id, product_id, variant_id, merchant_id, branch_id, quantity, unit_price, subtotal)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
        [
          cart.id,
          productId,
          Number(product.merchant_id),
          Number(product.branch_id),
          nextQuantity,
          unitPrice,
          nextSubtotal
        ]
      );
    }

    await connection.commit();
    const cartResponse = await buildCartResponse(connection, buyerId, buyerUserId);
    return res.status(201).json(cartResponse);
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

async function updateCartItem(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  const itemId = Number(req.params?.id);
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isPositiveNumber(itemId)) {
    return res.status(400).json({ error: 'Invalid cart item id' });
  }

  const quantity = Number(req.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'quantity must be an integer >= 1' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
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
    const cartResponse = await buildCartResponse(connection, buyerId, buyerUserId);
    return res.json(cartResponse);
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

async function removeCartItem(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  const itemId = Number(req.params?.id);
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isPositiveNumber(itemId)) {
    return res.status(400).json({ error: 'Invalid cart item id' });
  }

  const connection = await pool.getConnection();
  try {
    const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
    const [result] = await connection.query(
      'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
      [itemId, cart.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Cart item not found' });
    }
    const cartResponse = await buildCartResponse(connection, buyerId, buyerUserId);
    return res.json(cartResponse);
  } catch (err) {
    return next(err);
  } finally {
    connection.release();
  }
}

async function clearCart(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const connection = await pool.getConnection();
  try {
    const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
    await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
    const cartResponse = await buildCartResponse(connection, buyerId, buyerUserId);
    return res.json(cartResponse);
  } catch (err) {
    return next(err);
  } finally {
    connection.release();
  }
}

async function checkoutCart(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const paymentMethodIdRaw = req.body?.payment_method_id;
  if (paymentMethodIdRaw === undefined || paymentMethodIdRaw === null || paymentMethodIdRaw === '') {
    return res.status(400).json({ error: 'payment_method_id is required' });
  }
  const paymentMethodId = Number(paymentMethodIdRaw);
  if (!isPositiveNumber(paymentMethodId)) {
    return res.status(400).json({ error: 'payment_method_id must be a positive number' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cart = await getOrCreateActiveCart(connection, buyerId, buyerUserId);
    const cartItems = await listCartItems(connection, cart.id);
    if (!cartItems.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const order = await createOrderFromItems(connection, {
      buyerId,
      buyerUserId,
      items: cartItems.map((item) => ({
        ...item,
        product_name: item.product_name
      })),
      paymentMethodId,
      notes: req.body?.notes
    });

    await connection.query(
      `UPDATE carts
       SET status = 'converted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cart.id]
    );
    await connection.query(
      `INSERT INTO carts (buyer_id, buyer_user_id, status)
       VALUES (?, ?, 'active')`,
      [buyerId, buyerUserId]
    );

    await connection.commit();
    sendBuyerOrderConfirmationEmail({
      order,
      buyerUserId,
      fallbackEmail: req.buyerUser?.email
    }).catch((emailError) => {
      console.error('[BUYER_ORDER_CONFIRMATION_EMAIL_FAILED]', emailError?.message || emailError);
    });
    return res.status(201).json(order);
  } catch (err) {
    await connection.rollback();
    if (err?.message === 'Selected payment method is invalid') {
      return res.status(400).json({ error: err.message });
    }
    if (err?.message === 'payment_method_id is required') {
      return res.status(400).json({ error: err.message });
    }
    if (
      err?.message === 'Cart is empty' ||
      err?.message === 'Cart merchant/branch configuration is invalid' ||
      err?.message === 'Cart contains items from multiple branches or merchants'
    ) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

async function createOrder(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const paymentMethodIdRaw = payload.payment_method_id;
  if (paymentMethodIdRaw === undefined || paymentMethodIdRaw === null || paymentMethodIdRaw === '') {
    return res.status(400).json({ errors: { payment_method_id: 'payment_method_id is required' } });
  }
  const paymentMethodId = Number(paymentMethodIdRaw);
  if (!isPositiveNumber(paymentMethodId)) {
    return res.status(400).json({ errors: { payment_method_id: 'payment_method_id must be a positive number' } });
  }

  if (!payload.product_id) {
    return checkoutCart(req, res, next);
  }

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
    const product = await loadProductForOrdering(connection, productId);
    if (!product) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }
    if (String(product.status || '').toLowerCase() !== 'active') {
      await connection.rollback();
      return res.status(400).json({ error: 'Product is not available for ordering' });
    }

    const minQty = Number(product.min_order_quantity || 1);
    const maxQty = product.max_order_quantity ? Number(product.max_order_quantity) : null;
    if (quantity < minQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Minimum order quantity is ${minQty}` });
    }
    if (maxQty && quantity > maxQty) {
      await connection.rollback();
      return res.status(400).json({ error: `Maximum order quantity is ${maxQty}` });
    }

    const unitPrice = toAmount(product.base_price);
    if (unitPrice <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product does not have a valid base_price' });
    }
    if (!product.merchant_id || !product.branch_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product merchant/branch configuration is invalid' });
    }

    const order = await createOrderFromItems(connection, {
      buyerId,
      buyerUserId,
      paymentMethodId,
      notes: payload.notes,
      items: [
        {
          product_id: product.id,
          variant_id: null,
          merchant_id: product.merchant_id,
          branch_id: product.branch_id,
          product_name: product.name || `Product #${product.id}`,
          sku: product.sku || null,
          quantity,
          unit_price: unitPrice,
          subtotal: toAmount(unitPrice * quantity)
        }
      ]
    });
    await connection.commit();
    sendBuyerOrderConfirmationEmail({
      order,
      buyerUserId,
      fallbackEmail: req.buyerUser?.email
    }).catch((emailError) => {
      console.error('[BUYER_ORDER_CONFIRMATION_EMAIL_FAILED]', emailError?.message || emailError);
    });
    return res.status(201).json(order);
  } catch (err) {
    await connection.rollback();
    if (err?.message === 'payment_method_id is required' || err?.message === 'Selected payment method is invalid') {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkoutCart,
  listPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  listOrders,
  createOrder
};
