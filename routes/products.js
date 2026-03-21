const express = require('express');
const router = express.Router();

// GET /api/products - list all products with optional filtering
router.get('/', async (req, res) => {
    try {
        const Product = req.models.Product;
        const { category, search, stockFilter } = req.query;
        let query = {};

        if (category) query.category = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { supplier: { $regex: search, $options: 'i' } },
                { barcode: { $regex: search, $options: 'i' } }
            ];
        }

        let products = await Product.find(query).sort({ name: 1 });

        if (stockFilter) {
            products = products.filter(p => p.stockStatus === stockFilter);
        }

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
    try {
        const product = await req.models.Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/products
router.post('/', async (req, res) => {
    try {
        const Product = req.models.Product;
        const product = new Product({ ...req.body, lastRestocked: new Date() });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: errors.join(', ') });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
    try {
        const product = await req.models.Product.findByIdAndUpdate(
            req.params.id, { ...req.body }, { new: true, runValidators: true }
        );
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: errors.join(', ') });
        }
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', async (req, res) => {
    try {
        const Product = req.models.Product;
        const StockAdjustment = req.models.StockAdjustment;
        const { adjustmentType, quantity, reason, notes } = req.body;
        const product = await Product.findById(req.params.id);

        if (!product) return res.status(404).json({ error: 'Product not found' });

        const qty = parseInt(quantity);
        const oldStock = product.currentStock;
        let newStock;

        switch (adjustmentType) {
            case 'increase':
                newStock = oldStock + qty;
                product.lastRestocked = new Date();
                break;
            case 'decrease':
                newStock = Math.max(0, oldStock - qty);
                break;
            case 'set':
                newStock = qty;
                if (qty > oldStock) product.lastRestocked = new Date();
                break;
            default:
                return res.status(400).json({ error: 'Invalid adjustment type' });
        }

        product.currentStock = newStock;
        await product.save();

        const adjustment = new StockAdjustment({
            productId: product._id,
            productName: product.name,
            oldStock, newStock, adjustmentType,
            quantity: qty,
            reason: reason || 'Manual adjustment',
            notes: notes || '',
            user: req.user?.fullName || 'System User'
        });
        await adjustment.save();

        res.json({ product, adjustment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
    try {
        const product = await req.models.Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted successfully', product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
