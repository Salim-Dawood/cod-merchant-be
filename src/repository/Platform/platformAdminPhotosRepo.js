const pool = require('../../db');

async function setActivePhoto(platformAdminId, url) {
  if (url === undefined || url === null) {
    return;
  }
  const trimmed = String(url).trim();
  if (!trimmed) {
    await pool.query(
      'UPDATE platform_admin_photos SET is_active = 0 WHERE platform_admin_id = ? AND is_active = 1',
      [platformAdminId]
    );
    return;
  }
  await pool.query(
    'UPDATE platform_admin_photos SET is_active = 0 WHERE platform_admin_id = ? AND is_active = 1',
    [platformAdminId]
  );
  await pool.query(
    'INSERT INTO platform_admin_photos (platform_admin_id, url, is_active) VALUES (?, ?, 1)',
    [platformAdminId, trimmed]
  );
}

module.exports = {
  setActivePhoto
};
