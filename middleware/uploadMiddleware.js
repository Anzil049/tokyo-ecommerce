const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. Ensure all directories exist
const uploadDirs = [
    'public/uploads/products',
    'public/uploads/teams',
    'public/uploads/banners' // Added banners folder
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 2. Configure Storage Logic
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Sort into folders based on input field name
        if (file.fieldname === "teamLogo") {
            cb(null, "public/uploads/teams");
        }
        else if (file.fieldname === "saleBanner") { // New Logic
            cb(null, "public/uploads/banners");
        }
        else {
            // Default for products
            cb(null, "public/uploads/products");
        }
    },
    // ✅ NEW (Fixes the bug)
    filename: (req, file, cb) => {
        // Add a random number (1-10000) to ensure uniqueness
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 10000);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    }
});

// 3. File Filter (Only Images)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only images are allowed!"), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

module.exports = upload;