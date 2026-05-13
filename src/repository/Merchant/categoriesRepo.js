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
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT c.*
       FROM categories c
       LEFT JOIN users creator ON creator.id = c.created_by
       LEFT JOIN product_categories pc ON pc.category_id = c.id
       LEFT JOIN products p ON p.id = pc.product_id
       LEFT JOIN branches b ON b.id = p.branch_id
       WHERE b.merchant_id = ?
          OR creator.merchant_id = ?
          OR c.created_by IS NULL`,
      [merchantId, merchantId]
    );
    return rows;
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
      return repo.findAll();
    }
    throw err;
  }
};

module.exports = repo;
