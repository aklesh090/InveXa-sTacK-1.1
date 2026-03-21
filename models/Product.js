const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true
    },
    currentStock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minimumStock: {
        type: Number,
        required: true,
        min: 0,
        default: 10
    },
    maxStock: {
        type: Number,
        required: true,
        min: 0,
        default: 100
    },
    costPrice: {
        type: Number,
        required: true,
        min: 0
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: 0
    },
    supplier: {
        type: String,
        required: true,
        trim: true
    },
    expiryDate: {
        type: Date,
        required: true
    },
    batchNumber: {
        type: String,
        required: true,
        trim: true
    },
    lastRestocked: {
        type: Date,
        default: Date.now
    },
    salesVelocity: {
        type: Number,
        default: 5,
        min: 0
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    barcode: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function () {
    if (this.currentStock <= 0) return 'out';
    if (this.currentStock <= this.minimumStock) return 'low';
    if (this.currentStock <= this.minimumStock * 2) return 'medium';
    return 'high';
});

// Virtual for days until expiry
productSchema.virtual('daysUntilExpiry').get(function () {
    const today = new Date();
    const expiry = new Date(this.expiryDate);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function () {
    if (this.costPrice === 0) return 0;
    return ((this.sellingPrice - this.costPrice) / this.costPrice * 100).toFixed(2);
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
