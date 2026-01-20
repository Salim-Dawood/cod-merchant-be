const createCrudRouter = require('../crudRouter');
const usersController = require('../../controllers/Merchant/usersController');

module.exports = createCrudRouter(usersController);
