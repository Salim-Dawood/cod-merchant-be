const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('permissions', [
  'key_name',
  'description',
  'group_name'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT DISTINCT p.*
     FROM permissions p
     JOIN branch_role_permissions brp ON brp.permission_id = p.id
     JOIN branch_roles br ON br.id = brp.branch_role_id
     WHERE br.branch_id = ?`,
    [branchId]
  );
  return rows;
};

module.exports = repo;
