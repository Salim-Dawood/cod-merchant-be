const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Platform/platformClientRolesController');

module.exports = createCrudRouter(controller);
