const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('merchants', [
  'merchant_code',
  'name',
  'legal_name',
  'email',
  'phone',
  'country',
  'city',
  'address',
  'status'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query('SELECT * FROM merchants WHERE id = ?', [merchantId]);
  return rows;
};

module.exports = repo;
