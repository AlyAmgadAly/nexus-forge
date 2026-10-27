import test from 'node:test';
import assert from 'node:assert/strict';
import { CardDB } from '../server/engine/carddb.js';
import { Game } from '../server/engine/game.js';

function card(id, name, overrides = {}) {
  return {
    id, code: id, name, cost: 0, attack: 1, health: 1, type: 'Unit', supertype: '',
    subtypes: [], regions: ['Demacia'], rarity: 'COMMON', keywords: [], rawKeywords: [],
    text: '', collectible: true, enabled: true, set: 'Set1', spellSpeed: '',
    associatedCardRefs: [], art: null, fullArt: null, ...overrides,
  };
}

const cards = [
  card('E01', 'Damage Watcher', { attack: 0, health: 10 }),
  card('E02', 'Nexus Watcher', { attack: 0, health: 10 }),
  card('E03', 'Heal Watcher', { attack: 0, health: 10 }),
  card('E04', 'Discard Card', { attack: 0, health: 1 }),
  card('E05', 'Play Watcher', { attack: 0, health: 10 }),
  card('E06', 'New Spell Watcher', { attack: 0, health: 10 }),
  card('E07', 'Old Spell Watcher', { attack: 0, health: 10 }),
  card('E08', 'Block Attacker', { attack: 1, health: 3 }),
  card('E09', 'Block Blocker', { attack: 1, health: 3 }),
  card('E10', 'Equip Watcher', { attack: 0, health: 10 }),
  card('E11', 'Countdown Landmark', {
    type: 'Landmark', attack: 0, health: 1, keywords: ['Countdown'], rawKeywords: ['Countdown'],
  }),
  card('E12', 'Test Spell', {
    type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'],
    text: 'Burst test spell.',
  }),
  card('E13', 'Test Equipment', { type: 'Equipment', attack: 0, health: 0 }),
  card('E14', 'Played Unit', { attack: 1, health: 1 }),
  card('E15', 'Damage Target', { attack: 0, health: 3 }),
  card('E16', 'Filler', { attack: 1, health: 1, cost: 1 }),
  card('E17', 'Ally Death Watcher', { attack: 0, health: 10 }),
  card('E18', 'Recall Unit', { attack: 1, health: 1 }),
  card('E19', 'Recall Watcher', { attack: 0, health: 10 }),
  card('E20', 'Barrier Watcher', { attack: 0, health: 10 }),
  card('E21', 'Enemy Barrier Watcher', { attack: 0, health: 10 }),
  card('E22', 'Persistent Unit', { attack: 0, health: 1 }),
  card('E23', 'Fragile Unit', { attack: 0, health: 1 }),
];

const scripts = {
  E01: { status: 'curated', triggers: [{ on: 'damageUnit', actions: [{ type: 'log', text: 'EVENT:DAMAGE_UNIT' }] }] },
  E02: { status: 'curated', triggers: [{ on: 'damageNexus', actions: [{ type: 'log', text: 'EVENT:DAMAGE_NEXUS' }] }] },
  E03: { status: 'curated', triggers: [{ on: 'heal', actions: [{ type: 'log', text: 'EVENT:HEAL' }] }] },
  E04: { status: 'curated', triggers: [{ on: 'discard', actions: [{ type: 'log', text: 'EVENT:DISCARD' }] }] },
  E05: { status: 'curated', triggers: [{ on: 'playCard', actions: [{ type: 'log', text: 'EVENT:PLAY_CARD' }] }] },
  E06: { status: 'curated', triggers: [{ on: 'spellCast', actions: [{ type: 'log', text: 'EVENT:SPELL_CAST' }] }] },
  E07: { status: 'curated', triggers: [{ on: 'castSpell', actions: [{ type: 'log', text: 'EVENT:CAST_SPELL_ALIAS' }] }] },
  E08: { status: 'curated', triggers: [{ on: 'block', actions: [{ type: 'log', text: 'EVENT:BLOCK:ATTACKER' }] }] },
  E09: { status: 'curated', triggers: [{ on: 'block', actions: [{ type: 'log', text: 'EVENT:BLOCK:BLOCKER' }] }] },
  E10: { status: 'curated', triggers: [{ on: 'equip', actions: [{ type: 'log', text: 'EVENT:EQUIP' }] }] },
  E11: { status: 'curated', triggers: [{ on: 'countdown', actions: [{ type: 'log', text: 'EVENT:COUNTDOWN' }] }] },
  E13: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'log', text: 'EVENT:EQUIP_PLAY' }] }] },
  E17: { status: 'curated', triggers: [{ on: 'allyDeath', actions: [{ type: 'log', text: 'EVENT:ALLY_DEATH' }] }] },
  E18: { status: 'curated', triggers: [{ on: 'recall', actions: [{ type: 'log', text: 'EVENT:RECALL' }] }] },
  E19: { status: 'curated', triggers: [{ on: 'recall', actions: [{ type: 'log', text: 'EVENT:RECALL_WATCHER' }] }] },
  E20: { status: 'curated', triggers: [{ on: 'barrier', actions: [{ type: 'log', text: 'EVENT:BARRIER:ALLY' }] }] },
  E21: { status: 'curated', triggers: [{ on: 'barrier', actions: [{ type: 'log', text: 'EVENT:BARRIER:ENEMY' }] }] },
  E22: { status: 'curated', triggers: [{ on: 'summon', continueOnSourceDeath: true, actions: [{ type: 'kill', target: 'self' }, { type: 'log', text: 'EVENT:CONTINUE' }] }] },
  E23: { status: 'curated', triggers: [{ on: 'summon', actions: [{ type: 'kill', target: 'self' }, { type: 'log', text: 'EVENT:CONTINUE' }] }] },
};

const db = new CardDB({
  riotPayload: { cards, globals: { keywords: [], regions: [] } },
  scripts,
  settings: {},
});

function newGame() {
  const players = [
    { id: 'p1', name: 'Alice', team: 'A' },
    { id: 'p2', name: 'Bob', team: 'B' },
  ];
  const decks = Object.fromEntries(players.map((p) => [p.id, Array(30).fill('E16')]));
  const g = new Game({ mode: '1v1', players, decks, cardDB: db, seed: 42 });
  g.attackTokenTeam = 'A';
  g.teams.A.attackToken = true;
  g.teams.B.attackToken = false;
  g.autoMulligan();
  return g;
}

function summon(g, id, playerId) {
  const player = g.player(playerId);
  return g.summonUnit(g.cardDB.get(id), player, { token: true });
}

function logs(g) {
  return g.logs.map((entry) => entry.text);
}

function clearLogs(g) {
  g.logs.length = 0;
}

function captureContexts(g) {
  const captured = [];
  const original = g.effects.execute.bind(g.effects);
  g.effects.execute = (action, res, path) => {
    captured.push({ action, ctx: res.ctx });
    return original(action, res, path);
  };
  return captured;
}

test('damageUnit dispatches before the death watcher for a lethal hit', () => {
  const g = newGame();
  summon(g, 'E01', 'p1');
  summon(g, 'E17', 'p1');
  const source = summon(g, 'E16', 'p1');
  const target = summon(g, 'E15', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  g.damageUnit(target, 3, source, {});
  assert.equal(target.dead, true);
  const order = logs(g);
  assert.ok(order.includes('EVENT:DAMAGE_UNIT'));
  assert.ok(order.includes('EVENT:ALLY_DEATH'));
  assert.ok(order.indexOf('EVENT:DAMAGE_UNIT') < order.indexOf('EVENT:ALLY_DEATH'));
  const ctx = captured.find((entry) => entry.ctx.event === 'damageUnit').ctx;
  assert.equal(ctx.amount, 3);
  assert.equal(ctx.lethal, true);
  assert.equal(ctx.eventSource, source);
  assert.equal(ctx.damaged, target);
});

test('damageUnit dispatches for non-lethal damage too', () => {
  const g = newGame();
  summon(g, 'E01', 'p1');
  const source = summon(g, 'E16', 'p1');
  const target = summon(g, 'E15', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  g.damageUnit(target, 1, source, {});
  assert.equal(target.dead, false);
  assert.ok(logs(g).includes('EVENT:DAMAGE_UNIT'));
  const ctx = captured.find((entry) => entry.ctx.event === 'damageUnit').ctx;
  assert.equal(ctx.amount, 1);
  assert.equal(ctx.lethal, false);
});

test('damageNexus dispatches the damaged Nexus and amount', () => {
  const g = newGame();
  summon(g, 'E02', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  g.damageNexus('B', 2, null, {});
  assert.ok(logs(g).includes('EVENT:DAMAGE_NEXUS'));
  const ctx = captured.find((entry) => entry.ctx.event === 'damageNexus').ctx;
  assert.equal(ctx.nexus, 'B');
  assert.equal(ctx.amount, 2);
});

test('heal dispatches only when healing actually restores damage', () => {
  const g = newGame();
  summon(g, 'E03', 'p1');
  const source = summon(g, 'E16', 'p1');
  const target = summon(g, 'E15', 'p1');
  g.damageUnit(target, 1, null, {});
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.healUnit(target, 1, source), 1);
  assert.ok(logs(g).includes('EVENT:HEAL'));
  const ctx = captured.find((entry) => entry.ctx.event === 'heal').ctx;
  assert.equal(ctx.amount, 1);
  assert.equal(ctx.healed, target);
  assert.equal(ctx.eventSource, source);
  clearLogs(g);
  assert.equal(g.healUnit(target, 1, source), 0);
  assert.equal(logs(g).includes('EVENT:HEAL'), false);
});

test('heal dispatches when a Nexus is healed', () => {
  const g = newGame();
  summon(g, 'E03', 'p1');
  g.damageNexus('A', 2, null, {});
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.healNexus('A', 1, null), 1);
  assert.ok(logs(g).includes('EVENT:HEAL'));
  const ctx = captured.find((entry) => entry.ctx.event === 'heal').ctx;
  assert.equal(ctx.nexus, 'A');
  assert.equal(ctx.amount, 1);
});

test('discard dispatches the discarded card trigger with reason and random context', () => {
  const g = newGame();
  const p1 = g.player('p1');
  p1.hand = [{ iid: 'test-discard', cardId: 'E04' }];
  clearLogs(g);
  const captured = captureContexts(g);
  g.discardCards(p1, 1, { random: false, reason: 'test' });
  assert.deepEqual(p1.discard, ['E04']);
  assert.ok(logs(g).includes('EVENT:DISCARD'));
  const ctx = captured.find((entry) => entry.ctx.event === 'discard').ctx;
  assert.equal(ctx.card.id, 'E04');
  assert.equal(ctx.player, p1);
  assert.equal(ctx.reason, 'test');
  assert.equal(ctx.random, false);
  assert.equal(ctx.source.uid, null);
  assert.equal(ctx.source.handCard, true);
});

test('playCard fires for units but not spells', () => {
  const g = newGame();
  const p1 = g.player('p1');
  summon(g, 'E05', 'p1');
  const unitIid = g.addCardToHand(p1, 'E14');
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.playCard('p1', unitIid, []).ok, true);
  assert.ok(logs(g).includes('EVENT:PLAY_CARD'));
  const ctx = captured.find((entry) => entry.ctx.event === 'playCard').ctx;
  assert.equal(ctx.card.id, 'E14');
  assert.equal(ctx.played.cardId, 'E14');
  assert.equal(ctx.player, p1);

  const spellIid = g.addCardToHand(p1, 'E12');
  g.priorityTeam = 'A';
  clearLogs(g);
  captured.length = 0;
  assert.equal(g.playCard('p1', spellIid, []).ok, true);
  assert.equal(logs(g).includes('EVENT:PLAY_CARD'), false);
});

test('spellCast is canonical and castSpell remains a working alias', () => {
  const g = newGame();
  const p1 = g.player('p1');
  summon(g, 'E06', 'p1');
  summon(g, 'E07', 'p1');
  const spellIid = g.addCardToHand(p1, 'E12');
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.playCard('p1', spellIid, []).ok, true);
  assert.ok(logs(g).includes('EVENT:SPELL_CAST'));
  assert.ok(logs(g).includes('EVENT:CAST_SPELL_ALIAS'));
  const ctx = captured.find((entry) => entry.ctx.event === 'spellCast').ctx;
  assert.equal(ctx.spell.id, 'E12');
  assert.equal(ctx.caster, p1);
});

test('block dispatches once to the attacker and once to the blocker', () => {
  const g = newGame();
  const attacker = summon(g, 'E08', 'p1');
  const blocker = summon(g, 'E09', 'p2');
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.attack('p1', [attacker.uid]).ok, true);
  assert.equal(g.declareBlockers('p2', { [attacker.uid]: blocker.uid }).ok, true);
  assert.ok(logs(g).includes('EVENT:BLOCK:ATTACKER'));
  assert.ok(logs(g).includes('EVENT:BLOCK:BLOCKER'));
  assert.equal(captured.length, 2);
  for (const entry of captured) {
    assert.equal(entry.ctx.event, 'block');
    assert.equal(entry.ctx.attacker, attacker);
    assert.equal(entry.ctx.blocker, blocker);
  }
});

test('equip dispatches when an equipment card is attached', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const watcher = summon(g, 'E10', 'p1');
  summon(g, 'E05', 'p1');
  const equipmentIid = g.addCardToHand(p1, 'E13');
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.playCard('p1', equipmentIid, [`u:${watcher.uid}`]).ok, true);
  assert.equal(watcher.equipment.length, 1);
  assert.ok(logs(g).includes('EVENT:EQUIP'));
  assert.ok(logs(g).includes('EVENT:PLAY_CARD'));
  assert.ok(logs(g).includes('EVENT:EQUIP_PLAY'));
  const equipCtx = captured.find((entry) => entry.ctx.event === 'equip').ctx;
  assert.equal(equipCtx.equipped, watcher);
  assert.equal(equipCtx.equipment.id, 'E13');
  assert.equal(equipCtx.player, p1);
  const playCtx = captured.find((entry) => entry.ctx.event === 'playCard').ctx;
  assert.equal(playCtx.card.id, 'E13');
  assert.equal(playCtx.equipped, watcher);
});

test('countdown dispatches before a zero-countdown landmark is destroyed', () => {
  const g = newGame();
  const landmark = summon(g, 'E11', 'p1');
  landmark.countdown = 1;
  clearLogs(g);
  const captured = captureContexts(g);
  g.beginRound();
  assert.ok(logs(g).includes('EVENT:COUNTDOWN'));
  assert.equal(landmark.dead, true);
  const ctx = captured.find((entry) => entry.ctx.event === 'countdown').ctx;
  assert.equal(ctx.landmark, landmark);
  assert.equal(ctx.countdown, 0);
  assert.equal(ctx.destroyed, true);
});

test('recall dispatches to the recalled unit and allied watchers', () => {
  const g = newGame();
  const recalled = summon(g, 'E18', 'p1');
  summon(g, 'E19', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  g.recallUnit(recalled);
  assert.equal(recalled.dead, true);
  assert.ok(logs(g).includes('EVENT:RECALL'));
  assert.ok(logs(g).includes('EVENT:RECALL_WATCHER'));
  const ctx = captured.find((entry) => entry.ctx.event === 'recall').ctx;
  assert.equal(ctx.recalled, recalled);
  assert.equal(ctx.player, g.player('p1'));
});

test('barrier dispatches to allied watchers but not enemy watchers', () => {
  const g = newGame();
  summon(g, 'E20', 'p1');
  summon(g, 'E21', 'p2');
  const target = summon(g, 'E16', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  g.grantStatus(target, 'barrier');
  assert.equal(target.statuses.barrier, true);
  assert.ok(logs(g).includes('EVENT:BARRIER:ALLY'));
  assert.equal(logs(g).includes('EVENT:BARRIER:ENEMY'), false);
  const ctx = captured.find((entry) => entry.ctx.event === 'barrier').ctx;
  assert.equal(ctx.unit, target);
});

test('continueOnSourceDeath keeps later actions after the source dies', () => {
  const g = newGame();
  clearLogs(g);
  summon(g, 'E22', 'p1');
  assert.ok(logs(g).includes('EVENT:CONTINUE'));
  clearLogs(g);
  summon(g, 'E23', 'p1');
  assert.equal(logs(g).includes('EVENT:CONTINUE'), false);
});
