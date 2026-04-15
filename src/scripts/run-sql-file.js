require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function normalizeSql(sql) {
  return sql
    .replace(/^\s*DELIMITER\s+\$\$\s*$/gim, '')
    .replace(/^\s*DELIMITER\s+;\s*$/gim, '')
    .replace(/END\$\$/g, 'END;');
}

async function run() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node src/scripts/run-sql-file.js <sql-file-path>');
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`SQL file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const sql = normalizeSql(raw);

  const ssl =
    process.env.DB_SSL_CA || process.env.DB_SSL === 'true'
      ? {
          ca: process.env.DB_SSL_CA || undefined,
          rejectUnauthorized: true
        }
      : undefined;

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
    multipleStatements: true
  });

  try {
    await connection.query(sql);
    console.log(`SQL executed successfully: ${resolvedPath}`);
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error('SQL execution failed:', err.message || err);
  process.exit(1);
});

