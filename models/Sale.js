const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    subtotal: {
        type: Number,
        required: true
    }
}, { _id: false });

const saleSchema = new mongoose.Schema({
    saleDate: {
        type: Date,
        default: Date.now
    },
    items: [saleItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    transactions: {
        type: Number,
        default: 1
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Sale', saleSchema);
