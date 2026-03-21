const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    oldStock: {
        type: Number,
        required: true
    },
    newStock: {
        type: Number,
        required: true
    },
    adjustmentType: {
        type: String,
        enum: ['increase', 'decrease', 'set'],
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    notes: {
        type: String,
        default: ''
    },
    user: {
        type: String,
        default: 'System User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
