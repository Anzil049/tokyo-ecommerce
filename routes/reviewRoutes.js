const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');

// USER ROUTES
router.post('/submit', protectUser, reviewController.submitReview);
router.get('/product/:productId', reviewController.getProductReviews);

// ADMIN ROUTES
router.get('/admin/all', protectAdmin, reviewController.getAllReviews);
router.put('/admin/status/:id', protectAdmin, reviewController.updateReviewStatus);
router.delete('/admin/:id', protectAdmin, reviewController.deleteReview);
router.get('/admin/sync-ratings', reviewController.syncAllRatings);

module.exports = router;