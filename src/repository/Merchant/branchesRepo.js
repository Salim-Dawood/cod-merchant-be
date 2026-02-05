const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branches', [
  'merchant_id',
  'parent_branch_id',
  'name',
  'code',
  'type',
  'is_main',
  'status'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM branches WHERE id = ?', [branchId]);
  return rows;
};

module.exports = repo;
