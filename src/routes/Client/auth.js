const express = require('express');
const authController = require('../../controllers/Client/authController');
const clientAuth = require('../../middleware/clientAuth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', clientAuth, authController.me);

module.exports = router;
