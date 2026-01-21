const User = require('../models/User');
const Order = require('../models/Order'); // <--- UNCOMMENTED THIS (Critical)
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');

// --- 1. Get All Users ---
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
};

// --- 2. Update User Role ---
exports.updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const userId = req.params.id;

        const allowedRoles = ['user', 'superadmin', 'editor', 'viewer'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role selected' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user._id.toString() === req.user) {
            return res.status(400).json({ message: 'You cannot change your own role' });
        }

        user.role = role;
        await user.save();

        res.json({ message: `User role updated to ${role}`, user });

    } catch (err) {
        res.status(500).json({ message: 'Update failed', error: err.message });
    }
};

// --- 3. DASHBOARD STATS (Fixed: Item-Wise Count for Card) ---
exports.getDashboardStats = async (req, res) => {
    try {
        const { period } = req.query;
        let startDate = new Date();
        let endDate = new Date();
        let matchStage = {};
        let groupFormat = "%Y-%m-%d";
        let dateGeneratorType = 'daily';

        // 1. Determine Date Range
        if (period && period !== 'all_time') {
            const cleanPeriod = period.trim();
            const keywords = ['today', 'last7days', 'last1month', 'last6months', 'last1year'];

            if (keywords.includes(cleanPeriod)) {
                startDate.setHours(0, 0, 0, 0);
                switch (cleanPeriod) {
                    case 'today':
                        endDate.setHours(23, 59, 59, 999);
                        groupFormat = "%H:00";
                        dateGeneratorType = 'hourly';
                        break;
                    case 'last1month':
                        startDate.setDate(startDate.getDate() - 30);
                        break;
                    case 'last6months':
                        startDate.setMonth(startDate.getMonth() - 6);
                        groupFormat = "%Y-%m";
                        dateGeneratorType = 'monthly';
                        break;
                    case 'last1year':
                        startDate.setFullYear(startDate.getFullYear() - 1);
                        groupFormat = "%Y-%m";
                        dateGeneratorType = 'monthly';
                        break;
                    default:
                        startDate.setDate(startDate.getDate() - 6);
                }
            } else if (cleanPeriod.includes('_')) {
                // CUSTOM RANGE LOGIC (Start_End)
                const parts = cleanPeriod.split('_');
                if (parts.length === 2) {
                    const [sY, sM, sD] = parts[0].split('-').map(Number);
                    const [eY, eM, eD] = parts[1].split('-').map(Number);

                    startDate = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0));
                    endDate = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999));

                    groupFormat = "%Y-%m-%d";
                    dateGeneratorType = 'utc_daily';
                } else {
                    startDate.setDate(startDate.getDate() - 6);
                }
            } else {
                // SPECIFIC DATE LOGIC
                const parsedDate = new Date(cleanPeriod);
                if (!isNaN(parsedDate.getTime())) {
                    const parts = cleanPeriod.split('-');
                    if (parts.length === 3) {
                        const y = parseInt(parts[0]);
                        const m = parseInt(parts[1]);
                        const d = parseInt(parts[2]);
                        startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
                        endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

                        groupFormat = "%H:00";
                        dateGeneratorType = 'hourly';
                    } else {
                        startDate.setDate(startDate.getDate() - 6);
                    }
                } else {
                    startDate.setDate(startDate.getDate() - 6);
                }
            }
            matchStage = { createdAt: { $gte: startDate, $lte: endDate } };
        }

        // 2. CARD STATS (Aggregated) (Unchanged)
        const statsAgg = await Order.aggregate([
            { $match: { ...matchStage, orderStatus: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: { $add: ["$totalAmount", { $ifNull: ["$discountAmount", 0] }] } },
                    totalItems: { $sum: { $sum: "$items.quantity" } }
                }
            }
        ]);

        const totalSales = statsAgg.length > 0 ? statsAgg[0].totalSales : 0;
        const totalItems = statsAgg.length > 0 ? statsAgg[0].totalItems : 0;
        const newCustomers = await User.countDocuments({ role: 'user', ...matchStage });

        // 3. CHART DATA
        const dbData = await Order.aggregate([
            { $match: matchStage },
            { $unwind: "$items" },
            {
                $group: {
                    _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
                    success: { $sum: { $cond: [{ $in: ["$items.status", ["Delivered", "Completed", "Paid", "Pending", "Processing", "Shipped", "Out for Delivery"]] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $in: ["$items.status", ["Cancelled", "Returned", "Return Rejected", "Return Requested"]] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 4. FILL MISSING DATES
        const dataMap = {};
        dbData.forEach(item => { dataMap[item._id] = item; });

        const labels = [];
        const successData = [];
        const canceledData = [];
        let currentIterDate = new Date(startDate);

        if (period === 'all_time') {
            dbData.forEach(doc => {
                labels.push(doc._id);
                successData.push(doc.success);
                canceledData.push(doc.cancelled);
            });
        } else {
            while (currentIterDate <= endDate) {
                let label;
                if (dateGeneratorType === 'hourly') {
                    const hour = String(currentIterDate.getUTCHours()).padStart(2, '0');
                    label = `${hour}:00`;
                    currentIterDate.setUTCHours(currentIterDate.getUTCHours() + 1);
                } else if (dateGeneratorType === 'utc_daily') {
                    // NEW: UTC Daily Loop
                    const month = String(currentIterDate.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(currentIterDate.getUTCDate()).padStart(2, '0');
                    label = `${currentIterDate.getUTCFullYear()}-${month}-${day}`;
                    currentIterDate.setUTCDate(currentIterDate.getUTCDate() + 1);
                } else if (dateGeneratorType === 'monthly') {
                    const month = String(currentIterDate.getMonth() + 1).padStart(2, '0');
                    label = `${currentIterDate.getFullYear()}-${month}`;
                    currentIterDate.setMonth(currentIterDate.getMonth() + 1);
                } else {
                    const month = String(currentIterDate.getMonth() + 1).padStart(2, '0');
                    const day = String(currentIterDate.getDate()).padStart(2, '0');
                    label = `${currentIterDate.getFullYear()}-${month}-${day}`;
                    currentIterDate.setDate(currentIterDate.getDate() + 1);
                }

                if (dataMap[label]) {
                    labels.push(label);
                    successData.push(dataMap[label].success);
                    canceledData.push(dataMap[label].cancelled);
                } else {
                    labels.push(label);
                    successData.push(0);
                    canceledData.push(0);
                }
            }
        }

        res.json({
            success: true,
            stats: {
                sales: totalSales,
                items: totalItems,
                customers: newCustomers
            },
            chart: { labels, success: successData, canceled: canceledData }
        });

    } catch (err) {
        console.error("Stats Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- 4. Create Admin User ---
exports.createAdminUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password || !role) return res.status(400).json({ message: 'All fields required' });

        const allowedRoles = ['superadmin', 'editor', 'viewer'];
        if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Invalid role' });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name, email, password: hashedPassword, role, isVerified: true
        });

        res.status(201).json({ message: `New ${role} created`, user: { id: newUser._id, email: newUser.email } });

    } catch (err) {
        res.status(500).json({ message: 'Creation failed', error: err.message });
    }
};

// --- 5. Delete User ---
exports.deleteUser = async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        if (userToDelete._id.toString() === req.user) return res.status(400).json({ message: 'Cannot delete yourself' });

        await userToDelete.deleteOne();
        res.json({ message: 'User deleted' });

    } catch (err) {
        res.status(500).json({ message: 'Delete failed' });
    }
};

// --- 6. Toggle Block Status ---
exports.toggleBlockStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        if (user._id.toString() === req.user) return res.status(400).json({ success: false, message: "Cannot block yourself." });

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.status(200).json({
            success: true,
            message: `User ${user.isBlocked ? "Blocked" : "Unblocked"}`,
            isBlocked: user.isBlocked
        });

    } catch (error) {
        res.status(500).json({ success: false, error: "Block Error" });
    }
};

// --- 7. GENERATE REPORT DATA (Item-Wise & Wallet Stats) ---
exports.getReportData = async (req, res) => {
    try {
        const { period } = req.query;
        let startDate = new Date();
        let endDate = new Date();
        let matchStage = {};

        // 1. Determine Date Range
        if (period && period !== 'all_time') {
            const cleanPeriod = period.trim();
            const keywords = ['today', 'last7days', 'last1month', 'last6months', 'last1year'];

            if (keywords.includes(cleanPeriod)) {
                startDate.setHours(0, 0, 0, 0);
                switch (cleanPeriod) {
                    case 'today':
                        endDate.setHours(23, 59, 59, 999);
                        break;
                    case 'last1month':
                        startDate.setDate(startDate.getDate() - 30);
                        break;
                    case 'last6months':
                        startDate.setMonth(startDate.getMonth() - 6);
                        break;
                    case 'last1year':
                        startDate.setFullYear(startDate.getFullYear() - 1);
                        break;
                    default:
                        startDate.setDate(startDate.getDate() - 6);
                }
            } else if (cleanPeriod.includes('|')) {
                // CUSTOM RANGE LOGIC
                const parts = cleanPeriod.split('|');
                if (parts.length === 2) {
                    const [sY, sM, sD] = parts[0].split('-').map(Number);
                    const [eY, eM, eD] = parts[1].split('-').map(Number);
                    startDate = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0));
                    endDate = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999));
                } else {
                    startDate.setDate(startDate.getDate() - 6);
                }
            } else {
                // SPECIFIC DATE LOGIC
                const parsedDate = new Date(cleanPeriod);
                if (!isNaN(parsedDate.getTime())) {
                    const parts = cleanPeriod.split('-');
                    if (parts.length === 3) {
                        const y = parseInt(parts[0]);
                        const m = parseInt(parts[1]);
                        const d = parseInt(parts[2]);
                        startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
                        endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
                    } else {
                        startDate.setDate(startDate.getDate() - 6);
                    }
                } else {
                    startDate.setDate(startDate.getDate() - 6);
                }
            }
            matchStage = { createdAt: { $gte: startDate, $lte: endDate } };
        }

        // 2. FETCH RAW DATA
        const orders = await Order.find(matchStage)
            .populate('user', 'name email')
            .sort({ createdAt: -1 });

        const newCustomers = await User.find({ role: 'user', ...matchStage })
            .select('name email createdAt isVerified')
            .sort({ createdAt: -1 });

        // 3. AGGREGATE STATS (Wallet & Items)
        const paymentStats = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalOrders: { $sum: 1 },
                    // Sum of all item quantities across all orders
                    totalItemsSold: { $sum: { $sum: "$items.quantity" } },

                    // Payment Method Breakdowns
                    codTotal: {
                        $sum: { $cond: [{ $eq: ["$paymentMethod", "COD"] }, "$totalAmount", 0] }
                    },
                    onlineTotal: {
                        $sum: { $cond: [{ $in: ["$paymentMethod", ["Online", "Razorpay"]] }, "$totalAmount", 0] }
                    },
                    walletTotal: {
                        $sum: { $cond: [{ $eq: ["$paymentMethod", "Wallet"] }, "$totalAmount", 0] }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            orders,
            customers: newCustomers,
            // Default to 0 if no stats found
            paymentStats: paymentStats[0] || {
                totalRevenue: 0, totalOrders: 0, totalItemsSold: 0,
                codTotal: 0, onlineTotal: 0, walletTotal: 0
            }
        });

    } catch (err) {
        console.error("Report Error:", err);
        res.status(500).json({ success: false, message: "Failed to generate report" });
    }
};
