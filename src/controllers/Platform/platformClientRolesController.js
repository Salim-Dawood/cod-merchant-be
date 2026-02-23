const createController = require('../commonController');
const service = require('../../services/Platform/platformClientRolesService');

module.exports = createController(service);
