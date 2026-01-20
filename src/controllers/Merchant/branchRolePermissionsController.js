const createController = require('../commonController');
const service = require('../../services/Merchant/branchRolePermissionsService');

module.exports = createController(service);
