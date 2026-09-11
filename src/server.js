const http = require('http');
const app = require('./app');
const socketService = require('./services/socketService');
const env = require('./config/env');
const logger = require('./utils/logger');

const server = http.createServer(app);

// Initialize real-time WebSocket server
socketService.init(server);

// Start listening
server.listen(env.port, () => {
  logger.info(`🎬 Guess The Frame API server listening on http://localhost:${env.port}`);
  logger.info(`🔌 WebSocket Realtime server ready on ws://localhost:${env.port}/ws`);
  logger.info(`⚙️  Environment: ${env.nodeEnv}`);
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down server gracefully...');
  server.close(() => {
    logger.info('HTTP & WebSocket server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Force closing server after timeout.');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
