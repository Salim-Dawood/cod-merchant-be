const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('buyers', [
  'company_name',
  'business_registration_number',
  'tax_id',
  'email',
  'phone',
  'status'
]);

repo.findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM buyers WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
};

module.exports = repo;
