const express = require('express');
const { upload } = require('../../utils/upload');
const controller = require('../../controllers/Merchant/productImagesController');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/upload', upload.single('photo'), controller.uploadPhoto);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
