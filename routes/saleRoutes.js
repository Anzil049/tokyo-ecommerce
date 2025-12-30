const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { protectAdmin } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware'); // Import global middleware

// --- DEFINE ROUTES ---

router.get('/active', saleController.getActiveSale);


// GET: Fetch all sales (Visible to all admin roles)
router.get('/',
    protectAdmin,
    authorizeRoles('superadmin', 'editor', 'viewer'),
    saleController.getSales
);


// POST: Create a new sale
router.post('/',
    protectAdmin,
    authorizeRoles('superadmin', 'editor'),
    upload.single('saleBanner'), // Uses global config -> saves to /uploads/banners
    saleController.createSale
);

// PUT: Update an existing sale
router.put('/:id',
    protectAdmin,
    authorizeRoles('superadmin', 'editor'),
    upload.single('saleBanner'),
    saleController.updateSale
);

// POST: End a sale immediately
router.post('/:id/end',
    protectAdmin,
    authorizeRoles('superadmin', 'editor'),
    saleController.endSale
);

// DELETE: Remove a sale permanently
router.delete('/:id',
    protectAdmin,
    authorizeRoles('superadmin', 'editor'),
    saleController.deleteSale
);


module.exports = router;