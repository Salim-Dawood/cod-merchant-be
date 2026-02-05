const createRepo = require('../base');

module.exports = createRepo('product_categories', [
  'product_id',
  'category_id',
  'is_active'
]);
