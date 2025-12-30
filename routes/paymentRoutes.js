const express = require('express');
const router = express.Router();
const { protectUser } = require('../middleware/authMiddleware');

// Import ALL functions from paymentController
const {
    createOrder,
    verifyPayment,
    getWalletBalance
} = require('../controllers/paymentController');

router.post('/create-order', protectUser, createOrder);
router.post('/verify', protectUser, verifyPayment);
router.get('/balance', protectUser, getWalletBalance); // Now points to paymentController

module.exports = router;