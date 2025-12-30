const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Common Fields
  name: {
    type: String,
    required: true // Required for both Local (from form) and Google (from profile)
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  avatar: {
    type: String,
    default: "https://placehold.co/150" // Default image for local users
  },

  // Local Auth Fields
  password: {
    type: String,
    // Not required globally, because Google users won't have one
  },

  isVerified: {
    type: Boolean,
    default: false
  },

  isBlocked: {
    type: Boolean,
    default: false // By default, users are NOT blocked
  },

  role: {
    type: String,
    // These are the allowed roles in your system
    enum: ['user', 'superadmin', 'editor', 'viewer'],
    default: 'user'
  },

  // Google Auth Fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // CRITICAL: Allows multiple users to have 'null' googleId
  },

  // OTP / Reset Fields
  otp: String,
  otpExpires: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);