const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');

// --- User Routes ---
router.post('/place', protectUser, orderController.placeOrder);
router.get('/my-orders', protectUser, orderController.getMyOrders);
router.put('/cancel/:id', protectUser, orderController.cancelMyOrder); // Cancel ENTIRE Order
router.put('/return/:id', protectUser, orderController.requestReturn);
router.put('/return-item/:orderId/:itemId', protectUser, orderController.returnOrderItem); // <--- ADD THIS


// NEW: Cancel Single Item (User)
router.put('/cancel-item/:orderId/:itemId', protectUser, orderController.cancelOrderItem);


// --- Admin Routes ---
router.get('/admin/all', protectAdmin, orderController.getAllOrders);
router.put('/admin/status', protectAdmin, orderController.updateStatus); // Global Order Status
router.delete('/admin/delete/:id', protectAdmin, orderController.deleteOrder);

// NEW: Update Single Item Status (Admin)
router.put('/admin/item-status', protectAdmin, orderController.updateOrderItemStatus);

// NEW: Cancel Single Item (Admin can use the same function logic if needed, or specific admin route)
// We reuse the controller logic but protect it with admin middleware for flexibility
router.put('/admin/cancel-item/:orderId/:itemId', protectAdmin, orderController.cancelOrderItem);

module.exports = router;