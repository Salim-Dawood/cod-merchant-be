const service = require('../../services/Merchant/productImagesService');
const { isPositiveNumber, isNonEmptyString, addError, hasErrors } = require('../../utils/validation');

async function list(req, res, next) {
  try {
    const merchant = req.merchant || null;
    const rows = merchant && service.listForMerchant
      ? await service.listForMerchant(merchant)
      : await service.list();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const row = await service.getById(id);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const payload = req.body || {};
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'Empty payload' });
    }
    const { product_id, url, sort_order, is_active } = payload;
    const errors = {};
    if (!isPositiveNumber(product_id)) {
      addError(errors, 'product_id', 'product_id is required and must be a positive number');
    }
    if (url !== undefined && url !== null && url !== '' && !isNonEmptyString(url)) {
      addError(errors, 'url', 'url must be a non-empty string');
    }
    if (sort_order !== undefined && sort_order !== null && Number.isNaN(Number(sort_order))) {
      addError(errors, 'sort_order', 'sort_order must be a number');
    }
    if (is_active !== undefined && is_active !== null && typeof is_active !== 'boolean') {
      addError(errors, 'is_active', 'is_active must be a boolean');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }
    const result = await service.create({
      product_id,
      url,
      sort_order: sort_order !== undefined ? Number(sort_order) : null,
      is_active: is_active !== undefined ? Boolean(is_active) : true
    });
    if (!result.insertId) {
      return res.status(400).json({ error: 'Insert failed' });
    }
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const payload = req.body || {};
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'Empty payload' });
    }
    const allowedKeys = ['product_id', 'url', 'sort_order', 'is_active'];
    const payloadKeys = Object.keys(payload);
    const invalidKey = payloadKeys.find((key) => !allowedKeys.includes(key));
    if (invalidKey) {
      return res.status(400).json({ errors: { [invalidKey]: ['Unknown field'] } });
    }
    const errors = {};
    if (payload.product_id !== undefined && !isPositiveNumber(payload.product_id)) {
      addError(errors, 'product_id', 'product_id must be a positive number');
    }
    if (payload.url !== undefined && payload.url !== null && payload.url !== '' && !isNonEmptyString(payload.url)) {
      addError(errors, 'url', 'url must be a non-empty string');
    }
    if (payload.sort_order !== undefined && payload.sort_order !== null && Number.isNaN(Number(payload.sort_order))) {
      addError(errors, 'sort_order', 'sort_order must be a number');
    }
    if (payload.is_active !== undefined && payload.is_active !== null && typeof payload.is_active !== 'boolean') {
      addError(errors, 'is_active', 'is_active must be a boolean');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }
    const result = await service.update(id, payload);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const result = await service.remove(id);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function uploadPhoto(req, res, next) {
  try {
    const productId = Number(req.body?.product_id);
    if (!isPositiveNumber(productId)) {
      return res.status(400).json({ error: 'product_id is required and must be a positive number' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }
    const sortOrder = req.body?.sort_order ? Number(req.body.sort_order) : null;
    const isActive = req.body?.is_active ? String(req.body.is_active) === 'true' : true;
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/uploads/${req.file.filename}`;
    const result = await service.create({
      product_id: productId,
      url,
      sort_order: Number.isNaN(sortOrder) ? null : sortOrder,
      is_active: isActive
    });
    if (!result.insertId) {
      return res.status(400).json({ error: 'Insert failed' });
    }
    return res.status(201).json({ id: result.insertId, url });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  uploadPhoto
};
