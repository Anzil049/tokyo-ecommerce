const { body, validationResult } = require('express-validator');

// 1. Validation Rules for Signup
exports.validateSignup = [
    // Name: Trim whitespace, must be at least 3 chars
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 3 }).withMessage('Name must be at least 3 characters long')
        // Allow letters and spaces only (prevents numbers/symbols in names)
        .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces'),

    // Email: Must be a valid email format
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail(), // Sanitizes email (e.g., lowercase)

    // Password: Min 6 chars
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),

    // 2. Middleware to Check for Errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return only the first error message to keep the frontend UI simple
            return res.status(400).json({ message: errors.array()[0].msg });
        }
        next(); // If no errors, proceed to the controller
    }
];