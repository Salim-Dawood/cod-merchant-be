const service = require('../../services/Merchant/usersService');
const { findEmailConflicts, normalizeEmail } = require('../../services/identityService');
const { uploadImage } = require('../../utils/storage');
const pool = require('../../db');
const { isNonEmptyString, isValidEmail, isPositiveNumber, addError, hasErrors } = require('../../utils/validation');

const SUPPORTED_USER_ROLES = ['admin', 'merchant', 'buyer'];
const DEFAULT_ROLE_PERMISSIONS = {
  admin: 'all',
  merchant: ['view-merchant', 'view-branch', 'view-user', 'view-product', 'create-product', 'update-product', 'view-category', 'create-category', 'update-category', 'view-order', 'create-order', 'update-order'],
  buyer: ['view-merchant', 'view-branch', 'view-product', 'view-category', 'view-order']
};

async function getPermissionIds(connection) {
  const [rows] = await connection.query('SELECT id, key_name FROM permissions');
  return rows;
}

async function ensureRolePermissions(connection, roleId, roleKey) {
  const permissions = await getPermissionIds(connection);
  const map = new Map(permissions.map((perm) => [perm.key_name, perm.id]));
  const mode = DEFAULT_ROLE_PERMISSIONS[roleKey] || [];
  const ids = mode === 'all'
    ? permissions.map((perm) => perm.id)
    : mode.map((key) => map.get(key)).filter(Boolean);
  for (const permissionId of ids) {
    await connection.query(
      `INSERT IGNORE INTO branch_role_permissions (branch_role_id, permission_id)
       VALUES (?, ?)`,
      [roleId, permissionId]
    );
  }
}

async function resolveRoleIdByName(branchId, roleName) {
  if (!isPositiveNumber(branchId) || !SUPPORTED_USER_ROLES.includes(roleName)) {
    return null;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const normalizedName = roleName.charAt(0).toUpperCase() + roleName.slice(1);
    const [existing] = await connection.query(
      `SELECT id
       FROM branch_roles
       WHERE branch_id = ? AND LOWER(name) = ?
       LIMIT 1`,
      [branchId, roleName]
    );
    let roleId = existing[0]?.id || null;
    if (!roleId) {
      const [result] = await connection.query(
        `INSERT INTO branch_roles (branch_id, name, description, is_system)
         VALUES (?, ?, ?, 1)`,
        [branchId, normalizedName, `${normalizedName} role`]
      );
      roleId = result.insertId;
    }
    await ensureRolePermissions(connection, roleId, roleName);
    await connection.commit();
    return roleId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

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
    const {
      merchant_id,
      branch_id,
      merchant_role_id,
      role,
      email,
      phone,
      password,
      status,
      avatar_url
    } = payload;
    const errors = {};
    if (!isPositiveNumber(merchant_id)) {
      addError(errors, 'merchant_id', 'merchant_id is required and must be a positive number');
    }
    if (branch_id !== undefined && branch_id !== null && branch_id !== '' && !isPositiveNumber(branch_id)) {
      addError(errors, 'branch_id', 'branch_id must be a positive number');
    }
    if (merchant_role_id !== undefined && merchant_role_id !== null && !isPositiveNumber(merchant_role_id)) {
      addError(errors, 'merchant_role_id', 'merchant_role_id must be a positive number');
    }
    if (role !== undefined && role !== null && role !== '') {
      const normalizedRole = String(role).trim().toLowerCase();
      if (!SUPPORTED_USER_ROLES.includes(normalizedRole)) {
        addError(errors, 'role', `role must be one of: ${SUPPORTED_USER_ROLES.join(', ')}`);
      }
      if (!isPositiveNumber(branch_id)) {
        addError(errors, 'branch_id', 'branch_id is required when role is provided');
      }
    }
    if (!isValidEmail(email)) {
      addError(errors, 'email', 'email is required and must be valid');
    }
    if (!isNonEmptyString(password)) {
      addError(errors, 'password', 'password is required');
    } else if (password.trim().length < 6) {
      addError(errors, 'password', 'password must be at least 6 characters');
    }
    if (phone !== undefined && phone !== null && !isNonEmptyString(phone)) {
      addError(errors, 'phone', 'phone must be a non-empty string');
    }
    if (status !== undefined && status !== null && !isNonEmptyString(status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (avatar_url !== undefined && avatar_url !== null && avatar_url !== '' && !isNonEmptyString(avatar_url)) {
      addError(errors, 'avatar_url', 'avatar_url must be a non-empty string');
    }
    if (isValidEmail(email)) {
      const conflicts = await findEmailConflicts(email);
      if (conflicts.length > 0) {
        addError(errors, 'email', 'email already exists in another account');
      }
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }
    const createPayload = { ...payload };
    if (role !== undefined) {
      const normalizedRole = String(role || '').trim().toLowerCase();
      if (SUPPORTED_USER_ROLES.includes(normalizedRole)) {
        const resolvedRoleId = await resolveRoleIdByName(Number(branch_id), normalizedRole);
        createPayload.merchant_role_id = resolvedRoleId;
      }
      delete createPayload.role;
    }
    const result = await service.create(createPayload);
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
      'merchant_id',
      'branch_id',
      'merchant_role_id',
      'role',
      'email',
      'phone',
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
    if (payload.merchant_id !== undefined && !isPositiveNumber(payload.merchant_id)) {
      addError(errors, 'merchant_id', 'merchant_id must be a positive number');
    }
    if (payload.branch_id !== undefined && payload.branch_id !== null && payload.branch_id !== '' && !isPositiveNumber(payload.branch_id)) {
      addError(errors, 'branch_id', 'branch_id must be a positive number');
    }
    if (payload.merchant_role_id !== undefined && payload.merchant_role_id !== null && !isPositiveNumber(payload.merchant_role_id)) {
      addError(errors, 'merchant_role_id', 'merchant_role_id must be a positive number');
    }
    if (payload.role !== undefined && payload.role !== null && payload.role !== '') {
      const normalizedRole = String(payload.role).trim().toLowerCase();
      if (!SUPPORTED_USER_ROLES.includes(normalizedRole)) {
        addError(errors, 'role', `role must be one of: ${SUPPORTED_USER_ROLES.join(', ')}`);
      }
      const branchToUse = payload.branch_id || (await service.getById(id))?.branch_id;
      if (!isPositiveNumber(branchToUse)) {
        addError(errors, 'branch_id', 'branch_id is required when role is provided');
      }
    }
    if (payload.email !== undefined && !isValidEmail(payload.email)) {
      addError(errors, 'email', 'email must be a valid email');
    }
    if (payload.password !== undefined && !isNonEmptyString(payload.password)) {
      addError(errors, 'password', 'password must be a non-empty string');
    } else if (payload.password !== undefined && payload.password.trim().length < 6) {
      addError(errors, 'password', 'password must be at least 6 characters');
    }
    if (payload.phone !== undefined && payload.phone !== null && !isNonEmptyString(payload.phone)) {
      addError(errors, 'phone', 'phone must be a non-empty string');
    }
    if (payload.status !== undefined && payload.status !== null && !isNonEmptyString(payload.status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (payload.avatar_url !== undefined && payload.avatar_url !== null && payload.avatar_url !== '' && !isNonEmptyString(payload.avatar_url)) {
      addError(errors, 'avatar_url', 'avatar_url must be a non-empty string');
    }
    if (payload.email !== undefined && isValidEmail(payload.email)) {
      const existing = await service.getById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Not found' });
      }
      const nextEmail = normalizeEmail(payload.email);
      const currentEmail = normalizeEmail(existing.email);
      if (nextEmail !== currentEmail) {
        const conflicts = await findEmailConflicts(nextEmail);
        if (conflicts.length > 0) {
          addError(errors, 'email', 'email already exists in another account');
        }
      }
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }
    const updatePayload = { ...payload };
    if (payload.role !== undefined) {
      const normalizedRole = String(payload.role || '').trim().toLowerCase();
      if (SUPPORTED_USER_ROLES.includes(normalizedRole)) {
        const existingUser = await service.getById(id);
        if (!existingUser) {
          return res.status(404).json({ error: 'Not found' });
        }
        const branchToUse = Number(updatePayload.branch_id || existingUser.branch_id);
        const resolvedRoleId = await resolveRoleIdByName(branchToUse, normalizedRole);
        updatePayload.merchant_role_id = resolvedRoleId;
      }
      delete updatePayload.role;
    }
    const result = await service.update(id, updatePayload);
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
        prefix: `merchant-user-${id}`
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
