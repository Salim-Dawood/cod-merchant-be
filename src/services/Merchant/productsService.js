const createService = require('../commonService');
const repo = require('../../repository/Merchant/productsRepo');

module.exports = createService(repo);
