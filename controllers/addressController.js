const Address = require('../models/Address');

// Get all addresses
exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user }).sort({ isDefault: -1, createdAt: -1 });
        res.json({ success: true, data: addresses });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Add new address
exports.addAddress = async (req, res) => {
    try {
        const count = await Address.countDocuments({ user: req.user });
        
        // It becomes default if:
        // 1. It is the very first address (count === 0)
        // 2. OR the user checked the "Set as default" box
        let isDefault = count === 0 || req.body.isDefault === true;

        // If setting this as default, ensure no others are default
        if (isDefault) {
            await Address.updateMany({ user: req.user }, { isDefault: false });
        }

        const address = new Address({ ...req.body, user: req.user, isDefault });
        await address.save();
        res.status(201).json({ success: true, message: 'Address added', data: address });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Update address
exports.updateAddress = async (req, res) => {
    try {
        // If user wants to make this the default, unset all others first
        if (req.body.isDefault === true) {
            await Address.updateMany({ user: req.user }, { isDefault: false });
        }

        const address = await Address.findOneAndUpdate(
            { _id: req.params.id, user: req.user },
            req.body,
            { new: true }
        );
        
        if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
        res.json({ success: true, message: 'Address updated', data: address });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Delete address
exports.deleteAddress = async (req, res) => {
    try {
        await Address.findOneAndDelete({ _id: req.params.id, user: req.user });
        res.json({ success: true, message: 'Address deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Set an address as default
exports.setDefaultAddress = async (req, res) => {
    try {
        // 1. Set all addresses for this user to isDefault: false
        await Address.updateMany(
            { user: req.user },
            { isDefault: false }
        );

        // 2. Set the selected address to isDefault: true
        const address = await Address.findOneAndUpdate(
            { _id: req.params.id, user: req.user },
            { isDefault: true },
            { new: true }
        );

        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        res.json({ success: true, message: 'Default address updated', data: address });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};