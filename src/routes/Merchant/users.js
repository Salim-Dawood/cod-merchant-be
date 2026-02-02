const createCrudRouter = require('../crudRouter');
const usersController = require('../../controllers/Merchant/usersController');
const { upload } = require('../../utils/upload');

const router = createCrudRouter(usersController);
router.post('/:id/photo', upload.single('photo'), usersController.uploadPhoto);

module.exports = router;
