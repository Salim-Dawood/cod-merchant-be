const express = require('express');
const authController = require('../../controllers/Platform/authController');
const platformAuth = require('../../middleware/platformAuth');

const router = express.Router();

router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/register', authController.register);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', platformAuth, authController.me);

module.exports = router;
