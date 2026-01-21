const Product = require("../models/Product");
const Category = require("../models/Category");
const Team = require("../models/Team");

// --- HELPER: Force Sync Counts ---
async function syncCounts() {
    try {
        const categories = await Category.find();
        for (const cat of categories) {
            const count = await Product.countDocuments({ category: cat.name });
            cat.totalProducts = count;
            await cat.save();
        }

        const teams = await Team.find();
        for (const team of teams) {
            const count = await Product.countDocuments({ team: team.name });
            team.totalProducts = count;
            await team.save();
        }
    } catch (err) {
        console.error("Error syncing counts:", err);
    }
}

// 1. Create Product
exports.createProduct = async (req, res) => {
    try {
        let sizes = [];

        // Fix: Explicitly handle 0 stock
        if (req.body.sizes) {
            const parsedSizes = JSON.parse(req.body.sizes);
            sizes = parsedSizes.map(s => ({
                size: s.size,
                stock: (s.stock !== undefined && s.stock !== null && s.stock !== "") ? parseInt(s.stock) : 0
            }));
        }

        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            imagePaths = req.files.map(file => `/uploads/products/${file.filename}`);
        }

        // --- NEW CHANGE: Parse Category String to Array ---
        let categories = req.body.category;
        if (categories) {
            if (typeof categories === 'string') {
                try {
                    // Try to parse JSON string (e.g. "['Men', 'Sale']")
                    const parsed = JSON.parse(categories);
                    if (Array.isArray(parsed)) {
                        categories = parsed;
                    } else {
                        categories = [categories]; // Handle single string legacy
                    }
                } catch (e) {
                    categories = [categories]; // Handle plain string "Men"
                }
            }
        }
        // --------------------------------------------------

        const productData = {
            ...req.body,
            category: categories, // <--- Use the parsed categories array
            price: parseFloat(req.body.price),
            basePrice: parseFloat(req.body.basePrice) || 0,
            discountValue: parseFloat(req.body.discountValue) || 0,
            stockQuantity: parseInt(req.body.stockQuantity) || 0,
            sizes: sizes,
            images: imagePaths
        };

        const newProduct = new Product(productData);
        await newProduct.save();

        await syncCounts();

        res.status(201).json({ success: true, data: newProduct });
    } catch (error) {
        // ... (Keep your existing error handling) ...
        if (error.code === 11000) {
            // ... error handling code ...
            const field = Object.keys(error.keyPattern)[0];
            const value = error.keyValue[field];
            return res.status(400).json({
                success: false,
                error: `E11000 duplicate key error: ${field} "${value}" already exists.`
            });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};



// 2. Get All Products
exports.getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const totalDocs = await Product.countDocuments();
        const products = await Product.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: products,
            pagination: {
                totalDocs,
                totalPages: Math.ceil(totalDocs / limit),
                currentPage: page,
                limit
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 3. Get Single Product
exports.getSingleProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: "Product not found" });
        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 4. Update Product
exports.updateProduct = async (req, res) => {
    try {
        let updateData = { ...req.body };

        // Fix: Explicitly handle 0 stock during update
        if (req.body.sizes) {
            const parsedSizes = JSON.parse(req.body.sizes);
            updateData.sizes = parsedSizes.map(s => ({
                size: s.size,
                stock: (s.stock !== undefined && s.stock !== null && s.stock !== "") ? parseInt(s.stock) : 0
            }));
        }

        // --- NEW CHANGE: Parse Category String to Array ---
        if (req.body.category) {
            let categories = req.body.category;
            if (typeof categories === 'string') {
                try {
                    const parsed = JSON.parse(categories);
                    if (Array.isArray(parsed)) {
                        categories = parsed;
                    } else {
                        categories = [categories];
                    }
                } catch (e) {
                    categories = [categories];
                }
            }
            updateData.category = categories; // <--- Update the data object
        }
        // --------------------------------------------------

        // Ensure numbers
        if (updateData.price) updateData.price = parseFloat(updateData.price);
        if (updateData.basePrice) updateData.basePrice = parseFloat(updateData.basePrice);
        if (updateData.discountValue) updateData.discountValue = parseFloat(updateData.discountValue);
        if (updateData.stockQuantity) updateData.stockQuantity = parseInt(updateData.stockQuantity);

        // Handle Images
        const hasExisting = req.body.existingImages !== undefined;
        const hasNewFiles = req.files && req.files.length > 0;

        if (hasExisting || hasNewFiles) {
            let finalImages = [];
            if (req.body.existingImages) finalImages = JSON.parse(req.body.existingImages);
            if (hasNewFiles) {
                const newPaths = req.files.map(file => `/uploads/products/${file.filename}`);
                finalImages = [...finalImages, ...newPaths];
            }
            updateData.images = finalImages;
        }

        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

        if (!updatedProduct) return res.status(404).json({ success: false, error: "Product not found" });

        await syncCounts();

        res.status(200).json({ success: true, data: updatedProduct });
    } catch (error) {
        // ... (Keep your existing error handling) ...
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const value = error.keyValue[field];
            return res.status(400).json({
                success: false,
                error: `E11000 duplicate key error: ${field} "${value}" already exists.`
            });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// 5. Delete Product
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: "Product not found" });

        await syncCounts();

        res.status(200).json({ success: true, message: "Product deleted" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};