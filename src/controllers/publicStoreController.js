const crypto = require('crypto');
const pool = require('../db');
const { hashPassword } = require('../utils/password');
const { sendEmail } = require('../utils/mailer');
const { addError, hasErrors, isPositiveNumber } = require('../utils/validation');

const GUEST_COOKIE = 'guest_session_id';
const GUEST_PAYMENT_METHODS = [
  { id: 'credit_card', type: 'credit_card', label: 'Credit Card' }
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

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidLuhn(cardNumber) {
  const digits = normalizeDigits(cardNumber);
  if (digits.length < 12 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(cardNumberDigits) {
  if (/^4/.test(cardNumberDigits)) {
    return 'visa';
  }
  if (/^5[1-5]/.test(cardNumberDigits) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(cardNumberDigits)) {
    return 'mastercard';
  }
  if (/^3[47]/.test(cardNumberDigits)) {
    return 'amex';
  }
  if (/^6(?:011|5)/.test(cardNumberDigits)) {
    return 'discover';
  }
  return 'card';
}

function validateCardExpiry(monthRaw, yearRaw) {
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return null;
  }
  const expiryDate = new Date(year, month, 0, 23, 59, 59, 999);
  if (expiryDate.getTime() < Date.now()) {
    return null;
  }
  return { month, year };
}

function validateGuestPayment(selectedPayment, payload = {}) {
  if (selectedPayment !== 'credit_card') {
    throw new Error('Only credit_card payment is allowed for guest checkout');
  }

  const paymentDetails = payload.payment_details && typeof payload.payment_details === 'object'
    ? payload.payment_details
    : null;
  if (!paymentDetails) {
    throw new Error('payment_details are required for credit_card');
  }

  const cardholderName = String(paymentDetails.cardholder_name || '').trim();
  const cardNumberDigits = normalizeDigits(paymentDetails.card_number);
  const cvvDigits = normalizeDigits(paymentDetails.cvv);
  const expiry = validateCardExpiry(paymentDetails.expiry_month, paymentDetails.expiry_year);

  if (!cardholderName) {
    throw new Error('cardholder_name is required');
  }
  if (!isValidLuhn(cardNumberDigits)) {
    throw new Error('Invalid card_number');
  }
  if (!expiry) {
    throw new Error('Invalid card expiry');
  }
  if (!/^\d{3,4}$/.test(cvvDigits)) {
    throw new Error('Invalid CVV');
  }

  return {
    paymentStatus: 'completed',
    orderPaymentStatus: 'paid',
    gatewayResponse: {
      provider: 'demo_card_gateway',
      approved: true,
      card_brand: detectCardBrand(cardNumberDigits),
      card_last4: cardNumberDigits.slice(-4),
      cardholder_name: cardholderName,
      expiry_month: expiry.month,
      expiry_year: expiry.year
    }
  };
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

async function listProductImages(connection, productIds = []) {
  const ids = Array.isArray(productIds)
    ? productIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!ids.length) {
    return new Map();
  }
  const [imageTableRows] = await connection.query("SHOW TABLES LIKE 'product_images'");
  const hasProductImages = Array.isArray(imageTableRows) && imageTableRows.length > 0;
  if (!hasProductImages) {
    return new Map();
  }

  const imageColumns = await getTableColumns(connection, 'product_images');
  const where = [`product_id IN (${ids.map(() => '?').join(', ')})`];
  if (imageColumns.has('is_active')) {
    where.push('is_active = 1');
  }
  const orderBy = [];
  if (imageColumns.has('is_primary')) {
    orderBy.push('is_primary DESC');
  }
  if (imageColumns.has('sort_order')) {
    orderBy.push('sort_order ASC');
  } else if (imageColumns.has('position')) {
    orderBy.push('position ASC');
  }
  orderBy.push('id ASC');

  const [rows] = await connection.query(
    `SELECT id, product_id, url
     FROM product_images
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy.join(', ')}`,
    ids
  );
  const map = new Map();
  for (const row of rows) {
    const productId = Number(row.product_id);
    const existing = map.get(productId) || [];
    existing.push({
      id: Number(row.id),
      url: row.url || null
    });
    map.set(productId, existing);
  }
  return map;
}

function attachImagesToProducts(products = [], productImagesById = new Map()) {
  return (Array.isArray(products) ? products : []).map((product) => {
    const images = productImagesById.get(Number(product.id)) || [];
    const imageUrls = images.map((image) => image.url).filter(Boolean);
    return {
      ...product,
      images,
      image_urls: imageUrls,
      image_url: imageUrls[0] || null
    };
  });
}

function normalizeAddressPayload(value = {}, defaultLabel) {
  const payload = value && typeof value === 'object' ? value : {};
  return {
    label: String(payload.label || defaultLabel || 'Address').trim().slice(0, 120),
    contact_name: String(payload.contact_name || '').trim().slice(0, 255) || null,
    contact_phone: String(payload.contact_phone || '').trim().slice(0, 40) || null,
    street_address: String(payload.street_address || '').trim(),
    city: String(payload.city || '').trim().slice(0, 120) || null,
    state: String(payload.state || '').trim().slice(0, 120) || null,
    postal_code: String(payload.postal_code || '').trim().slice(0, 40) || null,
    country: String(payload.country || '').trim().slice(0, 120) || null
  };
}

function validateGuestCheckoutPayload(payload = {}) {
  const errors = {};
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    addError(errors, 'email', 'Valid email is required');
  }
  const firstName = String(payload.first_name || '').trim();
  const lastName = String(payload.last_name || '').trim();
  if (!firstName) {
    addError(errors, 'first_name', 'first_name is required');
  }
  if (!lastName) {
    addError(errors, 'last_name', 'last_name is required');
  }

  const shipping = normalizeAddressPayload(payload.shipping_address, 'Shipping');
  const useShippingAsBilling = Boolean(payload.use_shipping_as_billing);
  const billing = useShippingAsBilling
    ? shipping
    : normalizeAddressPayload(payload.billing_address, 'Billing');

  if (!shipping.street_address) {
    addError(errors, 'shipping_address.street_address', 'Shipping street_address is required');
  }
  if (!billing.street_address) {
    addError(errors, 'billing_address.street_address', 'Billing street_address is required');
  }

  return {
    errors,
    normalized: {
      email,
      first_name: firstName,
      last_name: lastName,
      phone: payload.phone ? String(payload.phone).trim() : null,
      shipping_address: shipping,
      billing_address: billing
    }
  };
}

async function createBuyerAddress(connection, buyerId, addressPayload) {
  const payload = normalizeAddressPayload(addressPayload, 'Address');
  const [result] = await connection.query(
    `INSERT INTO buyer_addresses
     (buyer_id, label, contact_name, contact_phone, street_address, city, state, postal_code, country, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      Number(buyerId),
      payload.label || 'Address',
      payload.contact_name,
      payload.contact_phone,
      payload.street_address,
      payload.city,
      payload.state,
      payload.postal_code,
      payload.country
    ]
  );
  return result.insertId;
}

async function sendOrderConfirmationEmail(payload = {}) {
  const to = String(payload.email || '').trim();
  if (!to) {
    return;
  }
  const orderNumber = payload.order_number || payload.orderNumber || '';
  const totalAmount = toAmount(payload.total_amount);
  const currency = payload.currency || 'USD';
  const subject = `Order Confirmation - ${orderNumber || 'Order Received'}`;
  const text = [
    `Thank you for your purchase, ${payload.first_name || 'Customer'}!`,
    '',
    `Order: ${orderNumber || 'N/A'}`,
    `Total: ${currency} ${totalAmount.toFixed(2)}`,
    `Status: ${payload.status || 'pending'}`,
    '',
    'We have received your order and will update you once it is processed.'
  ].join('\n');
  await sendEmail({
    to,
    subject,
    text,
    html: `<p>Thank you for your purchase, ${payload.first_name || 'Customer'}.</p>
<p><strong>Order:</strong> ${orderNumber || 'N/A'}<br/>
<strong>Total:</strong> ${currency} ${totalAmount.toFixed(2)}<br/>
<strong>Status:</strong> ${payload.status || 'pending'}</p>
<p>We have received your order and will update you once it is processed.</p>`
  });
}

async function listProducts(req, res, next) {
  try {
    const connection = await pool.getConnection();
    try {
      const [productColumnsRows] = await connection.query('SHOW COLUMNS FROM products');
      const productColumns = new Set(productColumnsRows.map((row) => row.Field));

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
        productColumns.has('is_active') ? 'p.is_active' : '1 AS is_active'
      ];

      const query = `
        SELECT
          ${productSelect.join(',\n          ')}
        FROM products p
        JOIN branches b ON b.id = p.branch_id
        JOIN merchants m ON m.id = b.merchant_id
        ORDER BY p.id DESC
      `;

      const [rows] = await connection.query(query);
      const productIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
      const productImagesById = await listProductImages(connection, productIds);
      return res.json(attachImagesToProducts(rows, productImagesById));
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(err);
  }
}

async function getProductById(req, res, next) {
  const productId = Number(req.params?.id);
  if (!isPositiveNumber(productId)) {
    return res.status(400).json({ error: 'Invalid product id' });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [productColumnsRows] = await connection.query('SHOW COLUMNS FROM products');
      const productColumns = new Set(productColumnsRows.map((row) => row.Field));
      const productSelect = [
        'p.id',
        productColumns.has('name') ? 'p.name' : `CONCAT('Product #', p.id) AS name`,
        productColumns.has('slug') ? 'p.slug' : 'NULL AS slug',
        productColumns.has('description') ? 'p.description' : 'NULL AS description',
        productColumns.has('short_description') ? 'p.short_description' : 'NULL AS short_description',
        productColumns.has('base_price') ? 'p.base_price' : '0 AS base_price',
        productColumns.has('provider_name') ? 'p.provider_name' : 'NULL AS provider_name',
        productColumns.has('sku') ? 'p.sku' : 'NULL AS sku',
        productColumns.has('unit') ? 'p.unit' : 'NULL AS unit',
        productColumns.has('weight') ? 'p.weight' : 'NULL AS weight',
        productColumns.has('branch_id') ? 'p.branch_id' : 'NULL AS branch_id',
        'b.name AS branch_name',
        'b.merchant_id',
        'm.name AS merchant_name',
        productColumns.has('status') ? 'p.status' : `'active' AS status`,
        productColumns.has('is_active') ? 'p.is_active' : '1 AS is_active'
      ];
      const [rows] = await connection.query(
        `SELECT
           ${productSelect.join(',\n           ')}
         FROM products p
         JOIN branches b ON b.id = p.branch_id
         JOIN merchants m ON m.id = b.merchant_id
         WHERE p.id = ?
         LIMIT 1`,
        [productId]
      );
      const product = rows[0];
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const productImagesById = await listProductImages(connection, [productId]);
      const response = attachImagesToProducts([product], productImagesById)[0];
      return res.json(response);
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
  let paymentValidation;
  try {
    paymentValidation = validateGuestPayment(selectedPayment, payload);
  } catch (validationError) {
    return res.status(400).json({ error: validationError.message || 'Invalid payment details' });
  }
  const checkoutValidation = validateGuestCheckoutPayload(payload);
  if (hasErrors(checkoutValidation.errors)) {
    return res.status(400).json({ errors: checkoutValidation.errors });
  }
  const normalizedCheckout = checkoutValidation.normalized;

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

    const { buyerId, buyerUserId, email } = await ensureGuestBuyer(connection, sessionId, {
      ...payload,
      ...normalizedCheckout
    });
    const shippingAddressId = await createBuyerAddress(
      connection,
      buyerId,
      normalizedCheckout.shipping_address
    );
    const billingAddressId = await createBuyerAddress(
      connection,
      buyerId,
      normalizedCheckout.billing_address
    );
    const subtotal = toAmount(cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
    const totalAmount = subtotal;
    const orderNumber = buildOrderNumber();
    const orderPaymentStatus = paymentValidation.orderPaymentStatus || 'pending';
    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, shipping_address_id, billing_address_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'pending', ?, ?, ?, ?)`,
      [
        orderNumber,
        buyerId,
        buyerUserId,
        merchantId,
        branchId,
        subtotal,
        totalAmount,
        orderPaymentStatus,
        shippingAddressId,
        billingAddressId,
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

    const paymentColumns = await getTableColumns(connection, 'payments');
    const insertColumns = ['order_id', 'buyer_id', 'payment_method_id', 'amount', 'currency', 'status', 'payment_gateway'];
    const insertValues = [
      orderId,
      buyerId,
      null,
      totalAmount,
      'USD',
      paymentValidation.paymentStatus || 'pending',
      selectedPayment
    ];
    if (paymentColumns.has('gateway_response')) {
      insertColumns.push('gateway_response');
      insertValues.push(
        paymentValidation.gatewayResponse ? JSON.stringify(paymentValidation.gatewayResponse) : null
      );
    }
    const placeholders = insertColumns.map(() => '?').join(', ');
    await connection.query(
      `INSERT INTO payments
       (${insertColumns.join(', ')})
       VALUES (${placeholders})`,
      insertValues
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
      `SELECT id, order_number, total_amount, currency, status, payment_status, shipping_address_id, billing_address_id, created_at
       FROM orders
       WHERE id = ?`,
      [orderId]
    );
    const orderResponse = orderRows[0] || null;
    sendOrderConfirmationEmail({
      email,
      first_name: normalizedCheckout.first_name,
      order_number: orderResponse?.order_number,
      total_amount: orderResponse?.total_amount,
      currency: orderResponse?.currency,
      status: orderResponse?.status
    }).catch((emailError) => {
      console.error('[ORDER_CONFIRMATION_EMAIL_FAILED]', emailError?.message || emailError);
    });
    return res.status(201).json(orderResponse);
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
  getProductById,
  listPaymentMethods,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  checkout
};
