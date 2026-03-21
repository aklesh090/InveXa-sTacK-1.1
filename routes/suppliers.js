const express = require('express');
const router = express.Router();

// GET /api/suppliers
router.get('/', async (req, res) => {
    try {
        const suppliers = await req.models.Supplier.find().sort({ name: 1 });
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
    try {
        const supplier = await req.models.Supplier.findById(req.params.id);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json(supplier);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
    try {
        const Supplier = req.models.Supplier;
        const supplierData = {
            ...req.body,
            totalOrders: req.body.totalOrders || 0,
            onTimeDelivery: req.body.onTimeDelivery || req.body.reliability || 90
        };
        const supplier = new Supplier(supplierData);
        await supplier.save();
        res.status(201).json(supplier);
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(', ') });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
    try {
        const supplier = await req.models.Supplier.findByIdAndUpdate(
            req.params.id, { ...req.body }, { new: true, runValidators: true }
        );
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json(supplier);
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(', ') });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
    try {
        const supplier = await req.models.Supplier.findByIdAndDelete(req.params.id);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json({ message: 'Supplier deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
