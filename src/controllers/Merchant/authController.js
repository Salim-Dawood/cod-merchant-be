const jwt = require('jsonwebtoken');
const pool = require('../../db');
const usersRepo = require('../../repository/Merchant/usersRepo');
const branchRolesRepo = require('../../repository/Merchant/branchRolesRepo');
const permissionsRepo = require('../../repository/Merchant/permissionsRepo');
const { buildInsert } = require('../../repository/common');
const { hashPassword, isHashed, verifyPassword } = require('../../utils/password');

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

function signRefreshToken(user) {
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

function buildMerchantCode(name) {
  const safe = (name || 'merchant').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  const stamp = Date.now().toString().slice(-5);
  return `M${safe}${stamp}`;
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await usersRepo.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!isHashed(user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordValid = await verifyPassword(password, user.password);

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie('merchant_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('merchant_refresh_token', refreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    await usersRepo.update(user.id, { last_login_at: new Date() });

    return res.json({
      id: user.id,
      email: user.email,
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

async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.merchant_refresh_token || getBearerToken(req) || req.body?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.type !== 'merchant') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await usersRepo.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = signAccessToken(user);
    const nextRefreshToken = signRefreshToken(user);

    res.cookie('merchant_access_token', accessToken, { ...cookieOptions(), maxAge: 1000 * 60 * 15 });
    res.cookie('merchant_refresh_token', nextRefreshToken, { ...cookieOptions(), maxAge: 1000 * 60 * 60 * 24 * 7 });

    return res.json({ ok: true, access_token: accessToken, refresh_token: nextRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function logout(req, res) {
  res.clearCookie('merchant_access_token', cookieOptions());
  res.clearCookie('merchant_refresh_token', cookieOptions());
  return res.status(204).send();
}

async function me(req, res) {
  try {
    const userId = req.merchant?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await usersRepo.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    const role = user.merchant_role_id ? await branchRolesRepo.findById(user.merchant_role_id) : null;
    const permissions = user.merchant_role_id
      ? await permissionsRepo.findAllByRoleId(user.merchant_role_id)
      : [];
    return res.json({
      id: user.id,
      email: user.email,
      merchant_id: user.merchant_id,
      branch_id: user.branch_id,
      merchant_role_id: user.merchant_role_id || null,
      role_name: role?.name || null,
      permissions: permissions.map((perm) => perm.key_name),
      avatar_url: user.avatar_url || null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function register(req, res, next) {
  const {
    merchant_code,
    name,
    legal_name,
    email,
    phone,
    country,
    city,
    address,
    admin_email,
    admin_phone,
    admin_password
  } = req.body || {};

  if (!name || !email || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [merchantRows] = await connection.query(
      'SELECT id FROM merchants WHERE email = ? LIMIT 1',
      [email]
    );
    if (merchantRows.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Merchant email already exists' });
    }

    const [userRows] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [admin_email]
    );
    if (userRows.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Admin email already exists' });
    }

    let code = merchant_code || buildMerchantCode(name);
    const [codeRows] = await connection.query(
      'SELECT id FROM merchants WHERE merchant_code = ? LIMIT 1',
      [code]
    );
    if (codeRows.length) {
      code = buildMerchantCode(`${name}${Math.floor(Math.random() * 1000)}`);
    }

    const merchantInsert = buildInsert(
      'merchants',
      {
        merchant_code: code,
        name,
        legal_name: legal_name || name,
        email,
        phone,
        country,
        city,
        address,
        status: 'pending'
      },
      ['merchant_code', 'name', 'legal_name', 'email', 'phone', 'country', 'city', 'address', 'status']
    );
    const [merchantResult] = await connection.query(
      merchantInsert.sql,
      merchantInsert.params
    );
    const merchantId = merchantResult.insertId;

    const branchInsert = buildInsert(
      'branches',
      {
        merchant_id: merchantId,
        parent_branch_id: null,
        name: 'HQ',
        code: `${code}-HQ`,
        type: 'hq',
        is_main: true,
        status: 'active'
      },
      ['merchant_id', 'parent_branch_id', 'name', 'code', 'type', 'is_main', 'status']
    );
    const [branchResult] = await connection.query(
      branchInsert.sql,
      branchInsert.params
    );
    const branchId = branchResult.insertId;

    const roleInsert = buildInsert(
      'branch_roles',
      {
        branch_id: branchId,
        name: 'Owner',
        description: 'Merchant owner',
        is_system: true
      },
      ['branch_id', 'name', 'description', 'is_system']
    );
    const [roleResult] = await connection.query(roleInsert.sql, roleInsert.params);
    const roleId = roleResult.insertId;

    const userInsert = buildInsert(
      'users',
      {
        merchant_id: merchantId,
        branch_id: branchId,
        merchant_role_id: roleId,
        email: admin_email,
        phone: admin_phone || null,
        password: await hashPassword(admin_password),
        status: 'active'
      },
      [
        'merchant_id',
        'branch_id',
        'merchant_role_id',
        'email',
        'phone',
        'password',
        'status'
      ]
    );
    await connection.query(userInsert.sql, userInsert.params);

    await connection.commit();
    return res.status(201).json({
      merchant_id: merchantId,
      branch_id: branchId
    });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
}

async function registerClient(req, res, next) {
  return res.status(410).json({
    error: 'Moved',
    message: 'Client registration moved to /api/client/auth/register'
  });
}

module.exports = {
  register,
  registerClient,
  login,
  refresh,
  logout,
  me
};
