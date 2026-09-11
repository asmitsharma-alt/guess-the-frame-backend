const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { generateTokens, verifyRefreshToken } = require('../utils/tokenHelper');

class AuthService {
  async register({ username, email, password, avatar = 'aman' }) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() }
        ]
      }
    });

    if (existing) {
      const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
      const error = new Error(`${field} already taken`);
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash,
        avatar
      }
    });

    const tokens = generateTokens(user);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt
      }
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      },
      tokens
    };
  }

  async login({ emailOrUsername, password }) {
    const query = emailOrUsername.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: query },
          { username: query }
        ]
      }
    });

    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const tokens = generateTokens(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt
      }
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        totalGames: user.totalGames,
        totalWins: user.totalWins,
        totalPoints: user.totalPoints
      },
      tokens
    };
  }

  async refresh(refreshToken) {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      const error = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      throw error;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      const error = new Error('Refresh token revoked or expired');
      error.statusCode = 401;
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      const error = new Error('User no longer exists');
      error.statusCode = 401;
      throw error;
    }

    // Delete old refresh token (rotation)
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    // Generate new tokens
    const tokens = generateTokens(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt
      }
    });

    return tokens;
  }

  async logout(refreshToken) {
    if (refreshToken) {
      try {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken }
        });
      } catch (err) {
        // Ignore token not found
      }
    }
    return true;
  }

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        totalGames: true,
        totalWins: true,
        totalPoints: true,
        createdAt: true
      }
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }
}

module.exports = new AuthService();
