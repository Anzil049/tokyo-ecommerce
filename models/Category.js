const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    

    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    description: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        enum: ["Published", "Hidden"],
        default: "Published"
    },

    totalProducts: {
        type: Number,
        default: 0
    }

}, { timestamps: true });

module.exports = mongoose.model("Category", categorySchema);