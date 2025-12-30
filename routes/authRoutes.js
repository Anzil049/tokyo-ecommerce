const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User'); // Import User model for verify routes

const {
    signup,
    verifyOtp,
    login,
    refreshToken,
    logoutUser,  // <-- ADD THIS
    logoutAdmin,
    forgotPassword, // <--- Added
    resetPassword,   // <--- Added
    googleCallback,
    updateProfile,
    sendProfileOtp
} = require('../controllers/authController');

// Import your Middleware
const {protectUser,protectAdmin} = require('../middleware/authMiddleware');
const { validateSignup } = require('../middleware/validationMiddleware');

// --- Authentication Routes ---
router.post('/signup',validateSignup, signup);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/refresh', refreshToken); 

router.post('/logout-user', logoutUser);   // Call from index.html / account.html
router.post('/logout-admin', logoutAdmin); // Call from dashboard.html


// --- Password Reset Routes (New) ---
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// --- NEW: Specific Verify Routes ---

// 1. Verify USER (for index.html, products.html)
router.get('/verify-user', protectUser, async (req, res) => {
    const user = await User.findById(req.user).select('-password -otp -otpExpires');
    res.json({ success: true, user });
});

// 2. Verify ADMIN (for dashboard.html, customers.html)
router.get('/verify-admin', protectAdmin, async (req, res) => {
    const user = await User.findById(req.user).select('-password -otp -otpExpires');
    res.json({ success: true, user });
});

// Start Google Login
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'], 
    session: false 
}));

router.get('/google/callback', 
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    googleCallback
);

// Profile Routes
router.post('/profile/otp', protectUser, sendProfileOtp); // <--- NEW ROUTE
router.put('/profile', protectUser, updateProfile);

module.exports = router;