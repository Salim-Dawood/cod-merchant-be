const createRepo = require('../base');
const pool = require('../../db');

const repo = createRepo('buyer_roles', [
  'buyer_id',
  'name',
  'description',
  'is_system'
]);

repo.findByBuyerAndName = async (buyerId, name) => {
  const [rows] = await pool.query(
    'SELECT * FROM buyer_roles WHERE buyer_id = ? AND name = ? LIMIT 1',
    [buyerId, name]
  );
  return rows[0] || null;
};

module.exports = repo;
