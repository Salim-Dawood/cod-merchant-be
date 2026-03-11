const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branch_role_permissions', [
  'branch_role_id',
  'permission_id'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT brp.*
     FROM branch_role_permissions brp
     JOIN branch_roles br ON br.id = brp.branch_role_id
     JOIN branches b ON b.id = br.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

module.exports = repo;
