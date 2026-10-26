import crypto from 'node:crypto';
import { Game } from './engine/game.js';
import { randomDeck, validateDeck } from './decks.js';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHAT = 120;
const MAX_NAME = 22;

function safeName(name, fallback = 'Player') {
  const clean = String(name || '').replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return clean || fallback;
}

function newRoomCode(rooms) {
  for (let i = 0; i < 50; i++) {
    let code = '';
    for (let j = 0; j < 5; j++) code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  return `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function roomModeMax(mode) { return mode === '2v2' ? 4 : 2; }
function teamMax(mode) { return mode === '2v2' ? 2 : 1; }

export class RoomManager {
  constructor(store, { send, broadcast } = {}) {
    this.store = store;
    this.rooms = new Map();
    this.clients = new Map();
    this.sendFn = send || (() => {});
    this.broadcastFn = broadcast || null;
    this.cleanupTimer = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  // ---------------------------------------------------------------- connections
  attach(ws, clientId) {
    const old = this.clients.get(clientId);
    if (old && old !== ws && old.readyState === 1) {
      try { old.close(4001, 'Replaced by a newer connection'); } catch {}
    }
    this.clients.set(clientId, ws);
    ws.clientId = clientId;
    ws.roomCode = null;
  }

  detach(ws) {
    if (!ws.clientId) return;
    if (this.clients.get(ws.clientId) === ws) this.clients.delete(ws.clientId);
    const room = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (!room) return;
    const player = room.players.get(ws.clientId);
    if (player) {
      player.connected = false;
      player.lastSeen = Date.now();
      this.broadcastLobby(room);
      if (room.started) this.broadcastGame(room);
    }
    const spectator = room.spectators.get(ws.clientId);
    if (spectator) spectator.connected = false;
  }

  send(ws, message) {
    if (!ws || ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(message)); } catch {}
  }

  error(ws, message, extra = {}) {
    this.send(ws, { type: 'error', message, ...extra });
  }

  // ---------------------------------------------------------------- rooms
  createRoom(ws, name) {
    const clientId = ws.clientId;
    const old = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (old) this.leaveRoom(ws, { silent: true });
    const code = newRoomCode(this.rooms);
    const room = {
      code,
      hostId: clientId,
      mode: '1v1',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      started: false,
      game: null,
      players: new Map(),
      spectators: new Map(),
      chat: [],
      nextTeam: 'A',
    };
    const player = {
      id: clientId,
      name: safeName(name, `Player ${this.rooms.size + 1}`),
      team: 'A',
      ready: false,
      deckId: 'auto',
      connected: true,
      isHost: true,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    room.players.set(clientId, player);
    this.rooms.set(code, room);
    ws.roomCode = code;
    room.nextTeam = 'B';
    this.pushChat(room, 'System', `${player.name} created the room.`, 'system');
    this.send(ws, { type: 'roomCreated', code, playerId: clientId });
    this.broadcastLobby(room);
    return room;
  }

  joinRoom(ws, codeRaw, name, { asSpectator = false } = {}) {
    const code = String(codeRaw || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return this.error(ws, 'Room not found. Check the invite code.');
    const clientId = ws.clientId;
    const existing = room.players.get(clientId);
    if (existing) {
      existing.connected = true;
      existing.lastSeen = Date.now();
      if (name) existing.name = safeName(name, existing.name);
      ws.roomCode = code;
      this.pushChat(room, 'System', `${existing.name} reconnected.`, 'system');
      this.send(ws, { type: 'roomJoined', code, playerId: clientId, reconnect: true });
      this.broadcastLobby(room);
      if (room.started) this.sendGame(room, clientId);
      return room;
    }
    const spectator = room.spectators.get(clientId);
    if (spectator) {
      spectator.connected = true;
      ws.roomCode = code;
      this.send(ws, { type: 'roomJoined', code, playerId: null, spectator: true });
      if (room.started) this.sendGame(room, null);
      else this.broadcastLobby(room);
      return room;
    }
    if (asSpectator || room.players.size >= roomModeMax(room.mode)) {
      if (!room.started && !asSpectator) {
        this.error(ws, 'This room is full.');
        return null;
      }
      room.spectators.set(clientId, { id: clientId, name: safeName(name, 'Spectator'), connected: true });
      ws.roomCode = code;
      this.send(ws, { type: 'roomJoined', code, playerId: null, spectator: true });
      this.pushChat(room, 'System', `${safeName(name, 'A spectator')} is watching.`, 'system');
      if (room.started) this.sendGame(room, null);
      else this.broadcastLobby(room);
      return room;
    }
    // Assign a team automatically, balancing.
    const counts = this.teamCounts(room);
    let team = counts.A <= counts.B ? 'A' : 'B';
    if (room.mode === '1v1') {
      if (!counts.A && counts.B) team = 'A';
      else if (counts.A && !counts.B) team = 'B';
    }
    const player = {
      id: clientId,
      name: safeName(name, `Player ${room.players.size + 1}`),
      team,
      ready: false,
      deckId: this.store.decks[0]?.id || 'auto',
      connected: true,
      isHost: false,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    room.players.set(clientId, player);
    ws.roomCode = code;
    room.lastActivity = Date.now();
    this.pushChat(room, 'System', `${player.name} joined Team ${team}.`, 'system');
    this.send(ws, { type: 'roomJoined', code, playerId: clientId });
    this.broadcastLobby(room);
    return room;
  }

  leaveRoom(ws, { silent = false } = {}) {
    const room = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (!room) return;
    const player = room.players.get(ws.clientId);
    if (player) {
      if (room.started && room.game && room.game.phase !== 'gameover') {
        room.game.surrender(player.id);
      }
      room.players.delete(player.id);
      this.pushChat(room, 'System', `${player.name} left.`, 'system');
      if (room.hostId === player.id) {
        const next = [...room.players.values()].find((p) => p.connected) || [...room.players.values()][0];
        if (next) {
          room.hostId = next.id;
          next.isHost = true;
          this.pushChat(room, 'System', `${next.name} is now the host.`, 'system');
        }
      }
    }
    const spectator = room.spectators.get(ws.clientId);
    if (spectator) room.spectators.delete(spectator.id);
    ws.roomCode = null;
    if (room.players.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(room.code);
    } else {
      this.broadcastLobby(room);
      if (room.started) this.broadcastGame(room);
    }
    if (!silent) this.send(ws, { type: 'leftRoom' });
  }

  roomFor(ws) {
    return ws.roomCode ? this.rooms.get(ws.roomCode) : null;
  }

  playerFor(ws) {
    const room = this.roomFor(ws);
    return room?.players.get(ws.clientId) || null;
  }

  requireHost(ws, room) {
    if (room.hostId !== ws.clientId) {
      this.error(ws, 'Only the host can do that.');
      return false;
    }
    return true;
  }

  teamCounts(room) {
    const counts = { A: 0, B: 0 };
    for (const p of room.players.values()) counts[p.team] = (counts[p.team] || 0) + 1;
    return counts;
  }

  setMode(ws, mode) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started) return this.error(ws, 'Cannot change the mode after the game starts.');
    if (!['1v1', '2v2'].includes(mode)) return this.error(ws, 'Invalid mode.');
    if (mode === '1v1' && room.players.size > 2) return this.error(ws, 'Remove extra players before switching to 1v1.');
    const maxPerTeam = teamMax(mode);
    for (const p of room.players.values()) {
      if (p.team === 'A' && this.teamCounts(room).A > maxPerTeam) p.team = 'B';
      if (p.team === 'B' && this.teamCounts(room).B > maxPerTeam) p.team = 'A';
    }
    room.mode = mode;
    room.lastActivity = Date.now();
    this.pushChat(room, 'System', `Mode set to ${mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel'}.`, 'system');
    this.broadcastLobby(room);
  }

  movePlayer(ws, playerId, team) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started) return this.error(ws, 'Cannot move players after the game starts.');
    if (!['A', 'B'].includes(team)) return this.error(ws, 'Invalid team.');
    const player = room.players.get(playerId);
    if (!player) return this.error(ws, 'Player not found.');
    if (player.team === team) return;
    const counts = this.teamCounts(room);
    if ((counts[team] || 0) >= teamMax(room.mode)) return this.error(ws, `Team ${team} is full.`);
    player.team = team;
    player.ready = false;
    this.pushChat(room, 'System', `${player.name} moved to Team ${team}.`, 'system');
    this.broadcastLobby(room);
  }

  kick(ws, playerId) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started) return this.error(ws, 'Cannot kick players after the game starts.');
    if (playerId === ws.clientId) return this.error(ws, 'You cannot kick yourself.');
    const player = room.players.get(playerId);
    if (!player) return this.error(ws, 'Player not found.');
    room.players.delete(playerId);
    const targetWs = this.clients.get(playerId);
    if (targetWs) {
      targetWs.roomCode = null;
      this.send(targetWs, { type: 'kicked' });
    }
    this.pushChat(room, 'System', `${player.name} was removed by the host.`, 'system');
    this.broadcastLobby(room);
  }

  setDeck(ws, deckId) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'You are spectating.');
    if (room.started) return this.error(ws, 'The game has already started.');
    if (deckId !== 'auto' && !this.store.getDeck(deckId)) return this.error(ws, 'Deck not found.');
    player.deckId = deckId;
    player.ready = false;
    this.broadcastLobby(room);
  }

  setReady(ws, ready) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'You are spectating.');
    if (room.started) return this.error(ws, 'The game has already started.');
    player.ready = !!ready;
    room.lastActivity = Date.now();
    this.broadcastLobby(room);
  }

  start(ws) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started) return this.error(ws, 'The game is already running.');
    const players = [...room.players.values()];
    const needed = roomModeMax(room.mode);
    if (players.length !== needed) return this.error(ws, `This mode needs exactly ${needed} players.`);
    const counts = this.teamCounts(room);
    const perTeam = teamMax(room.mode);
    if (counts.A !== perTeam || counts.B !== perTeam) return this.error(ws, `Each team needs exactly ${perTeam} player${perTeam === 1 ? '' : 's'}.`);
    if (players.some((p) => !p.ready)) return this.error(ws, 'Every player must be ready.');
    if (players.some((p) => !p.connected)) return this.error(ws, 'A player is disconnected.');
    return this.startGame(room);
  }

  startGame(room) {
    const players = [...room.players.values()];
    const decks = {};
    for (const p of players) {
      const selected = p.deckId && p.deckId !== 'auto' ? this.store.getDeck(p.deckId) : null;
      if (selected) {
        const validation = validateDeck(selected.cards, this.store.cardDB, this.store.rules, selected.regions);
        if (!validation.ok) {
          this.broadcastLobby(room);
          return this.send(this.clients.get(room.hostId), { type: 'error', message: `Deck "${selected.name}" is not legal: ${validation.errors.join('; ')}` });
        }
        decks[p.id] = selected.cards;
      } else {
        let built = randomDeck(this.store.cardDB, this.store.rules);
        let validation = validateDeck(built.cards, this.store.cardDB, this.store.rules);
        let attempts = 0;
        while (!validation.ok && attempts++ < 6) {
          built = randomDeck(this.store.cardDB, this.store.rules);
          validation = validateDeck(built.cards, this.store.cardDB, this.store.rules);
        }
        if (!validation.ok) {
          return this.send(this.clients.get(room.hostId), { type: 'error', message: 'Could not build a legal auto-deck. Pick a deck in the lobby.' });
        }
        decks[p.id] = built.cards;
      }
    }
    const game = new Game({
      id: `room-${room.code}-${Date.now()}`,
      mode: room.mode,
      players: players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
      decks,
      cardDB: this.store.cardDB,
      settings: { rules: this.store.rules },
      seed: crypto.randomInt(1, 2 ** 30),
    });
    room.game = game;
    room.started = true;
    room.startedAt = Date.now();
    room.lastActivity = Date.now();
    this.pushChat(room, 'System', `The game begins! ${room.mode === '2v2' ? 'Team Clash' : 'Duel'} — good luck.`, 'system');
    this.broadcastGame(room);
  }

  rematch(ws) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (!room.game || room.game.phase !== 'gameover') return this.error(ws, 'The current game is not over.');
    if ([...room.players.values()].some((p) => !p.connected)) return this.error(ws, 'A player is disconnected.');
    room.game = null;
    room.started = false;
    for (const p of room.players.values()) p.ready = true;
    this.pushChat(room, 'System', 'Rematch!', 'system');
    return this.startGame(room);
  }

  action(ws, msg) {
    const room = this.roomFor(ws);
    if (!room || !room.started || !room.game) return this.error(ws, 'No game is running.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'Spectators cannot act.');
    const game = room.game;
    let result = { ok: true };
    switch (msg.type) {
      case 'mulligan':
        result = game.submitMulligan(player.id, Array.isArray(msg.iids) ? msg.iids : []);
        break;
      case 'play':
        result = game.playCard(player.id, msg.iid, Array.isArray(msg.targets) ? msg.targets : []);
        break;
      case 'attack':
        result = game.attack(player.id, Array.isArray(msg.attackers) ? msg.attackers : [], msg.challengers || {});
        break;
      case 'block':
        result = game.declareBlockers(player.id, msg.blocks || {});
        break;
      case 'pass':
        result = game.pass(player.id);
        break;
      case 'choice':
        result = game.resolveChoice(player.id, Array.isArray(msg.ids) ? msg.ids : []);
        break;
      case 'surrender':
        result = game.surrender(player.id);
        break;
      case 'manual':
        result = game.manualAction(player.id, msg.op || {});
        break;
      default:
        result = { ok: false, error: 'Unknown game action.' };
    }
    if (!result?.ok) this.error(ws, result?.error || 'Action failed.', result?.needsTargets ? { needsTargets: result.needsTargets } : {});
    this.broadcastGame(room);
  }

  chat(ws, text) {
    const room = this.roomFor(ws);
    if (!room) return;
    const clean = String(text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
    if (!clean) return;
    const player = room.players.get(ws.clientId);
    const spectator = room.spectators.get(ws.clientId);
    const name = player?.name || spectator?.name || 'Someone';
    this.pushChat(room, name, clean, 'chat');
    this.broadcastLobby(room);
    if (room.started) this.broadcastGame(room);
  }

  pushChat(room, from, text, kind = 'chat') {
    room.chat.push({ id: crypto.randomUUID(), from, text, kind, at: Date.now() });
    if (room.chat.length > 120) room.chat.shift();
  }

  // ---------------------------------------------------------------- views
  lobbyView(room, clientId = null) {
    const players = [...room.players.values()].map((p) => {
      const deck = p.deckId && p.deckId !== 'auto' ? this.store.getDeck(p.deckId) : null;
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        connected: p.connected,
        deckId: p.deckId,
        deckName: p.deckId === 'auto' ? 'Auto deck' : (deck?.name || 'Missing deck'),
        deckRegions: deck?.regions || [],
        isHost: p.id === room.hostId,
        isYou: p.id === clientId,
      };
    });
    const counts = this.teamCounts(room);
    const needed = roomModeMax(room.mode);
    const perTeam = teamMax(room.mode);
    return {
      code: room.code,
      mode: room.mode,
      hostId: room.hostId,
      started: room.started,
      needed,
      maxPlayers: needed,
      canStart: clientId === room.hostId && players.length === needed && counts.A === perTeam && counts.B === perTeam && players.every((p) => p.ready && p.connected),
      counts,
      players,
      spectators: [...room.spectators.values()].map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
      decks: this.store.decks.map((d) => ({
        id: d.id, name: d.name, regions: d.regions, starter: !!d.starter, author: d.author,
        total: d.cards?.reduce((n, c) => n + c.count, 0) || 0,
        summary: this.store.deckSummary(d.cards || []),
        code: d.code,
      })),
      chat: room.chat.slice(-80),
      you: clientId,
    };
  }

  sendLobby(room, clientId) {
    const ws = this.clients.get(clientId);
    if (!ws) return;
    this.send(ws, { type: 'lobby', room: this.lobbyView(room, clientId) });
  }

  broadcastLobby(room) {
    if (this.broadcastFn) {
      // A custom broadcaster can take over (used by tests/embedding).
      this.broadcastFn(room, 'lobby');
      return;
    }
    for (const p of room.players.values()) this.sendLobby(room, p.id);
    for (const s of room.spectators.values()) this.sendLobby(room, s.id);
  }

  sendGame(room, clientId) {
    const ws = this.clients.get(clientId);
    if (!ws || !room.game) return;
    const view = room.game.viewFor(clientId, { revealAll: false });
    this.send(ws, {
      type: 'game',
      room: { code: room.code, mode: room.mode, hostId: room.hostId },
      view,
    });
  }

  broadcastGame(room) {
    if (!room.game) return this.broadcastLobby(room);
    if (this.broadcastFn) {
      this.broadcastFn(room, 'game');
      return;
    }
    for (const p of room.players.values()) {
      if (p.connected) this.sendGame(room, p.id);
    }
    for (const s of room.spectators.values()) {
      if (s.connected) {
        const ws = this.clients.get(s.id);
        if (ws) {
          this.send(ws, { type: 'game', room: { code: room.code, mode: room.mode, hostId: room.hostId }, view: room.game.viewFor(null, { revealAll: false }), spectator: true });
        }
      }
    }
  }

  // ---------------------------------------------------------------- cleanup
  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const connectedPlayers = [...room.players.values()].some((p) => p.connected);
      const connectedSpectators = [...room.spectators.values()].some((s) => s.connected);
      if (!connectedPlayers && !connectedSpectators && now - room.lastActivity > 6 * 60 * 60 * 1000) {
        this.rooms.delete(code);
      }
      for (const [id, p] of room.players) {
        if (!p.connected && now - p.lastSeen > 3 * 60 * 60 * 1000) room.players.delete(id);
      }
    }
  }
}
