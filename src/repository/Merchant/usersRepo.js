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

repo.findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
};

module.exports = repo;
