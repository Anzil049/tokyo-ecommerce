const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Coupon = require('../models/Coupon');
const { sendOrderStatus } = require('../utils/emailService');

// --- 1. HELPER FUNCTION (CRITICAL: MUST BE HERE) ---
// This determines the Global Status based on all items.
const calculateGlobalStatus = (items) => {
    const statuses = items.map(i => i.status);

    // Priority 1: If ANY item is "Return Requested", set global status to warn Admin.
    if (statuses.some(s => s === 'Return Requested')) {
        return 'Return Requested';
    }

    // Priority 2: If ANY item is still active (Pending, Shipped, etc.), order is "Pending".
    const activeStates = ['Pending', 'Processing', 'Shipped', 'Out for Delivery'];
    if (statuses.some(s => activeStates.includes(s))) {
        return 'Pending';
    }

    // Priority 3: If everything else is finished (Delivered, Cancelled, Returned, Rejected),
    // set to "Completed". This prevents Schema Validation Errors.
    return 'Completed';
};

// --- 2. REFUND HELPER ---
async function processRefund(userId, amount, description) {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
    wallet.balance += amount;
    wallet.transactions.push({ type: 'credit', amount, description, date: Date.now() });
    await wallet.save();
}

// --- 3. USER: Place Order ---
// --- 3. USER: Place Order ---
exports.placeOrder = async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, paymentDetails } = req.body;
        const userId = req.user;

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || cart.items.length === 0) return res.status(400).json({ success: false, message: "Cart is empty" });

        // --- 1. Coupon Setup & Validation ---
        let appliedCouponCode = null;
        let shippingCost = (cart.totalPrice > 600) ? 0 : 50;
        let totalDiscountFromCoupon = cart.discountAmount || 0;
        let couponDoc = null;

        if (cart.coupon) {
            try { couponDoc = await Coupon.findById(cart.coupon); }
            catch (e) { couponDoc = await Coupon.findOne({ code: cart.coupon }); }

            if (couponDoc) {
                appliedCouponCode = couponDoc.code;
                if (couponDoc.discountType === 'free_shipping') shippingCost = 0;

                // Update usage
                couponDoc.usedCount += 1;
                if (couponDoc.usageLimit !== null && couponDoc.usedCount >= couponDoc.usageLimit) {
                    couponDoc.isActive = false;
                }
                await couponDoc.save();
            }
        }

        // --- 2. Calculate Eligible Total (Strict Check) ---
        // We must know the total value of ONLY the items the coupon applies to
        // so we can distribute the discount proportionally among them.
        let eligibleTotalValue = 0;

        // Helper to check if a specific product matches the coupon rules
        const isItemEligibleForCoupon = (product) => {
            if (!couponDoc || !product) return false;
            if (couponDoc.appliesTo === 'all') return true;
            if (couponDoc.appliesTo === 'product') {
                const targets = (couponDoc.targetProducts || []).map(id => id.toString());
                return targets.includes(product._id.toString());
            }
            if (couponDoc.appliesTo === 'category') {
                const targets = (couponDoc.targetCategories || []).map(id => id.toString());
                return product.category && targets.includes(product.category.toString());
            }
            if (couponDoc.appliesTo === 'team') {
                const targets = (couponDoc.targetTeams || []).map(id => id.toString());
                return product.team && targets.includes(product.team.toString());
            }
            return false;
        };

        // First Pass: Calculate Total Value of Eligible Items
        if (totalDiscountFromCoupon > 0) {
            cart.items.forEach(item => {
                if (item.product && isItemEligibleForCoupon(item.product)) {
                    eligibleTotalValue += (item.price * item.quantity);
                }
            });
        }

        // --- 3. Process Items & Distribute Discount ---
        const orderItems = [];

        for (const item of cart.items) {
            const product = item.product;
            if (!product || product.status !== 'Active') return res.status(400).json({ success: false, message: `Item unavailable.` });
            if (product.stockQuantity < item.quantity) return res.status(400).json({ success: false, message: `Insufficient stock` });

            if (item.size) {
                const sizeData = product.sizes.find(s => s.size === item.size);
                if (!sizeData || sizeData.stock < item.quantity) return res.status(400).json({ success: false, message: `Size out of stock.` });
            }

            let finalPrice = item.price;

            // Apply Discount logic ONLY if this specific item is eligible
            if (totalDiscountFromCoupon > 0 && eligibleTotalValue > 0 && isItemEligibleForCoupon(product)) {
                const itemTotal = item.price * item.quantity;
                // Calculate proportion: (ItemTotal / EligibleTotal) * Discount
                const share = (itemTotal / eligibleTotalValue) * totalDiscountFromCoupon;
                finalPrice = item.price - (share / item.quantity);
            }

            orderItems.push({
                product: product._id,
                name: product.name,
                quantity: item.quantity,
                price: parseFloat(finalPrice.toFixed(2)), // Ensure 2 decimal places
                originalPrice: item.price, // [NEW] Save original price for refund calcs
                image: product.images?.[0] || null,
                size: item.size,
                status: 'Pending'
            });
        }

        // --- 4. Final Totals ---
        const originalSubtotal = cart.totalPrice;
        let finalTotalAmount = 0;

        // Recalculate total based on new item prices + shipping
        // (We calculate manually to be safe, rather than trusting cart.totalAfterDiscount blindy)
        const orderItemsTotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        finalTotalAmount = orderItemsTotal + shippingCost;
        // Round to handle floating point errors
        finalTotalAmount = Math.round(finalTotalAmount);

        // --- 5. Payment & Wallet Logic ---
        if (paymentMethod === 'Wallet') {
            const wallet = await Wallet.findOne({ user: userId });
            if (!wallet || wallet.balance < finalTotalAmount) return res.status(400).json({ success: false, message: "Insufficient Wallet Balance" });
            wallet.balance -= finalTotalAmount;
            wallet.transactions.push({ amount: finalTotalAmount, type: 'debit', description: 'Order Purchase', date: Date.now() });
            await wallet.save();
        }

        const newOrder = new Order({
            user: userId,
            items: orderItems,
            shippingAddress,
            paymentMethod,
            paymentStatus: (paymentMethod === 'Online' || paymentMethod === 'Wallet') ? 'Paid' : 'Pending',
            paymentDetails,
            subtotal: originalSubtotal,
            discountAmount: totalDiscountFromCoupon,
            shippingCost: shippingCost,
            totalAmount: finalTotalAmount,
            couponCode: appliedCouponCode,
            orderStatus: 'Pending'
        });

        await newOrder.save();

        // --- 6. Stock Updates ---
        for (const item of orderItems) {
            if (item.size) await Product.updateOne({ _id: item.product, "sizes.size": item.size }, { $inc: { "sizes.$.stock": -item.quantity, stockQuantity: -item.quantity } });
            else await Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: -item.quantity } });
        }

        // --- 7. Clear Cart ---
        cart.items = [];
        cart.totalPrice = 0;
        cart.discountAmount = 0;
        cart.totalAfterDiscount = 0;
        cart.coupon = null;
        await cart.save();

        res.status(201).json({ success: true, message: "Order placed!", orderId: newOrder._id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Order Failed" });
    }
};

// --- 4. USER: Get My Orders ---
exports.getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user }).sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: "Fetch failed" });
    }
};

// --- 5. USER: Cancel Entire Order ---
exports.cancelMyOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        if (order.orderStatus === 'Completed') {
            return res.status(400).json({ success: false, message: "Cannot cancel completed orders." });
        }

        for (const item of order.items) {
            if (item.status !== 'Cancelled') {
                if (item.size) await Product.updateOne({ _id: item.product, "sizes.size": item.size }, { $inc: { "sizes.$.stock": item.quantity, stockQuantity: item.quantity } });
                else await Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } });
                item.status = 'Cancelled';
            }
        }

        if (order.paymentStatus === 'Paid') {
            await processRefund(req.user, order.totalAmount, `Refund Order #${order._id.toString().slice(-6)}`);
            order.paymentStatus = 'Refunded';
        }

        // Fix: Use 'Completed' because 'Cancelled' is not in Schema Enum for global status
        order.orderStatus = 'Completed';
        order.cancelledAt = Date.now();
        await order.save();

        res.json({ success: true, message: "Order cancelled." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Cancellation failed" });
    }
};

// --- 6. USER: Return Request ---
exports.requestReturn = async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findOne({ _id: req.params.id, user: req.user });

        if (!order || order.orderStatus !== 'Completed') return res.status(400).json({ success: false, message: "Invalid Return Request" });

        order.orderStatus = 'Return Requested';
        order.returnReason = reason;
        await order.save();
        res.json({ success: true, message: "Return requested." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Request failed" });
    }
};

// --- 7. ADMIN: Get All Orders ---
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: "Fetch failed" });
    }
};

// --- 8. ADMIN: Update Global Status ---
exports.updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        if (status === 'Delivered') {
            order.deliveredAt = Date.now();
            if (order.paymentMethod === 'COD') order.paymentStatus = 'Paid';
        }

        if (status === 'Cancelled') {
            for (const item of order.items) {
                if (item.status !== 'Cancelled') {
                    if (item.size) await Product.updateOne({ _id: item.product, "sizes.size": item.size }, { $inc: { "sizes.$.stock": item.quantity, stockQuantity: item.quantity } });
                    else await Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } });
                    item.status = 'Cancelled';
                }
            }
            if (order.paymentStatus === 'Paid') {
                await processRefund(order.user, order.totalAmount, `Refund Order #${order._id}`);
                order.paymentStatus = 'Refunded';
            }
        }

        // Map manual admin updates to allowed schema values
        if (['Delivered', 'Cancelled'].includes(status)) {
            order.orderStatus = 'Completed';
        } else {
            order.orderStatus = status;
        }

        await order.save();
        res.json({ success: true, message: `Order updated.` });

    } catch (err) {
        res.status(500).json({ success: false, message: "Update failed" });
    }
};

// --- 9. ADMIN: Delete Order ---
exports.deleteOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        res.json({ success: true, message: "Order deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Delete failed" });
    }
};

// --- 10. CANCEL SINGLE ITEM (User/Admin) ---
exports.cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.user;
        const isAdmin = req.baseUrl.includes('admin');
        const query = isAdmin ? { _id: orderId } : { _id: orderId, user: userId };

        const order = await Order.findOne(query);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item || item.status === 'Cancelled') return res.status(400).json({ message: "Invalid Item" });

        // Restock
        if (item.size) await Product.updateOne({ _id: item.product, "sizes.size": item.size }, { $inc: { "sizes.$.stock": item.quantity, stockQuantity: item.quantity } });
        else await Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } });

        // --- NEW REFUND LOGIC START ---

        let refundAmount = 0;

        // 1. Calculate Standard Refund (Amount USER PAID for this item)
        // If no coupon, item.price == item.originalPrice.
        const standardRefund = item.price * item.quantity;

        // 2. Check Coupon Revalidation
        let couponRevoked = false;

        if (order.couponCode) {
            const coupon = await Coupon.findOne({ code: order.couponCode });
            if (coupon && coupon.minQuantity > 0) {
                // Count remaining active items (excluding the one being cancelled)
                const activeItems = order.items.filter(i =>
                    i._id.toString() !== itemId &&
                    !['Cancelled', 'Returned', 'Return Rejected'].includes(i.status)
                );

                // If remaining items fall below required min items -> REVOKE COUPON
                if (activeItems.length < coupon.minQuantity) {
                    couponRevoked = true;

                    // Logic: User must pay FULL ORIGINAL PRICE for kept items.
                    // Refund = TotalPaid - (OriginalCostOfKeptItems + Shipping)

                    let originalCostOfKeptItems = 0;
                    activeItems.forEach(i => {
                        // Fallback to price if originalPrice missing (legacy orders)
                        originalCostOfKeptItems += ((i.originalPrice || i.price) * i.quantity);
                    });

                    // We must ensure we don't refund more than what remains valid
                    const maxRefundable = order.totalAmount - (originalCostOfKeptItems + order.shippingCost);

                    // Detailed calculation for description
                    const deduction = standardRefund - Math.max(0, maxRefundable);
                    refundAmount = Math.max(0, maxRefundable);
                }
            }
        }

        // 3. Fallback to Standard Refund if Coupon validity not broken
        if (!couponRevoked) {
            refundAmount = standardRefund;
            // Edge Case: If this is the last item, include shipping (if policy allows)
            const otherValid = order.items.filter(i => i._id.toString() !== itemId && !['Cancelled', 'Returned', 'Return Rejected'].includes(i.status));

            if (otherValid.length === 0 && order.shippingCost > 0) {
                refundAmount += order.shippingCost;
            }
        }

        // --- NEW REFUND LOGIC END ---

        let description = `Refund Item: ${item.name}`;
        if (couponRevoked) {
            const lostVal = standardRefund - refundAmount;
            description += ` (Price: ₹${standardRefund} - Coupon Reversal: ₹${lostVal.toFixed(2)})`;
        } else {
            description += ` (Qty: ${item.quantity})`;
        }

        if (order.paymentStatus === 'Paid') await processRefund(order.user, refundAmount, description);

        item.status = 'Cancelled';
        order.totalAmount = Math.max(0, order.totalAmount - refundAmount);

        // Update Global Status using Helper
        order.orderStatus = calculateGlobalStatus(order.items);

        // Zeroing logic if all dead
        if (order.orderStatus === 'Completed' && order.totalAmount === 0) {
            order.shippingCost = 0;
            if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
        }

        await order.save();
        res.json({ success: true, message: "Item cancelled", newTotal: order.totalAmount });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error" });
    }
};

// --- 11. ADMIN: Update Item Status ---
exports.updateOrderItemStatus = async (req, res) => {
    try {
        const { orderId, itemId, status, rejectionReason } = req.body;
        const order = await Order.findById(orderId).populate('user');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });

        if (item.status === status) return res.json({ success: true, message: "Status unchanged" });

        // 1. Handle Rejection
        if (status === 'Return Rejected') {
            if (!rejectionReason) return res.status(400).json({ success: false, message: "Reason required" });
            item.rejectionReason = rejectionReason;
        }

        // 2. Handle Financials (Returns/Cancellations)
        if (['Cancelled', 'Returned'].includes(status) && !['Cancelled', 'Returned'].includes(item.status)) {
            // Restock
            // Restock
            if (item.size) await Product.updateOne({ _id: item.product, "sizes.size": item.size }, { $inc: { "sizes.$.stock": item.quantity, stockQuantity: item.quantity } });
            else await Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } });

            // --- NEW REFUND LOGIC START ---
            let refundValue = 0;
            const standardRefund = item.price * item.quantity;
            let couponRevoked = false;

            if (order.couponCode) {
                const coupon = await Coupon.findOne({ code: order.couponCode });
                if (coupon && coupon.minQuantity > 0) {
                    const activeItems = order.items.filter(i =>
                        i._id.toString() !== itemId &&
                        !['Cancelled', 'Returned', 'Return Rejected'].includes(i.status)
                    );

                    if (activeItems.length < coupon.minQuantity) {
                        couponRevoked = true;
                        let originalCostOfKeptItems = 0;
                        activeItems.forEach(i => {
                            // Fallback to price if originalPrice missing (legacy orders)
                            originalCostOfKeptItems += ((i.originalPrice || i.price) * i.quantity);
                        });

                        const maxRefundable = order.totalAmount - (originalCostOfKeptItems + order.shippingCost);
                        refundValue = Math.max(0, maxRefundable);
                    }
                }
            }

            if (!couponRevoked) {
                refundValue = standardRefund;
                const otherValid = order.items.filter(i =>
                    i._id.toString() !== itemId &&
                    !['Cancelled', 'Returned', 'Return Rejected'].includes(i.status)
                );
                if (otherValid.length === 0 && order.shippingCost > 0) refundValue += order.shippingCost;
            }
            // --- NEW REFUND LOGIC END ---

            const isPrePaid = order.paymentStatus === 'Paid';
            const isCodDelivered = order.paymentMethod === 'COD' && order.orderStatus === 'Completed';

            if (isPrePaid || (status === 'Returned' && (isCodDelivered || order.paymentStatus === 'Paid'))) {
                let description = `Refund (${status}): ${item.name}`;
                if (couponRevoked) {
                    const lostVal = standardRefund - refundValue;
                    description += ` (Price: ₹${standardRefund} - Coupon Reversal: ₹${lostVal.toFixed(2)})`;
                }
                await processRefund(order.user, refundValue, description);
            }
            order.totalAmount = Math.max(0, order.totalAmount - refundValue);

            // Check if all items are gone, ensuring shipping cost is removed
            const activeItemsRemaining = order.items.filter(i =>
                i._id.toString() !== itemId &&
                !['Cancelled', 'Returned', 'Return Rejected'].includes(i.status)
            );

            if (activeItemsRemaining.length === 0) order.shippingCost = 0;
        }

        item.status = status;

        // 3. Set Global Status (Correctly using Helper)
        order.orderStatus = calculateGlobalStatus(order.items);

        if (order.orderStatus === 'Completed') {
            if (!order.deliveredAt) order.deliveredAt = Date.now();

            // Manage final payment status
            const allDead = order.items.every(i => ['Cancelled', 'Returned'].includes(i.status));
            if (allDead && order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
            else if (!allDead && order.paymentStatus !== 'Refunded') order.paymentStatus = 'Paid';
        }

        await order.save();

        if (order.user && order.user.email) {
            // We call this without 'await' to ensure the admin UI updates instantly
            sendOrderStatus(
                order.user.email,       // User Email
                order.user.name,        // User Name
                order._id.toString().slice(-6).toUpperCase(), // Short Order ID
                item.name,              // Product Name
                status,                 // New Status
                rejectionReason         // Reason (only used if rejected)
            ).catch(err => console.error("Email failed:", err));
        }

        res.json({ success: true, message: `Item updated to ${status}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Update failed", error: err.message });
    }
};

// --- 12. USER: Return Single Item ---
exports.returnOrderItem = async (req, res) => {
    try {
        const { reason } = req.body;
        const { orderId, itemId } = req.params;
        const userId = req.user;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });

        if (item.status !== 'Delivered') return res.status(400).json({ message: "Not delivered" });

        item.status = 'Return Requested';
        order.returnReason = reason;

        // 4. Update Global Status using Helper
        // This ensures if even 1 item is requested, the whole order is flagged.
        order.orderStatus = calculateGlobalStatus(order.items);

        await order.save();
        res.json({ success: true, message: "Return requested." });

    } catch (err) {
        res.status(500).json({ success: false, message: "Request failed" });
    }
};