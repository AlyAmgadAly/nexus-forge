import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardDB } from '../server/engine/carddb.js';
import { Game } from '../server/engine/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardsPayload = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
const db = new CardDB({ riotPayload: cardsPayload, scripts, settings: {} });

function newGame() {
  const players = [
    { id: 'p1', name: 'Alice', team: 'A' },
    { id: 'p2', name: 'Bob', team: 'B' },
  ];
  const decks = Object.fromEntries(players.map((player) => [player.id, Array(30).fill('01DE001')]));
  const game = new Game({ mode: '1v1', players, decks, cardDB: db, seed: 42 });
  game.attackTokenTeam = 'A';
  game.teams.A.attackToken = true;
  game.teams.B.attackToken = false;
  game.autoMulligan();
  game.player('p1').hand = [];
  game.player('p2').hand = [];
  game.priorityTeam = 'A';
  return game;
}

function summon(game, cardId, playerId = 'p1') {
  return game.summonUnit(game.cardDB.get(cardId), game.player(playerId), { token: true });
}

function playFromHand(game, cardId, targetIds = [], playerId = 'p1') {
  const player = game.player(playerId);
  game.teams[player.team].mana = 10;
  game.teams[player.team].spellMana = 0;
  game.priorityTeam = player.team;
  const iid = game.addCardToHand(player, cardId);
  return game.playCard(playerId, iid, targetIds);
}

function resolveSpell(game, cardId, targetIds = []) {
  const result = playFromHand(game, cardId, targetIds);
  if (result.ok && game.stack.length) {
    game.pass('p2');
    game.pass('p1');
  }
  return result;
}

function choose(game, ids, playerId = 'p1') {
  const result = game.resolveChoice(playerId, ids);
  assert.equal(result.ok, true, result.error);
  return result;
}

function handIds(player) {
  return player.hand.map((card) => card.cardId);
}

// ------------------------------------------------------------------ Noxus

test('reckless-legion-saboteur', () => {
  const game = newGame();
  const saboteur = summon(game, '01NX040');
  assert.equal(game.teams.B.nexus, 20);

  const result = game.attack('p1', [saboteur.uid], {});
  assert.equal(result.ok, true, result.error);
  assert.equal(game.teams.B.nexus, 19);
});

test('reckless-guile', () => {
  const game = newGame();
  const first = summon(game, '01DE039', 'p2');
  const second = summon(game, '01DE020', 'p2');

  const result = resolveSpell(game, '01NX049', [`u:${first.uid}`]);
  assert.equal(result.ok, true, result.error);
  assert.equal(first.statuses.stunned, true);
  assert.equal(second.statuses.stunned, false);
});

test('reckless-elegant-edge', () => {
  const game = newGame();
  const result = playFromHand(game, '07NX008');
  assert.equal(result.ok, true, result.error);
  const unit = game.unitsOnTeam('A').find((entry) => entry.cardId === '07NX008');
  assert.ok(unit);
  assert.equal(game.power(unit), 1);
  assert.equal(game.health(unit), 2);

  const plunderGame = newGame();
  plunderGame.teams.A.plunderedThisRound = true;
  const plunderResult = playFromHand(plunderGame, '07NX008');
  assert.equal(plunderResult.ok, true, plunderResult.error);
  const plunderUnit = plunderGame.unitsOnTeam('A').find((entry) => entry.cardId === '07NX008');
  assert.ok(plunderUnit);
  assert.equal(plunderGame.power(plunderUnit), 3);
  assert.equal(plunderGame.health(plunderUnit), 2);
});

test('reckless-all-out', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const other = summon(game, '01DE020');

  const result = resolveSpell(game, '07NX003', [`u:${ally.uid}`]);
  assert.equal(result.ok, true, result.error);
  assert.equal(game.power(ally), 4);
  assert.equal(game.health(ally), 2);
  assert.equal(game.power(other), 2);
  assert.equal(game.health(other), 2);

  const plunderGame = newGame();
  plunderGame.teams.A.plunderedThisRound = true;
  const plunderAlly = summon(plunderGame, '01DE039');
  const plunderResult = resolveSpell(plunderGame, '07NX003', [`u:${plunderAlly.uid}`]);
  assert.equal(plunderResult.ok, true, plunderResult.error);
  assert.equal(plunderGame.power(plunderAlly), 4);
  assert.equal(plunderGame.health(plunderAlly), 3);
});

test('reckless-crimson-bloodletter', () => {
  const game = newGame();
  const bloodletter = summon(game, '04NX018');
  const first = summon(game, '01DE039');
  assert.equal(first.damage, 1);
  assert.equal(game.power(bloodletter), 2);
  assert.equal(game.health(bloodletter), 3);

  const second = summon(game, '01DE020');
  assert.equal(second.damage, 0);
  assert.equal(game.power(bloodletter), 2);
  assert.equal(game.health(bloodletter), 3);
});

test('reckless-crimson-pigeon', () => {
  const game = newGame();
  const pigeon = summon(game, '06NX041');
  const supported = summon(game, '01DE039');

  const result = game.attack(
    'p1',
    [pigeon.uid, supported.uid],
    {},
    { [pigeon.uid]: supported.uid },
  );
  assert.equal(result.ok, true, result.error);
  assert.equal(supported.damage, 1);
  assert.equal(game.power(pigeon), 3);
  assert.equal(game.health(pigeon), 3);

  game.endRound();
  assert.equal(game.power(pigeon), 2);
  assert.equal(game.health(pigeon), 2);
});

test('reckless-dravens-biggest-fan', () => {
  const deckGame = newGame();
  deckGame.player('p1').deck[5] = '01NX020';
  summon(deckGame, '01NX035');
  assert.equal(deckGame.player('p1').deck[0], '01NX020');
  assert.equal(deckGame.player('p1').deck.filter((id) => id === '01NX020').length, 1);

  const handGame = newGame();
  handGame.player('p1').deck[5] = '01NX020';
  handGame.addCardToHand(handGame.player('p1'), '01NX020');
  const handDeck = [...handGame.player('p1').deck];
  summon(handGame, '01NX035');
  assert.deepEqual(handGame.player('p1').deck, handDeck);

  const playGame = newGame();
  playGame.player('p1').deck[5] = '01NX020';
  summon(playGame, '01NX020');
  const playDeck = [...playGame.player('p1').deck];
  summon(playGame, '01NX035');
  assert.deepEqual(playGame.player('p1').deck, playDeck);
});

test('reckless-stygian-onlooker', () => {
  const normalGame = newGame();
  const normalResult = playFromHand(normalGame, '03SI003');
  assert.equal(normalResult.ok, true, normalResult.error);
  const normal = normalGame.unitsOnTeam('A').find((entry) => entry.cardId === '03SI003');
  assert.ok(normal);
  assert.equal(normalGame.power(normal), 2);
  assert.equal(normalGame.hasKeyword(normal, 'Fearsome'), false);

  const nightfallGame = newGame();
  const first = playFromHand(nightfallGame, '01DE020');
  assert.equal(first.ok, true, first.error);
  const nightfallResult = playFromHand(nightfallGame, '03SI003');
  assert.equal(nightfallResult.ok, true, nightfallResult.error);
  const onlooker = nightfallGame.unitsOnTeam('A').find((entry) => entry.cardId === '03SI003');
  assert.ok(onlooker);
  assert.equal(nightfallGame.power(onlooker), 4);
  assert.equal(nightfallGame.hasKeyword(onlooker, 'Fearsome'), true);

  nightfallGame.endRound();
  assert.equal(nightfallGame.power(onlooker), 2);
  assert.equal(nightfallGame.hasKeyword(onlooker, 'Fearsome'), false);
});

test('reckless-thrashing-snapper', () => {
  const game = newGame();
  const snapper = summon(game, '04NX019');
  const blocker = summon(game, '01DE039', 'p2');

  const attack = game.attack('p1', [snapper.uid], {});
  assert.equal(attack.ok, true, attack.error);
  const block = game.declareBlockers('p2', { [snapper.uid]: blocker.uid });
  assert.equal(block.ok, true, block.error);
  assert.equal(game.power(snapper), 5);

  game.endRound();
  assert.equal(game.power(snapper), 2);
});

// ------------------------------------------------------------------ Shadow Isles

test('reckless-hapless-aristocrat', () => {
  const game = newGame();
  const aristocrat = summon(game, '01SI043');
  game.killUnit(aristocrat, { reason: 'test' });
  const spiderling = game.unitsOnTeam('A').find((entry) => entry.cardId === '01SI002');
  assert.ok(spiderling);
  assert.equal(game.power(spiderling), 1);
  assert.equal(game.health(spiderling), 1);
});

test('reckless-mark-of-the-isles', () => {
  const game = newGame();
  const first = summon(game, '01DE039');
  const second = summon(game, '01DE020');

  const result = resolveSpell(game, '01SI022', [`u:${first.uid}`]);
  assert.equal(result.ok, true, result.error);
  assert.equal(game.power(first), 4);
  assert.equal(game.health(first), 4);
  assert.equal(game.hasKeyword(first, 'Ephemeral'), true);

  assert.equal(game.power(second), 2);
  assert.equal(game.health(second), 2);
  assert.equal(game.hasKeyword(second, 'Ephemeral'), false);
});

test('reckless-wardens-prey', () => {
  const game = newGame();
  const warden = summon(game, '01SI026');
  game.killUnit(warden, { reason: 'test' });

  assert.equal(game.player('p1').hand.length, 1);
  const created = game.cardDB.get(game.player('p1').hand[0].cardId);
  assert.notEqual(created.id, '01SI026');
  assert.equal(created.type, 'Unit');
  assert.notEqual(created.supertype, 'Champion');
  assert.ok(created.cost <= 3);
  assert.ok((created.keywords || []).includes('LastBreath') || /Last Breath/i.test(created.text || ''));
});

test('reckless-absorb-soul', () => {
  const barrierGame = newGame();
  barrierGame.teams.A.nexus = 15;
  const barriered = summon(barrierGame, '01DE039');
  barrierGame.grantStatus(barriered, 'barrier', null);
  const barrierResult = resolveSpell(barrierGame, '01SI045', [`u:${barriered.uid}`]);
  assert.equal(barrierResult.ok, true, barrierResult.error);
  assert.equal(barrierGame.teams.A.nexus, 15);
  assert.equal(barriered.dead, false);

  const toughGame = newGame();
  toughGame.teams.A.nexus = 15;
  const tough = summon(toughGame, '01DE039');
  toughGame.grantKeyword(tough, 'Tough');
  const toughResult = resolveSpell(toughGame, '01SI045', [`u:${tough.uid}`]);
  assert.equal(toughResult.ok, true, toughResult.error);
  assert.equal(toughGame.teams.A.nexus, 18);
  assert.equal(tough.dead, true);

  const overkillGame = newGame();
  overkillGame.teams.A.nexus = 15;
  const small = summon(overkillGame, '01DE039');
  const overkillResult = resolveSpell(overkillGame, '01SI045', [`u:${small.uid}`]);
  assert.equal(overkillResult.ok, true, overkillResult.error);
  assert.equal(overkillGame.teams.A.nexus, 19);
  assert.equal(small.dead, true);
});

test('reckless-barkbeast', () => {
  const game = newGame();
  const beast = summon(game, '02SI006');
  const first = summon(game, '01DE039');
  const second = summon(game, '01DE020');

  game.killUnit(first, { reason: 'test' });
  assert.equal(game.power(beast), 3);
  assert.equal(game.health(beast), 3);

  game.killUnit(second, { reason: 'test' });
  assert.equal(game.power(beast), 3);
  assert.equal(game.health(beast), 3);
});

test('reckless-oblivious-islander', () => {
  const game = newGame();
  const iid = game.addCardToHand(game.player('p1'), '01DE020');
  const result = playFromHand(game, '01SI012', [`h:${iid}`]);
  assert.equal(result.ok, true, result.error);

  const handCard = game.player('p1').hand.find((card) => card.iid === iid);
  assert.ok(handCard);
  assert.ok(handCard.keywords.includes('Ephemeral'));
  assert.equal(game.handCardCost(game.cardDB.get('01DE020'), handCard), 1);

  game.teams.A.mana = 1;
  game.priorityTeam = 'A';
  const played = game.playCard('p1', iid);
  assert.equal(played.ok, true, played.error);
  const unit = game.unitsOnTeam('A').find((entry) => entry.cardId === '01DE020');
  assert.ok(unit);
  assert.equal(game.hasKeyword(unit, 'Ephemeral'), true);
  assert.equal(game.teams.A.mana, 0);
});

test('reckless-oblivious-islander-no-target', () => {
  const game = newGame();
  const result = playFromHand(game, '01SI012');
  assert.equal(result.ok, true, result.error);
  assert.equal(game.pending, null);
  assert.ok(game.unitsOnTeam('A').some((entry) => entry.cardId === '01SI012'));
});

test('reckless-shadow-isles-tellstones', () => {
  const options = ['01SI022', '04SI002', '03SI008'];
  for (const selected of options) {
    const game = newGame();
    const result = playFromHand(game, '06SI037');
    assert.equal(result.ok, true, result.error);
    assert.ok(game.pending);
    assert.deepEqual(game.pending.options.map((option) => option.id), options);

    choose(game, [selected]);
    assert.equal(game.pending, null);
    assert.deepEqual(
      game.player('p1').hand.map((card) => [card.cardId, card.fleeting]),
      [[selected, true]],
    );

    game.endRound();
    assert.equal(handIds(game.player('p1')).includes(selected), false);
  }
});

test('reckless-burgeoning-sentinel', () => {
  const game = newGame();
  const sentinel = summon(game, '05SI011');
  const first = summon(game, '01DE039', 'p2');
  const second = summon(game, '01DE039', 'p2');

  const firstResult = resolveSpell(game, '01PZ052', [`u:${first.uid}`]);
  assert.equal(firstResult.ok, true, firstResult.error);
  assert.equal(first.dead, true);
  assert.equal(game.power(sentinel), 3);
  assert.equal(game.health(sentinel), 3);

  const secondResult = resolveSpell(game, '01PZ052', [`u:${second.uid}`]);
  assert.equal(secondResult.ok, true, secondResult.error);
  assert.equal(second.dead, true);
  assert.equal(game.power(sentinel), 3);
  assert.equal(game.health(sentinel), 3);

  const nonSpellGame = newGame();
  const nonSpellSentinel = summon(nonSpellGame, '05SI011');
  const victim = summon(nonSpellGame, '01DE039', 'p2');
  nonSpellGame.killUnit(victim, { reason: 'test' });
  assert.equal(nonSpellGame.power(nonSpellSentinel), 1);
  assert.equal(nonSpellGame.health(nonSpellSentinel), 2);
});

test('reckless-spell-kill-ignores-landmarks', () => {
  const game = newGame();
  const sentinel = summon(game, '05SI011');
  const landmark = summon(game, '03BW001');
  game.killUnit(landmark, {
    source: { isSpell: true, team: 'A', card: game.cardDB.get('03SI008') },
  });
  assert.equal(landmark.dead, true);
  assert.equal(game.power(sentinel), 1);
  assert.equal(game.health(sentinel), 2);
});

test('reckless-pesky-specter', () => {
  const game = newGame();
  const specter = summon(game, '03SI015');
  const enemyBefore = game.player('p2').deck.filter((id) => id === '03SI015').length;
  const ownBefore = game.player('p1').deck.filter((id) => id === '03SI015').length;

  game.killUnit(specter, { reason: 'test' });
  assert.equal(game.player('p2').deck.filter((id) => id === '03SI015').length, enemyBefore + 2);
  assert.equal(game.player('p1').deck.filter((id) => id === '03SI015').length, ownBefore);
});
