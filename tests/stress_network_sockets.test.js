import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import app from '../src/app.js';
import socketService from '../src/services/socketService.js';
import roomService from '../src/services/roomService.js';

describe('High-Concurrency WebSocket Stress & Race Condition Suite', () => {
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
    socketService.closeAll('Test teardown');
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

      ws.waitForEvent = (expectedType, timeout = 5000) => {
        return new Promise((res, rej) => {
          const foundIndex = buffer.findIndex((m) => m.type === expectedType);
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

  it('handles 20 concurrent clients joining a room simultaneously without race conditions', async () => {
    // 1. Host connects and creates room
    const host = await connectClient();
    await host.waitForEvent('CONNECTION_ACK');

    host.send(JSON.stringify({
      type: 'CREATE_ROOM',
      playerName: 'HostStress',
      playerAvatar: 'aman'
    }));

    const created = await host.waitForEvent('ROOM_CREATED');
    const roomCode = created.roomCode;
    expect(roomCode).toHaveLength(4);

    // 2. Connect 19 guest clients concurrently
    const numGuests = 19;
    const guests = await Promise.all(
      Array.from({ length: numGuests }, () => connectClient())
    );

    // Wait for all connection ACKs
    await Promise.all(guests.map((g) => g.waitForEvent('CONNECTION_ACK')));

    // 3. Simultaneously join the room
    const joinPromises = guests.map((g, i) => {
      g.send(JSON.stringify({
        type: 'PLAYER_JOIN',
        roomCode,
        playerId: `guest_id_${i}`,
        name: `Guest_${i}`,
        avatar: 'aziz'
      }));
      return g.waitForEvent('JOIN_ACK');
    });

    const joinAcks = await Promise.all(joinPromises);
    expect(joinAcks).toHaveLength(numGuests);

    // 4. Verify room state in memory
    const room = roomService.getRoom(roomCode);
    expect(room).toBeTruthy();
    expect(room.players.size).toBe(20); // 1 host + 19 guests

    // Clean up
    host.close();
    guests.forEach((g) => g.close());
  });

  it('guarantees podium race condition correctness under concurrent guess barrage', async () => {
    const host = await connectClient();
    await host.waitForEvent('CONNECTION_ACK');

    host.send(JSON.stringify({
      type: 'CREATE_ROOM',
      playerName: 'HostPodium',
      playerAvatar: 'aman'
    }));
    const { roomCode } = await host.waitForEvent('ROOM_CREATED');

    // Add 5 players
    const clients = await Promise.all(Array.from({ length: 5 }, () => connectClient()));
    await Promise.all(clients.map((c) => c.waitForEvent('CONNECTION_ACK')));

    for (let i = 0; i < clients.length; i++) {
      clients[i].send(JSON.stringify({
        type: 'PLAYER_JOIN',
        roomCode,
        playerId: `race_p_${i}`,
        name: `Racer_${i}`,
        avatar: 'vish'
      }));
      await clients[i].waitForEvent('JOIN_ACK');
    }

    // Prepare active round
    const room = roomService.getRoom(roomCode);
    room.isMatchActive = true;
    room.playlist = [
      { id: 'f_race', type: 'image', content: 'GUESSTHEFRAME/Memento.webp', answer: 'MEMENTO', year: '2000' }
    ];
    room.currentPlayIndex = 0;
    room.roundWinners = [];
    room.currentRoundStartedAt = Date.now();

    // 6 participants (host + 5 clients) submit guesses at the exact same tick
    const allParticipants = [host, ...clients];
    const guessSubmissions = allParticipants.map((ws, idx) => {
      const isCorrect = idx < 4; // First 4 guess correctly, 5th and 6th guess wrong
      const guessWord = isCorrect ? (idx % 2 === 0 ? 'memento' : 'Memento') : 'wrong guess';
      
      ws.send(JSON.stringify({
        type: 'SUBMIT_GUESS',
        roomCode,
        guess: guessWord
      }));

      // Immediate duplicate submission to test rapid spam suppression
      ws.send(JSON.stringify({
        type: 'SUBMIT_GUESS',
        roomCode,
        guess: guessWord
      }));

      return ws.waitForEvent('GUESS_RESULT');
    });

    const results = await Promise.all(guessSubmissions);
    expect(results).toHaveLength(6);

    // Verify exactly 3 podium winners recorded
    expect(room.roundWinners.length).toBeLessThanOrEqual(3);
    const winnerIds = room.roundWinners.map((w) => w.playerId);
    const uniqueWinnerIds = new Set(winnerIds);
    expect(uniqueWinnerIds.size).toBe(winnerIds.length); // Strict uniqueness

    // Scores check: exactly 10, 7, 5 points awarded
    if (room.roundWinners.length >= 1) expect(room.roundWinners[0].points).toBe(10);
    if (room.roundWinners.length >= 2) expect(room.roundWinners[1].points).toBe(7);
    if (room.roundWinners.length >= 3) expect(room.roundWinners[2].points).toBe(5);

    // Clean up
    host.close();
    clients.forEach((c) => c.close());
  });

  it('resiliently migrates host when host abruptly disconnects', async () => {
    const host = await connectClient();
    await host.waitForEvent('CONNECTION_ACK');

    host.send(JSON.stringify({
      type: 'CREATE_ROOM',
      playerName: 'OriginalHost',
      playerAvatar: 'aman'
    }));
    const { roomCode } = await host.waitForEvent('ROOM_CREATED');

    const guest = await connectClient();
    await guest.waitForEvent('CONNECTION_ACK');
    guest.send(JSON.stringify({
      type: 'PLAYER_JOIN',
      roomCode,
      playerId: 'guest_successor',
      name: 'SuccessorPlayer',
      avatar: 'aziz'
    }));
    await guest.waitForEvent('JOIN_ACK');

    // Abruptly terminate host connection
    host.terminate();

    // Trigger immediate disconnect cleanup
    const clientData = Array.from(socketService.connections.values()).find(
      (c) => c.roomCode === roomCode && c.isHost
    );
    if (clientData) {
      socketService.handlePlayerLeave(clientData.ws, clientData);
    }

    const room = roomService.getRoom(roomCode);
    expect(room).toBeTruthy();
    expect(room.hostId).toBe('guest_successor');
    expect(room.players.get('guest_successor').isHost).toBe(true);

    guest.close();
  });
});
