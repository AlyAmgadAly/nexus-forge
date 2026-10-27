import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startNexusService } from '../server/service.js';
import { Store } from '../server/store.js';
import { deckToCode, randomDeck } from '../server/decks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data');

class FakeWs {
  constructor(clientId) {
    this.clientId = clientId;
    this.kind = 'ws';
    this.readyState = 1;
    this.roomCode = null;
    this.sent = [];
  }

  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
}

function latest(ws, type) {
  return [...ws.sent].reverse().find((message) => message.type === type) || null;
}

async function post(url, body, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('deck APIs preserve repairable invalid decks, formats, and unknown imports', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-decks-'));
  const service = await startNexusService({
    dataDir: dir,
    seedDir: SEED,
    desktop: true,
    port: 0,
    logger: { log() {}, error() {}, warn() {} },
  });
  t.after(async () => {
    await service.stop();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  const incomplete = await post(`${service.url}/api/decks`, {
    name: 'Repair later', cards: [], regions: [], format: 'Standard',
  });
  assert.equal(incomplete.status, 201);
  assert.equal(incomplete.body.validation.isPlayable, false);
  assert.equal(incomplete.body.validation.status, 'incomplete');
  assert.equal(incomplete.body.deck.format, 'Standard');

  const invalid = await post(`${service.url}/api/decks/${incomplete.body.deck.id}`, {
    cards: [{ cardId: '01DE001', count: 4 }], regions: ['Demacia'], format: 'Eternal',
  }, 'PUT');
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.validation.isPlayable, false);
  assert.match(invalid.body.validation.errors.join(' '), /Too many copies/);

  const loaded = await (await fetch(`${service.url}/api/decks/${incomplete.body.deck.id}`)).json();
  assert.equal(loaded.validation.isPlayable, false);
  assert.equal(loaded.deck.cards[0].count, 4);

  const unknownCode = deckToCode([{ cardId: '99RU001', count: 1 }]);
  const imported = await post(`${service.url}/api/decks/import`, { code: unknownCode, format: 'Eternal' });
  assert.equal(imported.status, 200);
  assert.deepEqual(imported.body.missing, ['99RU001']);
  assert.deepEqual(imported.body.cards, [{ cardId: '99RU001', count: 1 }]);
  assert.match(imported.body.validation.errors.join(' '), /Unknown card/);
  const savedUnknown = await post(`${service.url}/api/decks`, {
    name: 'Missing card repair', cards: imported.body.cards, regions: imported.body.regions,
  });
  assert.equal(savedUnknown.status, 201);
  assert.equal(savedUnknown.body.deck.cards[0].cardId, '99RU001');

  const automatic = await post(`${service.url}/api/decks/auto`, {
    regions: ['Demacia', 'Ionia'], seed: 19, format: 'Standard',
  });
  assert.equal(automatic.status, 200);
  assert.equal(automatic.body.validation.isPlayable, true, automatic.body.validation.errors.join('; '));
  assert.equal(automatic.body.validation.format, 'Standard');

  await service.stop();
  const persisted = await new Store({ dataDir: dir, seedDir: SEED }).init();
  assert.equal(persisted.getDeck(incomplete.body.deck.id).cards[0].count, 4);
  assert.equal(persisted.getDeck(savedUnknown.body.deck.id).cards[0].cardId, '99RU001');
});

test('match launch revalidates saved decks and expands copies into forty physical cards', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-start-'));
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

  const built = randomDeck(service.store.cardDB, service.store.rules);
  const saved = {
    id: 'launch-validation', name: 'Launch validation', cards: built.cards,
    regions: built.regions, format: 'Eternal', starter: false,
  };
  await service.store.saveDeck(saved);

  const host = new FakeWs('host');
  const guest = new FakeWs('guest');
  service.rooms.attach(host, host.clientId);
  service.rooms.attach(guest, guest.clientId);
  service.rooms.createRoom(host, 'Host');
  const code = latest(host, 'roomCreated').code;
  service.rooms.joinRoom(guest, code, 'Guest');
  service.rooms.setDeck(host, { deckId: saved.id });
  service.rooms.setDeck(guest, { deckId: 'auto' });

  const originalCards = saved.cards.map((entry) => ({ ...entry }));
  saved.cards = saved.cards.map((entry) => ({ ...entry }));
  const last = saved.cards.at(-1);
  if (last.count === 1) saved.cards.pop();
  else last.count--;
  service.rooms.setReady(host, true);
  service.rooms.setReady(guest, true);
  service.rooms.start(host);
  const room = service.rooms.rooms.get(code);
  assert.equal(room.game, null);
  assert.match(latest(host, 'error').message, /exactly 40/);

  saved.cards = originalCards;
  service.rooms.start(host);
  assert.ok(room.game);
  for (const player of room.game.players.values()) {
    assert.equal(player.hand.length + player.deck.length, 40);
  }
});
