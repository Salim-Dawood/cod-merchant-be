const service = require('../../services/Platform/platformAdminsService');
const { uploadImage } = require('../../utils/storage');
const { isNonEmptyString, isValidEmail, isPositiveNumber, addError, hasErrors } = require('../../utils/validation');

async function list(req, res, next) {
  try {
    const rows = await service.list();
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
    const { email, password, platform_role_id, status, avatar_url } = payload;
    const errors = {};
    if (!isValidEmail(email)) {
      addError(errors, 'email', 'Email is required and must be valid');
    }
    if (!isNonEmptyString(password)) {
      addError(errors, 'password', 'Password is required');
    } else if (password.trim().length < 6) {
      addError(errors, 'password', 'Password must be at least 6 characters');
    }
    if (platform_role_id !== undefined && platform_role_id !== null && !isPositiveNumber(platform_role_id)) {
      addError(errors, 'platform_role_id', 'platform_role_id must be a positive number');
    }
    if (status !== undefined && status !== null && !isNonEmptyString(status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (avatar_url !== undefined && avatar_url !== null && avatar_url !== '' && !isNonEmptyString(avatar_url)) {
      addError(errors, 'avatar_url', 'avatar_url must be a non-empty string');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
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
    const allowedKeys = [
      'platform_role_id',
      'email',
      'password',
      'status',
      'avatar_url'
    ];
    const payloadKeys = Object.keys(payload);
    const invalidKey = payloadKeys.find((key) => !allowedKeys.includes(key));
    if (invalidKey) {
      return res.status(400).json({ errors: { [invalidKey]: ['Unknown field'] } });
    }
    const errors = {};
    if (payload.email !== undefined && !isValidEmail(payload.email)) {
      addError(errors, 'email', 'email must be a valid email');
    }
    if (payload.password !== undefined) {
      if (!isNonEmptyString(payload.password)) {
        addError(errors, 'password', 'password must be a non-empty string');
      } else if (payload.password.trim().length < 6) {
        addError(errors, 'password', 'Password must be at least 6 characters');
      }
    }
    if (payload.platform_role_id !== undefined && payload.platform_role_id !== null && !isPositiveNumber(payload.platform_role_id)) {
      addError(errors, 'platform_role_id', 'platform_role_id must be a positive number');
    }
    if (payload.status !== undefined && payload.status !== null && !isNonEmptyString(payload.status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (payload.avatar_url !== undefined && payload.avatar_url !== null && payload.avatar_url !== '' && !isNonEmptyString(payload.avatar_url)) {
      addError(errors, 'avatar_url', 'avatar_url must be a non-empty string');
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
    if (!id) {
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
    const id = Number(req.params.id);
    if (!isPositiveNumber(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }
    let url = '';
    if (req.file.buffer) {
      url = await uploadImage({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        prefix: `platform-admin-${id}`
      });
    }
    if (!url && req.file.filename) {
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      url = `${baseUrl}/uploads/${req.file.filename}`;
    }
    if (!url) {
      return res.status(400).json({ error: 'Upload failed' });
    }
    const result = await service.update(id, { avatar_url: url });
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ avatar_url: url });
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
