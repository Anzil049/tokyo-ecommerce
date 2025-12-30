const Sale = require('../models/Sale');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ==========================================
//   SHARED HELPER FUNCTIONS (Exported)
// ==========================================

exports.applyDiscountToProducts = async (sale) => {
    try {
        let filter = {};

        // 1. Target Filter & ID Casting
        if (sale.appliesTo === 'category') filter = { category: { $in: sale.targetIds } };
        else if (sale.appliesTo === 'team') filter = { team: { $in: sale.targetIds } };
        else if (sale.appliesTo === 'product') {
            const objectIds = sale.targetIds.map(id => new mongoose.Types.ObjectId(id));
            filter = { _id: { $in: objectIds } };
        }
        filter.status = 'Active';

        // 2. SNAPSHOT: Backup current prices
        const snapshotFilter = { ...filter, "preSaleSnapshot.price": { $exists: false } };

        await Product.collection.updateMany(snapshotFilter, [
            {
                $set: {
                    preSaleSnapshot: {
                        price: "$price",
                        discountValue: "$discountValue",
                        discountType: "$discountType"
                    }
                }
            }
        ]);

        // 3. Define Math Logic
        let calcPriceLogic;
        if (sale.discountUnit === 'percent') {
            calcPriceLogic = {
                $max: [0, { $subtract: ["$basePrice", { $multiply: ["$basePrice", { $divide: [sale.discountValue, 100] }] }] }]
            };
        } else {
            calcPriceLogic = {
                $max: [0, { $subtract: ["$basePrice", sale.discountValue] }]
            };
        }

        // 4. Update Pipeline
        const pipeline = [
            { $set: { tempSalePrice: calcPriceLogic } },
            {
                $set: {
                    price: {
                        $cond: {
                            if: { $eq: [sale.offerType, 'upto'] },
                            then: { $min: ["$price", "$tempSalePrice"] },
                            else: "$tempSalePrice"
                        }
                    }
                }
            },
            {
                $set: {
                    discountValue: {
                        $cond: {
                            if: { $eq: ["$price", "$tempSalePrice"] },
                            then: sale.discountValue,
                            else: "$discountValue"
                        }
                    },
                    discountType: {
                        $cond: {
                            if: { $eq: ["$price", "$tempSalePrice"] },
                            then: sale.discountUnit === 'amount' ? 'fixed' : 'percent',
                            else: "$discountType"
                        }
                    },
                    updatedAt: new Date()
                }
            },
            { $unset: "tempSalePrice" }
        ];

        await Product.collection.updateMany(filter, pipeline);

        // Mark as Applied in DB
        await Sale.findByIdAndUpdate(sale._id, { isApplied: true });

    } catch (err) { console.error("Error applying discount:", err); }
};

exports.revertSalePrices = async (sale) => {
    try {
        let filter = {};
        if (sale.appliesTo === 'category') filter = { category: { $in: sale.targetIds } };
        else if (sale.appliesTo === 'team') filter = { team: { $in: sale.targetIds } };
        else if (sale.appliesTo === 'product') {
            const objectIds = sale.targetIds.map(id => new mongoose.Types.ObjectId(id));
            filter = { _id: { $in: objectIds } };
        }

        const revertFilter = { ...filter, "preSaleSnapshot.price": { $exists: true } };

        await Product.collection.updateMany(revertFilter, [
            {
                $set: {
                    price: "$preSaleSnapshot.price",
                    discountValue: "$preSaleSnapshot.discountValue",
                    discountType: "$preSaleSnapshot.discountType",
                    updatedAt: new Date()
                }
            },
            { $unset: "preSaleSnapshot" }
        ]);

        // Mark as Un-Applied
        await Sale.findByIdAndUpdate(sale._id, { isApplied: false });
    } catch (err) { console.error("Error reverting prices:", err); }
};

// ==========================================
//   CONTROLLER FUNCTIONS
// ==========================================

// 1. CREATE SALE
exports.createSale = async (req, res) => {
    try {
        const { targetIds } = req.body;
        let endD = new Date(req.body.endDate);
        endD.setHours(23, 59, 59, 999);

        const saleData = {
            ...req.body,
            targetIds: targetIds ? JSON.parse(targetIds) : [],
            discountValue: parseFloat(req.body.discountValue),
            isActive: req.body.isActive === 'true',
            endDate: endD,
            isApplied: false // Default to false
        };

        if (req.file) saleData.bannerUrl = `/uploads/banners/${req.file.filename}`;

        const newSale = new Sale(saleData);
        await newSale.save();

        // LOGIC FIX: Only apply NOW if Start Date has passed
        const now = new Date();
        if (newSale.isActive && new Date(newSale.startDate) <= now) {
            await exports.applyDiscountToProducts(newSale);
        }

        res.status(201).json({ success: true, data: newSale });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: `Name exists.` });
        res.status(400).json({ success: false, message: err.message });
    }
};

// --- 2. UPDATE SALE ---
exports.updateSale = async (req, res) => {
    try {
        const oldSale = await Sale.findById(req.params.id);
        if (!oldSale) return res.status(404).json({ success: false, message: "Sale not found" });

        // 1. REVERT FIRST (Clean Slate) based on old logic
        if (oldSale.isApplied) {
            await exports.revertSalePrices(oldSale);
        }

        let updateData = { ...req.body };
        if (updateData.targetIds) updateData.targetIds = JSON.parse(updateData.targetIds);
        if (updateData.discountValue) updateData.discountValue = parseFloat(updateData.discountValue);
        if (typeof updateData.isActive === 'string') updateData.isActive = updateData.isActive === 'true';

        // 2. HANDLE DATES
        // Fix Start Date: Set to 00:00:00 (Start of Day)
        if (updateData.startDate) {
            let startD = new Date(updateData.startDate);
            startD.setHours(0, 0, 0, 0);
            updateData.startDate = startD;
        }

        // Fix End Date: Set to 23:59:59 (End of Day)
        if (updateData.endDate) {
            let endD = new Date(updateData.endDate);
            endD.setHours(23, 59, 59, 999);
            updateData.endDate = endD;
        }

        // 3. Handle Banner
        if (req.file) {
            if (oldSale.bannerUrl) {
                const oldPath = path.join(__dirname, '..', 'public', oldSale.bannerUrl);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            updateData.bannerUrl = `/uploads/banners/${req.file.filename}`;
        }

        // Reset applied status so logic can re-evaluate
        updateData.isApplied = false;

        const updatedSale = await Sale.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

        // 4. APPLY NEW LOGIC
        // Check if the sale should be active NOW
        const now = new Date();
        if (updatedSale.isActive && new Date(updatedSale.startDate) <= now) {
            await exports.applyDiscountToProducts(updatedSale);
        }

        res.json({ success: true, data: updatedSale });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: `Sale name already exists.` });
        res.status(500).json({ success: false, message: err.message });
    }
};

// 3. GET ACTIVE SALE
// --- 6. GET ALL ACTIVE SALES (Public Endpoint) ---
// --- 6. GET ACTIVE SALES (Public Endpoint) ---
exports.getActiveSale = async (req, res) => {
    try {
        const now = new Date();
        // CHANGE: Use .find() instead of .findOne()
        const sales = await Sale.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: sales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 4. GET ALL SALES
exports.getSales = async (req, res) => {
    try {
        const sales = await Sale.find().sort({ createdAt: -1 });
        res.json({ success: true, data: sales });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 5. END SALE
exports.endSale = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false, message: "Not found" });
        if (!sale.isActive) return res.status(400).json({ success: false, message: "Already inactive" });

        await exports.revertSalePrices(sale);
        sale.isActive = false;
        await sale.save();
        res.json({ success: true, message: "Sale ended" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 6. DELETE SALE
exports.deleteSale = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false });

        if (sale.isApplied) {
            await exports.revertSalePrices(sale);
        }
        if (sale.bannerUrl && fs.existsSync(path.join(__dirname, '..', 'public', sale.bannerUrl))) {
            fs.unlinkSync(path.join(__dirname, '..', 'public', sale.bannerUrl));
        }
        await Sale.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};