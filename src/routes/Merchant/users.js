const createCrudRouter = require('../crudRouter');
const usersController = require('../../controllers/Merchant/usersController');
const { upload, uploadMemory } = require('../../utils/upload');
const { isCloudinaryEnabled, isSupabaseEnabled } = require('../../utils/storage');

const router = createCrudRouter(usersController);
const uploader = (isCloudinaryEnabled || isSupabaseEnabled) ? uploadMemory : upload;
router.post('/:id/photo', uploader.single('photo'), usersController.uploadPhoto);

module.exports = router;
