const createRepo = require('../base');

module.exports = createRepo('branches', [
  'merchant_id',
  'parent_branch_id',
  'name',
  'code',
  'type',
  'is_main',
  'status'
]);
