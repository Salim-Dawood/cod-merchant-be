const createController = require('../commonController');
const service = require('../../services/Merchant/categoriesService');

module.exports = createController(service);
