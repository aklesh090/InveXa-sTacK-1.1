const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
    storeName: {
        type: String,
        required: [true, 'Store name is required'],
        trim: true
    },
    storeCode: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    ownerEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    dbName: {
        type: String,
        required: true,
        unique: true
    },
    plan: {
        type: String,
        enum: ['free', 'pro', 'enterprise'],
        default: 'free'
    },
    inviteCode: {
        type: String,
        unique: true
    },
    staffInviteCode: {
        type: String,
        unique: true
    },
    managerInviteCode: {
        type: String,
        unique: true
    },
    adminInviteCode: {
        type: String,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Generate a unique store code from store name
storeSchema.statics.generateStoreCode = function (storeName) {
    const slug = storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 20);
    const suffix = Math.random().toString(36).substring(2, 6);
    return `${slug}-${suffix}`;
};

// Generate a 6-char invite code
storeSchema.statics.generateInviteCode = function () {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

module.exports = mongoose.model('Store', storeSchema);
