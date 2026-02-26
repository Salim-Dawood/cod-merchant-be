const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('buyer_users', [
  'buyer_id',
  'first_name',
  'last_name',
  'email',
  'password_hash',
  'phone',
  'role_id',
  'status',
  'email_verified_at',
  'last_login_at'
]);

const baseQuery = `
  SELECT
    bu.*,
    b.company_name,
    b.status AS buyer_status,
    br.name AS role_name
  FROM buyer_users bu
  JOIN buyers b ON b.id = bu.buyer_id
  LEFT JOIN buyer_roles br ON br.id = bu.role_id
`;

repo.findById = async (id) => {
  const [rows] = await pool.query(`${baseQuery} WHERE bu.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

repo.findByEmail = async (email) => {
  const [rows] = await pool.query(`${baseQuery} WHERE bu.email = ? LIMIT 1`, [email]);
  return rows[0] || null;
};

repo.findPermissionsByUserId = async (userId) => {
  const [rows] = await pool.query(
    `SELECT bp.name
     FROM buyer_users bu
     LEFT JOIN buyer_roles br ON br.id = bu.role_id
     LEFT JOIN buyer_role_permissions brp ON brp.buyer_role_id = br.id
     LEFT JOIN buyer_permissions bp ON bp.id = brp.buyer_permission_id
     WHERE bu.id = ?
       AND bp.id IS NOT NULL`,
    [userId]
  );
  return rows.map((row) => row.name);
};

module.exports = repo;
