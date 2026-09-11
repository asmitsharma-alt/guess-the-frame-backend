const scoreService = require('../services/scoreService');
const { z } = require('zod');

const recordScoreSchema = z.object({
  body: z.object({
    roomId: z.string().optional(),
    totalRounds: z.number().optional(),
    scoreboard: z.array(z.object({
      id: z.string().optional(),
      userId: z.string().optional(),
      name: z.string(),
      score: z.number(),
      avatar: z.string().optional()
    }))
  })
});

class ScoreController {
  async recordResult(req, res, next) {
    try {
      const result = await scoreService.recordMatchResult(req.body);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getLeaderboard(req, res, next) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
      const leaderboard = await scoreService.getLeaderboard(limit);
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  scoreController: new ScoreController(),
  recordScoreSchema
};
