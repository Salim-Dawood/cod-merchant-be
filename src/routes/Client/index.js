const express = require('express');
const clientAuth = require('../../middleware/clientAuth');
const authRoutes = require('./auth');
const productsRoutes = require('./products');
const ordersRoutes = require('./orders');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(clientAuth);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);

module.exports = router;
