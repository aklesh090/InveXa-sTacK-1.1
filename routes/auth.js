const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Store = require('../models/Store');

const JWT_SECRET = process.env.JWT_SECRET || 'invexa-stack-secret-2026';

// ─── Email Transporter ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendOTPEmail(email, otp, storeName) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: `InveXa sTacK — Your Verification Code: ${otp}`,
        html: `
            <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:480px;margin:auto;background:#0a0a0f;color:#f0ece4;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                <div style="background:linear-gradient(135deg,#c9956b,#e0b088);padding:24px 32px;text-align:center;">
                    <h1 style="margin:0;color:#0a0a0f;font-size:1.5rem;">InveXa sTacK</h1>
                    <p style="margin:4px 0 0;color:rgba(0,0,0,0.6);font-size:0.85rem;">Grocery Inventory Management</p>
                </div>
                <div style="padding:32px;">
                    <h2 style="margin:0 0 8px;font-size:1.2rem;">Email Verification</h2>
                    <p style="color:rgba(240,236,228,0.6);font-size:0.9rem;margin:0 0 24px;">
                        ${storeName ? `Welcome to <strong>${storeName}</strong>! ` : ''}Use the code below to verify your email:
                    </p>
                    <div style="background:rgba(255,255,255,0.06);border:2px solid #c9956b;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
                        <span style="font-size:2.2rem;font-weight:800;letter-spacing:8px;color:#e0b088;">${otp}</span>
                    </div>
                    <p style="color:rgba(240,236,228,0.4);font-size:0.8rem;margin:0;text-align:center;">
                        This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
                    </p>
                </div>
                <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
                    <p style="margin:0;font-size:0.72rem;color:rgba(240,236,228,0.3);">&copy; 2026 InveXa sTacK. All rights reserved.</p>
                </div>
            </div>
        `
    };
    await transporter.sendMail(mailOptions);
}

// ─── POST /api/auth/register ── Create store + owner ────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, storeName } = req.body;

        if (!email || !password || !fullName || !storeName) {
            return res.status(400).json({ error: 'Email, password, full name, and store name are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already registered
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        // Create store
        const storeCode = Store.generateStoreCode(storeName);
        const inviteCode = Store.generateInviteCode();
        const store = new Store({
            storeName,
            storeCode,
            ownerEmail: email.toLowerCase(),
            dbName: `store_${storeCode.replace(/-/g, '_')}`,
            inviteCode
        });
        await store.save();

        // Create owner user
        const user = new User({
            email: email.toLowerCase(),
            password,
            fullName,
            role: 'owner',
            storeCode
        });
        const otp = user.generateOTP();
        await user.save();

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, storeName);
        } catch (emailErr) {
            console.error('Email send error:', emailErr.message);
            // Don't block registration if email fails — user can resend
        }

        res.status(201).json({
            success: true,
            message: 'Store created! Check your email for the verification code.',
            email: user.email,
            storeCode,
            storeName,
            inviteCode,
            requiresVerification: true
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/verify-otp ─────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        if (!user.verifyOTP(otp)) {
            return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Mark as verified
        user.isEmailVerified = true;
        user.emailOTP = null;
        user.otpExpiry = null;
        user.lastLogin = new Date();
        await user.save();

        // Get store info
        const store = await Store.findOne({ storeCode: user.storeCode });

        // Generate JWT
        const token = jwt.sign({
            userId: user._id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            storeCode: user.storeCode,
            storeName: store?.storeName || 'My Store',
            storeDbName: store?.dbName || `store_${user.storeCode}`
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: 'Email verified successfully!',
            token,
            user: {
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                storeCode: user.storeCode,
                storeName: store?.storeName
            },
            inviteCode: store?.inviteCode
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/resend-otp ─────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.isEmailVerified) return res.status(400).json({ error: 'Email is already verified' });

        const otp = user.generateOTP();
        await user.save();

        const store = await Store.findOne({ storeCode: user.storeCode });
        await sendOTPEmail(email, otp, store?.storeName);

        res.json({ success: true, message: 'New verification code sent to your email.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.isEmailVerified) {
            // Resend OTP automatically
            const otp = user.generateOTP();
            await user.save();
            const store = await Store.findOne({ storeCode: user.storeCode });
            try { await sendOTPEmail(email, otp, store?.storeName); } catch(e) {}
            return res.status(403).json({
                error: 'Email not verified. A new verification code has been sent to your email.',
                requiresVerification: true,
                email: user.email
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Get store info
        const store = await Store.findOne({ storeCode: user.storeCode });
        if (!store) {
            return res.status(404).json({ error: 'Store not found. Please contact support.' });
        }

        // Generate JWT
        const token = jwt.sign({
            userId: user._id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            storeCode: user.storeCode,
            storeName: store.storeName,
            storeDbName: store.dbName
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                storeCode: user.storeCode,
                storeName: store.storeName
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/invite ── Invite a user to the store ───────────────────────
router.post('/invite', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Authentication required' });

        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['owner', 'admin'].includes(decoded.role)) {
            return res.status(403).json({ error: 'Only owners and admins can invite users' });
        }

        const { email, role, fullName } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Check if user already exists
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }

        const store = await Store.findOne({ storeCode: decoded.storeCode });
        if (!store) return res.status(404).json({ error: 'Store not found' });

        // Send invite email
        const inviteMailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: email,
            subject: `You're invited to join ${store.storeName} on InveXa sTacK`,
            html: `
                <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:480px;margin:auto;background:#0a0a0f;color:#f0ece4;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                    <div style="background:linear-gradient(135deg,#1a6b3a,#2ecc71);padding:24px 32px;text-align:center;">
                        <h1 style="margin:0;color:#fff;font-size:1.5rem;">You're Invited!</h1>
                    </div>
                    <div style="padding:32px;">
                        <p style="color:#f0ece4;font-size:1rem;margin:0 0 16px;">
                            <strong>${decoded.fullName}</strong> has invited you to join <strong>${store.storeName}</strong> as a <strong>${role || 'staff'}</strong> member.
                        </p>
                        <p style="color:rgba(240,236,228,0.6);font-size:0.9rem;margin:0 0 24px;">
                            Use this invite code to join the store:
                        </p>
                        <div style="background:rgba(255,255,255,0.06);border:2px solid #2ecc71;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
                            <span style="font-size:1.8rem;font-weight:800;letter-spacing:6px;color:#2ecc71;">${store.inviteCode}</span>
                        </div>
                        <p style="color:rgba(240,236,228,0.4);font-size:0.8rem;margin:0;text-align:center;">
                            Go to the InveXa sTacK login page and click "Join a Store" to get started.
                        </p>
                    </div>
                </div>
            `
        };
        await transporter.sendMail(inviteMailOptions);

        res.json({ success: true, message: `Invite sent to ${email}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/auth/join ── Join an existing store ─────────────────────────────
router.post('/join', async (req, res) => {
    try {
        const { email, password, fullName, inviteCode } = req.body;

        if (!email || !password || !fullName || !inviteCode) {
            return res.status(400).json({ error: 'Email, password, full name, and invite code are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Find store by invite code
        const store = await Store.findOne({ inviteCode: inviteCode.toUpperCase(), isActive: true });
        if (!store) {
            return res.status(404).json({ error: 'Invalid invite code. Please check with your store owner.' });
        }

        // Check if email already registered
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        // Create staff user
        const user = new User({
            email: email.toLowerCase(),
            password,
            fullName,
            role: 'staff',
            storeCode: store.storeCode
        });
        const otp = user.generateOTP();
        await user.save();

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, store.storeName);
        } catch(e) {
            console.error('Email send error:', e.message);
        }

        res.status(201).json({
            success: true,
            message: `Joined ${store.storeName}! Check your email for the verification code.`,
            email: user.email,
            storeName: store.storeName,
            requiresVerification: true
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/auth/verify ── Verify JWT token ──────────────────────────────────
router.get('/verify', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user: decoded });
    } catch {
        res.status(401).json({ valid: false });
    }
});

// ─── GET /api/auth/store-info ── Get store info for logged-in user ──────────────
router.get('/store-info', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Auth required' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const store = await Store.findOne({ storeCode: decoded.storeCode });
        if (!store) return res.status(404).json({ error: 'Store not found' });

        const userCount = await User.countDocuments({ storeCode: store.storeCode });

        res.json({
            storeName: store.storeName,
            storeCode: store.storeCode,
            inviteCode: store.inviteCode,
            plan: store.plan,
            userCount,
            createdAt: store.createdAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/auth/store-users ── List users in the store ───────────────────────
router.get('/store-users', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Auth required' });

        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['owner', 'admin'].includes(decoded.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const users = await User.find({ storeCode: decoded.storeCode })
            .select('email fullName role isEmailVerified lastLogin createdAt')
            .sort({ createdAt: 1 });

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
