const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('branch_roles', [
  'branch_id',
  'name',
  'description',
  'is_system'
]);

repo.findAllForMerchant = async (merchant) => {
  const merchantId = merchant?.merchant_id;
  if (!merchantId) {
    return repo.findAll();
  }
  const [rows] = await pool.query(
    `SELECT br.*
     FROM branch_roles br
     JOIN branches b ON b.id = br.branch_id
     WHERE b.merchant_id = ?`,
    [merchantId]
  );
  return rows;
};

repo.findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM branch_roles WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

module.exports = repo;
