const http = require('http');
const app = require('./app');
const socketService = require('./services/socketService');
const env = require('./config/env');
const logger = require('./utils/logger');

const prisma = require('./config/database');

const server = http.createServer(app);

// Initialize real-time WebSocket server
socketService.init(server);

// Start listening
server.listen(env.port, () => {
  logger.info(`🎬 Guess The Frame API server listening on http://localhost:${env.port}`);
  logger.info(`🔌 WebSocket Realtime server ready on ws://localhost:${env.port}/ws`);
  logger.info(`⚙️  Environment: ${env.nodeEnv}`);
});

// Robust Graceful Shutdown
let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Force closing server after 5000ms timeout.');
    process.exit(1);
  }, 5000);

  try {
    // 1. Close WebSocket connections
    socketService.closeAll('Server shutting down');

    // 2. Stop accepting new HTTP requests
    await new Promise((resolve) => server.close(resolve));
    logger.info('HTTP & WebSocket server connections closed.');

    // 3. Disconnect database client
    if (prisma && prisma.$disconnect) {
      await prisma.$disconnect();
      logger.info('Database connection pool disconnected.');
    }

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown: %s', err.message);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at: %o, reason: %s', promise, reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception: %s', err.stack || err.message);
  shutdown('UNCAUGHT_EXCEPTION');
});

module.exports = server;
