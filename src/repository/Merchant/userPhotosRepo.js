const pool = require('../../db');

async function setActivePhoto(userId, url) {
  if (url === undefined || url === null) {
    return;
  }
  const trimmed = String(url).trim();
  if (!trimmed) {
    await pool.query(
      'UPDATE user_photos SET is_active = 0 WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    return;
  }
  await pool.query(
    'UPDATE user_photos SET is_active = 0 WHERE user_id = ? AND is_active = 1',
    [userId]
  );
  await pool.query(
    'INSERT INTO user_photos (user_id, url, is_active) VALUES (?, ?, 1)',
    [userId, trimmed]
  );
}

module.exports = {
  setActivePhoto
};
