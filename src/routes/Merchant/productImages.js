const createCrudRouter = require('../crudRouter');
const controller = require('../../controllers/Merchant/productImagesController');

module.exports = createCrudRouter(controller);
