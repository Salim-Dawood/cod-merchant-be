const createCrudRouter = require('../crudRouter');
const merchantsController = require('../../controllers/Merchant/merchantsController');

module.exports = createCrudRouter(merchantsController);
