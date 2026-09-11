import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Auth API Endpoints & Security Validation', () => {
  const randomUser = `user_${Date.now()}`;
  const randomEmail = `${randomUser}@test.local`;
  let accessToken = '';
  let refreshToken = '';

  it('rejects registration with invalid email or short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'ab', // too short (<3)
        email: 'invalid-email',
        password: '123' // too short (<6)
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
  });

  it('registers a new user successfully and returns JWT tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: randomUser,
        email: randomEmail,
        password: 'Password123!',
        avatar: 'amish'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(randomUser);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('prevents duplicate registration with same email or username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: randomUser,
        email: randomEmail,
        password: 'Password123!'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('logs in user with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrUsername: randomUser,
        password: 'Password123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        emailOrUsername: randomUser,
        password: 'WrongPassword!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('authenticates protected /me endpoint with Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(randomUser);
  });

  it('rejects /me without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
