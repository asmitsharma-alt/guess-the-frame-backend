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
    this.connectionsByIp = new Map(); // ip -> count
    this.pendingDisconnects = new Map(); // `${roomCode}_${playerId}` -> timer
    this.pingInterval = null;
    this.MAX_CONNECTIONS_PER_IP = 25;
    this.MAX_MESSAGE_SIZE = 65536; // 64KB
  }

  init(server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: this.MAX_MESSAGE_SIZE
    });

    this.wss.on('connection', (ws, req) => {
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .split(',')[0]
        .trim();

      // Enforce per-IP connection limit to prevent socket exhaustion DoS
      const currentIpCount = this.connectionsByIp.get(clientIp) || 0;
      if (currentIpCount >= this.MAX_CONNECTIONS_PER_IP) {
        logger.warn('WebSocket connection rejected: IP %s exceeded max connections limit (%d)', clientIp, this.MAX_CONNECTIONS_PER_IP);
        ws.close(1008, 'Connection limit exceeded for this IP');
        return;
      }

      this.connectionsByIp.set(clientIp, currentIpCount + 1);
      logger.info('WebSocket client connected from %s (active from IP: %d)', clientIp, currentIpCount + 1);

      const clientData = {
        ws,
        ip: clientIp,
        playerId: null,
        playerName: null,
        playerAvatar: 'aman',
        roomCode: null,
        isHost: false,
        isAlive: true,
        lastHeartbeat: Date.now()
      };

      this.connections.set(ws, clientData);

      // Handle standard WS ping/pong
      ws.on('pong', () => {
        clientData.isAlive = true;
        clientData.lastHeartbeat = Date.now();
      });

      ws.on('message', (data) => {
        if (data.length > this.MAX_MESSAGE_SIZE) {
          logger.warn('Dropping oversized WebSocket message from %s (%d bytes)', clientIp, data.length);
          return;
        }

        try {
          const message = JSON.parse(data.toString());
          clientData.lastHeartbeat = Date.now();
          this.handleMessage(ws, message);
        } catch (err) {
          logger.warn('Failed to parse WebSocket message from %s: %s', clientIp, err.message);
        }
      });

      ws.on('close', () => {
        const remaining = (this.connectionsByIp.get(clientIp) || 1) - 1;
        if (remaining <= 0) {
          this.connectionsByIp.delete(clientIp);
        } else {
          this.connectionsByIp.set(clientIp, remaining);
        }
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        logger.warn('WebSocket error on client connection (%s): %s', clientIp, err.message);
      });

      // Send initial connection acknowledgement
      this.send(ws, { type: 'CONNECTION_ACK', timestamp: Date.now() });
    });

    // Run connection watchdog ping interval every 30s
    this.pingInterval = setInterval(() => this.runHeartbeatWatchdog(), 30000);
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
    let count = 0;

    for (const [socket, client] of this.connections.entries()) {
      if (client.roomCode === cleanCode && socket !== excludeWs) {
        this.send(socket, message);
        count++;
      }
    }
    logger.info('[WS BROADCAST] roomCode=%s type=%s sentTo=%d sockets', cleanCode, message.type, count);
  }

  handleMessage(ws, msg) {
    const client = this.connections.get(ws);
    if (!client) return;

    const type = msg.type;
    const roomCode = String(msg.roomCode || client.roomCode || '').toUpperCase().trim();
    logger.info('[WS INCOMING] type=%s roomCode=%s playerId=%s', type, roomCode, msg.playerId || msg.id || client.playerId);

    switch (type) {
      case 'CREATE_ROOM':
        this.handleCreateRoom(ws, client, msg);
        break;

      case 'PLAYER_JOIN':
        this.handlePlayerJoin(ws, client, msg);
        break;

      case 'HOST_HEARTBEAT':
        if (!client.roomCode || !client.isHost) return;
        this.broadcastToRoom(roomCode, msg, ws);
        break;

      case 'CLIENT_HEARTBEAT':
        if (!client.roomCode) return;
        client.lastHeartbeat = Date.now();
        break;

      case 'START_MATCH':
      case 'MATCH_START':
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

      case 'GUIDE_COMPLETE':
        if (roomCode) {
          this.broadcastToRoom(roomCode, msg, ws);
        }
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
    let room;
    if (msg.roomCode) {
      const code = String(msg.roomCode).toUpperCase().trim();
      room = roomService.getRoom(code);
      if (!room) {
        room = {
          code,
          hostId: null,
          status: 'WAITING',
          settings: { category: 'frames', categories: ['frames'], rounds: 10, timer: 30, ...settings },
          players: new Map(),
          playlist: [],
          currentPlayIndex: 0,
          roundWinners: [],
          isMatchActive: false,
          isPaused: false,
          currentRoundStartedAt: 0,
          lastActivity: Date.now()
        };
        roomService.activeRooms.set(code, room);
      }
    } else {
      room = await roomService.createRoom({ settings });
    }

    client.playerId = String(msg.playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`).substring(0, 50);
    client.playerName = String(msg.playerName || 'Host').substring(0, 30).trim() || 'Host';
    client.playerAvatar = String(msg.playerAvatar || 'aman').substring(0, 30);
    client.roomCode = room.code;
    client.isHost = true;

    room.hostId = client.playerId;
    room.players.set(client.playerId, {
      id: client.playerId,
      name: client.playerName,
      avatar: client.playerAvatar,
      score: 0,
      isHost: true,
      loaded: true,
      connected: true
    });

    this.send(ws, {
      type: 'ROOM_CREATED',
      roomCode: room.code,
      playerId: client.playerId,
      players: Array.from(room.players.values()),
      settings: room.settings
    });
    logger.info('[WS ROOM_CREATED] roomCode=%s hostId=%s totalPlayers=%d', room.code, client.playerId, room.players.size);
  }

  handlePlayerJoin(ws, client, msg) {
    const roomCode = String(msg.roomCode || '').toUpperCase().trim();
    let room = roomService.getRoom(roomCode);

    if (!room) {
      // If the connecting player is host, automatically create room state
      if (msg.isHost) {
        room = {
          code: roomCode,
          hostId: null,
          status: 'WAITING',
          settings: { category: 'frames', categories: ['frames'], rounds: 10, timer: 30 },
          players: new Map(),
          playlist: [],
          currentPlayIndex: 0,
          roundWinners: [],
          isMatchActive: false,
          isPaused: false,
          currentRoundStartedAt: 0,
          lastActivity: Date.now()
        };
        roomService.activeRooms.set(roomCode, room);
        logger.info('[WS AUTO CREATE ROOM] roomCode=%s for host', roomCode);
      } else {
        logger.warn('[WS JOIN_ERROR] Room %s NOT FOUND for playerId=%s (activeRooms=%s)', roomCode, msg.playerId || msg.id, Array.from(roomService.activeRooms.keys()).join(','));
        return this.send(ws, {
          type: 'JOIN_ERROR',
          error: `Room "${roomCode}" not found. Check the code and try again.`
        });
      }
    }

    const candidateId = String(msg.id || msg.playerId || client.playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`).substring(0, 50);
    client.playerId = candidateId;
    client.playerName = String(msg.name || msg.playerName || 'Player').substring(0, 30).trim() || 'Player';
    client.playerAvatar = String(msg.avatar || msg.playerAvatar || 'aman').substring(0, 30);
    client.roomCode = roomCode;
    client.isHost = (room.hostId === client.playerId) || (room.players.size === 0);

    // Cancel pending disconnect timer if player reconnected within grace period
    const disconnectKey = `${roomCode}_${client.playerId}`;
    if (this.pendingDisconnects.has(disconnectKey)) {
      clearTimeout(this.pendingDisconnects.get(disconnectKey));
      this.pendingDisconnects.delete(disconnectKey);
    }

    const existingPlayer = room.players.get(client.playerId);
    const playerData = {
      id: client.playerId,
      name: client.playerName,
      avatar: client.playerAvatar,
      score: existingPlayer ? existingPlayer.score : 0,
      isHost: client.isHost,
      loaded: true,
      connected: true
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
      roomCode,
      senderId: client.playerId,
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

    const playlist = (msg.currentPlaylist && msg.currentPlaylist.length > 0)
      ? msg.currentPlaylist
      : await catalogService.generatePlaylist(room.settings);
    room.playlist = playlist;
    room.currentPlayIndex = msg.currentPlayIndex || 0;
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
      currentPlayIndex: room.currentPlayIndex,
      currentFrame: playlist[room.currentPlayIndex],
      players: Array.from(room.players.values()),
      settings: room.settings
    });

    this.broadcastToRoom(room.code, {
      type: 'MATCH_START',
      roomCode: room.code,
      currentPlaylist: playlist,
      currentPlayIndex: room.currentPlayIndex,
      players: Array.from(room.players.values())
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

      this.broadcastToRoom(room.code, {
        type: 'GUESS_CORRECT_BROADCAST',
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

      const wasHost = client.isHost || (room.hostId === client.playerId);

      this.broadcastToRoom(room.code, {
        type: 'PLAYER_LEAVE',
        playerId: client.playerId,
        senderId: client.playerId,
        isHost: wasHost,
        players: Array.from(room.players.values())
      });

      this.broadcastToRoom(room.code, {
        type: 'PLAYER_LEFT',
        playerId: client.playerId,
        playerName: client.playerName,
        isHost: wasHost,
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
    if (!client) return;

    const { roomCode, playerId } = client;
    this.connections.delete(ws);

    if (roomCode && playerId) {
      const room = roomService.getRoom(roomCode);
      if (room && room.players.has(playerId)) {
        // Mark player disconnected temporarily
        const player = room.players.get(playerId);
        player.connected = false;

        // Schedule grace period (7 seconds) before removing player
        const disconnectKey = `${roomCode}_${playerId}`;
        if (this.pendingDisconnects.has(disconnectKey)) {
          clearTimeout(this.pendingDisconnects.get(disconnectKey));
        }

        const timer = setTimeout(() => {
          this.pendingDisconnects.delete(disconnectKey);
          // If player still disconnected, officially remove them
          const currentRoom = roomService.getRoom(roomCode);
          if (currentRoom && currentRoom.players.has(playerId)) {
            const p = currentRoom.players.get(playerId);
            if (!p.connected) {
              this.handlePlayerLeave(ws, client);
            }
          }
        }, 7000);

        this.pendingDisconnects.set(disconnectKey, timer);

        // Notify room that player disconnected temporarily
        this.broadcastToRoom(roomCode, {
          type: 'PLAYER_DISCONNECTED_TEMP',
          playerId,
          playerName: client.playerName
        });
        return;
      }
    }

    this.handlePlayerLeave(ws, client);
  }

  runHeartbeatWatchdog() {
    const now = Date.now();
    for (const [ws, client] of this.connections.entries()) {
      if (!client.isAlive || (now - client.lastHeartbeat > 75000)) {
        logger.info('Terminating inactive WebSocket client (%s, %s)', client.ip, client.playerId || 'anonymous');
        try {
          ws.terminate();
        } catch (e) {}
        this.connections.delete(ws);
        continue;
      }

      client.isAlive = false;
      try {
        ws.ping();
      } catch (e) {
        ws.terminate();
        this.connections.delete(ws);
      }
    }
  }

  cleanupStaleConnections() {
    this.runHeartbeatWatchdog();
  }

  closeAll(reason = 'Server shutting down') {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const timer of this.pendingDisconnects.values()) {
      clearTimeout(timer);
    }
    this.pendingDisconnects.clear();

    for (const [ws] of this.connections.entries()) {
      try {
        ws.close(1001, reason);
      } catch (e) {}
    }
    this.connections.clear();
    this.connectionsByIp.clear();

    if (this.wss) {
      try {
        this.wss.close();
      } catch (e) {}
    }
  }

  getStats() {
    return {
      activeConnections: this.connections.size,
      activeRooms: roomService.activeRooms ? roomService.activeRooms.size : 0,
      uniqueIps: this.connectionsByIp.size
    };
  }
}

module.exports = new SocketService();
