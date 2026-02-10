const createCrudRouter = require('../crudRouter');
const platformAdminsController = require('../../controllers/Platform/platformAdminsController');
const { upload, uploadMemory } = require('../../utils/upload');
const { isCloudinaryEnabled, isSupabaseEnabled } = require('../../utils/storage');

const router = createCrudRouter(platformAdminsController);
const uploader = (isCloudinaryEnabled || isSupabaseEnabled) ? uploadMemory : upload;
router.post('/:id/photo', uploader.single('photo'), platformAdminsController.uploadPhoto);

module.exports = router;
