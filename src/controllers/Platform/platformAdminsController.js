const createController = require('../commonController');
const service = require('../../services/Platform/platformAdminsService');

module.exports = createController(service);
