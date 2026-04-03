const express = require('express');
const router = express.Router();
const { roleCheck } = require('../middleware/storeDb');
const nodemailer = require('nodemailer');

function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
    });
}

// POST /api/reorder - Send reorder email to supplier
router.post('/', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const Product = req.models.Product;
        const Supplier = req.models.Supplier;
        const ReorderLog = req.models.ReorderLog;
        const { productId, quantity, notes } = req.body;

        if (!productId) return res.status(400).json({ error: 'Product ID is required' });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const supplier = await Supplier.findOne({ name: product.supplier });
        if (!supplier) return res.status(404).json({ error: `Supplier "${product.supplier}" not found.` });
        if (!supplier.email) return res.status(400).json({ error: `Supplier "${supplier.name}" has no email.` });

        const reorderQty = quantity || Math.max(product.maxStock - product.currentStock, product.minimumStock * 2);

        const emailSubject = `Reorder Request - InveXa sTacK`;
        const emailBody = `
Dear ${supplier.name},

We would like to place a reorder for the following item:

Product:         ${product.name}
Quantity:        ${reorderQty} units
Current Stock:   ${product.currentStock} units
Reorder Level:   ${product.minimumStock} units
Batch Number:    ${product.batchNumber || 'N/A'}

${notes ? `Additional Notes: ${notes}\n` : ''}Please confirm availability and expected delivery time.

Regards,
${req.user?.storeName || 'InveXa sTacK'} Inventory System
        `.trim();

        const reorderLog = new ReorderLog({
            productId: product._id, productName: product.name,
            supplierId: supplier._id, supplierName: supplier.name,
            supplierEmail: supplier.email, reorderQuantity: reorderQty,
            currentStock: product.currentStock, reorderLevel: product.minimumStock,
            emailStatus: 'pending', notes: notes || ''
        });

        try {
            const transporter = createTransporter();
            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: supplier.email,
                subject: emailSubject,
                text: emailBody
            };
            if (process.env.MANAGER_EMAIL) mailOptions.cc = process.env.MANAGER_EMAIL;
            await transporter.sendMail(mailOptions);

            reorderLog.emailStatus = 'sent';
            await reorderLog.save();

            res.status(201).json({
                success: true,
                message: `Reorder email sent to ${supplier.name} (${supplier.email})`,
                reorderLog
            });
        } catch (emailErr) {
            reorderLog.emailStatus = 'failed';
            reorderLog.emailError = emailErr.message;
            await reorderLog.save();

            let suggestion = emailErr.message.includes('auth')
                ? 'Gmail requires an App Password. Generate one at https://myaccount.google.com/apppasswords'
                : 'Check internet connection and email credentials in .env';

            res.status(500).json({ success: false, error: `Email failed: ${emailErr.message}`, suggestion, reorderLog });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reorder - List reorder logs
router.get('/', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const logs = await req.models.ReorderLog.find().sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/reorder/:id/status
router.patch('/:id/status', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const log = await req.models.ReorderLog.findByIdAndUpdate(
            req.params.id, { orderStatus: req.body.orderStatus }, { new: true }
        );
        if (!log) return res.status(404).json({ error: 'Reorder log not found' });
        res.json(log);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reorder/supplier/:supplierId — Full order history for one supplier
router.get('/supplier/:supplierId', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const logs = await req.models.ReorderLog
            .find({ supplierId: req.params.supplierId })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/reorder/:id/deliver — Mark order as delivered with actual qty received
router.patch('/:id/deliver', roleCheck('manager', 'admin', 'owner'), async (req, res) => {
    try {
        const { quantityReceived, deliveryNotes } = req.body;
        const update = {
            orderStatus: 'delivered',
            finalQuantityAgreed: quantityReceived,
            notes: deliveryNotes || ''
        };
        const log = await req.models.ReorderLog.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!log) return res.status(404).json({ error: 'Reorder log not found' });
        res.json(log);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
