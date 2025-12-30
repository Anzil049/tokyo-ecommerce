const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTP } = require('../utils/emailService');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');

// ==========================================
//  1. SIGNUP (Handles New & Unverified Users)
// ==========================================
exports.signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        let user = await User.findOne({ email });

        if (user) {
            // Case A: User exists AND is verified -> Stop.
            if (user.isVerified) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // Case B: User exists but is NOT verified -> Overwrite & Resend OTP
            const hashedPassword = await bcrypt.hash(password, 10);
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

            user.name = name;
            user.password = hashedPassword;
            user.otp = otp;
            user.otpExpires = otpExpires;
            await user.save();

            // Send Email
            try {
                await sendOTP({
                    email: user.email,
                    subject: 'Tokyo Sports - Verify Your Account',
                    message: `Your verification OTP is: ${otp}`
                });
                return res.status(200).json({ message: 'Verification code sent to your email.' });
            } catch (emailError) {
                return res.status(500).json({ message: 'Error sending email. Please try again.' });
            }
        }

        // Case C: New User -> Create
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        user = await User.create({
            name,
            email,
            password: hashedPassword,
            isVerified: false,
            otp,
            otpExpires
        });

        // Send Email
        try {
            await sendOTP({
                email: user.email,
                subject: 'Tokyo Sports - Verify Your Account',
                message: `Your verification OTP is: ${otp}`
            });
            res.status(201).json({ message: 'Signup successful. OTP sent to email.' });
        } catch (emailError) {
            // If email fails, delete the user so they can try again smoothly
            await User.deleteOne({ _id: user._id });
            return res.status(500).json({ message: 'Error sending email. Please check your address.' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
};

// ==========================================
//  2. VERIFY OTP
// ==========================================
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.otp !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({ message: 'Account verified successfully' });

    } catch (err) {
        res.status(500).json({ message: 'OTP verification failed' });
    }
};

// ==========================================
//  3. LOGIN (Secure Cookie)        
// ==========================================
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !user.isVerified) {
            return res.status(401).json({ message: 'Invalid credentials or account not verified' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ message: 'Your account has been blocked. Please contact support.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // --- NEW LOGIC: Determine Cookie Name ---
        // Check if the user is an admin or a regular customer
        const isAdmin = ['superadmin', 'editor', 'viewer'].includes(user.role);

        const accessTokenName = isAdmin ? 'admin_access_token' : 'user_access_token';
        const refreshTokenName = isAdmin ? 'admin_refresh_token' : 'user_refresh_token';

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // 1. Set Refresh Token Cookie (Dynamic Name)
        res.cookie(refreshTokenName, refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
        });

        // 2. Set Access Token Cookie (Dynamic Name)
        res.cookie(accessTokenName, accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 60 * 1000 // 30 Minutes
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed' });
    }
};

// ==========================================
//  4. FORGOT PASSWORD (Email OTP)
// ==========================================
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        await user.save();

        // Send Email
        try {
            await sendOTP({
                email: user.email,
                subject: 'Tokyo Sports - Password Reset OTP',
                message: `You requested a password reset. Your OTP is: ${otp}`
            });
            res.json({ message: 'OTP sent to your email' });
        } catch (emailError) {
            user.otp = undefined;
            user.otpExpires = undefined;
            await user.save();
            return res.status(500).json({ message: 'Email could not be sent' });
        }

    } catch (err) {
        res.status(500).json({ message: 'Something went wrong', error: err.message });
    }
};

// ==========================================
//  5. RESET PASSWORD
// ==========================================
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await User.findOne({
            email,
            otp,
            otpExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password = hashedPassword;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successful. Please login.' });

    } catch (err) {
        res.status(500).json({ message: 'Failed to reset password' });
    }
};


// ==========================================
//  6. REFRESH TOKEN (Updated)
// ==========================================
exports.refreshToken = async (req, res) => {
    const cookies = req.cookies;

    // Check for either admin OR user refresh token
    const refreshToken = cookies.user_refresh_token || cookies.admin_refresh_token;

    if (!refreshToken) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });

        const foundUser = await User.findById(decoded.id);
        if (!foundUser) return res.status(401).json({ message: 'Unauthorized' });

        if (foundUser.isBlocked) return res.status(403).json({ message: 'Account Blocked' });

        // Determine which cookie to update based on the user's role
        const isAdmin = ['superadmin', 'editor', 'viewer'].includes(foundUser.role);
        const accessTokenName = isAdmin ? 'admin_access_token' : 'user_access_token';

        const newAccessToken = generateAccessToken(foundUser._id);

        res.cookie(accessTokenName, newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000 // 15 Minutes
        });

        res.json({ message: 'Token refreshed' });
    });
};

// ==========================================
//  7. LOGOUT (SEPARATED)
// ==========================================

// Logout for Store Customers (User Side)
exports.logoutUser = (req, res) => {
    res.clearCookie('user_access_token', { 
        httpOnly: true, 
        sameSite: 'strict', 
        secure: process.env.NODE_ENV === 'production' 
    });
    
    res.clearCookie('user_refresh_token', { 
        httpOnly: true, 
        sameSite: 'strict', 
        secure: process.env.NODE_ENV === 'production' 
    });
    
    res.json({ message: 'User logged out successfully' });
};

// Logout for Admin Panel (Admin Side)
exports.logoutAdmin = (req, res) => {
    res.clearCookie('admin_access_token', { 
        httpOnly: true, 
        sameSite: 'strict', 
        secure: process.env.NODE_ENV === 'production' 
    });
    
    res.clearCookie('admin_refresh_token', { 
        httpOnly: true, 
        sameSite: 'strict', 
        secure: process.env.NODE_ENV === 'production' 
    });
    
    res.json({ message: 'Admin logged out successfully' });
};


// ==========================================
//  8. VERIFY TOKEN (Frontend Check)
// ==========================================
exports.verifyToken = async (req, res) => {
    // Middleware passed, so token is valid
    const user = await User.findById(req.user).select('-password -otp -otpExpires');
    res.json({ success: true, user });
};


// ==========================================
//  8. GOOGLE CALLBACK
// ==========================================
exports.googleCallback = async (req, res) => {
    try {
        const user = req.user;

        if (user.isBlocked) {
            return res.redirect('http://localhost:3000/signup.html?error=AccountBlocked');
        }

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Google login implies a regular Store User
        res.cookie('user_refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.cookie('user_access_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.redirect('http://localhost:3000/User/index.html');

    } catch (err) {
        res.redirect('http://localhost:3000/signup.html?error=GoogleAuthFailed');
    }
};




// SEND OTP (For Profile Updates)
exports.sendProfileOtp = async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        await user.save();

        await sendOTP({
            email: user.email,
            subject: 'Security Verification - Tokyo Sports',
            message: `You requested to update your password. Your OTP is: ${otp}`
        });

        res.json({ message: 'OTP sent to your email.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to send OTP' });
    }
};

// UPDATE PROFILE
exports.updateProfile = async (req, res) => {
    try {
        const { name, newPassword, otp } = req.body;
        const user = await User.findById(req.user);

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Update Name
        if (name) user.name = name;

        // Update Password (Requires OTP)
        if (newPassword) {
            if (!otp) return res.status(400).json({ message: 'OTP required to set new password' });

            if (user.otp !== otp || user.otpExpires < Date.now()) {
                return res.status(400).json({ message: 'Invalid or expired OTP' });
            }

            user.password = await bcrypt.hash(newPassword, 10);
            user.otp = undefined;
            user.otpExpires = undefined;
        }

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: { id: user._id, name: user.name, email: user.email }
        });

    } catch (err) {
        res.status(500).json({ message: 'Update failed', error: err.message });
    }
};