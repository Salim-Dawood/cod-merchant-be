const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branch_roles', [
  'branch_id',
  'name',
  'description',
  'is_system'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM branch_roles WHERE branch_id = ?', [branchId]);
  return rows;
};

module.exports = repo;
