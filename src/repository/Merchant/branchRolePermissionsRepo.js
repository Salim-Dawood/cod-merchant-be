const createRepo = require('../base');

module.exports = createRepo('branch_role_permissions', [
  'branch_role_id',
  'permission_id'
]);
