const express = require('express');
const router = express.Router();

// GET /api/categories - list all with dynamic stats
router.get('/', async (req, res) => {
    try {
        const Category = req.models.Category;
        const Product = req.models.Product;
        const categories = await Category.find().sort({ name: 1 });

        const enriched = await Promise.all(categories.map(async (cat) => {
            const products = await Product.find({ category: cat.name });
            const totalProducts = products.length;
            const totalValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);
            const avgMargin = totalProducts > 0
                ? products.reduce((sum, p) => {
                    const margin = p.costPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.costPrice * 100) : 0;
                    return sum + margin;
                }, 0) / totalProducts
                : 0;

            return {
                _id: cat._id, id: cat._id, name: cat.name,
                description: cat.description, totalProducts,
                totalValue: parseFloat(totalValue.toFixed(2)),
                avgMargin: parseFloat(avgMargin.toFixed(1)),
                createdAt: cat.createdAt, updatedAt: cat.updatedAt
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/categories
router.post('/', async (req, res) => {
    try {
        const Category = req.models.Category;
        const category = new Category({ name: req.body.name, description: req.body.description || '' });
        await category.save();
        res.status(201).json({ ...category.toJSON(), totalProducts: 0, totalValue: 0, avgMargin: 0 });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'A category with this name already exists' });
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(', ') });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
    try {
        const category = await req.models.Category.findByIdAndUpdate(
            req.params.id, { name: req.body.name, description: req.body.description },
            { new: true, runValidators: true }
        );
        if (!category) return res.status(404).json({ error: 'Category not found' });
        res.json(category);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'A category with this name already exists' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
    try {
        const Category = req.models.Category;
        const Product = req.models.Product;
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const productCount = await Product.countDocuments({ category: category.name });
        if (productCount > 0) {
            return res.status(400).json({
                error: `Cannot delete category "${category.name}" - it has ${productCount} product(s). Reassign products first.`
            });
        }

        await Category.findByIdAndDelete(req.params.id);
        res.json({ message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
