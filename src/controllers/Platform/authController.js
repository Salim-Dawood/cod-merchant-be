const jwt = require('jsonwebtoken');
const platformAdminsRepo = require('../../repository/Platform/platformAdminsRepo');
const { hashPassword, isHashed, verifyPassword } = require('../../utils/password');
const { isNonEmptyString, isValidEmail, addError, hasErrors } = require('../../utils/validation');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function signAccessToken(admin) {
  return jwt.sign(
    {
      type: 'platform',
      sub: admin.id,
      email: admin.email,
      platform_role_id: admin.platform_role_id || null
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(admin) {
  return jwt.sign(
    { sub: admin.id },
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

    const admin = await platformAdminsRepo.findByEmail(email);
    if (admin) {
      if (!isHashed(admin.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const passwordValid = await verifyPassword(password, admin.password);

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const accessToken = signAccessToken(admin);
      const refreshToken = signRefreshToken(admin);

      res.cookie('access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
      res.cookie('refresh_token', refreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

      await platformAdminsRepo.update(admin.id, { last_login_at: new Date() });

      return res.json({
        id: admin.id,
        email: admin.email,
        platform_role_id: admin.platform_role_id || null,
        access_token: accessToken,
        refresh_token: refreshToken
      });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || getBearerToken(req) || req.body?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const admin = await platformAdminsRepo.findById(payload.sub);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = signAccessToken(admin);
    const nextRefreshToken = signRefreshToken(admin);

    res.cookie('access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('refresh_token', nextRefreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    return res.json({ ok: true, access_token: accessToken, refresh_token: nextRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function logout(req, res) {
  res.clearCookie('access_token', cookieOptions());
  res.clearCookie('refresh_token', cookieOptions());
  return res.status(204).send();
}

async function register(req, res, next) {
  try {
    const { email, password, platform_role_id, status } = req.body || {};
    const errors = {};
    if (!isValidEmail(email)) {
      addError(errors, 'email', 'Email is required and must be valid');
    }
    if (!isNonEmptyString(password)) {
      addError(errors, 'password', 'Password is required');
    } else if (password.trim().length < 6) {
      addError(errors, 'password', 'Password must be at least 6 characters');
    }
    if (platform_role_id !== undefined && platform_role_id !== null && Number.isNaN(Number(platform_role_id))) {
      addError(errors, 'platform_role_id', 'platform_role_id must be a number');
    }
    if (status !== undefined && status !== null && !isNonEmptyString(status)) {
      addError(errors, 'status', 'status must be a non-empty string');
    }
    if (hasErrors(errors)) {
      return res.status(400).json({ errors });
    }

    const existing = await platformAdminsRepo.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const result = await platformAdminsRepo.create({
      email,
      password: await hashPassword(password),
      platform_role_id: platform_role_id || null,
      status: status || 'active'
    });

    if (!result.insertId) {
      return res.status(400).json({ error: 'Registration failed' });
    }

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const admin = await platformAdminsRepo.findById(req.user.sub);
    if (!admin) {
      return res.status(404).json({ error: 'Not found' });
    }
    const permissions = await platformAdminsRepo.getPermissions(admin.id);
    return res.json({
      id: admin.id,
      email: admin.email,
      platform_role_id: admin.platform_role_id || null,
      avatar_url: admin.avatar_url || null,
      permissions
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  register
};
