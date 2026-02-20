const pool = require('../../db');
const { buildInsert } = require('../common');

const allowedFields = [
  'client_id',
  'product_id',
  'quantity',
  'unit_price',
  'total_price',
  'status',
  'notes',
  'shipping_address',
  'created_by',
  'updated_by',
  'is_active'
];

async function findAllByClient(clientId) {
  const [rows] = await pool.query(
    `SELECT o.*, p.name AS product_name, p.slug AS product_slug
     FROM client_orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE o.client_id = ?
       AND (o.is_active IS NULL OR o.is_active = 1)
     ORDER BY o.id DESC`,
    [clientId]
  );
  return rows;
}

async function findByIdForClient(id, clientId) {
  const [rows] = await pool.query(
    `SELECT o.*, p.name AS product_name, p.slug AS product_slug
     FROM client_orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE o.id = ? AND o.client_id = ?
       AND (o.is_active IS NULL OR o.is_active = 1)
     LIMIT 1`,
    [id, clientId]
  );
  return rows[0] || null;
}

async function createForClient(payload) {
  const stmt = buildInsert('client_orders', payload, allowedFields);
  if (!stmt) {
    return { insertId: null, affectedRows: 0 };
  }
  const [result] = await pool.query(stmt.sql, stmt.params);
  return result;
}

module.exports = {
  findAllByClient,
  findByIdForClient,
  createForClient
};
