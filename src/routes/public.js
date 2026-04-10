const express = require('express');
const controller = require('../controllers/publicStoreController');

const router = express.Router();

router.get('/products', controller.listProducts);
router.get('/payment-methods', controller.listPaymentMethods);
router.get('/cart', controller.getCart);
router.post('/cart/items', controller.addCartItem);
router.put('/cart/items/:id', controller.updateCartItem);
router.delete('/cart/items/:id', controller.removeCartItem);
router.post('/checkout', controller.checkout);

module.exports = router;
