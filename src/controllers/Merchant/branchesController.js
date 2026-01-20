const createController = require('../commonController');
const service = require('../../services/Merchant/branchesService');

module.exports = createController(service);
