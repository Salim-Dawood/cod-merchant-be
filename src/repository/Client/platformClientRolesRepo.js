const createRepo = require('../base');

module.exports = createRepo('platform_client_roles', [
  'name',
  'created_by',
  'updated_by',
  'is_active'
]);
