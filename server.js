/**
 * ==========================================================================
 * Ledgerly — Node.js & Express API Backend Foundation
 * ==========================================================================
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();
const { validateEnvironment } = require('./server/config/env');
const { nodeEnv, port: PORT } = validateEnvironment();

// Route Handlers
const authRoutes = require('./server/routes/authRoutes');
const accountRoutes = require('./server/routes/accountRoutes');
const transactionRoutes = require('./server/routes/transactionRoutes');
const settingsRoutes = require('./server/routes/settingsRoutes');
const categoryRoutes = require('./server/routes/categoryRoutes');
const analyticsRoutes = require('./server/routes/analyticsRoutes');
const { requireAuth } = require('./server/middleware/auth');

// DB connection tester (optional check during bootstrap)
const { testConnection } = require('./server/config/db');

const app = express();
const staticRoot = path.join(__dirname);
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    styleSrcAttr: ["'unsafe-inline'"],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"]
};
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: nodeEnv === 'test' ? 1000 : 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts. Try again later.' }
});

// --- Middlewares ---
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: cspDirectives } }));
app.use(cors({
    origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
}));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 }));

// Expose only the frontend entrypoint and assets; never mount the project root.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(staticRoot, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(staticRoot, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(staticRoot, 'script.js')));

// --- API Health Check ---
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        app: 'Ledgerly Personal Finance API',
        version: '1.0.0',
        environment: nodeEnv,
        timestamp: new Date().toISOString()
    });
});

// --- Mount API Routes ---
app.use('/api/auth', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/accounts', requireAuth, accountRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/categories', requireAuth, categoryRoutes);

// --- Fallback for SPA / Direct Route ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API route not found' });
    }
    return res.status(404).type('text/plain').send('Not found');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    if (nodeEnv === 'development') console.error('Server error:', err.stack || err.message);
    const status = err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError && err.status === 400 ? 400 : 500;
    res.status(status).json({
        success: false,
        error: status === 413 ? 'Request body is too large.' : status === 400 ? 'Invalid JSON request body.' : 'Internal server error.'
    });
});

// --- Start Server ---
if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`Ledgerly server running on port ${PORT} (${nodeEnv}).`);
        const connected = await testConnection();
        if (!connected && nodeEnv === 'production') {
            console.error('Database connection is required in production; stopping server.');
            process.exit(1);
        }
    });
}

module.exports = app;
