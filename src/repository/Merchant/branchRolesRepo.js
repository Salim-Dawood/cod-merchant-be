const createRepo = require('../base');

module.exports = createRepo('branch_roles', [
  'branch_id',
  'name',
  'description',
  'is_system'
]);
