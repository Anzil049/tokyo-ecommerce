const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    type: {
        type: String,
        enum: ["Club", "National", "Other"],
        required: true
    },

    // 'country' field removed

    logo: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        enum: ["Active", "Inactive"],
        default: "Active"
    },

    totalProducts: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model("Team", teamSchema);