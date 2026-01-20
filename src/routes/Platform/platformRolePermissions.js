const createCrudRouter = require('../crudRouter');
const platformRolePermissionsController = require('../../controllers/Platform/platformRolePermissionsController');

module.exports = createCrudRouter(platformRolePermissionsController);
