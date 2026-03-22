const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// POST /api/reorder - Send reorder email to supplier
router.post('/', async (req, res) => {
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
            if (!process.env.SENDGRID_API_KEY) {
                throw new Error("SENDGRID_API_KEY is missing. Email cannot be sent.");
            }

            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: supplier.email,
                subject: emailSubject,
                text: emailBody
            };
            if (process.env.MANAGER_EMAIL) mailOptions.cc = process.env.MANAGER_EMAIL;
            
            await sgMail.send(mailOptions);

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

            let suggestion = emailErr.message.includes('SENDGRID')
                ? 'Check your SENDGRID_API_KEY in Render Environment Settings.'
                : 'SendGrid requires a Verified Sender Identity matching your EMAIL_FROM address.';

            res.status(500).json({ success: false, error: `Email failed: ${emailErr.message}`, suggestion, reorderLog });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reorder - List reorder logs
router.get('/', async (req, res) => {
    try {
        const logs = await req.models.ReorderLog.find().sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/reorder/:id/status
router.patch('/:id/status', async (req, res) => {
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

module.exports = router;
