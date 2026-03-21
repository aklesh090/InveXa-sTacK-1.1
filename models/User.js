const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: true,
        minlength: [6, 'Password must be at least 6 characters']
    },
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    role: {
        type: String,
        enum: ['owner', 'admin', 'manager', 'staff'],
        default: 'staff'
    },
    storeCode: {
        type: String,
        required: [true, 'Store code is required'],
        lowercase: true,
        trim: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailOTP: {
        type: String,
        default: null
    },
    otpExpiry: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Generate 6-digit OTP
userSchema.methods.generateOTP = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.emailOTP = otp;
    this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    return otp;
};

// Verify OTP
userSchema.methods.verifyOTP = function (otp) {
    if (!this.emailOTP || !this.otpExpiry) return false;
    if (new Date() > this.otpExpiry) return false;
    return this.emailOTP === otp;
};

module.exports = mongoose.model('User', userSchema);
