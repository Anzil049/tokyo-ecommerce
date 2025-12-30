const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');

// --- HELPER: RECALCULATE PRODUCT RATING ---
// This function finds all "Approved" reviews for a product and updates the score.
async function recalculateProductRating(productId) {
    const allApproved = await Review.find({ product: productId, status: 'Approved' });

    let avg = 0;
    let count = allApproved.length;

    if (count > 0) {
        avg = allApproved.reduce((a, b) => a + b.rating, 0) / count;
    }

    await Product.findByIdAndUpdate(productId, {
        ratings: avg.toFixed(1),
        numReviews: count
    });
}

// 1. USER: Submit Review
exports.submitReview = async (req, res) => {
    try {
        const { productId, rating, comment, orderId, size } = req.body;

        if (!req.user) return res.status(500).json({ success: false, message: "Auth Error" });
        const userId = req.user._id ? req.user._id.toString() : req.user.toString();

        // Get Real Name
        const userDetails = await User.findById(userId);
        const realUserName = userDetails ? userDetails.name : "Verified Customer";

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        if (order.user.toString() !== userId) return res.status(403).json({ success: false, message: "Unauthorized" });

        // Find Item Match
        const validItem = order.items.find(i => {
            const dbPid = i.product._id ? i.product._id.toString() : i.product.toString();
            const itemSize = i.size || "";
            const targetSize = size || "";
            return dbPid === productId && i.status === 'Delivered' && itemSize === targetSize;
        });

        if (!validItem) return res.status(400).json({ success: false, message: "Item mismatch or not delivered." });

        const review = new Review({
            product: productId,
            user: userId,
            userName: realUserName,
            order: orderId,
            rating: Number(rating),
            comment,
            size: size || null
        });

        await review.save();

        // No need to recalculate here because status is 'Pending' by default.
        // It only counts once Admin approves it.

        res.status(201).json({ success: true, message: "Review submitted!" });

    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: "You already reviewed this item/size." });
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// 2. ADMIN: Update Status (Approve/Reject)
exports.updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });

        if (!review) return res.status(404).json({ success: false, message: "Review not found" });

        // ALWAYS Recalculate. 
        // If Approved -> Adds to score.
        // If Rejected -> Removes from score.
        await recalculateProductRating(review.product);

        res.json({ success: true, message: `Review ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

// 3. ADMIN: Delete Review (Safer Version)
exports.deleteReview = async (req, res) => {
    try {
        // 1. Find the review first (so we strictly get the Product ID)
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }

        const productId = review.product; // Save the ID to a variable

        // 2. Delete the review document
        await review.deleteOne();

        // 3. IMMEDIATE Recalculation using the saved ID
        await recalculateProductRating(productId);

        res.json({ success: true, message: "Review deleted and product stats updated." });

    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ success: false, message: "Delete failed" });
    }
};

// 4. USER: Get Reviews for Product
exports.getProductReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ product: req.params.productId, status: 'Approved' }).sort('-createdAt');
        res.json({ success: true, data: reviews });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// 5. ADMIN: Get All Reviews
exports.getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find().populate('product', 'name').sort('-createdAt');
        res.json({ success: true, data: reviews });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};


// --- 6. ADMIN: Sync/Repair All Product Ratings ---
// Run this once to fix your "Ghost" ratings
exports.syncAllRatings = async (req, res) => {
    try {
        const products = await Product.find();
        let updatedCount = 0;

        for (const product of products) {
            // 1. Find actual approved reviews for this product
            const reviews = await Review.find({ product: product._id, status: 'Approved' });

            // 2. Calculate real stats
            let avg = 0;
            let count = reviews.length;

            if (count > 0) {
                avg = reviews.reduce((acc, r) => acc + r.rating, 0) / count;
            }

            // 3. Force Update the Product
            product.ratings = avg.toFixed(1);
            product.numReviews = count;
            await product.save();

            updatedCount++;
        }

        res.json({
            success: true,
            message: `Successfully synced ratings for ${updatedCount} products.`
        });

    } catch (err) {
        console.error("Sync Error:", err);
        res.status(500).json({ success: false, message: "Sync failed" });
    }
};