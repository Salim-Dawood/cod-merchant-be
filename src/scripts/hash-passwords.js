require('dotenv').config();

const pool = require('../db');
const { hashPassword, isHashed } = require('../utils/password');

async function hashTablePasswords(table) {
  let rows = [];
  try {
    const [resultRows] = await pool.query(`SELECT id, password FROM ${table}`);
    rows = resultRows;
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return { table, total: 0, updated: 0, skipped: 0 };
    }
    throw err;
  }
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.password || isHashed(row.password)) {
      skipped += 1;
      continue;
    }
    const nextHash = await hashPassword(row.password);
    await pool.query(`UPDATE ${table} SET password = ? WHERE id = ?`, [nextHash, row.id]);
    updated += 1;
  }

  return { table, total: rows.length, updated, skipped };
}

async function run() {
  const results = [];
  results.push(await hashTablePasswords('users'));
  results.push(await hashTablePasswords('platform_admins'));

  for (const result of results) {
    console.log(
      `${result.table}: total=${result.total}, updated=${result.updated}, skipped=${result.skipped}`
    );
  }
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Password hash migration failed:', err);
    return pool.end().finally(() => process.exit(1));
  });
