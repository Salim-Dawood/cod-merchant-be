const express = require('express');
const { upload, uploadMemory } = require('../../utils/upload');
const { isCloudinaryEnabled, isSupabaseEnabled } = require('../../utils/storage');
const controller = require('../../controllers/Merchant/productImagesController');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
const uploader = (isCloudinaryEnabled || isSupabaseEnabled) ? uploadMemory : upload;
router.post('/upload', uploader.single('photo'), controller.uploadPhoto);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
