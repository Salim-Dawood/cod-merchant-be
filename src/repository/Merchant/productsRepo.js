const createRepo = require('../base');

module.exports = createRepo('products', [
  'branch_id',
  'name',
  'slug',
  'description',
  'moq',
  'status',
  'is_active',
  'created_by',
  'updated_by'
]);
