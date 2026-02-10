const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branch_roles', [
  'branch_id',
  'name',
  'description',
  'is_system'
]);

repo.findAllForMerchant = async (merchant) => {
  const branchId = merchant?.branch_id;
  if (!branchId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM branch_roles WHERE branch_id = ?', [branchId]);
  return rows;
};

repo.findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM branch_roles WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

module.exports = repo;
