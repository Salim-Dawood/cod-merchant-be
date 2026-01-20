const createRepo = require('../base');

module.exports = createRepo('merchants', [
  'merchant_code',
  'name',
  'legal_name',
  'email',
  'phone',
  'country',
  'city',
  'address',
  'status'
]);
