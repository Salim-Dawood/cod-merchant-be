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
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT DISTINCT c.*
     FROM categories c
     JOIN product_categories pc ON pc.category_id = c.id
     JOIN products p ON p.id = pc.product_id
     WHERE p.branch_id = ?`,
    [branchId]
  );
  return rows;
};

module.exports = repo;
