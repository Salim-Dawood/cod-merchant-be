const createCrudRouter = require('../crudRouter');
const permissionsController = require('../../controllers/Merchant/permissionsController');

module.exports = createCrudRouter(permissionsController);
