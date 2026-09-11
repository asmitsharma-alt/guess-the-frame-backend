require('dotenv').config();

const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'gtf_default_access_secret_key_change_in_production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'gtf_default_refresh_secret_key_change_in_production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  cors: {
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8080,http://localhost:3000').split(',').map(s => s.trim())
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = env;
