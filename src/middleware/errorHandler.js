const logger = require('../utils/logger');
const env = require('../config/env');

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
};

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled API Error: %s %s - %s', req.method, req.originalUrl, err.message, { stack: err.stack });

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(env.nodeEnv === 'development' ? { stack: err.stack } : {})
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
