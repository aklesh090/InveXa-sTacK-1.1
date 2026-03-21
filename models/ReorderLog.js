const mongoose = require('mongoose');

const reorderLogSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier'
    },
    supplierName: {
        type: String,
        required: true
    },
    supplierEmail: {
        type: String,
        required: true
    },
    reorderQuantity: {
        type: Number,
        required: true,
        min: 1
    },
    currentStock: {
        type: Number,
        default: 0
    },
    reorderLevel: {
        type: Number,
        default: 0
    },
    emailStatus: {
        type: String,
        enum: ['sent', 'failed', 'pending'],
        default: 'pending'
    },
    emailError: {
        type: String,
        default: ''
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReorderLog', reorderLogSchema);
