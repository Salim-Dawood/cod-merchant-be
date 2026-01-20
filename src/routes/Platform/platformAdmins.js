const createCrudRouter = require('../crudRouter');
const platformAdminsController = require('../../controllers/Platform/platformAdminsController');

module.exports = createCrudRouter(platformAdminsController);
