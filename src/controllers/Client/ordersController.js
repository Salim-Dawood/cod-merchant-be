const ordersRepo = require('../../repository/Client/clientOrdersRepo');
const productsRepo = require('../../repository/Client/clientProductsRepo');
const { isPositiveNumber, isNonEmptyString, addError, hasErrors } = require('../../utils/validation');

async function create(req, res, next) {
  try {
    const clientId = Number(req.client?.sub);
    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { product_id, quantity, notes, shipping_address } = req.body || {};
    const errors = {};
    if (!isPositiveNumber(product_id)) {
      addError(errors, 'product_id', 'product_id is required and must be a positive number');
    }
    if (quantity !== undefined && !isPositiveNumber(quantity)) {
      addError(errors, 'quantity', 'quantity must be a positive number');
    }
    if (notes !== undefined && notes !== null && !isNonEmptyString(String(notes))) {
      addError(errors, 'notes', 'notes must be a non-empty string when provided');
    }
    if (shipping_address !== undefined && shipping_address !== null && !isNonEmptyString(String(shipping_address))) {
      addError(errors, 'shipping_address', 'shipping_address must be a non-empty string when provided');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const product = await productsRepo.findByIdMarketplace(Number(product_id));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const qty = Number(quantity || 1);
    const unitPrice = Number.isFinite(Number(product.price)) ? Number(product.price) : null;
    const totalPrice = unitPrice === null ? null : Number((unitPrice * qty).toFixed(2));
    const result = await ordersRepo.createForClient({
      client_id: clientId,
      product_id: Number(product_id),
      quantity: qty,
      unit_price: unitPrice,
      total_price: totalPrice,
      status: 'pending',
      notes: notes || null,
      shipping_address: shipping_address || null,
      created_by: clientId,
      updated_by: clientId,
      is_active: true
    });
    if (!result.insertId) {
      return res.status(400).json({ error: 'Order creation failed' });
    }
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const clientId = Number(req.client?.sub);
    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const rows = await ordersRepo.findAllByClient(clientId);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    const clientId = Number(req.client?.sub);
    const id = Number(req.params.id);
    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!id) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const row = await ordersRepo.findByIdForClient(id, clientId);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(row);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  create,
  list,
  getById
};
