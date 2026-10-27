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

test('Flower Child: being supported grants +2 power', () => {
  const game = newGame();
  const flowerChild = summon(game, '03IO001');
  const supporter = summon(game, '01IO032');
  const result = game.attack('p1', [supporter.uid, flowerChild.uid], {}, { [supporter.uid]: flowerChild.uid });
  assert.equal(result.ok, true);
  assert.equal(game.power(flowerChild), 3);
  assert.equal(game.health(flowerChild), 2);
  game.endRound();
  assert.equal(game.power(flowerChild), 3);
});

test('Pix!: support gives the supported ally +2|+1 this round', () => {
  const game = newGame();
  const pix = summon(game, '03IO017');
  const supported = summon(game, '01DE039');
  const result = game.attack('p1', [pix.uid, supported.uid], {}, { [pix.uid]: supported.uid });
  assert.equal(result.ok, true);
  assert.equal(game.power(supported), 4);
  assert.equal(game.health(supported), 3);
  game.endRound();
  assert.equal(game.power(supported), 2);
  assert.equal(game.health(supported), 2);
});

test('Shen: support grants the supported ally Barrier', () => {
  const game = newGame();
  const shen = summon(game, '01IO032');
  const supported = summon(game, '01DE039');
  const result = game.attack('p1', [shen.uid, supported.uid], {}, { [shen.uid]: supported.uid });
  assert.equal(result.ok, true);
  assert.equal(supported.statuses.barrier, true);
  const healthBefore = game.health(supported);
  assert.equal(game.damageUnit(supported, 2, null, {}), 0);
  assert.equal(supported.statuses.barrier, false);
  assert.equal(game.health(supported), healthBefore);
});

function playFromHand(game, cardId, targetIds = []) {
  const player = game.player('p1');
  game.teams.A.mana = 10;
  game.teams.A.spellMana = 0;
  const iid = game.addCardToHand(player, cardId);
  return game.playCard('p1', iid, targetIds);
}

test('Fleetfeather Tracker: summoning another ally grants Challenger', () => {
  const game = newGame();
  const tracker = summon(game, '01DE029');
  assert.equal(game.hasKeyword(tracker, 'Challenger'), false);
  summon(game, '01DE039');
  assert.equal(game.hasKeyword(tracker, 'Challenger'), true);
});

test('Navori Bladescout: summon grants Elusive this round', () => {
  const game = newGame();
  const bladescout = summon(game, '01IO017');
  assert.equal(game.hasKeyword(bladescout, 'Elusive'), true);
  game.endRound();
  assert.equal(game.hasKeyword(bladescout, 'Elusive'), false);
});

test('Sparring Student: summoning another ally grants +1|+1 this round', () => {
  const game = newGame();
  const student = summon(game, '01IO042');
  summon(game, '01DE039');
  assert.equal(game.power(student), 2);
  assert.equal(game.health(student), 2);
  game.endRound();
  assert.equal(game.power(student), 1);
  assert.equal(game.health(student), 1);
});

test('Garen: summon gives other allies +1|+1 this round', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const garen = summon(game, '01DE012');
  assert.equal(game.power(ally), 3);
  assert.equal(game.health(ally), 3);
  assert.equal(game.power(garen), 5);
  assert.equal(game.health(garen), 5);
  game.endRound();
  assert.equal(game.power(ally), 2);
  assert.equal(game.health(ally), 2);
});

test('Battlefield Prowess: grants an ally +1|+1 permanently', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '04DE006', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(game.stack.length, 1);
  game.pass('p2');
  game.pass('p1');
  assert.equal(game.power(ally), 3);
  assert.equal(game.health(ally), 3);
  game.endRound();
  assert.equal(game.power(ally), 3);
  assert.equal(game.health(ally), 3);
});

test('Radiant Strike: grants an ally +1|+1 this round', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '01DE018', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(game.power(ally), 3);
  assert.equal(game.health(ally), 3);
  game.endRound();
  assert.equal(game.power(ally), 2);
  assert.equal(game.health(ally), 2);
});

test('Rangers Resolve: grants allies Tough this round', () => {
  const game = newGame();
  const first = summon(game, '01DE039');
  const second = summon(game, '01DE029');
  const result = playFromHand(game, '02DE007');
  assert.equal(result.ok, true);
  assert.equal(game.hasKeyword(first, 'Tough'), true);
  assert.equal(game.hasKeyword(second, 'Tough'), true);
  game.endRound();
  assert.equal(game.hasKeyword(first, 'Tough'), false);
  assert.equal(game.hasKeyword(second, 'Tough'), false);
});

test('Wuju Style: grants +2 power and creates Meditate in hand', () => {
  const game = newGame();
  const ally = summon(game, '01DE039');
  const result = playFromHand(game, '06IO013', [`u:${ally.uid}`]);
  assert.equal(result.ok, true);
  assert.equal(game.power(ally), 4);
  assert.equal(game.health(ally), 2);
  assert.equal(game.player('p1').hand.some((card) => card.cardId === '06IO013T1'), true);
  game.endRound();
  assert.equal(game.power(ally), 2);
});

function setTopDeck(game, cardId) {
  game.player('p1').deck.unshift(cardId);
}

test('Vanguard Bannerman: allegiance buffs other allies', () => {
  const matching = newGame();
  const matchingAlly = summon(matching, '01DE039');
  setTopDeck(matching, '01DE001');
  const bannerman = summon(matching, '01DE001');
  assert.equal(matching.power(matchingAlly), 3);
  assert.equal(matching.health(matchingAlly), 3);
  assert.equal(matching.power(bannerman), 3);
  assert.equal(matching.health(bannerman), 3);

  const missing = newGame();
  const missingAlly = summon(missing, '01DE039');
  setTopDeck(missing, '01IO001');
  summon(missing, '01DE001');
  assert.equal(missing.power(missingAlly), 2);
  assert.equal(missing.health(missingAlly), 2);
});

test('Basilisk Rider: allegiance grants stats and Overwhelm', () => {
  const matching = newGame();
  setTopDeck(matching, '01NX008');
  const rider = summon(matching, '01NX008');
  assert.equal(matching.power(rider), 5);
  assert.equal(matching.health(rider), 4);
  assert.equal(matching.hasKeyword(rider, 'Overwhelm'), true);

  const missing = newGame();
  setTopDeck(missing, '01DE001');
  const plain = summon(missing, '01NX008');
  assert.equal(missing.power(plain), 4);
  assert.equal(missing.health(plain), 3);
  assert.equal(missing.hasKeyword(plain, 'Overwhelm'), false);
});

test('Wraithcaller: allegiance summons a Mistwraith', () => {
  const matching = newGame();
  setTopDeck(matching, '01SI016');
  summon(matching, '01SI016');
  assert.equal(matching.teams.A.board.some((unit) => unit.cardId === '01SI014'), true);

  const missing = newGame();
  setTopDeck(missing, '01DE001');
  summon(missing, '01SI016');
  assert.equal(missing.teams.A.board.some((unit) => unit.cardId === '01SI014'), false);
});

test('Trusty Ramhound: first Elite summon grants +2|+2', () => {
  const game = newGame();
  const ramhound = summon(game, '06DE043');
  summon(game, '01IO013');
  assert.equal(game.power(ramhound), 1);
  assert.equal(game.health(ramhound), 1);
  summon(game, '01DE039');
  assert.equal(game.power(ramhound), 3);
  assert.equal(game.health(ramhound), 3);
  summon(game, '01DE020');
  assert.equal(game.power(ramhound), 3);
  assert.equal(game.health(ramhound), 3);
});

test('Shadow Apprentice: Ephemeral summon grants +1|+0 this round', () => {
  const game = newGame();
  const apprentice = summon(game, '04IO014');
  summon(game, '01IO013');
  assert.equal(game.power(apprentice), 2);
  assert.equal(game.health(apprentice), 1);
  summon(game, '01SI004');
  assert.equal(game.power(apprentice), 3);
  assert.equal(game.health(apprentice), 1);
  summon(game, '01DE039');
  assert.equal(game.power(apprentice), 3);
  assert.equal(game.health(apprentice), 1);
  game.endRound();
  assert.equal(game.power(apprentice), 1);
});

test('Trusty Ramhound: each copy tracks its own first Elite and keeps its grant', () => {
  const game = newGame();
  const first = summon(game, '06DE043');
  const second = summon(game, '06DE043');
  summon(game, '01DE039');
  assert.equal(game.power(first), 3);
  assert.equal(game.power(second), 3);
  const later = summon(game, '06DE043');
  summon(game, '01DE039');
  for (const unit of [first, second, later]) {
    assert.equal(game.power(unit), 3);
    assert.equal(game.health(unit), 3);
  }
  game.endRound();
  for (const unit of [first, second, later]) assert.equal(game.power(unit), 3);
});

test('Penitent Squire: Behold Elite creates Tattered Banner', () => {
  const matching = newGame();
  const matchingPlayer = matching.player('p1');
  matchingPlayer.hand = [];
  matching.addCardToHand(matchingPlayer, '01DE039');
  summon(matching, '04DE007');
  assert.equal(matchingPlayer.hand.some((card) => card.cardId === '04DE007T1'), true);

  const missing = newGame();
  const missingPlayer = missing.player('p1');
  missingPlayer.hand = [];
  summon(missing, '04DE007');
  assert.equal(missingPlayer.hand.some((card) => card.cardId === '04DE007T1'), false);
});

test('The Mourned: Nexus Strike recalls it', () => {
  const game = newGame();
  const mourned = summon(game, '05IO026');
  const nexusBefore = game.teams.B.nexus;
  assert.equal(game.attack('p1', [mourned.uid]).ok, true);
  if (game.combat?.stage === 'blockers') {
    assert.equal(game.declareBlockers('p2', {}).ok, true);
  }
  assert.equal(game.pass('p1').ok, true);
  assert.equal(game.pass('p2').ok, true);
  assert.equal(game.teams.B.nexus, nexusBefore - 2);
  assert.equal(game.player('p1').hand.some((card) => card.cardId === '05IO026'), true);
  assert.equal(game.teams.A.board.includes(mourned), false);
});

test('Dancing Droplet: recall draws 1', () => {
  const game = newGame();
  const droplet = summon(game, '04IO015');
  const player = game.player('p1');
  const handBefore = player.hand.length;
  game.recallUnit(droplet);
  assert.equal(droplet.dead, true);
  assert.equal(player.hand.length, handBefore + 2);
  assert.equal(player.hand.some((card) => card.cardId === '04IO015'), true);
});

test('Greenglade Caretaker: ally Barrier grants +2 power', () => {
  const game = newGame();
  const caretaker = summon(game, '01IO019');
  const ally = summon(game, '01DE039');
  assert.equal(game.power(caretaker), 1);
  game.grantStatus(ally, 'barrier');
  assert.equal(game.power(caretaker), 3);
  assert.equal(game.health(caretaker), 2);
  game.grantStatus(caretaker, 'barrier');
  assert.equal(game.power(caretaker), 5);
  assert.equal(game.health(caretaker), 2);
});

test('Health Potion: heals an ally or your Nexus', () => {
  const game = newGame();
  const ally = summon(game, '01IO013');
  game.damageUnit(ally, 2, null, {});
  assert.equal(game.health(ally), 1);
  assert.equal(playFromHand(game, '01IO004', [`u:${ally.uid}`]).ok, true);
  assert.equal(game.health(ally), 3);

  game.damageNexus('A', 5, null, {});
  assert.equal(game.teams.A.nexus, 15);
  assert.equal(playFromHand(game, '01IO004', ['n:A']).ok, true);
  assert.equal(game.teams.A.nexus, 18);
});

test('Inspiring Mentor: grants hand ally +1 power', () => {
  const game = newGame();
  const player = game.player('p1');
  player.hand = [];
  const targetIid = game.addCardToHand(player, '01DE039');
  assert.equal(playFromHand(game, '01IO026', [`h:${targetIid}`]).ok, true);
  const handCard = player.hand.find((card) => card.iid === targetIid);
  assert.equal(handCard.buffs.length, 1);
  assert.equal(handCard.buffs[0].power, 1);
  for (const viewer of ['p2', null]) {
    assert.equal(game.viewFor(viewer).log.some((entry) => entry.text.includes('Cithria')), false);
  }
  assert.equal(game.viewFor('p1').log.some((entry) => entry.text.includes('Cithria')), true);

  game.priorityTeam = 'A';
  assert.equal(game.playCard('p1', targetIid, []).ok, true);
  const cithria = game.teams.A.board.find((unit) => unit.cardId === '01DE039');
  assert.equal(game.power(cithria), 3);
  assert.equal(game.health(cithria), 2);
});

test('Mageseeker Conservator: Last Breath creates a non-Demacia 6+ spell', () => {
  const game = newGame();
  const player = game.player('p1');
  player.hand = [];
  const conservator = summon(game, '01DE024');
  game.killUnit(conservator, { reason: 'test' });
  assert.equal(player.hand.length, 1);
  const created = game.cardDB.get(player.hand[0].cardId);
  assert.equal(created.type, 'Spell');
  assert.ok(created.cost >= 6);
  assert.equal((created.regions || []).includes('Demacia'), false);
});

test('Dragon Chow: played Dragon strikes it and draws 1', () => {
  const game = newGame();
  const player = game.player('p1');
  player.hand = [];
  const chow = summon(game, '04DE014');
  assert.equal(playFromHand(game, '03MT038').ok, true);
  assert.equal(chow.dead, true);
  assert.equal(player.hand.length, 1);
  assert.equal(game.teams.A.board.some((unit) => unit.cardId === '03MT038'), true);
});
