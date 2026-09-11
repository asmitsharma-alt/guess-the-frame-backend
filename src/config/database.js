const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

let prisma;

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });
} catch (err) {
  logger.error('Failed to initialize Prisma Client:', err);
}

module.exports = prisma;
