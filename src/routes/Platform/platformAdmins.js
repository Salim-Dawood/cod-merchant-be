const createCrudRouter = require('../crudRouter');
const platformAdminsController = require('../../controllers/Platform/platformAdminsController');
const { upload, uploadMemory } = require('../../utils/upload');
const { isCloudinaryEnabled } = require('../../utils/cloudinary');

const router = createCrudRouter(platformAdminsController);
const uploader = isCloudinaryEnabled ? uploadMemory : upload;
router.post('/:id/photo', uploader.single('photo'), platformAdminsController.uploadPhoto);

module.exports = router;
