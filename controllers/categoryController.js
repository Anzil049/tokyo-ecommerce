const Category = require('../models/Category');
const Product = require('../models/Product');

// 1. Get All Categories
exports.getAllCategories = async (req, res) => {
    try {
        // Sort by newest first
        const categories = await Category.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 2. Create New Category
exports.createCategory = async (req, res) => {
    try {
        const { name, slug, status, description } = req.body;

        // Basic Backend Validation
        if (!name || !slug) {
            return res.status(400).json({
                success: false,
                error: "Name and Slug are required fields."
            });
        }

        const newCategory = new Category({
            name,
            slug,
            status: status || 'Published',
            description: description || "" // Optional
        });

        await newCategory.save();

        res.status(201).json({
            success: true,
            message: "Category created successfully!",
            data: newCategory
        });

    } catch (error) {
        // Handle Duplicate Errors (E11000 is MongoDB code for duplicate unique field)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: "Category Name or Slug already exists!"
            });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// 3. Update Category


exports.updateCategory = async (req, res) => {
    try {
        const { name, slug, description, status } = req.body;
        const categoryId = req.params.id;

        // 1. Fetch the OLD category first to get the current name
        const oldCategory = await Category.findById(categoryId);

        if (!oldCategory) {
            return res.status(404).json({ success: false, error: "Category not found" });
        }

        const oldName = oldCategory.name;

        // 2. Perform the update
        const updatedCategory = await Category.findByIdAndUpdate(
            categoryId,
            { name, slug, description, status },
            { new: true, runValidators: true }
        );

        // 3. *** SYNC LOGIC ***
        // If the name changed, update all products that used the old name
        if (name && oldName !== name) {
            await Product.updateMany(
                { category: oldName },        // Find products with OLD name
                { $set: { category: name } }  // Update to NEW name
            );
        }

        res.json({ success: true, data: updatedCategory });

    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
// 4. Delete Category
exports.deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;

        // 1. Find the category first so we know its name
        const categoryToDelete = await Category.findById(categoryId);

        if (!categoryToDelete) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const categoryName = categoryToDelete.name;

        // 2. Delete the Category
        await Category.findByIdAndDelete(categoryId);

        // 3. *** THE MAGIC PART ***
        // Find all products with this category name and update them
        await Product.updateMany(
            { category: categoryName }, // Filter: Products with this category
            {
                $set: {
                    status: 'Draft',      // 1. Change status to Draft
                    category: ''          // 2. Clear the deleted category name (Optional, but recommended)
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Category deleted. Associated products moved to Drafts.`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};