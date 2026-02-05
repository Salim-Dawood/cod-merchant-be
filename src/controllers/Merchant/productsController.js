const createController = require('../commonController');
const service = require('../../services/Merchant/productsService');

module.exports = createController(service);
