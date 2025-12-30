const User = require('../models/User');

// This function accepts a list of roles (e.g., 'superadmin', 'editor')
exports.authorizeRoles = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            // 1. Get user details from DB (req.user was set by verifyToken)
            const user = await User.findById(req.user);

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // 2. Check if the user's role is in the allowed list
            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({ 
                    message: `Access Denied. Role '${user.role}' is not authorized.` 
                });
            }

            // 3. Attach full user object to request (optional, for use in controllers)
            req.userData = user;
            next();

        } catch (err) {
            return res.status(500).json({ message: 'Role authorization failed' });
        }
    };
};