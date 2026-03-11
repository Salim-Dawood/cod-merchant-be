const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('product_images', [
  'product_id',
  'url',
  'sort_order',
  'is_active'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT pi.*
     FROM product_images pi
     JOIN products p ON p.id = pi.product_id
     JOIN branches b ON b.id = p.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

module.exports = repo;
