const createCrudRouter = require('../crudRouter');
const branchesController = require('../../controllers/Merchant/branchesController');

module.exports = createCrudRouter(branchesController);
