const createCrudRouter = require('../crudRouter');
const branchesController = require('../../controllers/Merchant/branchesController');
const { upload, uploadMemory } = require('../../utils/upload');
const { isCloudinaryEnabled, isSupabaseEnabled } = require('../../utils/storage');

const router = createCrudRouter(branchesController);
const uploader = (isCloudinaryEnabled || isSupabaseEnabled) ? uploadMemory : upload;
router.post('/:id/flag', uploader.single('photo'), branchesController.uploadFlag);

module.exports = router;
