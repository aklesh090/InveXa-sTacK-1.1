const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'invexa-stack-secret-2026';

// Cache for database connections per store
const dbConnections = {};

/**
 * Middleware that reads storeCode from JWT and switches
 * all Mongoose models to the store-specific database.
 * Models are re-registered on the store's DB connection.
 */
function storeDb(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.storeCode || !decoded.storeDbName) {
            return res.status(401).json({ error: 'Invalid token — missing store info' });
        }

        req.user = decoded;

        // Use mongoose.connection.useDb() to switch to the store's database
        const dbName = decoded.storeDbName;
        if (!dbConnections[dbName]) {
            dbConnections[dbName] = mongoose.connection.useDb(dbName, { useCache: true });
        }
        req.storeDb = dbConnections[dbName];

        // Register models on the store-specific connection
        const modelFiles = {
            Product: require('../models/Product'),
            Category: require('../models/Category'),
            Supplier: require('../models/Supplier'),
            Sale: require('../models/Sale'),
            StockAdjustment: require('../models/StockAdjustment'),
            ReorderLog: require('../models/ReorderLog')
        };

        req.models = {};
        for (const [name, model] of Object.entries(modelFiles)) {
            try {
                req.models[name] = req.storeDb.model(name);
            } catch {
                req.models[name] = req.storeDb.model(name, model.schema);
            }
        }

        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        return res.status(500).json({ error: 'Auth middleware error: ' + err.message });
    }
}

/**
 * Simple auth middleware (no store switching) for routes
 * that only need to verify the user is logged in.
 */
function authOnly(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Role-based access control middleware.
 * Usage: roleCheck('owner', 'admin')
 */
function roleCheck(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { storeDb, authOnly, roleCheck };
