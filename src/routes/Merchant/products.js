const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Merchant/productsController');

module.exports = createCrudRouter(controller);
