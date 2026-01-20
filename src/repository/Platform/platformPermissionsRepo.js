const createRepo = require('../base');

module.exports = createRepo('platform_permissions', [
  'key_name',
  'description',
  'group_name'
]);
