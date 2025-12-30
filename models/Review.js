const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    size: { type: String }, // <--- ADD THIS FIELD
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    }
}, { timestamps: true });

// OLD INDEX (Delete this from DB): reviewSchema.index({ order: 1, product: 1 }, { unique: true });

// NEW INDEX: Unique based on Order + Product + SIZE
reviewSchema.index({ order: 1, product: 1, size: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);