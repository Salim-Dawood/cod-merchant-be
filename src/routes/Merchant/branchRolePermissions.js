const createCrudRouter = require('../crudRouter');
const branchRolePermissionsController = require('../../controllers/Merchant/branchRolePermissionsController');

module.exports = createCrudRouter(branchRolePermissionsController);
