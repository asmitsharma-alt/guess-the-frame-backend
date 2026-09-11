const express = require('express');
const compression = require('compression');
const { helmetMiddleware, corsMiddleware, sanitizeInputs } = require('./middleware/securityMiddleware');
const { apiLimiter } = require('./middleware/rateLimiter');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

// Security and compression
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());

// Body parsing with size boundaries (prevents memory exhaustion)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging & sanitization
app.use(requestLogger);
app.use(sanitizeInputs);

// General rate limiter
app.use('/api', apiLimiter);

// Mount API routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Guess The Frame API',
    version: '1.0.0',
    description: 'Cinema Frame Guessing Party Game backend API',
    documentation: '/api/health'
  });
});

// 404 & Centralized error handler
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
