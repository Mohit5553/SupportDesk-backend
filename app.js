const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const defaultAllowedOrigins = [
    'http://localhost:5173',
    'https://support-desk-frontend-mu.vercel.app',
    'https://support-desk-frontend-nizicmd74-jts-projects-0424a64c.vercel.app',
];

const envAllowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;

    try {
        const { hostname } = new URL(origin);
        return hostname.endsWith('.vercel.app');
    } catch {
        return false;
    }
};

// Security & parsing middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
    origin: function (origin, callback) {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS not allowed"));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🛡️ Security: Sanitize data against NoSQL injection attacks
app.use(mongoSanitize());

// 🛡️ Security: Sanitize data against XSS attacks
app.use(xss());

const logger = require('./utils/logger');

// HTTP request logging (Winston + Morgan)
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/articles', require('./routes/articleRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Support Ticket API is running', timestamp: new Date() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
