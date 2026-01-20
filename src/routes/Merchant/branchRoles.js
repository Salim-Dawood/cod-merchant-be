const createCrudRouter = require('../crudRouter');
const branchRolesController = require('../../controllers/Merchant/branchRolesController');

module.exports = createCrudRouter(branchRolesController);
