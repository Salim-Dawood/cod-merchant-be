const service = require('../../services/Merchant/branchesService');
const { uploadImage } = require('../../utils/storage');
const { isPositiveNumber } = require('../../utils/validation');

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
    const result = await service.create(payload);
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

async function uploadLogo(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Logo image is required' });
    }
    let url = '';
    if (req.file.buffer) {
      url = await uploadImage({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        prefix: `branch-logo-${id}`
      });
    }
    if (!url && req.file.filename) {
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      url = `${baseUrl}/uploads/${req.file.filename}`;
    }
    if (!url) {
      return res.status(400).json({ error: 'Upload failed' });
    }
    const result = await service.update(id, { logo_url: url });
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ logo_url: url });
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
  uploadLogo
};
