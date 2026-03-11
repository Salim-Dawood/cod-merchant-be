const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branches', [
  'merchant_id',
  'parent_branch_id',
  'name',
  'flag_url',
  'code',
  'type',
  'is_main',
  'status'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM branches WHERE merchant_id = ?', [merchantId]);
  return rows;
};

module.exports = repo;
