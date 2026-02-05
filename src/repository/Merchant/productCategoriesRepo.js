const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('product_categories', [
  'product_id',
  'category_id',
  'is_active'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT pc.*
     FROM product_categories pc
     JOIN products p ON p.id = pc.product_id
     WHERE p.branch_id = ?`,
    [branchId]
  );
  return rows;
};

module.exports = repo;
