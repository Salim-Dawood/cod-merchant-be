const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('users', [
  'merchant_id',
  'branch_id',
  'merchant_role_id',
  'first_name',
  'last_name',
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
  const [rows] = await pool.query(baseQuery);
  return rows;
};

repo.findById = async (id) => {
  const [rows] = await pool.query(`${baseQuery} WHERE u.id = ?`, [id]);
  return rows[0] || null;
};

repo.findByEmail = async (email) => {
  const [rows] = await pool.query(`${baseQuery} WHERE u.email = ? LIMIT 1`, [email]);
  return rows[0] || null;
};

module.exports = repo;
