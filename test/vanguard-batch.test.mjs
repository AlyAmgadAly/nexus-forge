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
  return game;
}

function summon(game, cardId, playerId = 'p1') {
  return game.summonUnit(game.cardDB.get(cardId), game.player(playerId), { token: true });
}

function playFromHand(game, cardId, targetIds = [], playerId = 'p1') {
  const player = game.player(playerId);
  game.teams[player.team].mana = 10;
  game.teams[player.team].spellMana = 0;
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

function cardIds(player) {
  return player.hand.map((card) => card.cardId);
}

// ------------------------------------------------------------------ champions

test('vanguard-garen-levels-up', () => {
  const game = newGame();
  const garen = summon(game, '01DE012');
  assert.equal(garen.cardId, '01DE012');
  assert.equal(garen.card.level2Id, '01DE012T1');

  const firstTarget = summon(game, '01DE039');
  game.strike(garen, { uid: firstTarget.uid }, { effect: true });
  assert.equal(garen.leveled, false);

  const secondTarget = summon(game, '01DE039');
  game.strike(garen, { uid: secondTarget.uid }, { effect: true });
  assert.equal(garen.leveled, true);
  assert.equal(garen.cardId, '01DE012T1');
  assert.equal(game.power(garen), 6);
  assert.equal(game.health(garen), 6);
});

test('vanguard-garen-level-two-rally', () => {
  const game = newGame();
  const garen = summon(game, '01DE012');
  game.strike(garen, { uid: summon(game, '01DE039').uid }, { effect: true });
  game.strike(garen, { uid: summon(game, '01DE039').uid }, { effect: true });
  assert.equal(garen.cardId, '01DE012T1');

  game.teams.A.hasAttacked = true;
  game.endRound();
  assert.equal(game.teams.A.attackToken, true);
  assert.equal(game.teams.B.attackToken, false);
});

test('vanguard-shen-levels-up', () => {
  const game = newGame();
  const shen = summon(game, '01IO032');
  assert.equal(shen.card.level2Id, '01IO032T1');
  const ally = summon(game, '01DE039');

  for (let i = 0; i < 5; i++) game.grantStatus(ally, 'barrier', shen);
  assert.equal(shen.counters.barrierSeen, 5);
  assert.equal(shen.leveled, true);
  assert.equal(shen.cardId, '01IO032T1');
  assert.equal(game.power(shen), 4);
  assert.equal(game.health(shen), 6);
});

test('vanguard-shen-level-two-barrier-buff', () => {
  const game = newGame();
  const shen = summon(game, '01IO032');
  const ally = summon(game, '01DE039');
  for (let i = 0; i < 5; i++) game.grantStatus(ally, 'barrier', shen);
  assert.equal(shen.cardId, '01IO032T1');

  game.grantStatus(ally, 'barrier', shen);
  assert.equal(game.power(ally), 5);
  assert.equal(game.health(ally), 2);
  game.endRound();
  assert.equal(game.power(ally), 2);
});

test('Shen does not level below five ally Barriers', () => {
  const game = newGame();
  const shen = summon(game, '01IO032');
  const ally = summon(game, '01DE039');
  for (let i = 0; i < 4; i++) game.grantStatus(ally, 'barrier', shen);
  assert.equal(shen.counters.barrierSeen, 4);
  assert.equal(shen.leveled, false);
  assert.equal(shen.cardId, '01IO032');

  game.grantStatus(shen, 'barrier', shen);
  assert.equal(shen.counters.barrierSeen, 4);

  game.grantStatus(ally, 'barrier', shen);
  assert.equal(shen.counters.barrierSeen, 5);
  assert.equal(shen.leveled, true);
  assert.equal(shen.cardId, '01IO032T1');
});

test('Shen support still grants Barrier after level up', () => {
  const game = newGame();
  const shen = summon(game, '01IO032');
  const ally = summon(game, '01DE039');
  for (let i = 0; i < 5; i++) game.grantStatus(ally, 'barrier', shen);
  assert.equal(shen.cardId, '01IO032T1');

  const supported = summon(game, '01DE039');
  const result = game.attack('p1', [shen.uid, supported.uid], {}, { [shen.uid]: supported.uid });
  assert.equal(result.ok, true);
  assert.equal(supported.statuses.barrier, true);
});

// ------------------------------------------------------------------ removal / protection

test('vanguard-prismatic-barrier', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = resolveSpell(game, '01DE032', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(ally.statuses.barrier, true);
  assert.equal(game.damageUnit(ally, 2, null, {}), 0);
  assert.equal(ally.statuses.barrier, false);
  assert.equal(game.health(ally), 2);
});

test('vanguard-gruesome-theater', () => {
  const game = newGame();
  const small = summon(game, '01DE039', 'p2');
  const large = summon(game, '01DE012', 'p2');
  const result = resolveSpell(game, '06IO005', [`u:${small.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(small.dead, true);
  assert.equal(cardIds(game.player('p2')).includes('01DE039'), true);
  assert.equal(large.dead, false);
  assert.equal(game.unitsOnTeam('B').includes(large), true);
});

test('vanguard-ritual-of-renewal', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  game.damageUnit(ally, 1, null, {});
  const drawnBefore = game.player('p1').stats.cardsDrawnThisRound;
  const result = resolveSpell(game, '01IO001', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(ally.damage, 0);
  assert.equal(game.player('p1').stats.cardsDrawnThisRound, drawnBefore + 1);

  const nexusGame = newGame();
  nexusGame.damageNexus('A', 5, null, {});
  const nexusBefore = nexusGame.teams.A.nexus;
  const nexusResult = resolveSpell(nexusGame, '01IO001', ['n:A']);
  assert.equal(nexusResult.ok, true);
  assert.equal(nexusGame.teams.A.nexus, nexusBefore + 4);
});

// ------------------------------------------------------------------ capture / swap

test('vanguard-detain-capture-release', () => {
  const game = newGame();
  const captor = summon(game, '01DE039');
  const victim = summon(game, '01DE020', 'p2');
  const result = resolveSpell(game, '01DE025', [`u:${captor.uid}`, `u:${victim.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(victim.dead, true);
  assert.equal(captor.captured.length, 1);
  assert.equal(captor.captured[0].cardId, '01DE020');
  assert.equal(game.unitsOnTeam('B').includes(victim), false);

  game.killUnit(captor, { reason: 'test' });
  const released = game.unitsOnTeam('B').find((unit) => unit.cardId === '01DE020');
  assert.ok(released);
  assert.equal(game.health(released), 2);
});

test('vanguard-stand-united', () => {
  const game = newGame();
  const first = summon(game, '01DE039');
  const second = summon(game, '01DE020');
  const before = [...game.teams.A.board];
  const result = resolveSpell(game, '01IO010', [`u:${first.uid}`, `u:${second.uid}`]);
  assert.equal(result.ok, true);
  assert.deepEqual(game.teams.A.board.map((unit) => unit.uid), [before[1].uid, before[0].uid]);
  assert.equal(first.statuses.barrier, true);
  assert.equal(second.statuses.barrier, true);
});

// ------------------------------------------------------------------ buffs / next summon

test('vanguard-for-demacia', () => {
  const game = newGame();
  const first = summon(game, '01DE039');
  const second = summon(game, '01DE020');
  const result = resolveSpell(game, '01DE035');
  assert.equal(result.ok, true);
  assert.equal(game.power(first), 5);
  assert.equal(game.health(first), 5);
  assert.equal(game.power(second), 5);
  assert.equal(game.health(second), 5);
  game.endRound();
  assert.equal(game.power(first), 2);
  assert.equal(game.health(first), 2);
});

test('vanguard-tattered-banner', () => {
  const game = newGame();
  const result = playFromHand(game, '04DE007T1');
  assert.equal(result.ok, true);
  assert.equal(game.player('p1').nextSummons.length, 1);

  const buffed = summon(game, '01DE039');
  assert.equal(game.hasKeyword(buffed, 'Challenger'), true);
  const plain = summon(game, '01DE039');
  assert.equal(game.hasKeyword(plain, 'Challenger'), false);
});

test('Tattered Banner expires unused at round end', () => {
  const game = newGame();
  playFromHand(game, '04DE007T1');
  game.endRound();
  assert.equal(game.player('p1').nextSummons.length, 0);
  const late = summon(game, '01DE039');
  assert.equal(game.hasKeyword(late, 'Challenger'), false);
});

test('vanguard-meditate', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '06IO013T1', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(game.power(ally), 2);
  assert.equal(game.health(ally), 4);
  game.endRound();
  assert.equal(game.health(ally), 2);
});

// ------------------------------------------------------------------ modal / hand / deck

test('vanguard-catch-modal', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '06DE024');
  assert.equal(result.ok, true);
  assert.ok(game.pending);
  choose(game, ['buff']);
  assert.ok(game.pending);
  choose(game, [`u:${ally.uid}`]);
  assert.equal(game.power(ally), 3);
  assert.equal(game.health(ally), 3);
});

test('Catch! equips a cheap equipment from hand', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const equipmentIid = game.addCardToHand(game.player('p1'), '06DE032');
  const result = playFromHand(game, '06DE024');
  assert.equal(result.ok, true);
  choose(game, ['equip']);
  assert.ok(game.pending);
  choose(game, [`h:${equipmentIid}`]);
  assert.ok(game.pending);
  choose(game, [`u:${ally.uid}`]);
  assert.equal(ally.equipment.length, 1);
  assert.equal(ally.equipment[0].cardId, '06DE032');
  assert.equal(cardIds(game.player('p1')).includes('06DE032'), false);
});

test('vanguard-silence-and-suppress', () => {
  const game = newGame();
  const follower = summon(game, '01DE039', 'p2');
  game.equipCard(follower, game.cardDB.get('06DE032'), game.player('p2'));
  const result = resolveSpell(game, '06DE033', [`u:${follower.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(follower.equipment.length, 0);
  assert.equal(game.player('p2').discard.includes('06DE032'), true);
  assert.equal(follower.statuses.silenced, true);
});

test('Silence and Suppress does not Silence a champion', () => {
  const game = newGame();
  const champion = summon(game, '01DE012', 'p2');
  game.equipCard(champion, game.cardDB.get('06DE032'), game.player('p2'));
  const result = resolveSpell(game, '06DE033', [`u:${champion.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(champion.equipment.length, 0);
  assert.equal(champion.statuses.silenced, false);
});

test('vanguard-steadfast-elkin', () => {
  const game = newGame();
  const elkin = summon(game, '06DE029');
  const ally = summon(game, '01DE039');
  assert.equal(game.hasKeyword(elkin, 'Tough'), false);
  game.equipCard(ally, game.cardDB.get('06DE032'), game.player('p1'));
  assert.equal(game.hasKeyword(elkin, 'Tough'), true);
  game.endRound();
  assert.equal(game.hasKeyword(elkin, 'Tough'), true);
});

test('Catch! cannot equip from an empty hand', () => {
  const game = newGame();
  game.player('p1').hand = [];
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '06DE024');
  assert.equal(result.ok, true);
  assert.equal(game.player('p1').hand.length, 0);

  choose(game, ['equip']);
  assert.equal(game.pending, null);
  assert.equal(ally.equipment.length, 0);
});

test('Catch! rejects equipment costing more than 2 and non-equipment cards', () => {
  const game = newGame();
  game.player('p1').hand = [];
  const ally = summon(game, '01DE039');
  const expensive = game.addCardToHand(game.player('p1'), '06BC033');
  const follower = game.addCardToHand(game.player('p1'), '01DE020');
  const result = playFromHand(game, '06DE024');
  assert.equal(result.ok, true);

  choose(game, ['equip']);
  assert.equal(game.pending, null);
  assert.equal(ally.equipment.length, 0);
  const hand = game.player('p1').hand.map((card) => card.iid);
  assert.equal(hand.includes(expensive), true);
  assert.equal(hand.includes(follower), true);
});

test('Silence and Suppress cannot target a unit with no equipment', () => {
  const game = newGame();
  const follower = summon(game, '01DE039', 'p2');
  const result = resolveSpell(game, '06DE033', [`u:${follower.uid}`]);
  assert.equal(result.ok, false);
  assert.equal(follower.statuses.silenced, false);
});

test('Steadfast Elkin triggers once per copy and ignores enemy equips', () => {
  const game = newGame();
  const first = summon(game, '06DE029');
  const second = summon(game, '06DE029');
  const ally = summon(game, '01DE039');
  const enemy = summon(game, '01DE039', 'p2');

  game.equipCard(enemy, game.cardDB.get('06DE032'), game.player('p2'));
  assert.equal(game.hasKeyword(first, 'Tough'), false);
  assert.equal(game.hasKeyword(second, 'Tough'), false);

  game.equipCard(ally, game.cardDB.get('06DE032'), game.player('p1'));
  assert.equal(game.hasKeyword(first, 'Tough'), true);
  assert.equal(game.hasKeyword(second, 'Tough'), true);

  game.removeKeyword(first, 'Tough');
  game.removeKeyword(second, 'Tough');
  game.equipCard(ally, game.cardDB.get('06DE032'), game.player('p1'));
  game.equipCard(ally, game.cardDB.get('06DE032'), game.player('p1'));
  assert.equal(game.hasKeyword(first, 'Tough'), false);
  assert.equal(game.hasKeyword(second, 'Tough'), false);
});

test('vanguard-tempting-prospect', () => {
  const game = newGame();
  const deck = game.player('p1').deck;
  deck[0] = '01DE039';
  deck[1] = '06DE032';
  deck[2] = '01IO001';
  deck[3] = '01DE020';

  const result = playFromHand(game, '06DE040');
  assert.equal(result.ok, true);
  assert.ok(game.pending);
  assert.equal(game.pending.options.length, 3);
  choose(game, ['d:1:06DE032']);
  assert.equal(cardIds(game.player('p1')).includes('06DE032'), true);
  assert.equal(deck.includes('06DE032'), false);
  assert.equal(deck.includes('01IO001'), true);
});

test('vanguard-vastayan-disciple', () => {
  const game = newGame();
  const disciple = summon(game, '06IO014');
  game.strike(disciple, { nexus: 'B' }, { effect: true });
  assert.equal(disciple.dead, true);
  assert.equal(game.unitsOnTeam('A').includes(disciple), false);
  const transformed = game.player('p1').hand.find((card) => card.cardId === '06IO014T1');
  assert.ok(transformed);
});

test('vanguard-shimon-wind', () => {
  const game = newGame();
  const disciple = summon(game, '06IO014');
  game.strike(disciple, { nexus: 'B' }, { effect: true });
  const transformed = game.player('p1').hand.find((card) => card.cardId === '06IO014T1');
  assert.ok(transformed);

  const drawnBefore = game.player('p1').stats.cardsDrawnThisRound;
  game.teams.A.mana = 10;
  const result = game.playCard('p1', transformed.iid);
  assert.equal(result.ok, true);
  assert.equal(game.unitsOnTeam('A').some((unit) => unit.cardId === '06IO014'), true);
  assert.equal(game.player('p1').stats.cardsDrawnThisRound, drawnBefore + 1);
});

test('vanguard-jarro-lightfeather', () => {
  const game = newGame();
  const allyIid = game.addCardToHand(game.player('p1'), '01DE039');
  const result = playFromHand(game, '09DE031', [`h:${allyIid}`]);
  assert.equal(result.ok, true);
  const handCard = game.player('p1').hand.find((card) => card.iid === allyIid);
  assert.equal(handCard.keywords.includes('Spirit'), true);

  game.teams.A.mana = 10;
  game.priorityTeam = 'A';
  const played = game.playCard('p1', allyIid);
  assert.equal(played.ok, true, played.error);
  const unit = game.unitsOnTeam('A').find((entry) => entry.cardId === '01DE039');
  assert.ok(unit);
  assert.equal(game.power(unit), 3);
  assert.equal(game.health(unit), 3);
});
