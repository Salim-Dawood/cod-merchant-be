const createController = require('../commonController');
const service = require('../../services/Merchant/productCategoriesService');

module.exports = createController(service);
