const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    preSaleSnapshot: {
        price: Number,
        discountValue: Number,
        discountType: String
    },
    sku: {
        type: String,
        unique: true,
        required: function () { return this.status === 'Active'; },
    },
    category: { type: [String],
         required: true },
    // OR simply type: Array,
    team: {
        type: String,
        required: function () { return this.status === 'Active'; },

    },
    description: {
        type: String
    },

    // Pricing
    price: {
        type: Number,
        required: function () { return this.status === 'Active'; },
    },
    basePrice: {
        type: Number,
        default: 0
    },
    discountType: {
        type: String,
        enum: ['percent', 'fixed'],
        default: 'percent'
    },
    discountValue: {
        type: Number,
        default: 0
    },

    // Inventory
    stockQuantity: {
        type: Number,
        required: true,
        min: 0
    },
    sizes: [{
        size: {
            type: String,
            required: true
        },
        stock: {
            type: Number,
            required: true,
            min: 0
        }
    }],

    // Images & Status
    images: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ["Active", "Draft"],
        default: "Draft"
    },

    // --- NEW: REVIEW FIELDS ---
    ratings: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    numReviews: {
        type: Number,
        default: 0
    }

}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);