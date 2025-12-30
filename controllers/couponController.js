const Coupon = require('../models/Coupon');
const Cart = require('../models/Cart');
const Order = require('../models/Order'); // <--- ADD THIS

// 1. ADMIN: Create Coupon
exports.createCoupon = async (req, res) => {
    try {
        // ADDED: usageLimit to destructuring
        const { code, description, discountType, discountValue, appliesTo, targetIds, minOrderValue, minQuantity, usageLimit, startDate, expirationDate, isActive } = req.body;

        const existing = await Coupon.findOne({ code: code.toUpperCase() });
        if (existing) return res.status(400).json({ error: "Coupon code already exists" });

        // LOGIC: If expirationDate is empty/null, save as null (Infinity)
        const finalExpiry = expirationDate ? expirationDate : null;

        const newCoupon = new Coupon({
            code, description, discountType, discountValue, appliesTo, minOrderValue, minQuantity, startDate,
            expirationDate: finalExpiry,
            usageLimit: usageLimit || null, // FIXED: Save usage limit
            usedCount: 0, // Initialize used count
            isActive
        });

        // Assign Targets
        if (appliesTo === 'category') newCoupon.targetCategories = targetIds;
        if (appliesTo === 'team') newCoupon.targetTeams = targetIds;
        if (appliesTo === 'product') newCoupon.targetProducts = targetIds;

        await newCoupon.save();
        res.status(201).json({ message: "Coupon created successfully", coupon: newCoupon });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error creating coupon" });
    }
};

// 2. ADMIN: Get All Coupons
exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch coupons" });
    }
};

// 3. ADMIN: Update Coupon
exports.updateCoupon = async (req, res) => {
    try {
        // ADDED: usageLimit to destructuring
        const { code, description, discountType, discountValue, appliesTo, targetIds, minOrderValue, minQuantity, usageLimit, startDate, expirationDate, isActive } = req.body;

        const finalExpiry = expirationDate ? expirationDate : null;

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            {
                code, description, discountType, discountValue, appliesTo, minOrderValue, minQuantity, startDate,
                expirationDate: finalExpiry,
                usageLimit: usageLimit || null, // FIXED: Update usage limit
                isActive,
                targetCategories: appliesTo === 'category' ? targetIds : [],
                targetTeams: appliesTo === 'team' ? targetIds : [],
                targetProducts: appliesTo === 'product' ? targetIds : []
            },
            { new: true }
        );

        if (!updatedCoupon) return res.status(404).json({ error: "Coupon not found" });
        res.json({ message: "Coupon updated", coupon: updatedCoupon });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
};

// 4. ADMIN: Delete Coupon
exports.deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Delete failed" });
    }
};
exports.verifyCoupon = async (req, res) => {
    try {
        const { code, cartId } = req.body;
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });

        if (!coupon) return res.status(404).json({ valid: false, message: "Invalid Coupon Code" });
        if (!coupon.isActive) return res.status(400).json({ valid: false, message: "Coupon is inactive" });

        const now = new Date();
        if (coupon.startDate && new Date(coupon.startDate) > now) return res.status(400).json({ valid: false, message: "Coupon not active yet" });

        if (coupon.expirationDate && new Date(coupon.expirationDate) < now) {
            return res.status(400).json({ valid: false, message: "Coupon has expired" });
        }

        // Global Usage Limit Check
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ valid: false, message: "Coupon usage limit reached" });
        }

        const cart = await Cart.findById(cartId).populate('items.product');
        if (!cart) return res.status(404).json({ error: "Cart not found" });

        // ============================================================
        // 1. FIX: ONE TIME USE PER USER LOGIC
        // ============================================================
        if (coupon.discountType !== 'free_shipping') {
            if (cart.user) {
                // We verify against 'couponCode' because your Order model saves the string, not the ID.
                // We also ensure the order wasn't cancelled (cancelledAt: null).
                const alreadyUsed = await Order.findOne({
                    user: cart.user,
                    couponCode: coupon.code,
                    cancelledAt: null
                });

                if (alreadyUsed) {
                    return res.status(400).json({
                        valid: false,
                        message: "You have already used this coupon."
                    });
                }
            }
        }
        // ============================================================

        let currentTotal = 0;
        let totalItems = 0;

        cart.items.forEach(item => {
            if (item.product && item.product.status === 'Active' && item.product.stockQuantity > 0) {
                currentTotal += (item.price * item.quantity);
                totalItems += item.quantity;
            }
        });

        if (coupon.minQuantity > 0 && totalItems < coupon.minQuantity) {
            return res.status(400).json({ valid: false, message: `Add ${coupon.minQuantity - totalItems} more valid items.` });
        }

        if (coupon.minOrderValue > 0 && currentTotal < coupon.minOrderValue) {
            return res.status(400).json({ valid: false, message: `Min order value is ₹${coupon.minOrderValue}` });
        }

        // Scope Check (Logic unchanged)
        let eligibleAmount = 0;
        let isScopeValid = false;

        if (coupon.appliesTo === 'all') {
            eligibleAmount = currentTotal;
            isScopeValid = true;
        } else {
            const targetProducts = (coupon.targetProducts || []).map(id => id.toString());
            const targetCategories = (coupon.targetCategories || []).map(t => t.toString());
            const targetTeams = (coupon.targetTeams || []).map(t => t.toString());

            cart.items.forEach(item => {
                const product = item.product;
                if (!product || product.status !== 'Active' || product.stockQuantity <= 0) return;

                let match = false;
                if (coupon.appliesTo === 'product' && targetProducts.includes(product._id.toString())) match = true;
                if (coupon.appliesTo === 'category' && product.category && targetCategories.includes(product.category.toString())) match = true;
                if (coupon.appliesTo === 'team' && product.team && targetTeams.includes(product.team.toString())) match = true;

                if (match) {
                    eligibleAmount += (item.price * item.quantity);
                    isScopeValid = true;
                }
            });
        }

        if (!isScopeValid) return res.status(400).json({ valid: false, message: `Coupon not valid for these items.` });

        // Calculate Discount (Logic unchanged)
        let discountAmount = 0;
        let shippingDiscount = false;

        if (coupon.discountType === 'free_shipping') {
            shippingDiscount = true;
        } else if (coupon.discountType === 'percentage') {
            discountAmount = (eligibleAmount * coupon.discountValue) / 100;
        } else if (coupon.discountType === 'fixed') {
            discountAmount = coupon.discountValue;
            if (discountAmount > eligibleAmount) discountAmount = eligibleAmount;
        }

        discountAmount = Math.round(discountAmount);

        cart.coupon = coupon._id;
        cart.discountAmount = discountAmount;
        cart.totalPrice = currentTotal;
        cart.totalAfterDiscount = currentTotal - discountAmount;

        await cart.save();

        res.status(200).json({
            valid: true,
            discountAmount,
            newTotal: cart.totalAfterDiscount,
            shippingDiscount,
            message: "Coupon Applied"
        });

    } catch (err) {
        console.error("Verify Coupon Error:", err);
        res.status(500).json({ error: "Server error" });
    }
};