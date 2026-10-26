import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.js';
import { RoomManager } from '../server/rooms.js';
import { PeerHub } from '../server/peerhub.js';
import { dispatchClientMessage } from '../server/dispatch.js';
import { startNexusService } from '../server/service.js';
import { APP_VERSION, PROTOCOL_VERSION } from '../shared/protocol.js';
import { randomDeck } from '../server/decks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data');

class FakeWs {
  constructor(clientId) {
    this.clientId = clientId;
    this.kind = 'ws';
    this.readyState = 1;
    this.roomCode = null;
    this.sent = [];
    this.closed = false;
  }

  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.closed = true; }
}

function latest(ws, type) {
  for (let i = ws.sent.length - 1; i >= 0; i -= 1) {
    if (ws.sent[i].type === type) return ws.sent[i];
  }
  return null;
}

function outbound(deliver, sessionId) {
  return deliver
    .filter((entry) => entry.channel === 'nexus:peer-send' && entry.sessionId === sessionId)
    .map((entry) => JSON.parse(entry.data));
}

function latestPeer(deliver, sessionId, type) {
  const messages = outbound(deliver, sessionId);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].type === type) return messages[i];
  }
  return null;
}

async function makeHarness(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-mp-'));
  const store = await new Store({ dataDir: dir, seedDir: SEED }).init();
  const rooms = new RoomManager(store);
  const hub = new PeerHub({ store, rooms });
  const deliver = [];
  hub.setRendererSend((channel, payload) => deliver.push({ channel, ...payload }));
  t.after(async () => {
    hub.dispose();
    rooms.dispose();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  return { dir, store, rooms, hub, deliver };
}

function peerHello(hub, sessionId, code, manifest, extra = {}) {
  return hub.message(sessionId, JSON.stringify({
    type: 'peerHello',
    protocol: PROTOCOL_VERSION,
    appVersion: APP_VERSION,
    code,
    manifest,
    ...extra,
  }));
}

function peerSay(hub, sessionId, message) {
  return hub.message(sessionId, JSON.stringify(message));
}

test('peer rooms: filtered catalog, host-only actions, approval, reconnect, and host close', async (t) => {
  const { store, rooms, hub, deliver } = await makeHarness(t);
  const manifest = store.contentManifest();

  const host = new FakeWs('host-1');
  rooms.attach(host, 'host-1');
  dispatchClientMessage({ conn: host, msg: { type: 'create', name: 'Host' }, rooms });
  const created = latest(host, 'roomCreated');
  assert.ok(created);
  assert.match(created.code, /^[A-Z2-9]{5}$/);
  const code = created.code;
  assert.ok((latest(host, 'lobby')?.room?.decks || []).length > 0);

  // Host catalog includes scripts for the host's own engine; guests must not
  // receive effect scripts, only resolved target metadata on the cards.
  rooms.sendCatalogTo(host);
  const hostCatalog = latest(host, 'roomCatalog');
  assert.equal(typeof hostCatalog.scripts, 'object');
  assert.equal(typeof hostCatalog.manifest, 'object');

  const guestSession = 'session-guest-0001';
  assert.equal(hub.open({ sessionId: guestSession, remotePeerId: 'remote-guest' }).ok, true);
  const hello = peerHello(hub, guestSession, code, manifest);
  assert.equal(hello.resumed, false);
  const guestWelcome = latestPeer(deliver, guestSession, 'peerWelcome');
  assert.ok(guestWelcome);
  const guestId = guestWelcome.clientId;

  const joinCommand = 'cmd-join-0001';
  peerSay(hub, guestSession, { type: 'join', code, name: 'Guest', commandId: joinCommand });
  const guestJoined = latestPeer(deliver, guestSession, 'roomJoined');
  assert.ok(guestJoined);
  const resumeToken = guestJoined.reconnectToken;
  assert.ok(resumeToken);
  assert.equal(guestJoined.playerId, guestId);

  const guestCatalog = latestPeer(deliver, guestSession, 'roomCatalog');
  assert.deepEqual(guestCatalog.scripts, {});
  assert.equal(typeof guestCatalog.manifest, 'object');
  const guestLobby = latestPeer(deliver, guestSession, 'lobby');
  assert.equal(guestLobby.room.hostId, 'host-1');
  assert.equal(guestLobby.room.you, guestId);
  assert.deepEqual(guestLobby.room.decks, []);
  assert.ok(guestLobby.room.players.find((player) => player.isYou));

  // Duplicate peer commands are acknowledged but not applied twice.
  const beforeJoins = outbound(deliver, guestSession).filter((msg) => msg.type === 'roomJoined').length;
  const duplicate = peerSay(hub, guestSession, { type: 'join', code, name: 'Guest', commandId: joinCommand });
  assert.equal(duplicate.duplicate, true);
  assert.equal(outbound(deliver, guestSession).filter((msg) => msg.type === 'roomJoined').length, beforeJoins);

  // Guests cannot use host-only room controls over the peer transport.
  const kickAttempt = peerSay(hub, guestSession, { type: 'kick', playerId: guestId, commandId: 'cmd-kick-0001' });
  assert.equal(kickAttempt.ok, false);
  assert.match(latestPeer(deliver, guestSession, 'error').message, /Only the host/i);
  assert.ok(rooms.rooms.get(code).players.has(guestId));

  // A guest deck that uses a card the host lacks must be offered and approved.
  const room = rooms.rooms.get(code);
  const built = randomDeck(room.cardDB, room.rules);
  const entries = built.cards.map((entry) => ({ ...entry }));
  const swap = entries
    .map((entry, index) => ({ entry, index, card: room.cardDB.get(entry.cardId) }))
    .find(({ card }) => card?.type === 'Unit' && card.collectible && (card.regions || []).some((region) => built.regions.includes(region)));
  assert.ok(swap, 'expected a deck unit in the built deck regions');
  const customId = 'TEST_OFFER_1';
  const region = swap.card.regions.find((value) => built.regions.includes(value));
  if (swap.entry.count > 1) entries.splice(swap.index + 1, 0, { cardId: swap.entry.cardId, count: swap.entry.count - 1 });
  entries[swap.index] = { cardId: customId, count: 1 };
  const submittedDeck = { name: 'Offering Test', cards: entries, regions: built.regions };

  peerSay(hub, guestSession, { type: 'setDeck', deck: submittedDeck, commandId: 'cmd-deck-0001' });
  const contentRequired = latestPeer(deliver, guestSession, 'error');
  assert.equal(contentRequired.code, 'CONTENT_REQUIRED');
  assert.deepEqual(contentRequired.unknownCards, [customId]);
  let guestLobbyAfterDeck = latestPeer(deliver, guestSession, 'lobby');
  assert.equal(guestLobbyAfterDeck.room.players.find((p) => p.id === guestId).contentPending, true);

  const customCard = {
    id: customId,
    name: 'Test Offering',
    type: 'Unit',
    cost: 1,
    attack: 1,
    health: 1,
    regions: [region],
    rarity: 'COMMON',
    text: 'A card offered by a guest.',
    collectible: true,
    enabled: true,
  };
  peerSay(hub, guestSession, {
    type: 'offerContent',
    cards: [customCard],
    scripts: { [customId]: { script: { triggers: [] }, status: 'custom' } },
    commandId: 'cmd-offer-0001',
  });
  assert.equal(latestPeer(deliver, guestSession, 'contentQueued').count, 1);

  let hostLobby = latest(host, 'lobby');
  assert.equal(hostLobby.room.content.pending.length, 1);
  assert.equal(hostLobby.room.content.pending[0].playerId, guestId);
  assert.equal(hostLobby.room.content.pending[0].cards[0].id, customId);

  dispatchClientMessage({ conn: host, msg: { type: 'approveContent', playerId: guestId }, rooms });
  const approved = latestPeer(deliver, guestSession, 'contentApproved');
  assert.equal(approved.deckAccepted, true);
  hostLobby = latest(host, 'lobby');
  assert.equal(hostLobby.room.content.pending.length, 0);
  guestLobbyAfterDeck = latestPeer(deliver, guestSession, 'lobby');
  const approvedPlayer = guestLobbyAfterDeck.room.players.find((p) => p.id === guestId);
  assert.equal(approvedPlayer.contentPending, false);
  assert.equal(approvedPlayer.deckName, 'Offering Test');
  assert.ok(approvedPlayer.deckRegions.includes(region));

  const guestCatalogAfter = latestPeer(deliver, guestSession, 'roomCatalog');
  assert.ok(guestCatalogAfter.catalogVersion > guestCatalog.catalogVersion);
  assert.ok(guestCatalogAfter.cards.some((card) => card.id === customId));
  assert.deepEqual(guestCatalogAfter.scripts, {});
  const hostCatalogAfter = latest(host, 'roomCatalog');
  assert.deepEqual(hostCatalogAfter.scripts[customId].script, { triggers: [] });

  // Both players ready and the host begins the match.
  peerSay(hub, guestSession, { type: 'ready', ready: true, commandId: 'cmd-ready-001' });
  dispatchClientMessage({ conn: host, msg: { type: 'ready', ready: true }, rooms });
  dispatchClientMessage({ conn: host, msg: { type: 'start' }, rooms });
  const guestGame = latestPeer(deliver, guestSession, 'game');
  const hostGame = latest(host, 'game');
  assert.ok(guestGame?.view?.you);
  assert.ok(hostGame?.view?.you);
  assert.ok(guestGame.view.you.hand.length > 0);
  const enemyTeam = guestGame.view.you.team === 'A' ? 'B' : 'A';
  for (const player of guestGame.view.teams[enemyTeam].players) {
    for (const card of player.hand) {
      assert.equal(card.iid, null);
      assert.equal(card.hidden, true);
      assert.equal(card.name, undefined);
    }
  }
  for (const player of hostGame.view.teams[guestGame.view.you.team].players) {
    if (player.id === 'host-1') continue;
    for (const card of player.hand) assert.equal(card.iid, null);
  }

  // Data channel loss marks the seat disconnected; a single-use token restores
  // the same identity and sends a fresh catalog plus the live game view.
  hub.close(guestSession);
  hostLobby = latest(host, 'lobby');
  assert.equal(hostLobby.room.players.find((p) => p.id === guestId).connected, false);

  const resumeSession = 'session-guest-0002';
  hub.open({ sessionId: resumeSession, remotePeerId: 'remote-guest-2' });
  const resumed = peerHello(hub, resumeSession, code, manifest, { resumeToken });
  assert.equal(resumed.resumed, true);
  const resumedWelcome = latestPeer(deliver, resumeSession, 'peerWelcome');
  assert.equal(resumedWelcome.resume, true);
  assert.equal(resumedWelcome.clientId, guestId);
  const resumedJoin = latestPeer(deliver, resumeSession, 'roomJoined');
  assert.equal(resumedJoin.reconnect, true);
  assert.ok(resumedJoin.reconnectToken);
  assert.notEqual(resumedJoin.reconnectToken, resumeToken);
  assert.ok(latestPeer(deliver, resumeSession, 'roomCatalog'));
  assert.ok(latestPeer(deliver, resumeSession, 'game'));
  hostLobby = latest(host, 'lobby');
  assert.equal(hostLobby.room.players.find((p) => p.id === guestId).connected, true);

  // The old token is consumed and cannot take over the seat again.
  const replaySession = 'session-guest-0003';
  hub.open({ sessionId: replaySession, remotePeerId: 'remote-guest-3' });
  const replay = peerHello(hub, replaySession, code, manifest, { resumeToken });
  assert.equal(replay.ok, false);
  assert.equal(latestPeer(deliver, replaySession, 'peerError').code, 'RESUME_FAILED');

  // Host departure closes the room for guests without sending a duplicate
  // roomClosed to the host (the host gets its own leftRoom message).
  dispatchClientMessage({ conn: host, msg: { type: 'leave' }, rooms });
  const closed = latestPeer(deliver, resumeSession, 'roomClosed');
  assert.equal(closed.reason, 'host-left');
  assert.equal(latest(host, 'roomClosed'), null);
  assert.ok(latest(host, 'leftRoom'));
  assert.equal(rooms.rooms.has(code), false);
});

test('desktop service binds loopback, serves shared modules, and stops cleanly', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-svc-'));
  const service = await startNexusService({
    dataDir: dir,
    seedDir: SEED,
    desktop: true,
    port: 0,
    logger: { log() {}, error() {}, warn() {} },
  });
  t.after(async () => {
    try { await service.stop(); } catch {}
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const health = await (await fetch(`${service.url}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.desktop, true);
  assert.equal(health.protocol, PROTOCOL_VERSION);
  const meta = await (await fetch(`${service.url}/api/meta`)).json();
  assert.equal(meta.contentManifest.protocol, PROTOCOL_VERSION);
  const shared = await fetch(`${service.url}/shared/protocol.js`);
  assert.equal(shared.status, 200);
  assert.match(shared.headers.get('content-type') || '', /javascript/);

  // A Card Forge card uses an arbitrary id, so the deck must still save even
  // though Riot deck-code encoding cannot represent it.
  const adminHeaders = { 'content-type': 'application/json', 'x-admin-token': service.store.adminToken };
  const custom = await fetch(`${service.url}/api/admin/cards`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 'C343DC2', name: 'Saved Custom', type: 'Unit', cost: 1, attack: 1, health: 1, regions: ['Runeterra'],
    }),
  });
  assert.equal(custom.status, 201);
  const auto = await (await fetch(`${service.url}/api/decks/auto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ regions: ['Demacia', 'Ionia'], seed: 11 }),
  })).json();
  const cards = auto.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count }));
  const first = cards[0];
  if (first.count > 1) {
    first.count -= 1;
    cards.push({ cardId: 'C343DC2', count: 1 });
  } else {
    first.cardId = 'C343DC2';
  }
  const savedDeck = await fetch(`${service.url}/api/decks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Custom Deck', cards }),
  });
  assert.equal(savedDeck.status, 201);
  const savedBody = await savedDeck.json();
  assert.ok(savedBody.deck.cards.some((entry) => entry.cardId === 'C343DC2'));
  assert.equal(savedBody.deck.code, '');
  const exported = await (await fetch(`${service.url}/api/content/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cardIds: ['C343DC2'] }),
  })).json();
  assert.equal(exported.cards[0].id, 'C343DC2');

  const port = service.port;
  await service.stop();
  let closed = false;
  try { await fetch(`http://127.0.0.1:${port}/api/health`); } catch { closed = true; }
  assert.equal(closed, true);
});
