const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const catalogRoutes = require('./catalogRoutes');
const scoreRoutes = require('./scoreRoutes');
const healthRoutes = require('./healthRoutes');

router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/catalog', catalogRoutes);
router.use('/scores', scoreRoutes);
router.use('/health', healthRoutes);

module.exports = router;
