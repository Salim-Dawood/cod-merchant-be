const createCrudRouter = require('../crudRouter');
const platformRolesController = require('../../controllers/Platform/platformRolesController');

module.exports = createCrudRouter(platformRolesController);
