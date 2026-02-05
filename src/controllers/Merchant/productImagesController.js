const createController = require('../commonController');
const service = require('../../services/Merchant/productImagesService');

module.exports = createController(service);
