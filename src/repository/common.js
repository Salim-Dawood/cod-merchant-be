function buildInsert(table, data, allowedFields) {
  const keys = allowedFields.filter((key) => data[key] !== undefined);
  if (keys.length === 0) {
    return null;
  }
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  const params = keys.map((key) => data[key]);
  return { sql, params };
}

function buildUpdate(table, data, allowedFields, id) {
  const keys = allowedFields.filter((key) => data[key] !== undefined);
  if (keys.length === 0) {
    return null;
  }
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  const params = [...keys.map((key) => data[key]), id];
  return { sql, params };
}

module.exports = {
  buildInsert,
  buildUpdate
};
