const createRepo = require('../base');

module.exports = createRepo('categories', [
  'name',
  'slug',
  'is_active',
  'created_by',
  'updated_by'
]);
