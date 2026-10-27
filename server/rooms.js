import crypto from 'node:crypto';
import { Game } from './engine/game.js';
import { CardDB } from './engine/carddb.js';
import { randomDeck, validateDeck } from './decks.js';
import { targetSpecsForScript } from './engine/effects.js';
import {
  hashCard, roomManifest, sanitizeContentOffer, sanitizeDeckPayload, sanitizeRoomCatalog,
} from './content.js';
import { RECONNECT_GRACE_MS, ROOM_CODE_ALPHABET } from '../shared/protocol.js';

const MAX_CHAT = 120;
const MAX_NAME = 22;
const RECONNECT_TTL_MS = 6 * 60 * 60 * 1000;

function safeName(name, fallback = 'Player') {
  const clean = String(name || '').replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return clean || fallback;
}

function newRoomCode(rooms) {
  for (let i = 0; i < 200; i++) {
    let code = '';
    for (let j = 0; j < 5; j++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  // Keep five characters even if the generator is exhausted. This fallback is
  // still a valid room code and never leaks into a peer id longer than expected.
  for (let i = 0; i < 50; i++) {
    const code = `R${Date.now().toString(36).toUpperCase()}${i}`.slice(-5);
    if (!rooms.has(code)) return code;
  }
  throw new Error('No room codes are available right now.');
}

function roomModeMax(mode) { return mode === '2v2' ? 4 : 2; }
function teamMax(mode) { return mode === '2v2' ? 2 : 1; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export class RoomManager {
  constructor(store, { send, broadcast } = {}) {
    this.store = store;
    this.rooms = new Map();
    this.clients = new Map();
    this.recentCommands = new Map();
    this.sendFn = send || (() => {});
    this.broadcastFn = broadcast || null;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
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
    if (this.clients.get(ws.clientId) !== ws) {
      // A newer session already owns this identity; do not mark its seat offline.
      ws.roomCode = null;
      return;
    }
    this.clients.delete(ws.clientId);
    const room = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (!room) return;
    const player = room.players.get(ws.clientId);
    if (player) {
      player.connected = false;
      player.lastSeen = Date.now();
      player.disconnectedAt = Date.now();
      this.broadcastLobby(room);
      if (room.started) this.broadcastGame(room);
    }
    const spectator = room.spectators.get(ws.clientId);
    if (spectator) {
      spectator.connected = false;
      spectator.disconnectedAt = Date.now();
      this.broadcastLobby(room);
    }
  }

  send(ws, message) {
    if (!ws || ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(message)); } catch {}
  }

  error(ws, message, extra = {}) {
    this.send(ws, { type: 'error', message, ...extra });
  }

  isDuplicateCommand(clientId, commandId) {
    const now = Date.now();
    let commands = this.recentCommands.get(clientId);
    if (!commands) {
      commands = new Map();
      this.recentCommands.set(clientId, commands);
    }
    for (const [id, at] of commands) {
      if (now - at > 10 * 60 * 1000) commands.delete(id);
    }
    if (commands.has(commandId)) return true;
    commands.set(commandId, now);
    if (commands.size > 80) commands.delete(commands.keys().next().value);
    return false;
  }

  // ---------------------------------------------------------------- rooms
  buildRoomCatalog(room) {
    room.catalogCards = [...room.baseCustomCards, ...room.extraCards]
      .filter((card, index, list) => list.findIndex((entry) => entry.id === card.id) === index);
    room.catalogScripts = { ...room.baseScripts, ...room.extraScripts };
    room.catalogMechanics = [...room.baseMechanics, ...room.extraMechanics];
    room.cardHashes = new Map(room.catalogCards.map((card) => [card.id, hashCard(card)]));
    room.cardDB = new CardDB({
      riotPayload: room.cardsPayload,
      customCards: room.catalogCards,
      scripts: room.catalogScripts,
      settings: room.settingsSnapshot,
      mechanics: room.catalogMechanics,
    });
    room.manifest = roomManifest(room);
    return room.cardDB;
  }

  refreshRoomCatalog(room) {
    room.catalogVersion = (room.catalogVersion || 1) + 1;
    this.buildRoomCatalog(room);
    this.broadcastCatalog(room);
  }

  manifestFor(room) {
    return room.manifest || roomManifest(room);
  }

  newRoom(code, hostId) {
    const room = {
      code,
      hostId,
      mode: '1v1',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      started: false,
      game: null,
      players: new Map(),
      spectators: new Map(),
      chat: [],
      nextTeam: 'A',
      revision: 0,
      contentLocked: false,
      catalogVersion: 1,
      reconnectTokens: new Map(),
      pendingOffers: new Map(),
      cardsPayload: this.store.cardsPayload,
      // Use transfer-safe cards (uploaded art inlined as data URLs) for the
      // immutable room snapshot. Later Card Forge edits cannot change this room.
      baseCustomCards: clone(this.store.transferCards || this.store.customCards || []),
      baseScripts: clone(this.store.scripts || {}),
      baseMechanics: clone(this.store.mechanics || []),
      extraCards: [],
      extraScripts: {},
      extraMechanics: [],
      settingsSnapshot: clone(this.store.settings),
      rules: clone(this.store.rules),
      manifestBase: clone(this.store.contentManifest()),
    };
    room.buildRoom = null;
    this.buildRoomCatalog(room);
    return room;
  }

  createRoom(ws, name) {
    const clientId = ws.clientId;
    const old = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (old) this.leaveRoom(ws, { silent: true });
    const code = newRoomCode(this.rooms);
    const room = this.newRoom(code, clientId);
    const player = {
      id: clientId,
      name: safeName(name, `Player ${this.rooms.size + 1}`),
      team: 'A',
      ready: false,
      deckId: 'auto',
      deckPayload: null,
      pendingDeck: null,
      contentPending: false,
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
    this.touch(room);
    this.broadcastLobby(room);
    return room;
  }

  regenerateRoomCode(ws) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (room.hostId !== ws.clientId) return this.error(ws, 'Only the host can do that.');
    if (room.started) return this.error(ws, 'Cannot change the code after the game starts.');
    if (room.players.size > 1) return this.error(ws, 'Cannot change the code after other players joined.');
    const old = room.code;
    let code = newRoomCode(this.rooms);
    this.rooms.delete(old);
    room.code = code;
    this.rooms.set(code, room);
    ws.roomCode = code;
    this.touch(room);
    this.send(ws, { type: 'roomCodeChanged', code, oldCode: old });
    this.broadcastLobby(room);
    return code;
  }

  issueReconnectToken(room, clientId, role) {
    for (const [token, entry] of room.reconnectTokens) {
      if (entry.clientId === clientId) room.reconnectTokens.delete(token);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    room.reconnectTokens.set(token, {
      clientId,
      role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + RECONNECT_TTL_MS,
    });
    return token;
  }

  joinRoom(ws, codeRaw, name, { asSpectator = false, transport = 'local' } = {}) {
    const code = String(codeRaw || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room not found. Check the invite code.' });
      return null;
    }
    const clientId = ws.clientId;
    const existing = room.players.get(clientId);
    if (existing) {
      existing.connected = true;
      existing.lastSeen = Date.now();
      delete existing.disconnectedAt;
      if (name) existing.name = safeName(name, existing.name);
      ws.roomCode = code;
      this.pushChat(room, 'System', `${existing.name} reconnected.`, 'system');
      const reconnectToken = transport === 'peer' ? this.issueReconnectToken(room, clientId, 'player') : undefined;
      this.send(ws, { type: 'roomJoined', code, playerId: clientId, reconnect: true, reconnectToken });
      this.touch(room);
      this.broadcastLobby(room);
      if (room.started) this.sendGame(room, clientId);
      return room;
    }
    const spectator = room.spectators.get(clientId);
    if (spectator) {
      spectator.connected = true;
      delete spectator.disconnectedAt;
      ws.roomCode = code;
      const reconnectToken = transport === 'peer' ? this.issueReconnectToken(room, clientId, 'spectator') : undefined;
      this.send(ws, { type: 'roomJoined', code, playerId: null, spectator: true, reconnectToken });
      if (room.started) this.sendGameTo(ws, room, { spectator: true });
      else this.broadcastLobby(room);
      return room;
    }
    if (asSpectator || room.players.size >= roomModeMax(room.mode)) {
      if (!room.started && !asSpectator) {
        this.send(ws, { type: 'error', code: 'ROOM_FULL', message: 'This room is full.' });
        return null;
      }
      const spectatorEntry = { id: clientId, name: safeName(name, 'Spectator'), connected: true };
      room.spectators.set(clientId, spectatorEntry);
      ws.roomCode = code;
      const reconnectToken = transport === 'peer' ? this.issueReconnectToken(room, clientId, 'spectator') : undefined;
      this.send(ws, { type: 'roomJoined', code, playerId: null, spectator: true, reconnectToken });
      this.pushChat(room, 'System', `${spectatorEntry.name} is watching.`, 'system');
      this.sendCatalogTo(ws);
      this.touch(room);
      if (room.started) this.sendGameTo(ws, room, { spectator: true });
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
      deckId: 'auto',
      deckPayload: null,
      pendingDeck: null,
      contentPending: false,
      connected: true,
      isHost: false,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    room.players.set(clientId, player);
    ws.roomCode = code;
    const reconnectToken = transport === 'peer' ? this.issueReconnectToken(room, clientId, 'player') : undefined;
    this.pushChat(room, 'System', `${player.name} joined Team ${team}.`, 'system');
    this.send(ws, { type: 'roomJoined', code, playerId: clientId, reconnectToken });
    this.sendCatalogTo(ws);
    this.touch(room);
    this.broadcastLobby(room);
    return room;
  }

  resumePeer(ws, room, token) {
    const entry = room.reconnectTokens.get(String(token || ''));
    if (!entry || entry.expiresAt < Date.now()) return null;
    const clientId = entry.clientId;
    if (entry.role === 'player' && !room.players.has(clientId)) return null;
    if (entry.role === 'spectator' && !room.spectators.has(clientId)) return null;
    room.reconnectTokens.delete(String(token));
    const old = this.clients.get(clientId);
    if (old && old !== ws) {
      this.clients.delete(clientId);
      old.roomCode = null;
      try { old.close(4001, 'Replaced by a newer connection'); } catch {}
    }
    this.attach(ws, clientId);
    ws.roomCode = room.code;
    if (entry.role === 'player') {
      const player = room.players.get(clientId);
      player.connected = true;
      player.lastSeen = Date.now();
      delete player.disconnectedAt;
    } else {
      const spectator = room.spectators.get(clientId);
      spectator.connected = true;
      delete spectator.disconnectedAt;
    }
    const reconnectToken = this.issueReconnectToken(room, clientId, entry.role);
    this.touch(room);
    return { clientId, role: entry.role, token: reconnectToken };
  }

  sendResume(room, resumed) {
    const ws = this.clients.get(resumed.clientId);
    if (!ws) return;
    if (resumed.role === 'player') {
      this.send(ws, { type: 'roomJoined', code: room.code, playerId: resumed.clientId, reconnect: true, reconnectToken: resumed.token });
      // Catalog offers can be approved while a guest is offline, so refresh the
      // snapshot on every resume rather than assuming the old client is current.
      this.sendCatalogTo(ws);
      this.pushChat(room, 'System', `${room.players.get(resumed.clientId)?.name || 'A player'} reconnected.`, 'system');
      this.broadcastLobby(room);
      if (room.started) this.sendGame(room, resumed.clientId);
    } else {
      this.send(ws, { type: 'roomJoined', code: room.code, playerId: null, spectator: true, reconnectToken: resumed.token });
      this.sendCatalogTo(ws);
      if (room.started) this.sendGameTo(ws, room, { spectator: true });
      else this.broadcastLobby(room);
    }
  }

  leaveRoom(ws, { silent = false } = {}) {
    const room = ws.roomCode ? this.rooms.get(ws.roomCode) : null;
    if (!room) return;
    const player = room.players.get(ws.clientId);
    if (player && room.hostId === player.id) {
      this.closeRoom(room, 'host-left');
      if (!silent) this.send(ws, { type: 'leftRoom' });
      return;
    }
    if (player) {
      if (room.started && room.game && room.game.phase !== 'gameover') {
        room.game.surrender(player.id);
      }
      room.players.delete(player.id);
      this.pushChat(room, 'System', `${player.name} left.`, 'system');
      for (const [token, entry] of room.reconnectTokens) {
        if (entry.clientId === player.id) room.reconnectTokens.delete(token);
      }
      room.pendingOffers.delete(player.id);
    }
    const spectator = room.spectators.get(ws.clientId);
    if (spectator) {
      room.spectators.delete(spectator.id);
      for (const [token, entry] of room.reconnectTokens) {
        if (entry.clientId === spectator.id) room.reconnectTokens.delete(token);
      }
    }
    ws.roomCode = null;
    if (room.players.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(room.code);
    } else {
      this.touch(room);
      this.broadcastLobby(room);
      if (room.started) this.broadcastGame(room);
    }
    if (!silent) this.send(ws, { type: 'leftRoom' });
  }

  closeRoom(room, reason = 'host-left') {
    for (const id of [...room.players.keys(), ...room.spectators.keys()]) {
      // The host already gets leftRoom from leaveRoom(); sending roomClosed to
      // the host as well would make the same departure reset twice.
      if (id === room.hostId) continue;
      const conn = this.clients.get(id);
      if (!conn) continue;
      this.send(conn, { type: 'roomClosed', reason });
      conn.roomCode = null;
      if (conn.kind === 'peer') {
        try { conn.close(4007, 'room closed'); } catch {}
      }
    }
    this.rooms.delete(room.code);
    room.reconnectTokens.clear();
    room.pendingOffers.clear();
  }

  closeAllRooms(reason = 'host-left') {
    for (const room of [...this.rooms.values()]) {
      try { this.closeRoom(room, reason); } catch {}
    }
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

  touch(room) {
    room.revision = (room.revision || 0) + 1;
    room.lastActivity = Date.now();
    return room.revision;
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
      const counts = this.teamCounts(room);
      if (p.team === 'A' && counts.A > maxPerTeam) p.team = 'B';
      if (p.team === 'B' && counts.B > maxPerTeam) p.team = 'A';
    }
    room.mode = mode;
    this.pushChat(room, 'System', `Mode set to ${mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel'}.`, 'system');
    this.touch(room);
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
    this.touch(room);
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
    for (const [token, entry] of room.reconnectTokens) {
      if (entry.clientId === playerId) room.reconnectTokens.delete(token);
    }
    room.pendingOffers.delete(playerId);
    const targetWs = this.clients.get(playerId);
    if (targetWs) {
      targetWs.roomCode = null;
      this.send(targetWs, { type: 'kicked' });
      if (targetWs.kind === 'peer') {
        try { targetWs.close(4006, 'kicked'); } catch {}
      }
    }
    this.pushChat(room, 'System', `${player.name} was removed by the host.`, 'system');
    this.touch(room);
    this.broadcastLobby(room);
  }

  setDeck(ws, payload) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'You are spectating.');
    if (room.started || room.contentLocked) return this.error(ws, 'The game has already started.');

    if (payload && typeof payload === 'object' && payload.deck) {
      const clean = sanitizeDeckPayload(payload.deck);
      if (!clean.ok) return this.error(ws, `Deck is not valid: ${clean.errors.join('; ')}`);
      const result = this.validateSubmittedDeck(room, clean.deck);
      if (result.unknown.length) {
        player.pendingDeck = clean.deck;
        player.deckPayload = null;
        player.deckId = 'submitted';
        player.contentPending = true;
        player.ready = false;
        this.touch(room);
        this.broadcastLobby(room);
        return this.error(ws, `This deck uses ${result.unknown.length} card${result.unknown.length === 1 ? '' : 's'} the host does not have. Offer the custom content for host approval.`, {
          code: 'CONTENT_REQUIRED',
          unknownCards: result.unknown,
        });
      }
      if (!result.validation.ok) return this.error(ws, `Deck is not legal in this room: ${result.validation.errors.join('; ')}`);
      this.applySubmittedDeck(player, clean.deck, result.validation);
      player.contentPending = false;
      player.pendingDeck = null;
      this.touch(room);
      this.send(ws, { type: 'deckAccepted', deck: { name: player.deckPayload.name, regions: player.deckPayload.regions } });
      this.broadcastLobby(room);
      return;
    }

    const deckId = payload?.deckId;
    if (ws.kind === 'peer' && deckId !== 'auto') {
      return this.error(ws, 'Submit your deck contents when joining over the internet.');
    }
    if (deckId !== 'auto' && !this.store.getDeck(deckId)) return this.error(ws, 'Deck not found.');
    player.deckId = deckId || 'auto';
    player.deckPayload = null;
    player.pendingDeck = null;
    player.contentPending = false;
    player.ready = false;
    this.touch(room);
    this.broadcastLobby(room);
  }

  validateSubmittedDeck(room, deck) {
    const unknown = [];
    const enableErrors = [];
    for (const entry of deck.cards || []) {
      const card = room.cardDB.get(entry.cardId);
      if (!card) { unknown.push(entry.cardId); continue; }
      if (!card.enabled) enableErrors.push(`${card.name} is disabled in this room's pool`);
    }
    const validation = validateDeck(deck.cards, room.cardDB, room.rules, deck.regions, { format: deck.format });
    if (enableErrors.length) validation.errors.push(...enableErrors);
    validation.isValid = validation.errors.length === 0;
    validation.isPlayable = validation.isValid && validation.totalCards === (room.rules.deckSize ?? 40);
    validation.ok = validation.isPlayable;
    return { validation, unknown };
  }

  applySubmittedDeck(player, deck, validation) {
    player.deckPayload = {
      name: deck.name,
      cards: deck.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count })),
      regions: [...(validation.regions || [])],
      format: validation.format,
    };
    player.deckId = 'submitted';
    player.ready = false;
  }

  offerContent(ws, msg) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'Spectators cannot offer content.');
    if (room.started || room.contentLocked) return this.error(ws, 'Room content is locked.');
    const clean = sanitizeContentOffer(msg);
    if (!clean.ok) return this.error(ws, `Custom content is not valid: ${clean.errors.join('; ')}`);
    const conflicts = [];
    const cards = [];
    for (const card of clean.cards) {
      const existing = room.cardDB.get(card.id);
      if (existing) {
        const hostHash = room.cardHashes.get(card.id) || hashCard(existing);
        if (hostHash === hashCard(card)) continue;
        conflicts.push(card.id);
        continue;
      }
      cards.push(card);
    }
    if (conflicts.length) {
      return this.error(ws, `These custom card ids conflict with the host's definitions: ${conflicts.join(', ')}. Rename them locally and try again.`);
    }
    if (!cards.length) {
      return this.send(ws, { type: 'contentQueued', count: 0, message: 'The host already has matching definitions.' });
    }
    if (room.pendingOffers.size >= 8 && !room.pendingOffers.has(player.id)) {
      return this.error(ws, 'The host has too many pending content offers.');
    }
    const scripts = {};
    for (const card of cards) {
      if (clean.scripts[card.id]) scripts[card.id] = clean.scripts[card.id];
    }
    room.pendingOffers.set(player.id, {
      cards,
      scripts,
      at: Date.now(),
      warnings: clean.warnings,
    });
    player.contentPending = true;
    this.touch(room);
    this.send(ws, { type: 'contentQueued', count: cards.length, message: 'Waiting for the host to approve your custom content.' });
    this.broadcastLobby(room);
  }

  approveContent(ws, playerId) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started || room.contentLocked) return this.error(ws, 'Room content is locked.');
    const offer = room.pendingOffers.get(playerId);
    const player = room.players.get(playerId);
    if (!offer || !player) return this.error(ws, 'No pending content offer from that player.');
    const conflicts = offer.cards.filter((card) => {
      const existing = room.cardDB.get(card.id);
      if (!existing) return false;
      return (room.cardHashes.get(card.id) || hashCard(existing)) !== hashCard(card);
    });
    if (conflicts.length) return this.error(ws, `Cannot approve conflicting cards: ${conflicts.map((card) => card.id).join(', ')}`);
    for (const card of offer.cards) {
      room.extraCards = room.extraCards.filter((entry) => entry.id !== card.id);
      room.extraCards.push(card);
    }
    Object.assign(room.extraScripts, offer.scripts);
    room.pendingOffers.delete(playerId);
    this.refreshRoomCatalog(room);

    let accepted = false;
    if (player.pendingDeck) {
      const result = this.validateSubmittedDeck(room, player.pendingDeck);
      if (result.validation.ok && !result.unknown.length) {
        this.applySubmittedDeck(player, player.pendingDeck, result.validation);
        player.pendingDeck = null;
        player.contentPending = false;
        accepted = true;
      } else {
        this.error(ws, `Approved definitions, but ${player.name}'s deck is still not legal: ${result.validation.errors.join('; ')}`);
      }
    } else {
      player.contentPending = false;
    }
    this.touch(room);
    this.send(player.id ? this.clients.get(player.id) : null, { type: 'contentApproved', count: offer.cards.length, deckAccepted: accepted });
    this.broadcastLobby(room);
  }

  rejectContent(ws, playerId) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    if (!this.requireHost(ws, room)) return;
    if (room.started || room.contentLocked) return this.error(ws, 'Room content is locked.');
    const offer = room.pendingOffers.get(playerId);
    const player = room.players.get(playerId);
    if (!offer || !player) return this.error(ws, 'No pending content offer from that player.');
    room.pendingOffers.delete(playerId);
    player.contentPending = false;
    player.pendingDeck = null;
    this.touch(room);
    this.send(this.clients.get(playerId), { type: 'contentRejected', message: 'The host declined the custom content. Choose a different deck.' });
    this.broadcastLobby(room);
  }

  setReady(ws, ready) {
    const room = this.roomFor(ws);
    if (!room) return this.error(ws, 'Join a room first.');
    const player = room.players.get(ws.clientId);
    if (!player) return this.error(ws, 'You are spectating.');
    if (room.started) return this.error(ws, 'The game has already started.');
    if (ready) {
      if (player.contentPending) return this.error(ws, 'Wait for the host to approve your custom content.');
      if (!player.deckPayload && player.deckId && player.deckId !== 'auto' && !this.store.getDeck(player.deckId)) {
        return this.error(ws, 'Choose a deck before readying up.');
      }
      if (player.pendingDeck) return this.error(ws, 'Choose a legal deck before readying up.');
    }
    player.ready = !!ready;
    this.touch(room);
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
    if (players.some((p) => p.contentPending || p.pendingDeck)) return this.error(ws, 'Resolve pending custom content first.');
    if (room.pendingOffers.size) return this.error(ws, 'Resolve pending custom content offers first.');
    return this.startGame(room);
  }

  startGame(room) {
    const players = [...room.players.values()];
    const decks = {};
    for (const p of players) {
      if (p.deckPayload) {
        const result = this.validateSubmittedDeck(room, p.deckPayload);
        if (!result.validation.ok || result.unknown.length) {
          this.broadcastLobby(room);
          return this.send(this.clients.get(room.hostId), { type: 'error', message: `Deck "${p.deckPayload.name}" is not legal in this room: ${result.validation.errors.join('; ')}` });
        }
        decks[p.id] = p.deckPayload.cards;
        continue;
      }
      const selected = p.deckId && p.deckId !== 'auto' ? this.store.getDeck(p.deckId) : null;
      if (selected) {
        const validation = validateDeck(selected.cards, room.cardDB, room.rules, selected.regions, { format: selected.format });
        if (!validation.ok) {
          this.broadcastLobby(room);
          return this.send(this.clients.get(room.hostId), { type: 'error', message: `Deck "${selected.name}" is not legal in this room: ${validation.errors.join('; ')}` });
        }
        decks[p.id] = selected.cards;
      } else {
        let built = randomDeck(room.cardDB, room.rules);
        let validation = validateDeck(built.cards, room.cardDB, room.rules);
        let attempts = 0;
        while (!validation.ok && attempts++ < 6) {
          built = randomDeck(room.cardDB, room.rules);
          validation = validateDeck(built.cards, room.cardDB, room.rules);
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
      cardDB: room.cardDB,
      settings: { rules: room.rules },
      seed: crypto.randomInt(1, 2 ** 30),
    });
    room.game = game;
    room.started = true;
    room.startedAt = Date.now();
    room.contentLocked = true;
    this.pushChat(room, 'System', `The game begins! ${room.mode === '2v2' ? 'Team Clash' : 'Duel'} — good luck.`, 'system');
    this.touch(room);
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
    this.touch(room);
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
        result = game.attack(player.id, Array.isArray(msg.attackers) ? msg.attackers : [], msg.challengers || {}, msg.supports || {});
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
    this.touch(room);
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
    this.touch(room);
    this.broadcastLobby(room);
    if (room.started) this.broadcastGame(room);
  }

  pushChat(room, from, text, kind = 'chat') {
    room.chat.push({ id: crypto.randomUUID(), from, text, kind, at: Date.now() });
    if (room.chat.length > 120) room.chat.shift();
  }

  // ---------------------------------------------------------------- catalog
  sendCatalogTo(conn) {
    const room = this.roomFor(conn);
    if (!room) return;
    const payload = sanitizeRoomCatalog(room.catalogCards, room.catalogScripts, room.catalogMechanics);
    if (!payload.ok) return this.error(conn, payload.error);
    const isHost = conn.clientId === room.hostId;
    this.send(conn, {
      type: 'roomCatalog',
      roomCode: room.code,
      catalogVersion: room.catalogVersion,
      cards: payload.cards.map((card) => ({
        ...card,
        // Hosts already own their effect scripts. Sending only resolved target
        // metadata to guests keeps the peer surface declarative and minimal.
        targetSpecs: targetSpecsForScript(room.catalogScripts[card.id]?.script),
      })),
      scripts: isHost ? payload.scripts : {},
      mechanics: payload.mechanics,
      manifest: room.manifest,
    });
  }

  broadcastCatalog(room) {
    for (const id of [...room.players.keys(), ...room.spectators.keys()]) {
      const conn = this.clients.get(id);
      if (conn) this.sendCatalogTo(conn);
    }
  }

  // ---------------------------------------------------------------- views
  lobbyView(room, clientId = null) {
    const players = [...room.players.values()].map((p) => {
      const localDeck = !p.deckPayload && p.deckId && p.deckId !== 'auto' ? this.store.getDeck(p.deckId) : null;
      const submitted = p.deckPayload;
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        connected: p.connected,
        deckId: p.deckId,
        deckName: submitted ? submitted.name : (p.deckId === 'auto' ? 'Auto deck' : (localDeck?.name || (p.pendingDeck ? `${p.pendingDeck.name} (awaiting content)` : 'Missing deck'))),
        deckRegions: submitted ? submitted.regions : (localDeck?.regions || []),
        contentPending: !!p.contentPending,
        isHost: p.id === room.hostId,
        isYou: p.id === clientId,
      };
    });
    const counts = this.teamCounts(room);
    const needed = roomModeMax(room.mode);
    const perTeam = teamMax(room.mode);
    const pending = clientId === room.hostId ? [...room.pendingOffers.entries()].map(([playerId, offer]) => ({
      playerId,
      playerName: room.players.get(playerId)?.name || 'Player',
      deckName: room.players.get(playerId)?.pendingDeck?.name || '',
      cards: offer.cards.map((card) => ({ id: card.id, name: card.name, type: card.type })),
      warnings: offer.warnings || [],
    })) : [];
    return {
      code: room.code,
      mode: room.mode,
      hostId: room.hostId,
      started: room.started,
      needed,
      maxPlayers: needed,
      canStart: clientId === room.hostId && players.length === needed && counts.A === perTeam && counts.B === perTeam && players.every((p) => p.ready && p.connected) && !room.pendingOffers.size && players.every((p) => !p.contentPending),
      counts,
      revision: room.revision,
      players,
      spectators: [...room.spectators.values()].map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
      // Guests bring their own deck list; the host's local deck codes are not
      // part of a filtered room view.
      decks: clientId === room.hostId ? this.store.decks.map((d) => ({
        id: d.id, name: d.name, regions: d.regions, starter: !!d.starter, author: d.author,
        total: d.cards?.reduce((n, c) => n + c.count, 0) || 0,
        summary: this.store.deckSummary(d.cards || []),
        code: d.code,
      })) : [],
      content: {
        locked: !!room.contentLocked,
        catalogVersion: room.catalogVersion,
        customCards: room.catalogCards.length,
        rules: room.rules,
        pending,
        yourPending: !!room.pendingOffers.get(clientId),
      },
      chat: room.chat.slice(-80),
      you: clientId,
    };
  }

  sendLobby(room, clientId) {
    const ws = this.clients.get(clientId);
    if (!ws) return;
    this.send(ws, { type: 'lobby', revision: room.revision, room: this.lobbyView(room, clientId) });
  }

  broadcastLobby(room) {
    if (this.broadcastFn) {
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
      revision: room.revision,
      room: { code: room.code, mode: room.mode, hostId: room.hostId },
      view,
    });
  }

  sendGameTo(ws, room, { spectator = false } = {}) {
    if (!ws || !room.game) return;
    const view = room.game.viewFor(spectator ? null : ws.clientId, { revealAll: false });
    this.send(ws, {
      type: 'game',
      revision: room.revision,
      room: { code: room.code, mode: room.mode, hostId: room.hostId },
      view,
      spectator,
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
      if (!s.connected) continue;
      const ws = this.clients.get(s.id);
      if (ws) this.sendGameTo(ws, room, { spectator: true });
    }
  }

  // ---------------------------------------------------------------- cleanup
  cleanup() {
    const now = Date.now();
    for (const [clientId, commands] of this.recentCommands) {
      for (const [id, at] of commands) if (now - at > 10 * 60 * 1000) commands.delete(id);
      if (!commands.size) this.recentCommands.delete(clientId);
    }
    for (const [code, room] of this.rooms) {
      for (const [token, entry] of room.reconnectTokens) {
        if (entry.expiresAt < now) room.reconnectTokens.delete(token);
      }
      for (const [playerId, offer] of room.pendingOffers) {
        if (now - offer.at > 60 * 60 * 1000) {
          room.pendingOffers.delete(playerId);
          const player = room.players.get(playerId);
          if (player) player.contentPending = false;
        }
      }
      const connectedPlayers = [...room.players.values()].some((p) => p.connected);
      const connectedSpectators = [...room.spectators.values()].some((s) => s.connected);
      if (!connectedPlayers && !connectedSpectators && now - room.lastActivity > 6 * 60 * 60 * 1000) {
        this.rooms.delete(code);
      }
      for (const [id, p] of room.players) {
        if (p.connected || id === room.hostId) continue;
        const goneFor = now - (p.disconnectedAt || p.lastSeen || now);
        if (goneFor < RECONNECT_GRACE_MS || p.expired) continue;
        if (room.started && room.game && room.game.phase !== 'gameover') {
          p.expired = true;
          room.game.surrender(p.id);
          this.pushChat(room, 'System', `${p.name} did not reconnect in time and forfeited.`, 'system');
          this.touch(room);
          this.broadcastGame(room);
          continue;
        }
        room.players.delete(id);
        room.pendingOffers.delete(id);
        for (const [token, entry] of room.reconnectTokens) {
          if (entry.clientId === id) room.reconnectTokens.delete(token);
        }
        this.pushChat(room, 'System', `${p.name}'s seat expired after disconnecting.`, 'system');
        this.touch(room);
        this.broadcastLobby(room);
      }
      for (const [id, s] of room.spectators) {
        if (s.connected) continue;
        const goneFor = now - (s.disconnectedAt || now);
        if (goneFor < RECONNECT_GRACE_MS) continue;
        room.spectators.delete(id);
        for (const [token, entry] of room.reconnectTokens) {
          if (entry.clientId === id) room.reconnectTokens.delete(token);
        }
        this.touch(room);
        this.broadcastLobby(room);
      }
    }
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.rooms.clear();
    this.clients.clear();
    this.recentCommands.clear();
  }
}
