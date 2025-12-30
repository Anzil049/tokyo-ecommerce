const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

exports.getPublicStats = async (req, res) => {
    try {
        // 1. "Happy Customers" -> Count Users
        const customerCount = await User.countDocuments({ role: 'user' });

        // 2. "Exclusive Products" -> Count Active Products in Inventory
        const productCount = await Product.countDocuments({ status: 'Active' });

        // 3. "Total Orders" -> Count All Orders
        const orderCount = await Order.countDocuments();

        // 4. "Gross Sales" -> Sum of all order totals
        const revenueResult = await Order.aggregate([
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        res.json({
            success: true,
            stats: {
                customers: customerCount,
                products: productCount,
                orders: orderCount,
                revenue: totalRevenue
            }
        });

    } catch (error) {
        console.error("Public Stats Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};