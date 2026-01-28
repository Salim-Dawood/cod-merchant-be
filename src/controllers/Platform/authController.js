const jwt = require('jsonwebtoken');
const platformAdminsRepo = require('../../repository/Platform/platformAdminsRepo');
const usersRepo = require('../../repository/Merchant/usersRepo');
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

function signMerchantAccessToken(user) {
  return jwt.sign(
    {
      type: 'merchant',
      sub: user.id,
      email: user.email,
      merchant_id: user.merchant_id,
      branch_id: user.branch_id,
      merchant_role_id: user.merchant_role_id || null
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signMerchantRefreshToken(user) {
  return jwt.sign(
    { type: 'merchant', sub: user.id },
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
      let passwordValid = false;
      if (isHashed(admin.password)) {
        passwordValid = await verifyPassword(password, admin.password);
      } else if (admin.password === password) {
        passwordValid = true;
        const nextHash = await hashPassword(password);
        await platformAdminsRepo.update(admin.id, { password: nextHash });
      }

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
        first_name: admin.first_name,
        last_name: admin.last_name,
        platform_role_id: admin.platform_role_id || null,
        access_token: accessToken,
        refresh_token: refreshToken
      });
    }

    const user = await usersRepo.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let passwordValid = false;
    if (isHashed(user.password)) {
      passwordValid = await verifyPassword(password, user.password);
    } else if (user.password === password) {
      passwordValid = true;
      const nextHash = await hashPassword(password);
      await usersRepo.update(user.id, { password: nextHash });
    }

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = signMerchantAccessToken(user);
    const refreshToken = signMerchantRefreshToken(user);

    res.cookie('merchant_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('merchant_refresh_token', refreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    await usersRepo.update(user.id, { last_login_at: new Date() });

    return res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      merchant_id: user.merchant_id,
      branch_id: user.branch_id,
      merchant_role_id: user.merchant_role_id || null,
      access_token: accessToken,
      refresh_token: refreshToken
    });
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
    const { first_name, last_name, email, password, platform_role_id, status } = req.body || {};
    const errors = {};
    if (!isNonEmptyString(first_name)) {
      addError(errors, 'first_name', 'First name is required');
    }
    if (!isNonEmptyString(last_name)) {
      addError(errors, 'last_name', 'Last name is required');
    }
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
      first_name,
      last_name,
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
      first_name: admin.first_name,
      last_name: admin.last_name,
      platform_role_id: admin.platform_role_id || null,
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
