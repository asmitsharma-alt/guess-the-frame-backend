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
    if (Array.isArray(val)) {
      return val.map(sanitize);
    }
    if (typeof val === 'object' && val !== null && !(val instanceof Date) && !(val instanceof RegExp)) {
      const sanitized = {};
      for (const key of Object.keys(val)) {
        sanitized[key] = sanitize(val[key]);
      }
      return sanitized;
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
    
    // Check configured origins or wildcard
    if (env.cors.origins.includes(origin) || env.cors.origins.includes('*') || !env.isProduction) {
      return callback(null, true);
    }

    // Support Vercel deployments and custom production domains
    try {
      const parsedUrl = new URL(origin);
      if (
        parsedUrl.hostname.endsWith('.vercel.app') ||
        parsedUrl.hostname.endsWith('scoopcast-live.in') ||
        parsedUrl.hostname.endsWith('asmit.tech')
      ) {
        return callback(null, true);
      }
    } catch (e) {}

    // Clean CORS denial without throwing 500 error
    return callback(null, false);
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
