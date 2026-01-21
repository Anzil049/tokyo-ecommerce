const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // --- ITEMS: Detailed Status ---
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        originalPrice: { type: Number, required: true }, // [NEW] Track true price for refund calcs
        image: { type: String },
        size: { type: String },

        // Items track the specific stage (Full Lifecycle)
        status: {
            type: String,
            default: 'Pending',
            enum: [
                'Pending', 'Processing', 'Shipped', 'Out for Delivery',
                'Delivered', 'Cancelled', 'Return Requested',
                'Returned', 'Return Rejected'
            ]
        },
        rejectionReason: { type: String, default: null },
        returnReason: { type: String, default: null }
    }],

    shippingAddress: { type: Object, required: true },
    paymentMethod: { type: String, enum: ['COD', 'Online', 'Wallet'], required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Pending' },
    paymentDetails: { razorpay_payment_id: String, razorpay_order_id: String, razorpay_signature: String },

    // --- GLOBAL STATUS: Simplified (Only 3 Values) ---
    orderStatus: {
        type: String,
        enum: [
            'Pending',          // Order is Open/Active (Includes Shipped, Processing, etc.)
            'Return Requested', // User requested return on one or more items
            'Completed'         // Order is Closed/Finalized (Includes Delivered, Cancelled, Returned)
        ],
        default: 'Pending'
    },

    subtotal: { type: Number, required: true },
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    deliveredAt: { type: Date },
    cancelledAt: { type: Date },
    returnReason: { type: String }

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);