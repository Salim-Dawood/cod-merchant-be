const createRepo = require('../base');

const repo = createRepo('categories', [
  'name',
  'slug',
  'is_active',
  'created_by',
  'updated_by'
]);

repo.findAllForMerchant = async (merchant) => {
  return repo.findAll();
};

module.exports = repo;
