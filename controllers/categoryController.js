const Category = require('../models/Category');
const Product = require('../models/Product');

// 1. Get All Categories with Live Counts
exports.getAllCategories = async (req, res) => {
    try {
        // Fetch all categories first
        const categories = await Category.find();

        // Calculate counts dynamically for each category
        // We use Promise.all to handle multiple database queries efficiently
        const categoriesWithCounts = await Promise.all(categories.map(async (cat) => {
            const count = await Product.countDocuments({ category: cat.name });
            return {
                ...cat._doc, // Spread existing category data
                totalProducts: count // Add the live count
            };
        }));

        // Sort alphabetically (User friendly) or by Date
        // To sort by newest first like before:
        categoriesWithCounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({ success: true, data: categoriesWithCounts });
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


// 3. Update Category
exports.updateCategory = async (req, res) => {
    try {
        const { name, slug, description, status } = req.body;
        const categoryId = req.params.id;

        const oldCategory = await Category.findById(categoryId);
        if (!oldCategory) {
            return res.status(404).json({ success: false, error: "Category not found" });
        }

        const oldName = oldCategory.name;

        // Perform the update on Category
        const updatedCategory = await Category.findByIdAndUpdate(
            categoryId,
            { name, slug, description, status },
            { new: true, runValidators: true }
        );

        // *** SYNC LOGIC FOR ARRAYS ***
        // If name changed, find products containing the OLD name in their array
        // and replace ONLY that element with the NEW name.
        if (name && oldName !== name) {
            await Product.updateMany(
                { category: oldName }, // Find products containing "Men"
                { $set: { "category.$": name } } // Update the matched element to "Mens"
            );
        }

        res.json({ success: true, data: updatedCategory });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// 4. Delete Category (With Orphan Safety Check)
exports.deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const categoryToDelete = await Category.findById(categoryId);

        if (!categoryToDelete) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const categoryName = categoryToDelete.name;

        // 1. Delete the Category from collection
        await Category.findByIdAndDelete(categoryId);

        // 2. Remove this category from all products
        await Product.updateMany(
            { category: categoryName },
            { $pull: { category: categoryName } }
        );

        // 3. *** SAFETY CHECK *** // Find any products that now have NO categories (empty array) and set them to 'Draft'
        await Product.updateMany(
            { category: { $size: 0 } }, // MongoDB operator to find empty arrays
            { $set: { status: 'Draft' } }
        );

        res.status(200).json({
            success: true,
            message: `Category "${categoryName}" deleted. Products with no remaining categories were moved to Draft.`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};