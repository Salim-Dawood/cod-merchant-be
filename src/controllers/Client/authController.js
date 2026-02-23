const jwt = require('jsonwebtoken');
const platformClientsRepo = require('../../repository/Client/platformClientsRepo');
const platformClientRolesRepo = require('../../repository/Client/platformClientRolesRepo');
const { hashPassword, isHashed, verifyPassword } = require('../../utils/password');
const { isNonEmptyString, isValidEmail, addError, hasErrors } = require('../../utils/validation');
const passwordResetService = require('../../services/passwordResetService');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';
const DEFAULT_CLIENT_ROLE = process.env.DEFAULT_CLIENT_ROLE || 'Buyer';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
  };
}

function signAccessToken(client) {
  return jwt.sign(
    {
      type: 'client',
      sub: client.id,
      email: client.email,
      platform_client_role_id: client.platform_client_role_id || null
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(client) {
  return jwt.sign(
    { type: 'client', sub: client.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

async function resolveClientRoleId(requestedRoleId) {
  if (requestedRoleId !== undefined && requestedRoleId !== null) {
    return Number(requestedRoleId);
  }
  const roles = await platformClientRolesRepo.findAll();
  const defaultRole = roles.find(
    (role) => String(role.name || '').toLowerCase() === DEFAULT_CLIENT_ROLE.toLowerCase()
  );
  if (defaultRole) {
    return defaultRole.id;
  }
  const result = await platformClientRolesRepo.create({
    name: DEFAULT_CLIENT_ROLE,
    is_active: true
  });
  return result.insertId || null;
}

async function register(req, res, next) {
  try {
    const { first_name, last_name, email, phone, password, platform_client_role_id } = req.body || {};
    const errors = {};
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
    } else if (password.trim().length < 6) {
      addError(errors, 'password', 'Password must be at least 6 characters');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const existing = await platformClientsRepo.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const roleId = await resolveClientRoleId(platform_client_role_id);
    const result = await platformClientsRepo.create({
      platform_client_role_id: roleId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || null,
      password: await hashPassword(password),
      status: 'active',
      is_active: true
    });
    if (!result.insertId) {
      return res.status(400).json({ error: 'Registration failed' });
    }

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const client = await platformClientsRepo.findByEmail(email.trim().toLowerCase());
    if (!client || !isHashed(client.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (client.status !== 'active' || client.is_active === 0) {
      return res.status(403).json({ error: 'Account is not active' });
    }
    const passwordValid = await verifyPassword(password, client.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(client);
    const refreshToken = signRefreshToken(client);
    res.cookie('client_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('client_refresh_token', refreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    return res.json({
      id: client.id,
      email: client.email,
      first_name: client.first_name,
      last_name: client.last_name,
      platform_client_role_id: client.platform_client_role_id || null,
      access_token: accessToken,
      refresh_token: refreshToken
    });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.client_refresh_token || getBearerToken(req) || req.body?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.type !== 'client') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await platformClientsRepo.findById(payload.sub);
    if (!client || client.status !== 'active' || client.is_active === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = signAccessToken(client);
    const nextRefreshToken = signRefreshToken(client);
    res.cookie('client_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('client_refresh_token', nextRefreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });
    return res.json({ ok: true, access_token: accessToken, refresh_token: nextRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function logout(req, res) {
  res.clearCookie('client_access_token', cookieOptions());
  res.clearCookie('client_refresh_token', cookieOptions());
  return res.status(204).send();
}

async function me(req, res, next) {
  try {
    const clientId = req.client?.sub;
    if (!clientId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const client = await platformClientsRepo.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({
      id: client.id,
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.phone || null,
      role_name: client.role_name || null,
      platform_client_role_id: client.platform_client_role_id || null,
      status: client.status
    });
  } catch (err) {
    return next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const result = await passwordResetService.requestReset('client', email);
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
    const result = await passwordResetService.resetPassword('client', String(token), String(password));
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
