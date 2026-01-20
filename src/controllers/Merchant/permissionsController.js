const createController = require('../commonController');
const service = require('../../services/Merchant/permissionsService');

module.exports = createController(service);
