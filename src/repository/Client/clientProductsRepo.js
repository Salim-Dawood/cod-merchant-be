const pool = require('../../db');

function withDefaultCategories(product, categoryRows) {
  const categories = categoryRows
    .filter((row) => Number(row.product_id) === Number(product.id))
    .map((row) => ({
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug
    }));
  return { ...product, categories };
}

async function findAllMarketplace() {
  const [products] = await pool.query(
    `SELECT p.*, b.name AS branch_name, b.flag_url AS branch_flag_url, b.merchant_id, m.name AS merchant_name
     FROM products p
     LEFT JOIN branches b ON b.id = p.branch_id
     LEFT JOIN merchants m ON m.id = b.merchant_id
     WHERE (p.is_active IS NULL OR p.is_active = 1)
       AND (p.status IS NULL OR LOWER(p.status) = 'active')
     ORDER BY p.id DESC`
  );

  if (!products.length) {
    return [];
  }

  const productIds = products.map((item) => item.id);
  const [categoryRows] = await pool.query(
    `SELECT pc.product_id, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
     FROM product_categories pc
     JOIN categories c ON c.id = pc.category_id
     WHERE pc.product_id IN (?)
       AND (pc.is_active IS NULL OR pc.is_active = 1)
       AND (c.is_active IS NULL OR c.is_active = 1)`,
    [productIds]
  );

  return products.map((item) => withDefaultCategories(item, categoryRows));
}

async function findByIdMarketplace(id) {
  const [rows] = await pool.query(
    `SELECT p.*, b.name AS branch_name, b.flag_url AS branch_flag_url, b.merchant_id, m.name AS merchant_name
     FROM products p
     LEFT JOIN branches b ON b.id = p.branch_id
     LEFT JOIN merchants m ON m.id = b.merchant_id
     WHERE p.id = ?
       AND (p.is_active IS NULL OR p.is_active = 1)
       AND (p.status IS NULL OR LOWER(p.status) = 'active')
     LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    return null;
  }

  const product = rows[0];
  const [categoryRows] = await pool.query(
    `SELECT pc.product_id, c.id AS category_id, c.name AS category_name, c.slug AS category_slug
     FROM product_categories pc
     JOIN categories c ON c.id = pc.category_id
     WHERE pc.product_id = ?
       AND (pc.is_active IS NULL OR pc.is_active = 1)
       AND (c.is_active IS NULL OR c.is_active = 1)`,
    [id]
  );
  return withDefaultCategories(product, categoryRows);
}

module.exports = {
  findAllMarketplace,
  findByIdMarketplace
};
