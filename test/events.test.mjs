import test from 'node:test';
import assert from 'node:assert/strict';
import { CardDB } from '../server/engine/carddb.js';
import { Game } from '../server/engine/game.js';

function card(id, name, overrides = {}) {
  return {
    id, code: id, name, cost: 1, attack: 1, health: 1, type: 'Unit', supertype: '',
    subtypes: [], regions: ['Demacia'], rarity: 'COMMON', keywords: [], rawKeywords: [],
    text: '', collectible: true, enabled: true, set: 'Set1', spellSpeed: '',
    associatedCardRefs: [], art: null, fullArt: null, ...overrides,
  };
}

const cards = [
  card('E01', 'Order A1'),
  card('E02', 'Order B1'),
  card('E03', 'Order B2'),
  card('E04', 'Order A2'),
  card('E05', 'Death One'),
  card('E06', 'Death Two'),
  card('E07', 'Wipe', { cost: 1, type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'], text: 'Deal 10 to all enemy units.' }),
  card('E08', 'Loop', { cost: 1, attack: 0, health: 1000, text: 'When I survive damage, deal 1 to myself.' }),
  card('E09', 'Self Destruct', { cost: 0, attack: 1, health: 1, text: 'Play: Deal 1 to myself, then log.' }),
  card('E10', 'Filler'),
  card('E11', 'Ordered Pair', { cost: 0, attack: 1, health: 1, text: 'Play: two ordered triggers.' }),
];

const scripts = {
  E01: { status: 'curated', triggers: [{ on: 'roundStart', actions: [{ type: 'log', text: 'ORDER:A1' }] }] },
  E02: { status: 'curated', triggers: [{ on: 'roundStart', actions: [{ type: 'log', text: 'ORDER:B1' }] }] },
  E03: { status: 'curated', triggers: [{ on: 'roundStart', actions: [{ type: 'log', text: 'ORDER:B2' }] }] },
  E04: { status: 'curated', triggers: [{ on: 'roundStart', actions: [{ type: 'log', text: 'ORDER:A2' }] }] },
  E05: { status: 'curated', triggers: [{ on: 'death', actions: [{ type: 'log', text: 'DEATH:ONE' }] }] },
  E06: { status: 'curated', triggers: [{ on: 'death', actions: [{ type: 'log', text: 'DEATH:TWO' }] }] },
  E07: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'damageAll', team: 'enemy', amount: 10 }] }] },
  E08: { status: 'curated', triggers: [{ on: 'surviveDamage', actions: [{ type: 'damage', amount: 1, target: 'self' }] }] },
  E09: {
    status: 'curated',
    triggers: [{
      on: 'play',
      actions: [
        { type: 'damage', amount: 1, target: 'self' },
        { type: 'log', text: 'SHOULD_NOT_RUN' },
      ],
    }],
  },
  E11: {
    status: 'curated',
    triggers: [
      { on: 'play', actions: [{ type: 'log', text: 'PAIR:1' }] },
      { on: 'play', actions: [{ type: 'log', text: 'PAIR:2' }] },
    ],
  },
};

const db = new CardDB({ riotPayload: { cards, globals: { keywords: [], regions: [] } }, scripts, settings: {} });

function newGame(mode = '1v1', players = null) {
  const ps = players || [
    { id: 'p1', name: 'Alice', team: 'A' },
    { id: 'p2', name: 'Bob', team: 'B' },
  ];
  const decks = Object.fromEntries(ps.map((p) => [p.id, Array(30).fill('E10')]));
  const g = new Game({ mode, players: ps, decks, cardDB: db, seed: 42 });
  g.attackTokenTeam = 'A';
  g.teams.A.attackToken = true;
  g.teams.B.attackToken = false;
  g.autoMulligan();
  return g;
}

function orderLogs(g) {
  return g.logs.filter((entry) => entry.type === 'effect' && entry.text.startsWith('ORDER:')).map((entry) => entry.text);
}

function deathLogs(g) {
  return g.logs.filter((entry) => entry.type === 'effect' && entry.text.startsWith('DEATH:')).map((entry) => entry.text);
}

function roundStartEntry(g, cardId, controller) {
  const unit = g.summonUnit(db.get(cardId), controller, { token: true });
  return {
    event: 'roundStart',
    script: db.get(cardId).script,
    source: unit,
    controller,
    opts: { auto: true, eventCtx: { round: 1 } },
  };
}

test('simultaneous triggers resolve active team first, then seat order', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const a = roundStartEntry(g, 'E01', p1);
  const b = roundStartEntry(g, 'E02', p2);

  g.logs.length = 0;
  g.activeTeam = 'A';
  g.emitEvents([b, a]);
  assert.deepEqual(orderLogs(g), ['ORDER:A1', 'ORDER:B1']);
  const activeFirst = g.logs.find((entry) => entry.type === 'event' && entry.text.startsWith('Event order'));
  assert.ok(activeFirst);
  assert.ok(activeFirst.text.includes('roundStart:Alice:Order A1 -> roundStart:Bob:Order B1'));

  g.logs.length = 0;
  g.activeTeam = 'B';
  g.emitEvents([a, b]);
  assert.deepEqual(orderLogs(g), ['ORDER:B1', 'ORDER:A1']);
});

test('beginRound dispatches one sorted round-start batch', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  g.summonUnit(db.get('E02'), p2, { token: true });
  g.summonUnit(db.get('E01'), p1, { token: true });

  g.logs.length = 0;
  g.beginRound(); // Round 2: the attack token and active team move to B.
  assert.equal(g.activeTeam, 'B');
  assert.deepEqual(orderLogs(g), ['ORDER:B1', 'ORDER:A1']);
});

test('2v2 simultaneous triggers use seat order within the active team', () => {
  const ps = [
    { id: 'a1', name: 'A1', team: 'A' },
    { id: 'a2', name: 'A2', team: 'A' },
    { id: 'b1', name: 'B1', team: 'B' },
    { id: 'b2', name: 'B2', team: 'B' },
  ];
  const g = newGame('2v2', ps);
  const entries = [
    roundStartEntry(g, 'E04', g.player('a2')),
    roundStartEntry(g, 'E03', g.player('b2')),
    roundStartEntry(g, 'E01', g.player('a1')),
    roundStartEntry(g, 'E02', g.player('b1')),
  ];

  g.logs.length = 0;
  g.activeTeam = 'B';
  g.emitEvents(entries);
  assert.deepEqual(orderLogs(g), ['ORDER:B1', 'ORDER:B2', 'ORDER:A1', 'ORDER:A2']);
});

test('multiple triggers on one script resolve in declared order', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const iid = g.addCardToHand(p1, 'E11');

  g.logs.length = 0;
  const result = g.playCard('p1', iid, []);
  assert.equal(result.ok, true);
  assert.deepEqual(
    g.logs.filter((entry) => entry.type === 'effect' && entry.text.startsWith('PAIR:')).map((entry) => entry.text),
    ['PAIR:1', 'PAIR:2'],
  );
});

test('simultaneous deaths are batched and ordered by active team, then seat', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const a = g.summonUnit(db.get('E05'), p1, { token: true });
  const b = g.summonUnit(db.get('E06'), p2, { token: true });

  g.logs.length = 0;
  g.activeTeam = 'A';
  g.killUnits([b, a], { reason: 'test' });
  assert.deepEqual(deathLogs(g), ['DEATH:ONE', 'DEATH:TWO']);
  const order = g.logs.find((entry) => entry.type === 'event' && entry.text.startsWith('Event order'));
  assert.ok(order);
  assert.ok(order.text.includes('death:Alice:Death One -> death:Bob:Death Two'));
});

test('a board wipe queues all deaths before any death trigger resolves', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  g.summonUnit(db.get('E05'), p2, { token: true });
  g.summonUnit(db.get('E06'), p2, { token: true });
  const wipe = g.addCardToHand(p1, 'E07');

  g.logs.length = 0;
  const result = g.playCard('p1', wipe, []);
  assert.equal(result.ok, true);
  assert.deepEqual(deathLogs(g), ['DEATH:ONE', 'DEATH:TWO']);
});

test('event storm guard stops an unbounded survive-damage loop', () => {
  const g = newGame();
  const loop = g.summonUnit(db.get('E08'), g.player('p1'), { token: true });
  g.maxEventsPerPump = 20;
  g.logs.length = 0;

  g.damageUnit(loop, 1, null, {});
  assert.ok(g.logs.some((entry) => entry.type === 'error' && entry.text.includes('Event storm guard')));
  assert.equal(g.eventQueue.length, 0);
  assert.equal(g.resolutionStack.length, 0);
  assert.equal(g.pending, null);
  assert.ok(g.health(loop) > 0);
  assert.ok(g.health(loop) < 1000);
});

test('a trigger that kills its source stops its remaining actions', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const iid = g.addCardToHand(p1, 'E09');

  g.logs.length = 0;
  const result = g.playCard('p1', iid, []);
  assert.equal(result.ok, true);
  assert.equal(g.logs.some((entry) => entry.text === 'SHOULD_NOT_RUN'), false);
  assert.ok(g.logs.some((entry) => entry.type === 'event' && entry.text.includes('died during its play trigger; remaining actions skipped')));
  assert.equal(g.teams.A.board.length, 0);
});
