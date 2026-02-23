const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Platform/platformClientsController');

module.exports = createCrudRouter(controller);
