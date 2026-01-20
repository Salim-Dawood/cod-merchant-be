const pool = require('../db');
const { buildInsert, buildUpdate } = require('./common');

function createRepo(table, allowedFields) {
  return {
    async findAll() {
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      return rows;
    },
    async findById(id) {
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      return rows[0] || null;
    },
    async create(data) {
      const stmt = buildInsert(table, data, allowedFields);
      if (!stmt) {
        return { insertId: null, affectedRows: 0 };
      }
      const [result] = await pool.query(stmt.sql, stmt.params);
      return result;
    },
    async update(id, data) {
      const stmt = buildUpdate(table, data, allowedFields, id);
      if (!stmt) {
        return { affectedRows: 0 };
      }
      const [result] = await pool.query(stmt.sql, stmt.params);
      return result;
    },
    async remove(id) {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      return result;
    }
  };
}

module.exports = createRepo;
