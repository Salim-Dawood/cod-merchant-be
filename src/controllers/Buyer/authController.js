const jwt = require('jsonwebtoken');
const pool = require('../../db');
const buyersRepo = require('../../repository/Buyer/buyersRepo');
const buyerUsersRepo = require('../../repository/Buyer/buyerUsersRepo');
const { hashPassword, isHashed, verifyPassword } = require('../../utils/password');
const { isNonEmptyString, isValidEmail, addError, hasErrors } = require('../../utils/validation');
const passwordResetService = require('../../services/passwordResetService');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      type: 'buyer',
      sub: user.id,
      buyer_id: user.buyer_id,
      email: user.email,
      buyer_role_id: user.role_id || null
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { type: 'buyer', sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function register(req, res, next) {
  const {
    company_name,
    business_registration_number,
    tax_id,
    company_email,
    email,
    phone,
    first_name,
    last_name,
    password
  } = req.body || {};

  const errors = {};
  const buyerEmail = normalizeEmail(company_email || email);
  const userEmail = normalizeEmail(email);

  if (!isNonEmptyString(company_name)) {
    addError(errors, 'company_name', 'company_name is required');
  }
  if (!isValidEmail(buyerEmail)) {
    addError(errors, 'company_email', 'company_email (or email) must be valid');
  }
  if (!isValidEmail(userEmail)) {
    addError(errors, 'email', 'email is required and must be valid');
  }
  if (!isNonEmptyString(first_name)) {
    addError(errors, 'first_name', 'first_name is required');
  }
  if (!isNonEmptyString(last_name)) {
    addError(errors, 'last_name', 'last_name is required');
  }
  if (!isNonEmptyString(password)) {
    addError(errors, 'password', 'password is required');
  } else if (String(password).trim().length < 6) {
    addError(errors, 'password', 'Password must be at least 6 characters');
  }
  if (hasErrors(errors)) {
    return res.status(400).json({ errors });
  }

  const existingBuyer = await buyersRepo.findByEmail(buyerEmail);
  if (existingBuyer) {
    return res.status(409).json({ error: 'Company email already exists' });
  }
  const existingUser = await buyerUsersRepo.findByEmail(userEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'User email already exists' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [buyerResult] = await connection.query(
      `INSERT INTO buyers
       (company_name, business_registration_number, tax_id, email, phone, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        company_name,
        business_registration_number || null,
        tax_id || null,
        buyerEmail,
        phone || null,
        'active'
      ]
    );
    const buyerId = buyerResult.insertId;

    const [roleResult] = await connection.query(
      `INSERT INTO buyer_roles (buyer_id, name, description, is_system)
       VALUES (?, ?, ?, ?)`,
      [buyerId, 'Buyer Admin', 'Default buyer administrator', 1]
    );
    const roleId = roleResult.insertId;

    try {
      const [permissionRows] = await connection.query('SELECT id FROM buyer_permissions');
      for (const perm of permissionRows) {
        await connection.query(
          `INSERT IGNORE INTO buyer_role_permissions (buyer_role_id, buyer_permission_id)
           VALUES (?, ?)`,
          [roleId, perm.id]
        );
      }
    } catch (err) {
      if (!(err && err.code === 'ER_NO_SUCH_TABLE')) {
        throw err;
      }
    }

    const passwordHash = await hashPassword(password);
    const [userResult] = await connection.query(
      `INSERT INTO buyer_users
       (buyer_id, first_name, last_name, email, password_hash, phone, role_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [buyerId, first_name, last_name, userEmail, passwordHash, phone || null, roleId, 'active']
    );

    await connection.commit();
    return res.status(201).json({
      buyer_id: buyerId,
      buyer_user_id: userResult.insertId,
      role_id: roleId
    });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const errors = {};
    if (!isValidEmail(email)) {
      addError(errors, 'email', 'Email is required and must be valid');
    }
    if (!isNonEmptyString(password)) {
      addError(errors, 'password', 'Password is required');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const user = await buyerUsersRepo.findByEmail(normalizeEmail(email));
    if (!user || !isHashed(user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    if (user.buyer_status === 'suspended') {
      return res.status(403).json({ error: 'Buyer account is suspended' });
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie('buyer_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('buyer_refresh_token', refreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    await buyerUsersRepo.update(user.id, { last_login_at: new Date() });

    return res.json({
      id: user.id,
      buyer_id: user.buyer_id,
      email: user.email,
      role_id: user.role_id || null,
      role_name: user.role_name || null,
      access_token: accessToken,
      refresh_token: refreshToken
    });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.buyer_refresh_token || getBearerToken(req) || req.body?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.type !== 'buyer') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await buyerUsersRepo.findById(payload.sub);
    if (!user || user.status !== 'active' || user.buyer_status === 'suspended') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = signAccessToken(user);
    const nextRefreshToken = signRefreshToken(user);

    res.cookie('buyer_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('buyer_refresh_token', nextRefreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    return res.json({ ok: true, access_token: accessToken, refresh_token: nextRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function logout(req, res) {
  res.clearCookie('buyer_access_token', cookieOptions());
  res.clearCookie('buyer_refresh_token', cookieOptions());
  return res.status(204).send();
}

async function me(req, res, next) {
  try {
    const userId = req.buyerUser?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await buyerUsersRepo.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    const permissions = await buyerUsersRepo.findPermissionsByUserId(user.id);
    return res.json({
      id: user.id,
      buyer_id: user.buyer_id,
      company_name: user.company_name,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone || null,
      role_id: user.role_id || null,
      role_name: user.role_name || null,
      status: user.status,
      buyer_status: user.buyer_status,
      permissions
    });
  } catch (err) {
    return next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const result = await passwordResetService.requestReset('buyer', email);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    if (String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await passwordResetService.resetPassword('buyer', String(token), String(password));
    if (!result.ok) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }
    return res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword
};
