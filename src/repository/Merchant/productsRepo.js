const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('products', [
  'branch_id',
  'merchant_id',
  'name',
  'slug',
  'description',
  'provider_name',
  'base_price',
  'min_order_quantity',
  'max_order_quantity',
  'status',
  'is_active',
  'created_by',
  'updated_by'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT p.*
     FROM products p
     JOIN branches b ON b.id = p.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

module.exports = repo;
