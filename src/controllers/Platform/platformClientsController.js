const service = require('../../services/Platform/platformClientsService');
const { isNonEmptyString, isValidEmail, isPositiveNumber, addError, hasErrors } = require('../../utils/validation');

function isBooleanLike(value) {
  return typeof value === 'boolean' || value === 0 || value === 1 || value === '0' || value === '1';
}

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
    const { platform_client_role_id, first_name, last_name, email, phone, password, status, is_active } = payload;
    const errors = {};
    if (platform_client_role_id !== undefined && platform_client_role_id !== null && !isPositiveNumber(platform_client_role_id)) {
      addError(errors, 'platform_client_role_id', 'platform_client_role_id must be a positive number');
    }
    if (!isNonEmptyString(first_name)) {
      addError(errors, 'first_name', 'first_name is required');
    }
    if (!isNonEmptyString(last_name)) {
      addError(errors, 'last_name', 'last_name is required');
    }
    if (!isValidEmail(email)) {
      addError(errors, 'email', 'Email is required and must be valid');
    }
    if (!isNonEmptyString(password)) {
      addError(errors, 'password', 'Password is required');
    } else if (String(password).trim().length < 6) {
      addError(errors, 'password', 'Password must be at least 6 characters');
    }
    if (phone !== undefined && phone !== null && !isNonEmptyString(phone)) {
      addError(errors, 'phone', 'phone must be a non-empty string');
    }
    if (status !== undefined && status !== null && !isNonEmptyString(status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (is_active !== undefined && is_active !== null && !isBooleanLike(is_active)) {
      addError(errors, 'is_active', 'is_active must be boolean');
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
      'platform_client_role_id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'password',
      'status',
      'is_active'
    ];
    const invalidKey = Object.keys(payload).find((key) => !allowedKeys.includes(key));
    if (invalidKey) {
      return res.status(400).json({ errors: { [invalidKey]: ['Unknown field'] } });
    }
    const errors = {};
    if (payload.platform_client_role_id !== undefined && payload.platform_client_role_id !== null && !isPositiveNumber(payload.platform_client_role_id)) {
      addError(errors, 'platform_client_role_id', 'platform_client_role_id must be a positive number');
    }
    if (payload.first_name !== undefined && !isNonEmptyString(payload.first_name)) {
      addError(errors, 'first_name', 'first_name must be a non-empty string');
    }
    if (payload.last_name !== undefined && !isNonEmptyString(payload.last_name)) {
      addError(errors, 'last_name', 'last_name must be a non-empty string');
    }
    if (payload.email !== undefined && !isValidEmail(payload.email)) {
      addError(errors, 'email', 'email must be a valid email');
    }
    if (payload.phone !== undefined && payload.phone !== null && !isNonEmptyString(payload.phone)) {
      addError(errors, 'phone', 'phone must be a non-empty string');
    }
    if (payload.password !== undefined) {
      if (!isNonEmptyString(payload.password)) {
        addError(errors, 'password', 'password must be a non-empty string');
      } else if (String(payload.password).trim().length < 6) {
        addError(errors, 'password', 'Password must be at least 6 characters');
      }
    }
    if (payload.status !== undefined && payload.status !== null && !isNonEmptyString(payload.status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (payload.is_active !== undefined && payload.is_active !== null && !isBooleanLike(payload.is_active)) {
      addError(errors, 'is_active', 'is_active must be boolean');
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

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
