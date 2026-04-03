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
        enum: ['sent', 'failed', 'pending', 'not_requested'],
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
    },
    // ─── AI Voice Call Fields ────────────────────────────────────────────────
    callStatus: {
        type: String,
        enum: ['not_initiated', 'queued', 'in_progress', 'completed', 'failed'],
        default: 'not_initiated'
    },
    callId: {
        type: String,
        default: ''
    },
    fulfillmentStatus: {
        type: String,
        enum: ['pending', 'fully_accepted', 'partially_accepted', 'denied', 'unknown'],
        default: 'pending'
    },
    finalQuantityAgreed: {
        type: Number,
        default: null
    },
    callTranscript: {
        type: String,
        default: ''
    },
    supplierPhone: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReorderLog', reorderLogSchema);
