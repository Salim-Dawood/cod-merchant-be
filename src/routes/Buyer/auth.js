const express = require('express');
const authController = require('../../controllers/Buyer/authController');
const buyerAuth = require('../../middleware/buyerAuth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', buyerAuth, authController.me);

module.exports = router;
