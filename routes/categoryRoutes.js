const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// GET /api/categories -> Fetch all
router.get('/', categoryController.getAllCategories);

// POST /api/categories -> Create new
router.post('/', categoryController.createCategory);

// PUT (Update)
router.put('/:id', categoryController.updateCategory);

// DELETE (Remove)
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;