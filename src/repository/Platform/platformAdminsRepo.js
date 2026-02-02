const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('platform_admins', [
  'platform_role_id',
  'first_name',
  'last_name',
  'email',
  'password',
  'status',
  'last_login_at'
]);

const baseQuery = `
  SELECT pa.*, pap.url AS avatar_url
  FROM platform_admins pa
  LEFT JOIN platform_admin_photos pap
    ON pap.id = (
      SELECT id
      FROM platform_admin_photos
      WHERE platform_admin_id = pa.id AND is_active = 1
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
      const [rows] = await pool.query('SELECT * FROM platform_admins');
      return rows;
    }
    throw err;
  }
};

repo.findById = async (id) => {
  try {
    const [rows] = await pool.query(`${baseQuery} WHERE pa.id = ?`, [id]);
    return rows[0] || null;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      const [rows] = await pool.query('SELECT * FROM platform_admins WHERE id = ? LIMIT 1', [id]);
      return rows[0] || null;
    }
    throw err;
  }
};

repo.findByEmail = async (email) => {
  try {
    const [rows] = await pool.query(`${baseQuery} WHERE pa.email = ? LIMIT 1`, [email]);
    return rows[0] || null;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      const [rows] = await pool.query('SELECT * FROM platform_admins WHERE email = ? LIMIT 1', [email]);
      return rows[0] || null;
    }
    throw err;
  }
};

repo.getPermissions = async (adminId) => {
  try {
    const [rows] = await pool.query(
      `SELECT pp.key_name
       FROM platform_admins pa
       JOIN platform_role_permissions prp ON prp.platform_role_id = pa.platform_role_id
       JOIN platform_permissions pp ON pp.id = prp.platform_permission_id
       WHERE pa.id = ?`,
      [adminId]
    );
    return rows.map((row) => row.key_name);
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return [];
    }
    throw err;
  }
};

module.exports = repo;
