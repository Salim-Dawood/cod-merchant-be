const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('product_images', [
  'product_id',
  'url',
  'sort_order',
  'is_active'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT pi.*
     FROM product_images pi
     JOIN products p ON p.id = pi.product_id
     WHERE p.branch_id = ?`,
    [branchId]
  );
  return rows;
};

module.exports = repo;
