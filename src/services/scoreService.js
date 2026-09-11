const prisma = require('../config/database');
const logger = require('../utils/logger');

class ScoreService {
  async recordMatchResult({ roomId, scoreboard, totalRounds }) {
    if (!scoreboard || !Array.isArray(scoreboard) || scoreboard.length === 0) {
      return null;
    }

    const sorted = [...scoreboard].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    try {
      if (prisma && prisma.matchResult) {
        // Record match in DB
        const session = await prisma.gameSession.create({
          data: {
            roomId: roomId || 'offline',
            totalRounds: totalRounds || 10,
            status: 'COMPLETED',
            playlist: '[]',
            endedAt: new Date(),
            matchResult: {
              create: {
                winnerName: winner.name || 'Anonymous',
                winnerScore: winner.score || 0,
                scoreboard: JSON.stringify(sorted)
              }
            }
          },
          include: { matchResult: true }
        });

        // Update registered users stats if mapped
        for (const player of scoreboard) {
          if (player.userId) {
            const isWinner = player.id === winner.id;
            await prisma.user.update({
              where: { id: player.userId },
              data: {
                totalGames: { increment: 1 },
                totalWins: { increment: isWinner ? 1 : 0 },
                totalPoints: { increment: player.score || 0 }
              }
            }).catch(() => {});
          }
        }

        return session.matchResult;
      }
    } catch (err) {
      logger.warn('Failed to record match result to DB:', err.message);
    }

    return {
      winnerName: winner.name,
      winnerScore: winner.score,
      scoreboard: sorted
    };
  }

  async getLeaderboard(limit = 10) {
    try {
      if (prisma && prisma.user) {
        const topUsers = await prisma.user.findMany({
          take: limit,
          orderBy: [{ totalPoints: 'desc' }, { totalWins: 'desc' }],
          select: {
            id: true,
            username: true,
            avatar: true,
            totalPoints: true,
            totalWins: true,
            totalGames: true
          }
        });
        if (topUsers.length > 0) return topUsers;
      }
    } catch (err) {
      logger.warn('Failed to fetch leaderboard from DB:', err.message);
    }

    // Default demo leaderboard
    return [
      { id: '1', username: 'Aman', avatar: 'aman', totalPoints: 1240, totalWins: 42, totalGames: 50 },
      { id: '2', username: 'Amish', avatar: 'amish', totalPoints: 1080, totalWins: 35, totalGames: 48 },
      { id: '3', username: 'Aziz', avatar: 'aziz', totalPoints: 960, totalWins: 28, totalGames: 45 },
      { id: '4', username: 'Vish', avatar: 'vish', totalPoints: 850, totalWins: 22, totalGames: 40 }
    ];
  }
}

module.exports = new ScoreService();
