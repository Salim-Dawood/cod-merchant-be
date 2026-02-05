const createService = require('../commonService');
const repo = require('../../repository/Merchant/productCategoriesRepo');

module.exports = createService(repo);
