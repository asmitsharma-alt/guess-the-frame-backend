const prisma = require('../config/database');
const logger = require('../utils/logger');

// Clean alphabet excluding ambiguous characters
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RoomService {
  constructor() {
    this.activeRooms = new Map(); // roomCode -> RoomState
    this.cleanupInterval = setInterval(() => this.sweepStaleRooms(), 15 * 60 * 1000); // Every 15m
  }

  generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    return code;
  }

  async createRoom({ hostId = null, settings = {} }) {
    let code = this.generateRoomCode();
    let attempts = 0;

    while (this.activeRooms.has(code) && attempts < 100) {
      code = this.generateRoomCode();
      attempts++;
    }

    if (this.activeRooms.has(code)) {
      throw new Error('Room capacity full. Please try again in a moment.');
    }

    const defaultSettings = {
      category: 'frames',
      categories: ['frames'],
      rounds: 10,
      timer: 30,
      judgeMode: false,
      ...settings
    };

    const roomState = {
      code,
      hostId,
      status: 'WAITING',
      settings: defaultSettings,
      players: new Map(),
      playlist: [],
      currentPlayIndex: 0,
      roundWinners: [],
      isMatchActive: false,
      isPaused: false,
      currentRoundStartedAt: 0,
      lastActivity: Date.now()
    };

    this.activeRooms.set(code, roomState);

    try {
      if (prisma && prisma.room) {
        await prisma.room.upsert({
          where: { code },
          update: {
            settings: JSON.stringify(defaultSettings),
            status: 'WAITING',
            updatedAt: new Date()
          },
          create: {
            code,
            hostId,
            settings: JSON.stringify(defaultSettings),
            status: 'WAITING'
          }
        });
      }
    } catch (err) {
      logger.warn('Failed to persist room to DB, memory room active: %s', err.message);
    }

    return roomState;
  }

  getRoom(code) {
    if (!code) return null;
    const cleanCode = String(code).toUpperCase().trim();
    const room = this.activeRooms.get(cleanCode);
    if (room) {
      room.lastActivity = Date.now();
      return room;
    }
    return null;
  }

  async getRoomAsync(code) {
    if (!code) return null;
    const cleanCode = String(code).toUpperCase().trim();
    let room = this.getRoom(cleanCode);
    if (room) return room;

    // Database fallback / re-hydration
    try {
      if (prisma && prisma.room) {
        const dbRoom = await prisma.room.findUnique({ where: { code: cleanCode } });
        if (dbRoom && dbRoom.status !== 'FINISHED' && dbRoom.status !== 'EXPIRED') {
          let parsedSettings = {};
          try {
            parsedSettings = JSON.parse(dbRoom.settings || '{}');
          } catch (e) {}

          room = {
            code: cleanCode,
            hostId: dbRoom.hostId,
            status: dbRoom.status,
            settings: parsedSettings,
            players: new Map(),
            playlist: [],
            currentPlayIndex: 0,
            roundWinners: [],
            isMatchActive: dbRoom.status === 'PLAYING',
            isPaused: false,
            currentRoundStartedAt: 0,
            lastActivity: Date.now()
          };
          this.activeRooms.set(cleanCode, room);
          logger.info('Re-hydrated room %s from database', cleanCode);
          return room;
        }
      }
    } catch (err) {
      logger.warn('Failed to rehydrate room from DB: %s', err.message);
    }

    return null;
  }

  hasRoom(code) {
    if (!code) return false;
    const cleanCode = String(code).toUpperCase().trim();
    return this.activeRooms.has(cleanCode);
  }

  getAllActiveRooms() {
    return Array.from(this.activeRooms.values()).map(r => ({
      code: r.code,
      playerCount: r.players.size,
      status: r.status,
      settings: r.settings
    }));
  }

  updateRoomSettings(code, settings) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.settings = { ...room.settings, ...settings };
    room.lastActivity = Date.now();
    return room;
  }

  async updateRoomStatus(code, status) {
    const room = this.getRoom(code);
    if (room) {
      room.status = status;
      room.lastActivity = Date.now();
    }
    try {
      if (prisma && prisma.room) {
        await prisma.room.update({
          where: { code },
          data: { status, updatedAt: new Date() }
        });
      }
    } catch (err) {
      logger.warn('Failed to update room status in DB: %s', err.message);
    }
  }

  removeRoom(code) {
    const cleanCode = String(code).toUpperCase().trim();
    return this.activeRooms.delete(cleanCode);
  }

  sweepStaleRooms() {
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    for (const [code, room] of this.activeRooms.entries()) {
      if (now - room.lastActivity > TWO_HOURS && room.players.size === 0) {
        logger.info('Sweeping stale room %s (inactive for >2h)', code);
        this.activeRooms.delete(code);
        if (prisma && prisma.room) {
          prisma.room.update({
            where: { code },
            data: { status: 'EXPIRED' }
          }).catch(() => {});
        }
      }
    }
  }
}

// Ensure process-wide global singleton across CommonJS and ESM module boundaries
if (!global.__GTF_ROOM_SERVICE__) {
  global.__GTF_ROOM_SERVICE__ = new RoomService();
}

module.exports = global.__GTF_ROOM_SERVICE__;
