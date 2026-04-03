require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { storeDb } = require('./middleware/storeDb');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/grocery_inventory';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// ─── Serve frontend static files ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Routes (shared database — no store middleware) ───────────────────────
app.use('/api/auth', require('./routes/auth'));

// ─── Store-scoped API Routes (storeDb middleware applied) ──────────────────────
app.use('/api/products', storeDb, require('./routes/products'));
app.use('/api/categories', storeDb, require('./routes/categories'));
app.use('/api/suppliers', storeDb, require('./routes/suppliers'));
app.use('/api/sales', storeDb, require('./routes/sales'));
app.use('/api/dashboard', storeDb, require('./routes/dashboard'));
app.use('/api/stock-adjustments', storeDb, require('./routes/stockAdjustments'));
app.use('/api/reorder', storeDb, require('./routes/reorder'));

// ─── Voice Call Routes ─────────────────────────────────────────────────────
// Webhook is mounted FIRST (before storeDb) so Bland AI can call it without a JWT
// POST /api/voice-call/webhook  → public Bland AI result callback
// POST /api/voice-call          → trigger AI call + email (requires auth)
const voiceCallRouter = require('./routes/voicecall');
app.post('/api/voice-call/webhook', voiceCallRouter.handleWebhook);
app.use('/api/voice-call', storeDb, voiceCallRouter);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
        });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', error: err.message });
    }
});

// ─── Login page route ──────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
    res.redirect('/');
});

// ─── Catch-all: serve HTML pages or 404 for API routes ────────────────────────
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    const requestedFile = path.join(__dirname, 'public', req.path);
    res.sendFile(requestedFile, (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log(`Connected to MongoDB`);
        app.listen(PORT, () => {
            console.log(`\nInveXa sTacK Backend running on port ${PORT}`);
            console.log(`Dashboard:    http://localhost:${PORT}`);
            console.log(`API Health:   http://localhost:${PORT}/api/health`);
            console.log(`\nMulti-store mode enabled. Each store uses its own database.`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        console.error('\nMake sure MongoDB is running or update MONGODB_URI in .env\n');
        process.exit(1);
    });

module.exports = app;
