const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Merchant/categoriesController');

module.exports = createCrudRouter(controller);
