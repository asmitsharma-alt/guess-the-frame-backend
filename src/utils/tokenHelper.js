const jwt = require('jsonwebtoken');
const env = require('../config/env');

const generateTokens = (user) => {
  const nonce = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role || 'player',
    nonce
  };

  const accessToken = jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn
  });

  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn
  });

  return { accessToken, refreshToken };
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    return null;
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.refreshSecret);
  } catch (err) {
    return null;
  }
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken
};
