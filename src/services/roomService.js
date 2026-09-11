const prisma = require('../config/database');
const logger = require('../utils/logger');

// Clean alphabet excluding ambiguous characters
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RoomService {
  constructor() {
    this.activeRooms = new Map(); // roomCode -> RoomState
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

    while (this.activeRooms.has(code) && attempts < 10) {
      code = this.generateRoomCode();
      attempts++;
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
            status: 'WAITING'
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
    return this.activeRooms.get(cleanCode) || null;
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

  removeRoom(code) {
    const cleanCode = String(code).toUpperCase().trim();
    return this.activeRooms.delete(cleanCode);
  }
}

// Ensure process-wide global singleton across CommonJS and ESM module boundaries
if (!global.__GTF_ROOM_SERVICE__) {
  global.__GTF_ROOM_SERVICE__ = new RoomService();
}

module.exports = global.__GTF_ROOM_SERVICE__;
