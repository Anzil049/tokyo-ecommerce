const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');

router.post('/create', couponController.createCoupon);
router.post('/verify', couponController.verifyCoupon); // For User Cart
router.get('/', couponController.getAllCoupons);       // For Admin Table
router.put('/:id', couponController.updateCoupon);     // For Admin Edit
router.delete('/:id', couponController.deleteCoupon);  // For Admin Delete

module.exports = router;