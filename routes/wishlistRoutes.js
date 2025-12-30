const express = require('express');
const router = express.Router();
const { getWishlist, toggleWishlist } = require('../controllers/wishlistController');
const {protectUser} = require('../middleware/authMiddleware');

router.get('/', protectUser, getWishlist);
router.post('/toggle', protectUser, toggleWishlist);

module.exports = router;