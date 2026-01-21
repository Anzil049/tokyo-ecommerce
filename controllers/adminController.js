const User = require('../models/User');
const Order = require('../models/Order'); // <--- UNCOMMENTED THIS (Critical)
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');

// --- 1. Get All Users ---
exports.getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const roleFilter = req.query.role ? { role: req.query.role } : {};

        // We use aggregation to join with Orders and get stats
        const aggregationPipeline = [
            { $match: roleFilter },
            {
                $lookup: {
                    from: 'orders',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'orders'
                }
            },
            {
                $project: {
                    name: 1,
                    email: 1,
                    role: 1,
                    isVerified: 1,
                    isBlocked: 1,
                    createdAt: 1,
                    totalOrders: { $size: "$orders" },
                    totalSpent: {
                        $sum: {
                            $map: {
                                input: "$orders",
                                as: "order",
                                in: {
                                    $sum: {
                                        $map: {
                                            input: "$$order.items",
                                            as: "item",
                                            in: {
                                                $cond: [
                                                    {
                                                        $or: [
                                                            // COD: Count only if Delivered
                                                            {
                                                                $and: [
                                                                    { $eq: ["$$order.paymentMethod", "COD"] },
                                                                    { $eq: ["$$item.status", "Delivered"] }
                                                                ]
                                                            },
                                                            // Online/Wallet: Count if NOT Cancelled or Returned
                                                            {
                                                                $and: [
                                                                    { $in: ["$$order.paymentMethod", ["Online", "Wallet", "Razorpay"]] },
                                                                    { $not: { $in: ["$$item.status", ["Cancelled", "Returned"]] } }
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    { $multiply: ["$$item.price", "$$item.quantity"] },
                                                    0
                                                ]
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const result = await User.aggregate(aggregationPipeline);

        const totalDocs = result[0].metadata[0] ? result[0].metadata[0].total : 0;
        const users = result[0].data;

        res.json({
            success: true,
            data: users,
            pagination: {
                totalDocs,
                totalPages: Math.ceil(totalDocs / limit),
                currentPage: page,
                limit
            }
        });
    } catch (err) {
        console.error("Fetch Users Error:", err);
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
// --- 8. GET TRANSACTIONS (Strict Pagination) ---
exports.getTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const aggregationPipeline = [
            // 1. Unwind items to process each item as potential transaction
            { $unwind: "$items" },
            // 2. Lookup User for Name
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } }, // Keep order even if user deleted?
            // 3. Project Potential Transactions (Credit & Debit)
            {
                $project: {
                    _id: 0,
                    orderId: "$_id",
                    trxIdBase: {
                        $concat: [
                            { $toUpper: { $substr: [{ $toString: "$_id" }, 18, 6] } },
                            "-",
                            { $toUpper: { $substr: [{ $toString: "$items._id" }, 22, 2] } }
                        ]
                    },
                    date: "$createdAt",
                    customer: { $ifNull: ["$userInfo.name", "$shippingAddress.fullName"] },
                    itemDisplay: { $concat: ["$items.name", " (x", { $toString: "$items.quantity" }, ")"] },
                    method: "$paymentMethod",
                    amount: { $multiply: ["$items.price", "$items.quantity"] }, // Simplification: Ignore tax/shipping split for item view

                    // Conditions
                    isPrepaid: { $in: ["$paymentMethod", ["Online", "Razorpay", "Wallet"]] },
                    isCOD: { $eq: ["$paymentMethod", "COD"] },
                    status: "$items.status"
                }
            },
            // 4. Generate Transaction Rows
            {
                $project: {
                    transactions: [
                        // Credit Transaction (Sale)
                        {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ["$isPrepaid", true] },
                                        { $and: [{ $eq: ["$isCOD", true] }, { $in: ["$status", ["Delivered", "Completed", "Returned"]] }] } // Returned items were once Delivered/Paid in COD
                                    ]
                                },
                                {
                                    trxId: { $concat: ["TRX-", "$trxIdBase"] },
                                    date: "$date",
                                    customer: "$customer",
                                    itemDisplay: "$itemDisplay",
                                    method: "$method",
                                    type: "Credit",
                                    amount: "$amount",
                                    status: "Success"
                                },
                                null
                            ]
                        },
                        // Debit Transaction (Refund)
                        {
                            $cond: [
                                {
                                    $or: [
                                        // Prepaid Refund
                                        { $and: [{ $eq: ["$isPrepaid", true] }, { $in: ["$status", ["Cancelled", "Returned"]] }] },
                                        // COD Refund (Only if Returned, effectively implies it was delivered first)
                                        { $and: [{ $eq: ["$isCOD", true] }, { $eq: ["$status", "Returned"] }] }
                                    ]
                                },
                                {
                                    trxId: { $concat: ["REF-", "$trxIdBase"] },
                                    date: "$date", // Ideally slightly later, but keeping simple
                                    customer: "$customer",
                                    itemDisplay: { $concat: ["Refund: ", "$itemDisplay"] },
                                    method: "Wallet", // Refunds usually go to wallet? Or same method. Using Wallet as per frontend logic often.
                                    type: "Debit",
                                    amount: "$amount",
                                    status: "Refunded"
                                },
                                null
                            ]
                        }
                    ]
                }
            },
            // 5. Unwind generated transactions
            { $unwind: "$transactions" },
            // 6. Filter nulls (invalid transactions)
            { $match: { "transactions": { $ne: null } } },
            // 7. Promote to root
            { $replaceRoot: { newRoot: "$transactions" } },
            // 8. Sort
            { $sort: { date: -1 } },
            // 9. Pagination Facet
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const result = await Order.aggregate(aggregationPipeline);

        const totalDocs = result[0].metadata[0] ? result[0].metadata[0].total : 0;
        const transactions = result[0].data;

        res.json({
            success: true,
            data: transactions,
            pagination: {
                totalDocs,
                totalPages: Math.ceil(totalDocs / limit),
                currentPage: page,
                limit
            }
        });

    } catch (err) {
        console.error("Get Transactions Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch transactions" });
    }
};
