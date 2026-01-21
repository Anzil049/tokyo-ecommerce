const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const {
    createAdminUser,
    deleteUser,
    getAllUsers,
    updateUserRole,
    toggleBlockStatus,
    getDashboardStats,
    getReportData,
    getTransactions
} = require('../controllers/adminController');

// --- MANAGE ADMINS (Super Admin Only) ---

// Create a new Editor, Viewer, or Super Admin
router.post('/create-admin',
    protectAdmin,
    authorizeRoles('superadmin'),
    createAdminUser
);

// Delete any user or admin
router.delete('/user/:id',
    protectAdmin,
    authorizeRoles('superadmin'),
    deleteUser
);

router.get('/users', protectAdmin, authorizeRoles('superadmin', 'editor', 'viewer'), getAllUsers);

// Update User Role
router.put('/user/:id', protectAdmin, authorizeRoles('superadmin'), updateUserRole);


// --- NEW ROUTE: Block/Unblock User ---
// Allowing Super Admin and Editors to block users
router.put('/user/block/:id',
    protectAdmin,
    authorizeRoles('superadmin', 'editor'),
    toggleBlockStatus
);


// Allow all admin types to view stats
router.get('/dashboard-stats', protectAdmin, authorizeRoles('superadmin', 'editor', 'viewer'), getDashboardStats);

router.get('/report-data', protectAdmin, authorizeRoles('superadmin', 'editor', 'viewer'), getReportData);

router.get('/transactions', protectAdmin, authorizeRoles('superadmin', 'editor', 'viewer'), getTransactions);

module.exports = router;