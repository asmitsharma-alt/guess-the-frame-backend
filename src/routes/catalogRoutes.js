const express = require('express');
const router = express.Router();
const { catalogController } = require('../controllers/catalogController');

router.get('/', catalogController.getAll);
router.get('/playlist', catalogController.getPlaylist);
router.get('/:category', catalogController.getByCategory);

module.exports = router;
