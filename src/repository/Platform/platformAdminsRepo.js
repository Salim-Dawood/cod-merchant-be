const createRepo = require('../base');

module.exports = createRepo('platform_admins', [
  'first_name',
  'last_name',
  'email',
  'password',
  'status',
  'last_login_at'
]);
