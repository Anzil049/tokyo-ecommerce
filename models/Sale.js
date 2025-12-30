const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true // <--- ADD THIS
    },
    bannerUrl: { type: String, required: true },
    offerType: { type: String, enum: ['flat', 'upto'], default: 'flat' },
    discountUnit: { type: String, enum: ['percent', 'amount'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    appliesTo: { type: String, enum: ['all', 'category', 'team', 'product'], required: true },
    targetIds: { type: [String], default: [] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isApplied: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Sale', saleSchema);