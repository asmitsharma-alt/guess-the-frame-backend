const authService = require('../services/authService');
const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Alphanumeric and underscores only'),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    avatar: z.string().optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    emailOrUsername: z.string().min(1),
    password: z.string().min(1)
  })
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1)
  })
});

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const tokens = await authService.refresh(req.body.refreshToken);
      res.json({
        success: true,
        data: tokens
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(req.body.refreshToken);
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req, res, next) {
    try {
      const profile = await authService.getProfile(req.user.userId);
      res.json({
        success: true,
        data: profile
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  authController: new AuthController(),
  registerSchema,
  loginSchema,
  refreshSchema
};
