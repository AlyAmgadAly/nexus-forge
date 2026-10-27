import test from 'node:test';
import assert from 'node:assert/strict';
import { CardDB } from '../server/engine/carddb.js';
import { Game } from '../server/engine/game.js';
import { evalCondition, targetOptions } from '../server/engine/effects.js';

function card(id, name, overrides = {}) {
  return {
    id, code: id, name, cost: 0, attack: 1, health: 1, type: 'Unit', supertype: '',
    subtypes: [], regions: ['Demacia'], rarity: 'COMMON', keywords: [], rawKeywords: [],
    text: '', collectible: true, enabled: true, set: 'Set1', spellSpeed: '',
    associatedCardRefs: [], art: null, fullArt: null, ...overrides,
  };
}

const cards = [
  card('F01', 'Round First Watcher', { attack: 0, health: 10 }),
  card('F02', 'First Target', { attack: 0, health: 10 }),
  card('F03', 'Game First Watcher', { attack: 0, health: 10 }),
  card('S01', 'Supporter', { attack: 1, health: 3, keywords: ['Support'], rawKeywords: ['Support'] }),
  card('S02', 'Supported', { attack: 1, health: 3 }),
  card('U01', 'Equip Target', { attack: 2, health: 2 }),
  card('EQ1', 'Test Blade', { type: 'Equipment', attack: 1, health: 2, keywords: ['Tough'], rawKeywords: ['Tough'] }),
  card('W01', 'Detach Watcher', { attack: 0, health: 10 }),
  card('D01', 'Sunder Equipment', {
    type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'],
    text: 'Destroy a unit\'s equipment.',
  }),
  card('A01', 'Equipped Attacker', { attack: 1, health: 3 }),
  card('W02', 'Equipped Attack Watcher', { attack: 0, health: 10 }),
  card('EQ2', 'Test Charm', { type: 'Equipment', attack: 0, health: 0 }),
  card('B01', 'Celestial Beholder', { attack: 0, health: 5 }),
  card('B02', 'Elite Beholder', { attack: 0, health: 5 }),
  card('B03', 'Nightfall Beholder', { attack: 0, health: 5 }),
  card('CEL1', 'Celestial Card', { subtypes: ['CELESTIAL'], regions: ['Targon'] }),
  card('NF1', 'Nightfall Card', { text: 'Nightfall: Test.', regions: ['Targon'] }),
  card('H01', 'Heal Watcher', { attack: 0, health: 10 }),
  card('H02', 'Heal Target', { attack: 0, health: 10 }),
  card('H03', 'Enemy Heal Target', { attack: 0, health: 10 }),
  card('L01', 'Lurker Attacker', { attack: 1, health: 3, keywords: ['Lurker'], rawKeywords: ['Lurker'] }),
  card('L02', 'Lurk Watcher', { attack: 0, health: 10 }),
  card('M01', 'Deck Returner', { attack: 1, health: 1 }),
  card('BL1', 'Block Attacker', { attack: 1, health: 3 }),
  card('BL2', 'Block Blocker', { attack: 1, health: 3 }),
  card('TG1', 'Targeted Watcher', { attack: 0, health: 10 }),
  card('FT1', 'Fated Unit', { attack: 0, health: 10, text: 'Fated.' }),
  card('SP1', 'Target Spell', {
    type: 'Spell', spellSpeed: 'Burst', keywords: ['Burst'], rawKeywords: ['Burst'],
    text: 'Give an ally +1|+0 this round.',
  }),
  card('K01', 'Keyword Unit', {
    attack: 1, health: 3,
    keywords: ['Flow', 'Evolve', 'Augment', 'Hallowed', 'Brash', 'Formidable'],
    rawKeywords: ['Flow', 'Evolve', 'Augment', 'Hallowed', 'Brash', 'Formidable'],
  }),
  card('C1', 'Level One Champion', { supertype: 'Champion', attack: 2, health: 2, level2Id: 'C2' }),
  card('C2', 'Level Two Champion', {
    supertype: 'Champion', attack: 4, health: 4, keywords: ['Fury'], rawKeywords: ['Fury'],
  }),
  card('T01', 'Filler', { attack: 1, health: 1, cost: 1 }),
];

const scripts = {
  F01: {
    status: 'curated',
    triggers: [{
      on: 'damageUnit',
      condition: { type: 'firstTimeThisRound', flag: 'damage' },
      actions: [{ type: 'log', text: 'FIRST_ROUND' }],
    }],
  },
  F03: {
    status: 'curated',
    triggers: [{
      on: 'damageUnit',
      condition: { type: 'firstTimeThisGame', flag: 'damage' },
      actions: [{ type: 'log', text: 'FIRST_GAME' }],
    }],
  },
  S01: {
    status: 'curated',
    triggers: [{
      on: 'support',
      actions: [{ type: 'buff', power: 1, health: 1, duration: 'round', target: 'supported' }],
    }],
  },
  S02: {
    status: 'curated',
    triggers: [{
      on: 'supported',
      actions: [
        { type: 'buff', power: 2, health: 0, duration: 'round', target: 'self' },
        { type: 'buff', power: 0, health: 1, duration: 'round', target: 'supporter' },
      ],
    }],
  },
  W01: {
    status: 'curated',
    triggers: [{ on: 'detach', actions: [{ type: 'log', text: 'DETACH' }] }],
  },
  D01: {
    status: 'curated',
    triggers: [{
      on: 'play',
      actions: [{ type: 'destroyEquipment', target: 'anyUnit' }],
    }],
  },
  A01: {
    status: 'curated',
    triggers: [{
      on: 'attack',
      condition: { type: 'sourceEquipped' },
      actions: [{ type: 'log', text: 'ATTACKER_EQUIPPED' }],
    }],
  },
  W02: {
    status: 'curated',
    triggers: [{
      on: 'allyAttack',
      condition: { type: 'attackerEquipped' },
      actions: [{ type: 'log', text: 'ALLY_EQUIPPED' }],
    }],
  },
  B01: {
    status: 'curated',
    triggers: [{
      on: 'summon',
      condition: { type: 'behold', filter: { subtype: 'CELESTIAL' } },
      actions: [{ type: 'log', text: 'BEHOLD_CELESTIAL' }],
    }],
  },
  B02: {
    status: 'curated',
    triggers: [{
      on: 'summon',
      condition: { type: 'behold', filter: { subtype: 'ELITE' } },
      actions: [{ type: 'log', text: 'BEHOLD_ELITE' }],
    }],
  },
  B03: {
    status: 'curated',
    triggers: [{
      on: 'summon',
      condition: { type: 'behold', filter: { keyword: 'Nightfall' } },
      actions: [{ type: 'log', text: 'BEHOLD_NIGHTFALL' }],
    }],
  },
  H01: {
    status: 'curated',
    triggers: [{
      on: 'heal',
      condition: { type: 'healWasDamaged' },
      actions: [{ type: 'log', text: 'HEAL_DAMAGED_ALLY' }],
    }],
  },
  L01: {
    status: 'curated',
    triggers: [{ on: 'lurk', actions: [{ type: 'log', text: 'LURK_ATTACKER' }] }],
  },
  L02: {
    status: 'curated',
    triggers: [{ on: 'lurk', actions: [{ type: 'log', text: 'LURK_WATCHER' }] }],
  },
  M01: {
    status: 'curated',
    triggers: [{
      on: 'play',
      actions: [{ type: 'moveToDeck', target: 'self', position: 'top' }],
    }],
  },
  BL1: {
    status: 'curated',
    triggers: [{
      on: 'block',
      actions: [{ type: 'buff', power: 1, health: 1, duration: 'round', target: 'blocker' }],
    }],
  },
  BL2: {
    status: 'curated',
    triggers: [{
      on: 'block',
      actions: [{ type: 'buff', power: 1, health: 0, duration: 'round', target: 'attacker' }],
    }],
  },
  TG1: {
    status: 'curated',
    triggers: [{ on: 'targeted', actions: [{ type: 'log', text: 'TARGETED' }] }],
  },
  FT1: {
    status: 'curated',
    triggers: [{
      on: 'targeted',
      condition: { type: 'fated' },
      actions: [{ type: 'log', text: 'FATED_TARGET' }],
    }],
  },
  SP1: {
    status: 'curated',
    triggers: [{
      on: 'play',
      actions: [{ type: 'buff', power: 1, health: 0, duration: 'round', target: 'allyUnit' }],
    }],
  },
  C1: {
    status: 'curated',
    levelUp: { condition: { type: 'always' } },
    triggers: [],
  },
  C2: {
    status: 'curated',
    triggers: [{ on: 'levelUp', actions: [{ type: 'log', text: 'LEVEL_UP' }] }],
  },
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
  const decks = Object.fromEntries(players.map((p) => [p.id, Array(30).fill('T01')]));
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

test('firstTimeThisRound consumes its flag and resets at round start', () => {
  const g = newGame();
  summon(g, 'F01', 'p1');
  const target = summon(g, 'F02', 'p1');
  clearLogs(g);
  g.damageUnit(target, 1, null, {});
  g.damageUnit(target, 1, null, {});
  assert.equal(logs(g).filter((text) => text === 'FIRST_ROUND').length, 1);
  g.beginRound();
  g.damageUnit(target, 1, null, {});
  assert.equal(logs(g).filter((text) => text === 'FIRST_ROUND').length, 2);
});

test('firstTimeThisGame is not reset by a new round', () => {
  const g = newGame();
  summon(g, 'F03', 'p1');
  const target = summon(g, 'F02', 'p1');
  clearLogs(g);
  g.damageUnit(target, 1, null, {});
  g.damageUnit(target, 1, null, {});
  g.beginRound();
  g.damageUnit(target, 1, null, {});
  assert.equal(logs(g).filter((text) => text === 'FIRST_GAME').length, 1);
});

test('support and supported events carry both units and apply both effects', () => {
  const g = newGame();
  const supporter = summon(g, 'S01', 'p1');
  const supported = summon(g, 'S02', 'p1');
  clearLogs(g);
  const captured = captureContexts(g);
  assert.equal(g.attack('p1', [supporter.uid, supported.uid], {}, { [supporter.uid]: supported.uid }).ok, true);
  assert.equal(g.power(supported), 4);
  assert.equal(g.health(supported), 4);
  assert.equal(g.power(supporter), 1);
  assert.equal(g.health(supporter), 4);
  const supportCtx = captured.find((entry) => entry.ctx.event === 'support').ctx;
  assert.equal(supportCtx.supporter, supporter);
  assert.equal(supportCtx.supported, supported);
  const supportedCtx = captured.find((entry) => entry.ctx.event === 'supported').ctx;
  assert.equal(supportedCtx.supporter, supporter);
  assert.equal(supportedCtx.supported, supported);
});

test('equipment grants stats and keywords and detach removes them', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const unit = summon(g, 'U01', 'p1');
  summon(g, 'W01', 'p1');
  const equipmentIid = g.addCardToHand(p1, 'EQ1');
  clearLogs(g);
  assert.equal(g.playCard('p1', equipmentIid, [`u:${unit.uid}`]).ok, true);
  assert.equal(unit.equipment.length, 1);
  assert.equal(g.power(unit), 3);
  assert.equal(g.maxHealth(unit), 4);
  assert.equal(g.health(unit), 4);
  assert.equal(g.hasKeyword(unit, 'Tough'), true);
  assert.equal(p1.stats.equipsThisGame, 1);

  const spellIid = g.addCardToHand(p1, 'D01');
  g.priorityTeam = 'A';
  clearLogs(g);
  assert.equal(g.playCard('p1', spellIid, [`u:${unit.uid}`]).ok, true);
  assert.equal(unit.equipment.length, 0);
  assert.equal(g.power(unit), 2);
  assert.equal(g.maxHealth(unit), 2);
  assert.equal(g.health(unit), 2);
  assert.equal(g.hasKeyword(unit, 'Tough'), false);
  assert.ok(p1.discard.includes('EQ1'));
  assert.ok(logs(g).includes('DETACH'));
});

test('sourceEquipped and attackerEquipped see equipment during combat', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const attacker = summon(g, 'A01', 'p1');
  summon(g, 'W02', 'p1');
  const equipmentIid = g.addCardToHand(p1, 'EQ2');
  assert.equal(g.playCard('p1', equipmentIid, [`u:${attacker.uid}`]).ok, true);
  g.priorityTeam = 'A';
  clearLogs(g);
  assert.equal(g.attack('p1', [attacker.uid]).ok, true);
  assert.ok(logs(g).includes('ATTACKER_EQUIPPED'));
  assert.ok(logs(g).includes('ALLY_EQUIPPED'));
});

test('behold matches hand cards by subtype and keyword text', () => {
  const g = newGame();
  const p1 = g.player('p1');
  g.addCardToHand(p1, 'CEL1');
  g.addCardToHand(p1, 'NF1');
  clearLogs(g);
  summon(g, 'B01', 'p1');
  summon(g, 'B03', 'p1');
  summon(g, 'B02', 'p1');
  assert.ok(logs(g).includes('BEHOLD_CELESTIAL'));
  assert.ok(logs(g).includes('BEHOLD_NIGHTFALL'));
  assert.equal(logs(g).includes('BEHOLD_ELITE'), false);
});

test('heal context exposes a damaged ally and ignores enemy heals', () => {
  const g = newGame();
  const target = summon(g, 'H02', 'p1');
  const enemy = summon(g, 'H03', 'p2');
  summon(g, 'H01', 'p1');
  g.damageUnit(target, 2, null, {});
  g.damageUnit(enemy, 2, null, {});
  clearLogs(g);
  g.healUnit(target, 1, null);
  assert.equal(logs(g).filter((text) => text === 'HEAL_DAMAGED_ALLY').length, 1);
  g.healUnit(target, 99, null);
  assert.equal(logs(g).filter((text) => text === 'HEAL_DAMAGED_ALLY').length, 2);
  g.healUnit(target, 99, null);
  assert.equal(logs(g).filter((text) => text === 'HEAL_DAMAGED_ALLY').length, 2);
  g.healUnit(enemy, 1, null);
  assert.equal(logs(g).filter((text) => text === 'HEAL_DAMAGED_ALLY').length, 2);
});

test('lurk dispatches when a Lurker attacks', () => {
  const g = newGame();
  const lurker = summon(g, 'L01', 'p1');
  summon(g, 'L02', 'p1');
  clearLogs(g);
  assert.equal(g.attack('p1', [lurker.uid]).ok, true);
  assert.ok(logs(g).includes('LURK_ATTACKER'));
  assert.ok(logs(g).includes('LURK_WATCHER'));
  assert.equal(g.teams.A.lurkActiveThisRound, true);
});

test('moveToDeck places the source on top of the deck and removes it from play', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const iid = g.addCardToHand(p1, 'M01');
  clearLogs(g);
  assert.equal(g.playCard('p1', iid, []).ok, true);
  assert.equal(p1.deck[0], 'M01');
  assert.equal(g.unitsOnTeam('A').some((u) => u.cardId === 'M01'), false);
  assert.equal(p1.hand.some((h) => h.iid === iid), false);
});

test('block event target primitives resolve the opposing unit', () => {
  const g = newGame();
  const attacker = summon(g, 'BL1', 'p1');
  const blocker = summon(g, 'BL2', 'p2');
  clearLogs(g);
  assert.equal(g.attack('p1', [attacker.uid]).ok, true);
  assert.equal(g.declareBlockers('p2', { [attacker.uid]: blocker.uid }).ok, true);
  assert.equal(g.power(blocker), 2);
  assert.equal(g.health(blocker), 4);
  assert.equal(g.power(attacker), 2);
  assert.equal(g.health(attacker), 3);
});

test('round counters and the new state checks read the current team state', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const source = summon(g, 'U01', 'p1');
  g.teams.A.cardsPlayedThisRound = 2;
  g.teams.A.damageTakenThisRound = 5;
  g.teams.A.damageDealtThisRound = 6;
  p1.stats.cardsDrawnThisRound = 2;
  p1.stats.maxCardsDrawnInRound = 3;
  p1.stats.equipsThisGame = 1;
  p1.stats.damageToEnemyNexus = 4;
  g.teams.A.lurkActiveThisRound = true;
  p1.deck.unshift('T01');
  source.card.regions = ['Demacia'];
  const ctx = { controller: p1, source };
  assert.equal(evalCondition(g, { type: 'cardsPlayedThisRound', value: 2 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'damageTakenThisRound', value: 5 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'damageDealtThisRound', value: 6 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'cardsDrawnThisRound', value: 2 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'cardsDrawnInARoundThisGame', value: 3 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'equipsThisGame', value: 1 }, ctx), true);
  assert.equal(evalCondition(g, { type: 'reputation' }, ctx), true);
  assert.equal(evalCondition(g, { type: 'allegiance' }, ctx), true);
  assert.equal(evalCondition(g, { type: 'lurkActive' }, ctx), true);
  assert.equal(evalCondition(g, { type: 'cardsPlayedThisRound', value: 3 }, ctx), false);
});

test('static keyword conditions read the source keyword set', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const source = summon(g, 'K01', 'p1');
  const ctx = { controller: p1, source };
  for (const type of ['flow', 'evolve', 'augment', 'hallowed', 'brash', 'formidable']) {
    assert.equal(evalCondition(g, { type }, ctx), true, type);
  }
  const plain = summon(g, 'T01', 'p1');
  assert.equal(evalCondition(g, { type: 'flow' }, { controller: p1, source: plain }), false);
});

test('damage and heal history record amount, overkill, and round counters', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const source = summon(g, 'U01', 'p1');
  const target = summon(g, 'H02', 'p1');
  clearLogs(g);
  g.damageUnit(target, 3, source, {});
  assert.equal(g.teams.A.damageTakenThisRound, 3);
  assert.equal(g.teams.A.damageDealtThisRound, 3);
  assert.equal(g.damageHistory[0].amount, 3);
  assert.equal(g.damageHistory[0].overkill, 0);
  assert.equal(g.damageHistory[0].source, source.uid);
  g.damageUnit(target, 20, source, {});
  assert.equal(g.damageHistory[1].overkill, 13);
  assert.equal(g.damageHistory[1].lethal, true);

  const healTarget = summon(g, 'H02', 'p1');
  g.damageUnit(healTarget, 2, null, {});
  g.healUnit(healTarget, 1, null);
  assert.equal(g.healHistory[0].amount, 1);
  assert.equal(g.healHistory[0].wasDamaged, true);
  assert.equal(g.healHistory[0].overheal, 0);
  g.healUnit(healTarget, 99, null);
  assert.equal(g.healHistory[1].overheal, 98);

  p1.stats.cardsDrawnThisRound = 0;
  p1.stats.maxCardsDrawnInRound = 0;
  g.drawCard(p1);
  g.drawCard(p1);
  assert.equal(p1.stats.cardsDrawnThisRound, 2);
  assert.equal(p1.stats.maxCardsDrawnInRound, 2);
});

test('spell targeting dispatches targeted and records target history', () => {
  const g = newGame();
  const p1 = g.player('p1');
  const target = summon(g, 'TG1', 'p1');
  summon(g, 'FT1', 'p1');
  const iid = g.addCardToHand(p1, 'SP1');
  clearLogs(g);
  assert.equal(g.playCard('p1', iid, [`u:${target.uid}`]).ok, true);
  assert.ok(logs(g).includes('TARGETED'));
  assert.equal(g.targetHistory.length, 1);
  assert.equal(g.targetHistory[0].target, target.uid);
  assert.equal(g.targetHistory[0].spell, true);
  assert.equal(g.power(target), 1);

  const fated = g.unitsOnTeam('A').find((u) => u.cardId === 'FT1');
  const iid2 = g.addCardToHand(p1, 'SP1');
  g.priorityTeam = 'A';
  clearLogs(g);
  assert.equal(g.playCard('p1', iid2, [`u:${fated.uid}`]).ok, true);
  assert.ok(logs(g).includes('FATED_TARGET'));
});

test('champion level-up swaps card data and fires levelUp after the swap', () => {
  const g = newGame();
  const champion = summon(g, 'C1', 'p1');
  assert.equal(champion.cardId, 'C2');
  assert.equal(champion.leveled, true);
  assert.equal(champion.card.name, 'Level Two Champion');
  assert.equal(g.power(champion), 4);
  assert.equal(g.maxHealth(champion), 4);
  assert.equal(g.hasKeyword(champion, 'Fury'), true);
  assert.equal(g.player('p1').stats.levelsGained, 1);
  assert.ok(logs(g).includes('LEVEL_UP'));
});

test('new target primitives select damaged and champion allies and enemies', () => {
  const ally = { uid: 'u1', name: 'Ally', team: 'A', damage: 1, isLandmark: false, card: { supertype: 'Unit' } };
  const champion = { uid: 'u2', name: 'Champion', team: 'A', damage: 0, isLandmark: false, card: { supertype: 'Champion' } };
  const enemy = { uid: 'u3', name: 'Enemy', team: 'B', damage: 1, isLandmark: false, card: { supertype: 'Unit' } };
  const game = {
    otherTeam: () => 'B',
    unitsOnTeam: (team) => (team === 'A' ? [ally, champion] : [enemy]),
    log: () => {},
  };
  const ctx = { controller: { team: 'A' }, source: ally, supporter: ally, supported: champion };
  assert.deepEqual(targetOptions(game, 'allDamagedAllyUnits', ctx).map((o) => o.uid), ['u1']);
  assert.deepEqual(targetOptions(game, 'allDamagedEnemyUnits', ctx).map((o) => o.uid), ['u3']);
  assert.deepEqual(targetOptions(game, 'allChampionAllies', ctx).map((o) => o.uid), ['u2']);
  assert.deepEqual(targetOptions(game, 'allChampionEnemies', ctx).map((o) => o.uid), []);
  assert.deepEqual(targetOptions(game, 'supporter', ctx).map((o) => o.uid), ['u1']);
  assert.deepEqual(targetOptions(game, 'supported', ctx).map((o) => o.uid), ['u2']);
});
