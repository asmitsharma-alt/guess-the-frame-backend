const express = require('express');
const router = express.Router();
const prisma = require('../config/database');

router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  try {
    if (prisma && prisma.$queryRaw) {
      await prisma.$queryRaw`SELECT 1`;
    }
  } catch (err) {
    dbStatus = 'degraded';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatus,
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
