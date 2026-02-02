const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            size: String,
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: Number // Store the price at time of adding
        }
    ],
    savedItems: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            size: String,
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: Number
        }
    ],
    // --- COUPON & TOTAL FIELDS ---
    coupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        default: null
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    totalPrice: {
        type: Number,
        default: 0 // Subtotal (Sum of items)
    },
    totalAfterDiscount: {
        type: Number,
        default: 0 // Subtotal - Discount
    }

}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);