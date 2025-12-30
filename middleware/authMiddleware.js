const jwt = require('jsonwebtoken');

// --- Middleware for USER Routes ---
exports.protectUser = (req, res, next) => {
    // Look specifically for the USER cookie
    const token = req.cookies.user_access_token;

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no user token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'User token expired or invalid' });
    }
};

// --- Middleware for ADMIN Routes ---
exports.protectAdmin = (req, res, next) => {
    // Look specifically for the ADMIN cookie
    const token = req.cookies.admin_access_token;

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no admin token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Admin token expired or invalid' });
    }
};