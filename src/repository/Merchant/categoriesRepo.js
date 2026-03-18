const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('categories', [
  'name',
  'slug',
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
    `SELECT DISTINCT c.*
     FROM categories c
     JOIN product_categories pc ON pc.category_id = c.id
     JOIN products p ON p.id = pc.product_id
     JOIN branches b ON b.id = p.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

module.exports = repo;
