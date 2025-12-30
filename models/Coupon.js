const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true, // Auto-convert 'shipoff' to 'SHIPOFF'
        trim: true
    },
    description: {
        type: String
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'free_shipping'],
        required: true
    },
    discountValue: {
        type: Number,
        default: 0
    },

    // --- SCOPE: Where can this coupon be used? ---
    appliesTo: {
        type: String,
        enum: ['all', 'category', 'team', 'product'],
        default: 'all'
    },

    // --- CHANGE 1: Use String for Categories & Teams (Matches Product DB) ---
    targetCategories: [{ type: String }],
    targetTeams: [{ type: String }],

    // Products are still selected by ID, so keep this as ObjectId
    targetProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // --- CONDITIONS ---
    minOrderValue: {
        type: Number,
        default: 0
    },
    minQuantity: {
        type: Number,
        default: 0
    },

    // --- LIMITS & VALIDITY ---
    startDate: {
        type: Date,
        default: Date.now
    },

    // --- CHANGE 2: Removed 'required: true' to allow Null (Infinity) ---
    expirationDate: {
        type: Date
    },

    usageLimit: {
        type: Number,
        default: null
    },
    usedCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);