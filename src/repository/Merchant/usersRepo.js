const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('users', [
  'merchant_id',
  'branch_id',
  'merchant_role_id',
  'email',
  'phone',
  'password',
  'status',
  'last_login_at'
]);

const baseQuery = `
  SELECT u.*, up.url AS avatar_url
  FROM users u
  LEFT JOIN user_photos up
    ON up.id = (
      SELECT id
      FROM user_photos
      WHERE user_id = u.id AND is_active = 1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    )
`;

repo.findAll = async () => {
  try {
    const [rows] = await pool.query(baseQuery);
    return rows;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      const [rows] = await pool.query('SELECT * FROM users');
      return rows;
    }
    throw err;
  }
};

repo.findById = async (id) => {
  try {
    const [rows] = await pool.query(`${baseQuery} WHERE u.id = ?`, [id]);
    return rows[0] || null;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      return rows[0] || null;
    }
    throw err;
  }
};

repo.findByEmail = async (email) => {
  try {
    const [rows] = await pool.query(`${baseQuery} WHERE u.email = ? LIMIT 1`, [email]);
    return rows[0] || null;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      return rows[0] || null;
    }
    throw err;
  }
};

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(`${baseQuery} WHERE u.branch_id = ?`, [branchId]);
  return rows;
};

module.exports = repo;
