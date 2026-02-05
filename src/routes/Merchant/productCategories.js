const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Merchant/productCategoriesController');

module.exports = createCrudRouter(controller);
