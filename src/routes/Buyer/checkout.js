const express = require('express');
const buyerAuth = require('../../middleware/buyerAuth');
const checkoutController = require('../../controllers/Buyer/checkoutController');

const router = express.Router();

router.use(buyerAuth);

router.get('/payment-methods', checkoutController.listPaymentMethods);
router.post('/payment-methods', checkoutController.createPaymentMethod);
router.delete('/payment-methods/:id', checkoutController.deletePaymentMethod);

router.get('/orders', checkoutController.listOrders);
router.post('/orders', checkoutController.createOrder);

module.exports = router;

