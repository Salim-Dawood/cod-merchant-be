const pool = require('../db');

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO password_reset_tokens (actor_type, actor_id, email, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [data.actor_type, data.actor_id, data.email, data.token_hash, data.expires_at]
  );
  return result;
}

async function invalidateOutstanding(actorType, actorId) {
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
     WHERE actor_type = ? AND actor_id = ? AND used_at IS NULL`,
    [actorType, actorId]
  );
}

async function findActiveByTokenHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT *
     FROM password_reset_tokens
     WHERE token_hash = ?
       AND used_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY id DESC
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function markUsed(id) {
  const [result] = await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE id = ? AND used_at IS NULL`,
    [id]
  );
  return result;
}

module.exports = {
  create,
  invalidateOutstanding,
  findActiveByTokenHash,
  markUsed
};
