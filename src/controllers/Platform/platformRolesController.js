const service = require('../../services/Platform/platformRolesService');
const { isNonEmptyString, isPositiveNumber, addError, hasErrors } = require('../../utils/validation');

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
    const { name, description, is_system } = payload;
    const errors = {};
    if (!isNonEmptyString(name)) {
      addError(errors, 'name', 'name is required');
    }
    if (description !== undefined && description !== null && !isNonEmptyString(description)) {
      addError(errors, 'description', 'description must be a non-empty string');
    }
    if (is_system !== undefined && is_system !== null && !isBooleanLike(is_system)) {
      addError(errors, 'is_system', 'is_system must be boolean');
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
    const allowedKeys = ['name', 'description', 'is_system'];
    const payloadKeys = Object.keys(payload);
    const invalidKey = payloadKeys.find((key) => !allowedKeys.includes(key));
    if (invalidKey) {
      return res.status(400).json({ errors: { [invalidKey]: ['Unknown field'] } });
    }
    const errors = {};
    if (payload.name !== undefined && !isNonEmptyString(payload.name)) {
      addError(errors, 'name', 'name must be a non-empty string');
    }
    if (payload.description !== undefined && payload.description !== null && !isNonEmptyString(payload.description)) {
      addError(errors, 'description', 'description must be a non-empty string');
    }
    if (payload.is_system !== undefined && payload.is_system !== null && !isBooleanLike(payload.is_system)) {
      addError(errors, 'is_system', 'is_system must be boolean');
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

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
