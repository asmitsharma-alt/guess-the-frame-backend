const express = require('express');
const router = express.Router();
const { scoreController, recordScoreSchema } = require('../controllers/scoreController');
const { validate } = require('../middleware/validationMiddleware');

router.post('/result', validate(recordScoreSchema), scoreController.recordResult);
router.get('/leaderboard', scoreController.getLeaderboard);

module.exports = router;
