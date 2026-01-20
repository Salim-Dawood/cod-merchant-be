const createController = require('../commonController');
const service = require('../../services/Merchant/branchRolesService');

module.exports = createController(service);
