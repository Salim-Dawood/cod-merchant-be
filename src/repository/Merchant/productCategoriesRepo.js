const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('product_categories', [
  'product_id',
  'category_id',
  'is_active'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT pc.*
     FROM product_categories pc
     JOIN products p ON p.id = pc.product_id
     JOIN branches b ON b.id = p.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

module.exports = repo;
