import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import roomService from '../src/services/roomService.js';

describe('Room Service & API Endpoints', () => {
  it('generates a 4-letter uppercase code without ambiguous characters', () => {
    const code = roomService.generateRoomCode();
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
  });

  it('creates an active room with default settings', async () => {
    const room = await roomService.createRoom({
      settings: { timer: 25, rounds: 15 }
    });

    expect(room.code).toHaveLength(4);
    expect(room.settings.timer).toBe(25);
    expect(room.settings.rounds).toBe(15);
    expect(roomService.hasRoom(room.code)).toBe(true);
  });

  it('POST /api/rooms creates a room via HTTP endpoint', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ settings: { timer: 30, rounds: 10 } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toHaveLength(4);
    expect(res.body.data.settings.timer).toBe(30);
  });

  it('GET /api/rooms/:code fetches room status', async () => {
    const postRes = await request(app)
      .post('/api/rooms')
      .send({ settings: { timer: 20, rounds: 8 } });
    const code = postRes.body.data.code;

    const res = await request(app).get(`/api/rooms/${code}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(code);
  });

  it('GET /api/rooms/:code returns 404 for nonexistent room', async () => {
    const res = await request(app).get('/api/rooms/ZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
