const express = require('express');
const platformRoutes = require('./Platform');
const merchantRoutes = require('./Merchant');

const router = express.Router();

router.use('/platform', platformRoutes);
router.use('/merchant', merchantRoutes);

module.exports = router;
