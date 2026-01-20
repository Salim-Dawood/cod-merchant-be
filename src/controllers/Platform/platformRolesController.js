const createController = require('../commonController');
const service = require('../../services/Platform/platformRolesService');

module.exports = createController(service);
