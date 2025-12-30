const express = require('express');
const router = express.Router();
const { protectUser } = require('../middleware/authMiddleware'); // Ensure you have this
const { getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } = require('../controllers/addressController');

router.get('/', protectUser, getAddresses);
router.post('/', protectUser, addAddress);
router.put('/:id', protectUser, updateAddress);
router.delete('/:id', protectUser, deleteAddress);
router.put('/:id/default', protectUser, setDefaultAddress);

module.exports = router;