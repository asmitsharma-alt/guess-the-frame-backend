import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import app from '../src/app.js';
import socketService from '../src/services/socketService.js';
import roomService from '../src/services/roomService.js';

describe('Realtime WebSocket Server Tests', () => {
  let server;
  let serverPort;

  beforeAll(async () => {
    server = http.createServer(app);
    socketService.init(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const connectClient = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws`);
      const buffer = [];
      const listeners = new Map();

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (listeners.has(msg.type)) {
            const cb = listeners.get(msg.type);
            listeners.delete(msg.type);
            cb(msg);
          } else {
            buffer.push(msg);
          }
        } catch (e) {}
      });

      ws.waitForEvent = (expectedType, timeout = 4000) => {
        return new Promise((res, rej) => {
          // Check if already in buffer
          const foundIndex = buffer.findIndex(m => m.type === expectedType);
          if (foundIndex !== -1) {
            const [msg] = buffer.splice(foundIndex, 1);
            return res(msg);
          }

          const timer = setTimeout(() => {
            listeners.delete(expectedType);
            rej(new Error(`Timed out waiting for event: ${expectedType}`));
          }, timeout);

          listeners.set(expectedType, (msg) => {
            clearTimeout(timer);
            res(msg);
          });
        });
      };

      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  it('connects to WebSocket and receives CONNECTION_ACK', async () => {
    const ws = await connectClient();
    const ack = await ws.waitForEvent('CONNECTION_ACK');
    expect(ack.type).toBe('CONNECTION_ACK');
    ws.close();
  });

  it('creates room and allows guest player to join', async () => {
    const hostWs = await connectClient();
    await hostWs.waitForEvent('CONNECTION_ACK');

    // Host creates room
    hostWs.send(JSON.stringify({
      type: 'CREATE_ROOM',
      playerName: 'HostAlice',
      playerAvatar: 'aman'
    }));

    const roomCreated = await hostWs.waitForEvent('ROOM_CREATED');
    expect(roomCreated.roomCode).toHaveLength(4);
    expect(roomCreated.players).toHaveLength(1);

    const roomCode = roomCreated.roomCode;

    // Guest connects & joins
    const guestWs = await connectClient();
    await guestWs.waitForEvent('CONNECTION_ACK');

    guestWs.send(JSON.stringify({
      type: 'PLAYER_JOIN',
      roomCode,
      name: 'GuestBob',
      avatar: 'aziz'
    }));

    const joinAck = await guestWs.waitForEvent('JOIN_ACK');
    expect(joinAck.roomCode).toBe(roomCode);
    expect(joinAck.players.length).toBe(2);

    hostWs.close();
    guestWs.close();
  });

  it('validates guess and awards points with duplicate suppression', async () => {
    const ws = await connectClient();
    await ws.waitForEvent('CONNECTION_ACK');

    // Create a room manually in service to test guess logic
    const room = await roomService.createRoom({
      settings: { rounds: 1, timer: 30 }
    });
    room.isMatchActive = true;
    room.playlist = [
      { id: 'f1', type: 'image', content: 'GUESSTHEFRAME/Rush (2023).webp', answer: 'RUSH', year: '2023' }
    ];
    room.currentPlayIndex = 0;
    room.roundWinners = [];

    // Join room
    ws.send(JSON.stringify({
      type: 'PLAYER_JOIN',
      roomCode: room.code,
      name: 'SpeedyGuesser',
      avatar: 'vish'
    }));
    await ws.waitForEvent('JOIN_ACK');

    // Submit correct guess
    ws.send(JSON.stringify({
      type: 'SUBMIT_GUESS',
      roomCode: room.code,
      guess: 'Rush'
    }));

    const result1 = await ws.waitForEvent('GUESS_RESULT');
    expect(result1.isCorrect).toBe(true);
    expect(result1.points).toBe(10);
    expect(result1.score).toBe(10);

    // Submit guess again -> duplicate suppression
    ws.send(JSON.stringify({
      type: 'SUBMIT_GUESS',
      roomCode: room.code,
      guess: 'Rush'
    }));

    const result2 = await ws.waitForEvent('GUESS_RESULT');
    expect(result2.alreadyScored).toBe(true);
    expect(result2.score).toBe(10); // score unchanged

    ws.close();
  });

  it('processes hint request and deducts 2 points penalty', async () => {
    const ws = await connectClient();
    await ws.waitForEvent('CONNECTION_ACK');

    const room = await roomService.createRoom({});
    room.isMatchActive = true;
    room.playlist = [
      { id: 'f2', type: 'image', content: 'GUESSTHEFRAME/Memento (2000).webp', answer: 'MEMENTO', year: '2000' }
    ];
    room.currentPlayIndex = 0;

    ws.send(JSON.stringify({
      type: 'PLAYER_JOIN',
      roomCode: room.code,
      name: 'HintSeeker',
      avatar: 'amish'
    }));
    await ws.waitForEvent('JOIN_ACK');

    // Give player initial score 10
    const client = Array.from(socketService.connections.values()).find(c => c.roomCode === room.code);
    room.players.get(client.playerId).score = 10;

    // Request hint
    ws.send(JSON.stringify({
      type: 'REQUEST_HINT',
      roomCode: room.code
    }));

    const hintRes = await ws.waitForEvent('HINT_RESPONSE');
    expect(hintRes.score).toBe(8); // 10 - 2 = 8
    expect(hintRes.hintText).toBeTruthy();

    ws.close();
  });
});
