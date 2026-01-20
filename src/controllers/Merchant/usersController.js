const createController = require('../commonController');
const service = require('../../services/Merchant/usersService');

module.exports = createController(service);
