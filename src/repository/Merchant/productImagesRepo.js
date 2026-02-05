const createRepo = require('../base');

module.exports = createRepo('product_images', [
  'product_id',
  'url',
  'sort_order',
  'is_active'
]);
