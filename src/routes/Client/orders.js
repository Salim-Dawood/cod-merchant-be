const express = require('express');
const ordersController = require('../../controllers/Client/ordersController');

const router = express.Router();

router.post('/', ordersController.create);
router.get('/', ordersController.list);
router.get('/:id', ordersController.getById);

module.exports = router;
