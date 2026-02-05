const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branch_role_permissions', [
  'branch_role_id',
  'permission_id'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT brp.*
     FROM branch_role_permissions brp
     JOIN branch_roles br ON br.id = brp.branch_role_id
     WHERE br.branch_id = ?`,
    [branchId]
  );
  return rows;
};

module.exports = repo;
