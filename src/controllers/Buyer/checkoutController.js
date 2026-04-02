const pool = require('../../db');
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

async function createOrder(req, res, next) {
  const buyerId = req.buyerUser?.buyer_id;
  const buyerUserId = req.buyerUser?.sub;
  if (!buyerId || !buyerUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const errors = {};
  const productId = Number(payload.product_id);
  const quantity = Number(payload.quantity || 1);
  const paymentMethodId = payload.payment_method_id ? Number(payload.payment_method_id) : null;

  if (!isPositiveNumber(productId)) {
    addError(errors, 'product_id', 'product_id is required and must be positive');
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    addError(errors, 'quantity', 'quantity must be an integer >= 1');
  }
  if (paymentMethodId !== null && !isPositiveNumber(paymentMethodId)) {
    addError(errors, 'payment_method_id', 'payment_method_id must be a positive number');
  }
  if (hasErrors(errors)) {
    return res.status(400).json({ errors });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let paymentMethod = null;
    if (paymentMethodId) {
      const [methodRows] = await connection.query(
        `SELECT id, type, is_default
         FROM buyer_payment_methods
         WHERE id = ? AND buyer_id = ?`,
        [paymentMethodId, buyerId]
      );
      paymentMethod = methodRows[0] || null;
      if (!paymentMethod) {
        await connection.rollback();
        return res.status(400).json({ error: 'Selected payment method is invalid' });
      }
    }

    const [productRows] = await connection.query(
      `SELECT p.id, p.name, p.sku, p.base_price, p.min_order_quantity, p.max_order_quantity, p.branch_id, p.merchant_id, p.status
       FROM products p
       WHERE p.id = ?
       LIMIT 1`,
      [productId]
    );
    const product = productRows[0];
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

    let merchantId = product.merchant_id ? Number(product.merchant_id) : null;
    if (!merchantId) {
      const [branchRows] = await connection.query('SELECT merchant_id FROM branches WHERE id = ? LIMIT 1', [product.branch_id]);
      merchantId = branchRows[0]?.merchant_id ? Number(branchRows[0].merchant_id) : null;
    }
    if (!merchantId || !product.branch_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product merchant/branch configuration is invalid' });
    }

    const unitPrice = toAmount(product.base_price);
    if (unitPrice <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Product does not have a valid base_price' });
    }
    const subtotal = toAmount(unitPrice * quantity);
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
        Number(product.branch_id),
        subtotal,
        totalAmount,
        'USD',
        'pending',
        'pending',
        payload.notes ? String(payload.notes).trim() : null
      ]
    );
    const orderId = orderResult.insertId;

    await connection.query(
      `INSERT INTO order_items
       (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price, subtotal, tax_amount)
       VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, 0)`,
      [
        orderId,
        product.id,
        product.name || `Product #${product.id}`,
        product.sku || null,
        quantity,
        unitPrice,
        subtotal
      ]
    );

    await connection.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by_type, changed_by_id)
       VALUES (?, ?, ?, 'buyer', ?)`,
      [orderId, 'pending', 'Order created', buyerUserId]
    );

    if (paymentMethod) {
      await connection.query(
        `INSERT INTO payments
         (order_id, buyer_id, payment_method_id, amount, currency, status, payment_gateway)
         VALUES (?, ?, ?, ?, 'USD', 'pending', ?)`,
        [orderId, buyerId, paymentMethod.id, totalAmount, paymentMethod.type]
      );
    }

    await connection.commit();

    const [orderRows] = await pool.query(
      `SELECT id, order_number, buyer_id, buyer_user_id, merchant_id, branch_id, subtotal, total_amount, currency, status, payment_status, created_at
       FROM orders WHERE id = ?`,
      [orderId]
    );
    return res.status(201).json(orderRows[0] || null);
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  listPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  listOrders,
  createOrder
};

