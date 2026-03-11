const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('permissions', [
  'key_name',
  'description',
  'group_name'
]);

repo.findAllForMerchant = async (merchant) => {
  return repo.findAll();
};

repo.findAllByRoleId = async (roleId) => {
  if (!roleId) {
    return [];
  }
  const [rows] = await pool.query(
    `SELECT p.*
     FROM permissions p
     JOIN branch_role_permissions brp ON brp.permission_id = p.id
     WHERE brp.branch_role_id = ?`,
    [roleId]
  );
  return rows;
};

module.exports = repo;
