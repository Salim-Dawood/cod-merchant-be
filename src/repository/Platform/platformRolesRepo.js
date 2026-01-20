const createRepo = require('../base');

module.exports = createRepo('platform_roles', [
  'name',
  'description',
  'is_system'
]);
