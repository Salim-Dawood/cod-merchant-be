const createCrudRouter = require('../crudRouter');
const platformAdminsController = require('../../controllers/Platform/platformAdminsController');
const { upload } = require('../../utils/upload');

const router = createCrudRouter(platformAdminsController);
router.post('/:id/photo', upload.single('photo'), platformAdminsController.uploadPhoto);

module.exports = router;
