const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('products', [
  'branch_id',
  'name',
  'slug',
  'description',
  'moq',
  'status',
  'is_active',
  'created_by',
  'updated_by'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM products WHERE branch_id = ?', [branchId]);
  return rows;
};

module.exports = repo;
