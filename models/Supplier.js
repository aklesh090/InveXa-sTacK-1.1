const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Supplier name is required'],
        trim: true
    },
    contact: {
        type: String,
        required: [true, 'Contact person is required'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true
    },
    reliability: {
        type: Number,
        min: 0,
        max: 100,
        default: 90
    },
    avgLeadTime: {
        type: Number,
        min: 1,
        default: 3
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    onTimeDelivery: {
        type: Number,
        min: 0,
        max: 100,
        default: 90
    },
    bankAccountNumber: {
        type: String,
        default: '',
        trim: true
    },
    ifscCode: {
        type: String,
        default: '',
        trim: true,
        uppercase: true
    },
    upiId: {
        type: String,
        default: '',
        trim: true
    },
    paymentNotes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Supplier', supplierSchema);
