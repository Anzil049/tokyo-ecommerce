const jwt = require('jsonwebtoken');

const generateAccessToken = (userId) => {
    // Short lifespan (e.g., 15 minutes) for security
    return jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '30m'
    });
};

const generateRefreshToken = (userId) => {
    // Long lifespan (e.g., 7 days) to keep user logged in
    return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: '7d'
    });
};

module.exports = { generateAccessToken, generateRefreshToken };