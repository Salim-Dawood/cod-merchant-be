require('dotenv').config();

const pool = require('../db');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [process.env.DB_NAME, table, column]
  );
  return rows.length > 0;
}

async function dropColumnIfExists(table, column) {
  const exists = await columnExists(table, column);
  if (!exists) {
    return false;
  }
  await pool.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  return true;
}

async function run() {
  const targets = [
    { table: 'platform_admins', column: 'first_name' },
    { table: 'platform_admins', column: 'last_name' },
    { table: 'users', column: 'first_name' },
    { table: 'users', column: 'last_name' }
  ];

  for (const { table, column } of targets) {
    const dropped = await dropColumnIfExists(table, column);
    console.log(`${table}.${column}: ${dropped ? 'dropped' : 'not found'}`);
  }
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Drop columns failed:', err);
    return pool.end().finally(() => process.exit(1));
  });
