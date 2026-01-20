const createController = require('../commonController');
const service = require('../../services/Merchant/merchantsService');

module.exports = createController(service);
