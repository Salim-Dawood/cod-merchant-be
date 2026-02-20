const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('platform_clients', [
  'platform_client_role_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'password',
  'status',
  'created_by',
  'updated_by',
  'is_active'
]);

const baseQuery = `
  SELECT pc.*, pcr.name AS role_name
  FROM platform_clients pc
  LEFT JOIN platform_client_roles pcr ON pcr.id = pc.platform_client_role_id
`;

repo.findAll = async () => {
  const [rows] = await pool.query(baseQuery);
  return rows;
};

repo.findById = async (id) => {
  const [rows] = await pool.query(`${baseQuery} WHERE pc.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

repo.findByEmail = async (email) => {
  const [rows] = await pool.query(`${baseQuery} WHERE pc.email = ? LIMIT 1`, [email]);
  return rows[0] || null;
};

module.exports = repo;
