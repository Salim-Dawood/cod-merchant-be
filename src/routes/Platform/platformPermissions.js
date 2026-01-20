const createCrudRouter = require('../crudRouter');
const platformPermissionsController = require('../../controllers/Platform/platformPermissionsController');

module.exports = createCrudRouter(platformPermissionsController);
