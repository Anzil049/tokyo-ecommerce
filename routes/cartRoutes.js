const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protectUser } = require('../middleware/authMiddleware');

// ... existing routes ...
router.get('/', protectUser, cartController.getCart);
router.post('/add', protectUser, cartController.addToCart);
router.put('/update', protectUser, cartController.updateCart);
router.delete('/remove/:id', protectUser, cartController.removeItem);

// --- MAKE SURE THIS LINE EXISTS ---
router.put('/remove-coupon', protectUser, cartController.removeCoupon);

// --- SAVE FOR LATER ROUTES ---
router.post('/save-later', protectUser, cartController.saveForLater);
router.post('/move-to-cart', protectUser, cartController.moveToCart);
router.delete('/remove-saved/:id', protectUser, cartController.removeSavedItem);

module.exports = router;