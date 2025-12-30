const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../models/Wallet');

// Initialize with Keys
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 1. Create Order (For Adding Money)
exports.createOrder = async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // Amount in paise
            currency: "INR",
            receipt: "receipt_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json({ success: true, order });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Order creation failed" });
    }
};

// 2. Verify Payment (Updates Wallet after successful payment)
exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
        const body = razorpay_order_id + "|" + razorpay_payment_id;

        // Verify Signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            let wallet = await Wallet.findOne({ user: req.user });

            // Create wallet if it doesn't exist
            if (!wallet) {
                wallet = new Wallet({ user: req.user, balance: 0, transactions: [] });
            }

            // Update Balance & Add Transaction
            wallet.balance += parseFloat(amount);
            wallet.transactions.push({
                amount: amount,
                type: 'credit',
                description: `Added via Razorpay (Txn: ${razorpay_payment_id})`,
                date: Date.now()
            });

            await wallet.save();
            res.json({ success: true, message: "Payment Verified & Wallet Updated" });
        } else {
            res.status(400).json({ success: false, message: "Invalid Signature" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};

// 3. Get Wallet Balance & Transactions (Merged here)
exports.getWalletBalance = async (req, res) => {
    try {
        let wallet = await Wallet.findOne({ user: req.user });

        if (!wallet) {
            return res.json({ success: true, balance: 0, transactions: [] });
        }

        // Return Balance AND Transactions
        res.json({
            success: true,
            balance: wallet.balance,
            transactions: wallet.transactions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};