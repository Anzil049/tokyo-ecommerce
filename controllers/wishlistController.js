const Wishlist = require('../models/Wishlist');

// @desc    Get user wishlist
// @route   GET /api/wishlist
// @access  Private
exports.getWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user })
            .populate({
                path: 'products',
                // ⚠️ ADDED 'basePrice' here so the discount badge works
                // Kept 'status' and 'stockQuantity' so the Out of Stock logic works
                select: 'name price images slug category status stockQuantity basePrice sizes'
            });

        if (!wishlist) {
            return res.status(200).json([]);
        }

        // Filter out nulls (items that were completely deleted from the database)
        const validProducts = wishlist.products.filter(item => item !== null);

        res.status(200).json(validProducts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Toggle item in wishlist
// @route   POST /api/wishlist/toggle
// @access  Private
exports.toggleWishlist = async (req, res) => {
    const { productId } = req.body;

    if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not authorized.' });
    }

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    try {
        let wishlist = await Wishlist.findOne({ user: req.user });

        if (!wishlist) {
            wishlist = new Wishlist({
                user: req.user,
                products: [productId]
            });
            await wishlist.save();
            return res.status(200).json({ success: true, action: 'added' });
        }

        // Check if product exists (using safe string comparison)
        const productIndex = wishlist.products.findIndex(
            (item) => item.toString() === productId
        );

        if (productIndex > -1) {
            // Item exists -> Remove it
            wishlist.products.splice(productIndex, 1);
            await wishlist.save();
            return res.status(200).json({ success: true, action: 'removed' });
        } else {
            // Item does not exist -> Add it
            wishlist.products.push(productId);
            await wishlist.save();
            return res.status(200).json({ success: true, action: 'added' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};