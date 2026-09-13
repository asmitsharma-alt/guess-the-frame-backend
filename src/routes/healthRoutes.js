const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const socketService = require('../services/socketService');

router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  let dbLatencyMs = 0;
  const startDb = Date.now();

  try {
    if (prisma && prisma.$queryRaw) {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startDb;
    }
  } catch (err) {
    dbStatus = 'degraded';
    dbLatencyMs = Date.now() - startDb;
  }

  const socketStats = socketService.getStats ? socketService.getStats() : { activeConnections: 0, activeRooms: 0 };
  const isHealthy = dbStatus === 'ok';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs
    },
    realtime: socketStats,
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
