const helmet = require('helmet');
const cors = require('cors');
const env = require('../config/env');

// Input sanitizer to prevent XSS payloads in JSON strings
const sanitizeInputs = (req, res, next) => {
  const sanitize = (val) => {
    if (typeof val === 'string') {
      return val
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/[<>]/g, (tag) => ({ '<': '&lt;', '>': '&gt;' }[tag] || tag));
    }
    if (typeof val === 'object' && val !== null) {
      for (const key of Object.keys(val)) {
        val[key] = sanitize(val[key]);
      }
    }
    return val;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
};

const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Disabled for flexible API responses, or configured for production
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, tests)
    if (!origin) return callback(null, true);
    if (env.cors.origins.includes(origin) || env.cors.origins.includes('*') || !env.isProduction) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

module.exports = {
  helmetMiddleware,
  corsMiddleware: cors(corsOptions),
  sanitizeInputs
};
