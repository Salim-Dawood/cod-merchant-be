const createController = require('../commonController');
const service = require('../../services/Platform/platformRolePermissionsService');

module.exports = createController(service);
