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
  card('T01', 'Recruit', { attack: 1, health: 1 }),
  card('T02', 'Soldier', { cost: 2, attack: 2, health: 2 }),
  card('T03', 'Bruiser', { cost: 3, attack: 3, health: 3 }),
  card('T04', 'Scout', { cost: 1, attack: 2, health: 1, keywords: ['Quick Attack'], rawKeywords: ['QuickStrike'] }),
  card('T05', 'Wall', { cost: 2, attack: 0, health: 5, keywords: ['Tough'], rawKeywords: ['Tough'] }),
  card('T06', 'Tiny', { cost: 1, attack: 1, health: 1, keywords: ['Elusive'], rawKeywords: ['Elusive'] }),
  card('T07', 'Big', { cost: 4, attack: 4, health: 4, keywords: ['Overwhelm'], rawKeywords: ['Overwhelm'] }),
  card('T08', 'Bolt', { cost: 1, type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'], text: 'Deal 2 to an enemy unit.' }),
  card('T09', 'Blessing', { cost: 1, type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'], text: 'Give an ally +1|+1.' }),
  card('T10', 'Last Word', { cost: 1, attack: 1, health: 1, keywords: ['Last Breath'], rawKeywords: ['LastBreath'] }),
  card('T11', 'Poro', { cost: 0, attack: 1, health: 1, collectible: false }),
  card('T12', 'Summoner', { cost: 1, attack: 1, health: 1, text: 'Play: Summon a Poro.' }),
  card('T13', 'Drawer', { cost: 1, attack: 1, health: 1, text: 'Last Breath: Draw 1.' }),
  card('T14', 'Duelist', { cost: 2, attack: 3, health: 2, keywords: ['Challenger'], rawKeywords: ['Challenger'] }),
  card('T15', 'Frost Mage', { cost: 2, attack: 2, health: 2, text: 'Play: Frostbite an enemy.' }),
];

const scripts = {
  T08: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'damage', amount: 2, target: 'enemyUnit' }] }] },
  T09: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'buff', power: 1, health: 1, target: 'allyUnit' }] }] },
  T12: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'summon', name: 'Poro' }] }] },
  T13: { status: 'curated', triggers: [{ on: 'death', actions: [{ type: 'draw', amount: 1 }] }] },
  T15: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'frostbite', target: 'enemyUnit' }] }] },
};

const payload = { cards, globals: { keywords: [], regions: [] } };
const db = new CardDB({ riotPayload: payload, scripts, settings: {} });

function newGame(mode = '1v1', players = null, decks = null) {
  const ps = players || [
    { id: 'p1', name: 'Alice', team: 'A' },
    { id: 'p2', name: 'Bob', team: 'B' },
  ];
  const ds = decks || Object.fromEntries(ps.map((p) => [p.id, Array(30).fill('T01')]));
  const g = new Game({ mode, players: ps, decks: ds, cardDB: db, seed: 42 });
  // Force team A to start so tests are deterministic.
  g.attackTokenTeam = 'A';
  g.teams.A.attackToken = true;
  g.teams.B.attackToken = false;
  g.autoMulligan();
  return g;
}

test('starts with five cards, one mana, and a valid round', () => {
  const g = newGame();
  assert.equal(g.phase, 'playing');
  assert.equal(g.round, 1);
  assert.equal(g.players.get('p1').hand.length, 5);
  assert.equal(g.players.get('p2').hand.length, 5);
  assert.equal(g.teams.A.maxMana, 1);
  assert.equal(g.priorityTeam, 'A');
});

test('playing a unit passes priority and ends the round after both passes', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const unit = p1.hand.find((h) => g.cardDB.get(h.cardId).name === 'Recruit');
  const res = g.playCard('p1', unit.iid, []);
  assert.equal(res.ok, true);
  assert.equal(g.teams.A.board.length, 1);
  assert.equal(g.priorityTeam, 'B');
  g.pass('p2');
  g.pass('p1');
  assert.equal(g.round, 2);
});

test('attack opens blockers, deals nexus damage, then ends the round', () => {
  const g = newGame();
  const p1 = g.player('p1');
  // Put a 2-power attacker directly into play for a deterministic check.
  const attacker = g.summonUnit(db.get('T04'), p1, { token: true });
  g.teams.A.hasAttacked = false;
  g.teams.A.attackToken = true;
  g.priorityTeam = 'A';
  g.phase = 'playing';
  const res = g.attack('p1', [attacker.uid], {});
  assert.equal(res.ok, true);
  assert.equal(g.phase, 'combat');
  g.pass('p2'); // no blockers
  g.pass('p1');
  g.pass('p2');
  assert.equal(g.teams.B.nexus, 18);
  assert.equal(g.round, 2);
});

test('quick attack kills a blocker before it can strike back', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const attacker = g.summonUnit(db.get('T04'), p1, { token: true });
  const blocker = g.summonUnit(db.get('T02'), p2, { token: true });
  g.teams.A.attackToken = true;
  g.teams.A.hasAttacked = false;
  g.priorityTeam = 'A';
  const res = g.attack('p1', [attacker.uid], {});
  assert.equal(res.ok, true);
  g.declareBlockers('p2', { [attacker.uid]: blocker.uid });
  g.pass('p1');
  g.pass('p2');
  // Quick attack 2 damage kills the 2-health Soldier; attacker survives with 1 health.
  assert.equal(blocker.dead, true);
  assert.equal(attacker.dead, false);
  assert.equal(g.health(attacker), 1);
});

test('tough reduces damage by one', () => {
  const g = newGame();
  const p2 = g.player('p2');
  const wall = g.summonUnit(db.get('T05'), p2, { token: true });
  g.damageUnit(wall, 3, null, {});
  assert.equal(g.health(wall), 3); // 5 max, 2 damage after Tough
});

test('barrier negates one damage instance and then breaks', () => {
  const g = newGame();
  const p2 = g.player('p2');
  const wall = g.summonUnit(db.get('T05'), p2, { token: true });
  g.grantStatus(wall, 'barrier');
  g.damageUnit(wall, 3, null, {});
  assert.equal(g.health(wall), 5);
  assert.equal(wall.statuses.barrier, false);
  g.damageUnit(wall, 2, null, {});
  assert.equal(g.health(wall), 4);
});

test('overwhelm sends excess damage to the nexus', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const attacker = g.summonUnit(db.get('T07'), p1, { token: true });
  const blocker = g.summonUnit(db.get('T01'), p2, { token: true });
  g.teams.A.attackToken = true;
  g.teams.A.hasAttacked = false;
  g.priorityTeam = 'A';
  g.attack('p1', [attacker.uid], {});
  g.declareBlockers('p2', { [attacker.uid]: blocker.uid });
  g.pass('p1');
  g.pass('p2');
  assert.equal(blocker.dead, true);
  assert.equal(g.teams.B.nexus, 17); // 4 damage, 1 to kill, 3 overwhelm
});

test('burst spell resolves immediately and can kill a unit', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const target = g.summonUnit(db.get('T01'), p2, { token: true });
  const bolt = p1.hand.find((h) => h.cardId === 'T08') || (() => { const iid = g.addCardToHand(p1, 'T08'); return { iid }; })();
  const res = g.playCard('p1', bolt.iid, [`u:${target.uid}`]);
  assert.equal(res.ok, true);
  assert.equal(target.dead, true);
  assert.equal(g.stack.length, 0);
});

test('targeted play effect requires a target, then resolves it', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const p2 = g.player('p2');
  const target = g.summonUnit(db.get('T01'), p2, { token: true });
  const bolt = p1.hand.find((h) => h.cardId === 'T08') || (() => { const iid = g.addCardToHand(p1, 'T08'); return { iid }; })();
  const missing = g.playCard('p1', bolt.iid, []);
  assert.equal(missing.ok, false);
  assert.ok(missing.needsTargets?.length);
  const res = g.playCard('p1', bolt.iid, [`u:${target.uid}`]);
  assert.equal(res.ok, true);
  assert.equal(target.dead, true);
});

test('last breath draws a card', () => {
  const g = newGame();
  const p2 = g.player('p2');
  const drawer = g.summonUnit(db.get('T13'), p2, { token: true });
  const handBefore = p2.hand.length;
  g.killUnit(drawer, { reason: 'test' });
  assert.equal(p2.hand.length, handBefore + 1);
});

test('play effect summons a token', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const summoner = g.summonUnit(db.get('T12'), p1, { fromHand: true, presetTargets: [] });
  assert.ok(summoner);
  assert.equal(g.teams.A.board.length, 2);
  assert.ok(g.teams.A.board.some((u) => u.name === 'Poro'));
});

test('2v2 shares board/nexus but keeps hands separate', () => {
  const ps = [
    { id: 'a1', name: 'A1', team: 'A' },
    { id: 'a2', name: 'A2', team: 'A' },
    { id: 'b1', name: 'B1', team: 'B' },
    { id: 'b2', name: 'B2', team: 'B' },
  ];
  const g = newGame('2v2', ps, Object.fromEntries(ps.map((p) => [p.id, Array(30).fill('T01')])));
  assert.equal(g.teams.A.nexus, 40);
  assert.equal(g.teams.A.maxMana, 2);
  assert.equal(g.player('a1').hand.length, 5);
  assert.equal(g.player('a2').hand.length, 5);
  const unit = g.player('a1').hand.find((h) => h.cardId === 'T01');
  g.playCard('a1', unit.iid, []);
  assert.equal(g.teams.A.board.length, 1);
  assert.equal(g.teams.A.mana, 1);
  assert.equal(g.priorityTeam, 'B');
});
