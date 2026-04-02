const express = require('express');
const authRoutes = require('./auth');
const checkoutRoutes = require('./checkout');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/', checkoutRoutes);

module.exports = router;
