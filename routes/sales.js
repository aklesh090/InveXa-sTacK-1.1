const express = require('express');
const router = express.Router();

// GET /api/sales - list sales
router.get('/', async (req, res) => {
    try {
        const Sale = req.models.Sale;
        const { startDate, endDate, days } = req.query;
        let query = {};

        if (days) {
            const since = new Date();
            since.setDate(since.getDate() - parseInt(days));
            query.saleDate = { $gte: since };
        } else if (startDate || endDate) {
            query.saleDate = {};
            if (startDate) query.saleDate.$gte = new Date(startDate);
            if (endDate) query.saleDate.$lte = new Date(endDate);
        }

        const sales = await Sale.find(query).sort({ saleDate: -1 });
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sales/summary - daily summary for charts
router.get('/summary', async (req, res) => {
    try {
        const Sale = req.models.Sale;
        const { days = 7 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const sales = await Sale.find({ saleDate: { $gte: since } }).sort({ saleDate: 1 });

        const summaryMap = {};
        sales.forEach(sale => {
            const dateStr = new Date(sale.saleDate).toISOString().split('T')[0];
            if (!summaryMap[dateStr]) {
                summaryMap[dateStr] = { date: dateStr, totalSales: 0, transactions: 0, topProduct: '' };
            }
            summaryMap[dateStr].totalSales += sale.totalAmount;
            summaryMap[dateStr].transactions += 1;
            if (sale.items.length > 0) {
                summaryMap[dateStr].topProduct = sale.items[0].productName;
            }
        });

        res.json(Object.values(summaryMap).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sales - record a sale
router.post('/', async (req, res) => {
    try {
        const Product = req.models.Product;
        const Sale = req.models.Sale;
        const { items, notes } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'At least one sale item is required' });
        }

        const resolvedItems = [];
        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) return res.status(400).json({ error: `Product not found: ${item.productId}` });
            if (product.currentStock < item.quantity) {
                return res.status(400).json({
                    error: `Insufficient stock for "${product.name}". Available: ${product.currentStock}, Requested: ${item.quantity}`
                });
            }
            resolvedItems.push({ product, quantity: parseInt(item.quantity), price: parseFloat(item.price) });
        }

        let totalAmount = 0;
        const saleItems = [];

        for (const { product, quantity, price } of resolvedItems) {
            product.currentStock -= quantity;
            product.salesVelocity = Math.max(1, Math.round(product.salesVelocity * 0.9 + quantity * 0.1));
            await product.save();

            const subtotal = quantity * price;
            totalAmount += subtotal;
            saleItems.push({ productId: product._id, productName: product.name, quantity, price, subtotal });
        }

        const sale = new Sale({
            saleDate: new Date(),
            items: saleItems,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            notes: notes || ''
        });

        await sale.save();
        res.status(201).json(sale);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
