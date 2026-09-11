const { WebSocketServer } = require('ws');
const roomService = require('./roomService');
const catalogService = require('./catalogService');
const scoreService = require('./scoreService');
const FuzzyMatcher = require('../utils/fuzzyMatch');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.wss = null;
    this.connections = new Map(); // socket -> clientData
  }

  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logger.info('WebSocket client connected from %s', clientIp);

      const clientData = {
        ws,
        playerId: null,
        playerName: null,
        playerAvatar: 'aman',
        roomCode: null,
        isHost: false,
        lastHeartbeat: Date.now()
      };

      this.connections.set(ws, clientData);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (err) {
          logger.warn('Failed to parse WebSocket message: %s', err.message);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        logger.warn('WebSocket error on client connection: %s', err.message);
      });

      // Send initial connection acknowledgement
      this.send(ws, { type: 'CONNECTION_ACK', timestamp: Date.now() });
    });

    // Run connection watchdog interval
    setInterval(() => this.cleanupStaleConnections(), 30000);
    logger.info('WebSocket Realtime Server initialized on /ws');
  }

  send(ws, message) {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcastToRoom(roomCode, message, excludeWs = null) {
    if (!roomCode) return;
    const cleanCode = String(roomCode).toUpperCase().trim();

    for (const [socket, client] of this.connections.entries()) {
      if (client.roomCode === cleanCode && socket !== excludeWs) {
        this.send(socket, message);
      }
    }
  }

  handleMessage(ws, msg) {
    const client = this.connections.get(ws);
    if (!client) return;

    const type = msg.type;
    const roomCode = String(msg.roomCode || client.roomCode || '').toUpperCase().trim();

    switch (type) {
      case 'CREATE_ROOM':
        this.handleCreateRoom(ws, client, msg);
        break;

      case 'PLAYER_JOIN':
        this.handlePlayerJoin(ws, client, msg);
        break;

      case 'CLIENT_HEARTBEAT':
        client.lastHeartbeat = Date.now();
        break;

      case 'START_MATCH':
        this.handleStartMatch(ws, client, msg);
        break;

      case 'SUBMIT_GUESS':
        this.handleSubmitGuess(ws, client, msg);
        break;

      case 'REQUEST_HINT':
        this.handleRequestHint(ws, client, msg);
        break;

      case 'NEXT_ROUND':
        this.handleNextRound(ws, client, msg);
        break;

      case 'PAUSE_MATCH':
        this.handlePauseMatch(ws, client, msg);
        break;

      case 'END_GAME':
        this.handleEndGame(ws, client, msg);
        break;

      case 'REMATCH':
        this.handleRematch(ws, client, msg);
        break;

      case 'CHAT_MESSAGE':
        this.handleChatMessage(ws, client, msg);
        break;

      case 'UPDATE_SETTINGS':
        this.handleUpdateSettings(ws, client, msg);
        break;

      case 'PLAYER_LEAVE':
        this.handlePlayerLeave(ws, client);
        break;

      default:
        // Relay any custom events for backward compatibility
        if (roomCode) {
          this.broadcastToRoom(roomCode, msg, ws);
        }
    }
  }

  async handleCreateRoom(ws, client, msg) {
    const settings = msg.settings || {};
    const room = await roomService.createRoom({ settings });

    client.playerId = msg.playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    client.playerName = msg.playerName || 'Host';
    client.playerAvatar = msg.playerAvatar || 'aman';
    client.roomCode = room.code;
    client.isHost = true;

    room.hostId = client.playerId;
    room.players.set(client.playerId, {
      id: client.playerId,
      name: client.playerName,
      avatar: client.playerAvatar,
      score: 0,
      isHost: true,
      loaded: true
    });

    this.send(ws, {
      type: 'ROOM_CREATED',
      roomCode: room.code,
      playerId: client.playerId,
      players: Array.from(room.players.values()),
      settings: room.settings
    });
  }

  handlePlayerJoin(ws, client, msg) {
    const roomCode = String(msg.roomCode || '').toUpperCase().trim();
    const room = roomService.getRoom(roomCode);

    if (!room) {
      return this.send(ws, {
        type: 'JOIN_ERROR',
        error: `Room "${roomCode}" not found. Check the code and try again.`
      });
    }

    client.playerId = msg.id || msg.playerId || client.playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    client.playerName = msg.name || msg.playerName || 'Player';
    client.playerAvatar = msg.avatar || msg.playerAvatar || 'aman';
    client.roomCode = roomCode;
    client.isHost = (room.hostId === client.playerId) || (room.players.size === 0);

    const existingPlayer = room.players.get(client.playerId);
    const playerData = {
      id: client.playerId,
      name: client.playerName,
      avatar: client.playerAvatar,
      score: existingPlayer ? existingPlayer.score : 0,
      isHost: client.isHost,
      loaded: true
    };

    room.players.set(client.playerId, playerData);

    // Send JOIN_ACK to joining player
    this.send(ws, {
      type: 'JOIN_ACK',
      roomCode,
      playerId: client.playerId,
      isHost: client.isHost,
      players: Array.from(room.players.values()),
      settings: room.settings,
      isMatchActive: room.isMatchActive,
      currentPlayIndex: room.currentPlayIndex
    });

    // Broadcast updated player list to room
    this.broadcastToRoom(roomCode, {
      type: 'PLAYER_JOIN',
      id: client.playerId,
      playerId: client.playerId,
      name: client.playerName,
      avatar: client.playerAvatar,
      isHost: client.isHost,
      players: Array.from(room.players.values())
    }, ws);
  }

  async handleStartMatch(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || (!client.isHost && room.hostId !== client.playerId)) return;

    const playlist = await catalogService.generatePlaylist(room.settings);
    room.playlist = playlist;
    room.currentPlayIndex = 0;
    room.roundWinners = [];
    room.isMatchActive = true;
    room.status = 'PLAYING';
    room.currentRoundStartedAt = Date.now();

    // Reset scores for new match
    for (const player of room.players.values()) {
      player.score = 0;
    }

    this.broadcastToRoom(room.code, {
      type: 'MATCH_STARTED',
      roomCode: room.code,
      playlist,
      totalRounds: playlist.length,
      currentPlayIndex: 0,
      currentFrame: playlist[0],
      players: Array.from(room.players.values()),
      settings: room.settings
    });
  }

  handleSubmitGuess(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || !room.isMatchActive) return;

    const currentFrame = room.playlist[room.currentPlayIndex];
    if (!currentFrame) return;

    const guessText = String(msg.guess || '').trim();
    const playerId = client.playerId || msg.playerId;
    const player = room.players.get(playerId);

    if (!player) return;

    // Check duplicate: has player already won this round?
    const alreadyWon = room.roundWinners.some(w => w.playerId === playerId);
    if (alreadyWon) {
      return this.send(ws, {
        type: 'GUESS_RESULT',
        isCorrect: true,
        alreadyScored: true,
        score: player.score
      });
    }

    // Check answer correctness
    const isCorrect = FuzzyMatcher.isMatch(guessText, currentFrame.answer);

    if (isCorrect) {
      const position = room.roundWinners.length + 1;
      let points = 0;
      if (position === 1) points = 10;
      else if (position === 2) points = 7;
      else if (position === 3) points = 5;

      player.score = (player.score || 0) + points;

      const winnerEntry = {
        playerId: player.id,
        playerName: player.name,
        playerAvatar: player.avatar,
        points,
        position,
        time: (Date.now() - room.currentRoundStartedAt) / 1000
      };

      if (position <= 3) {
        room.roundWinners.push(winnerEntry);
      }

      // Notify the guesser
      this.send(ws, {
        type: 'GUESS_RESULT',
        isCorrect: true,
        points,
        position,
        score: player.score
      });

      // Broadcast winner banner & updated leaderboard
      this.broadcastToRoom(room.code, {
        type: 'ROUND_WINNER',
        winner: winnerEntry,
        roundWinners: room.roundWinners,
        players: Array.from(room.players.values())
      });

      // If 3 players scored, finish the round early
      if (room.roundWinners.length >= 3) {
        this.broadcastToRoom(room.code, {
          type: 'ROUND_FINISH_EARLY',
          roundIndex: room.currentPlayIndex,
          correctAnswer: currentFrame.answer,
          roundWinners: room.roundWinners
        });
      }
    } else {
      this.send(ws, {
        type: 'GUESS_RESULT',
        isCorrect: false,
        score: player.score
      });
    }
  }

  handleRequestHint(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || !room.isMatchActive) return;

    const currentFrame = room.playlist[room.currentPlayIndex];
    if (!currentFrame || !currentFrame.answer) return;

    const player = room.players.get(client.playerId);
    if (!player) return;

    // Deduct 2 points penalty (cannot go negative)
    player.score = Math.max(0, (player.score || 0) - 2);

    // Generate masked hint: keep spaces and reveal ~35% of characters
    const ans = currentFrame.answer;
    let masked = '';
    for (let i = 0; i < ans.length; i++) {
      const ch = ans[i];
      if (ch === ' ' || ch === '-' || ch === ':') {
        masked += ch;
      } else if (i === 0 || (i % 3 === 0)) {
        masked += ch;
      } else {
        masked += '_ ';
      }
    }

    this.send(ws, {
      type: 'HINT_RESPONSE',
      hintText: masked,
      score: player.score
    });

    // Broadcast updated score to room
    this.broadcastToRoom(room.code, {
      type: 'SCORE_UPDATE',
      playerId: player.id,
      score: player.score,
      players: Array.from(room.players.values())
    });
  }

  handleNextRound(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || (!client.isHost && room.hostId !== client.playerId)) return;

    room.currentPlayIndex++;
    room.roundWinners = [];
    room.currentRoundStartedAt = Date.now();

    if (room.currentPlayIndex >= room.playlist.length) {
      // Match Finished!
      this.handleEndGame(ws, client, msg);
    } else {
      const nextFrame = room.playlist[room.currentPlayIndex];
      this.broadcastToRoom(room.code, {
        type: 'ROUND_START',
        currentPlayIndex: room.currentPlayIndex,
        currentFrame: nextFrame,
        totalRounds: room.playlist.length,
        players: Array.from(room.players.values())
      });
    }
  }

  handlePauseMatch(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || (!client.isHost && room.hostId !== client.playerId)) return;

    room.isPaused = !room.isPaused;
    this.broadcastToRoom(room.code, {
      type: 'MATCH_PAUSED',
      isPaused: room.isPaused
    });
  }

  async handleEndGame(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room) return;

    room.isMatchActive = false;
    room.status = 'FINISHED';

    const scoreboard = Array.from(room.players.values()).sort((a, b) => b.score - a.score);

    // Record result in background
    await scoreService.recordMatchResult({
      roomId: room.code,
      scoreboard,
      totalRounds: room.playlist ? room.playlist.length : 10
    });

    this.broadcastToRoom(room.code, {
      type: 'GAME_OVER',
      roomCode: room.code,
      scoreboard,
      winner: scoreboard[0] || null
    });
  }

  handleRematch(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room) return;

    // Reset scores
    for (const p of room.players.values()) {
      p.score = 0;
    }
    room.currentPlayIndex = 0;
    room.roundWinners = [];
    room.isMatchActive = false;
    room.status = 'WAITING';

    this.broadcastToRoom(room.code, {
      type: 'RETURN_TO_LOBBY',
      players: Array.from(room.players.values()),
      settings: room.settings
    });
  }

  handleChatMessage(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room) return;

    const chatMsg = msg.msg || {};
    const text = String(chatMsg.text || '').trim();

    // Check spoiler shield during active round
    if (room.isMatchActive && room.playlist[room.currentPlayIndex]) {
      const currentAns = room.playlist[room.currentPlayIndex].answer;
      if (FuzzyMatcher.isMatch(text, currentAns)) {
        // Suppress spoiler leak into chat
        return this.send(ws, {
          type: 'SYSTEM_MESSAGE',
          text: "⚠️ That's the answer! Don't spoil it in chat! 🤫"
        });
      }
    }

    // Broadcast clean chat message to entire room
    this.broadcastToRoom(room.code, {
      type: 'CHAT_MESSAGE',
      msg: {
        id: chatMsg.id || `msg_${Date.now()}`,
        senderId: client.playerId,
        senderName: client.playerName,
        senderAvatar: client.playerAvatar,
        text,
        timestamp: Date.now()
      }
    });
  }

  handleUpdateSettings(ws, client, msg) {
    const room = roomService.getRoom(client.roomCode);
    if (!room || (!client.isHost && room.hostId !== client.playerId)) return;

    room.settings = { ...room.settings, ...msg.settings };
    this.broadcastToRoom(room.code, {
      type: 'SETTINGS_UPDATED',
      settings: room.settings
    });
  }

  handlePlayerLeave(ws, client) {
    const room = roomService.getRoom(client.roomCode);
    if (room && client.playerId) {
      room.players.delete(client.playerId);

      // Check host migration
      if (client.isHost && room.players.size > 0) {
        const nextHost = room.players.values().next().value;
        if (nextHost) {
          nextHost.isHost = true;
          room.hostId = nextHost.id;

          // Notify next host
          for (const [s, c] of this.connections.entries()) {
            if (c.playerId === nextHost.id) {
              c.isHost = true;
              this.send(s, { type: 'HOST_PROMOTED', isHost: true });
            }
          }

          this.broadcastToRoom(room.code, {
            type: 'HOST_MIGRATED',
            newHostId: nextHost.id,
            newHostName: nextHost.name
          });
        }
      }

      this.broadcastToRoom(room.code, {
        type: 'PLAYER_LEFT',
        playerId: client.playerId,
        playerName: client.playerName,
        players: Array.from(room.players.values())
      });

      if (room.players.size === 0) {
        roomService.removeRoom(room.code);
      }
    }

    client.roomCode = null;
    client.isHost = false;
  }

  handleDisconnect(ws) {
    const client = this.connections.get(ws);
    if (client) {
      this.handlePlayerLeave(ws, client);
      this.connections.delete(ws);
    }
  }

  cleanupStaleConnections() {
    const now = Date.now();
    for (const [ws, client] of this.connections.entries()) {
      if (now - client.lastHeartbeat > 90000) { // 90s inactive
        try {
          ws.terminate();
        } catch (e) {}
        this.connections.delete(ws);
      }
    }
  }
}

module.exports = new SocketService();
