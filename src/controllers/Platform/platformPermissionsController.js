const createController = require('../commonController');
const service = require('../../services/Platform/platformPermissionsService');

module.exports = createController(service);
