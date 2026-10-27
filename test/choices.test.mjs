import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CardDB } from '../server/engine/carddb.js';
import { Game } from '../server/engine/game.js';

const payload = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url)));
const scripts = JSON.parse(fs.readFileSync(new URL('../data/scripts.json', import.meta.url)));
const db = new CardDB({ riotPayload: payload, scripts, settings: {} });

function gameFixture() {
  const players = [{ id: 'p1', name: 'Alice', team: 'A' }, { id: 'p2', name: 'Bob', team: 'B' }];
  const game = new Game({ mode: '1v1', players, decks: { p1: Array(40).fill('01DE039'), p2: Array(40).fill('01DE039') }, cardDB: db, seed: 42 });
  game.autoMulligan();
  game.priorityTeam = 'A';
  game.teams.A.mana = 10;
  game.player('p1').hand = [];
  return game;
}

function playTellstones(game, id) {
  const iid = game.addCardToHand(game.player('p1'), id);
  assert.equal(game.playCard('p1', iid).ok, true);
  assert.ok(game.pending, 'casting must pause for a real player choice');
}

test('Tellstones: every branch creates only the selected Fleeting card', () => {
  for (const [id, expected] of [
    ['06DE042', ['01DE032', '01DE025', '01DE035']],
    ['06IO036', ['06IO005', '01IO001', '01IO010']],
  ]) {
    for (const selected of expected) {
      const game = gameFixture();
      playTellstones(game, id);
      assert.deepEqual(game.pending.options.map((option) => option.id), expected);
      assert.equal(game.player('p1').hand.length, 0);
      assert.equal(game.viewFor('p2').pending.waiting, true);
      assert.equal(game.viewFor('p2').pending.options, undefined);
      assert.equal(game.resolveChoice('p1', [selected]).ok, true);
      assert.equal(game.pending, null);
      assert.equal(game.resolutionStack.length, 0);
      assert.deepEqual(game.player('p1').hand.map((card) => [card.cardId, card.fleeting]), [[selected, true]]);
      const label = db.get(selected).name;
      for (const viewer of ['p2', null]) {
        assert.equal(game.viewFor(viewer).log.some((entry) => entry.text.includes(label)), false, 'hidden choices must not leak through public logs');
      }
      assert.equal(game.viewFor('p1').log.some((entry) => entry.text.includes(label)), true);
      game.endRound();
      assert.equal(game.player('p1').hand.some((card) => card.fleeting), false);
      assert.equal(game.logs.some((entry) => entry.type === 'error'), false);
    }
  }
});

test('pending choices reject another player, forged ids, excess choices and empty input without advancing', () => {
  const game = gameFixture();
  playTellstones(game, '06DE042');
  const pending = game.pending;
  for (const [player, ids] of [['p2', ['01DE032']], ['p1', ['not-an-option']], ['p1', ['01DE032', '01DE025']], ['p1', []]]) {
    assert.equal(game.resolveChoice(player, ids).ok, false);
    assert.equal(game.pending, pending);
    assert.equal(game.player('p1').hand.length, 0);
  }
  assert.equal(game.resolveChoice('p1', ['01DE025']).ok, true);
  assert.equal(game.player('p1').hand[0].cardId, '01DE025');
});

test('unit choices reject a forged enemy target and remain resolvable', () => {
  const game = gameFixture();
  const ally = game.summonUnit(db.get('01DE039'), game.player('p1'), { token: true });
  const enemy = game.summonUnit(db.get('01DE039'), game.player('p2'), { token: true });
  game.runScript({ triggers: [{ on: 'play', actions: [{ type: 'buff', power: 2, target: 'allyUnit' }] }] }, 'play', null, game.player('p1'));
  assert.ok(game.pending);
  assert.equal(game.resolveChoice('p1', [`u:${enemy.uid}`]).ok, false);
  assert.equal(game.power(enemy), 2);
  assert.equal(game.resolveChoice('p1', [`u:${ally.uid}`]).ok, true);
  assert.equal(game.power(ally), 4);
});

test('nested choices resume in order and execute the chosen branch and then exactly once', () => {
  const game = gameFixture();
  const draw = { type: 'draw', amount: 1 };
  const inner = { type: 'choose', options: [{ id: 'draw', label: 'Draw', actions: [draw] }, { id: 'skip', label: 'Skip', actions: [{ type: 'noop' }] }] };
  const outer = { type: 'choose', options: [{ id: 'nested', label: 'Nested', actions: [inner] }, { id: 'skip', label: 'Skip', actions: [{ type: 'noop' }] }], then: [draw] };
  game.runScript({ triggers: [{ on: 'play', actions: [outer, draw] }] }, 'play', null, game.player('p1'));
  assert.equal(game.resolveChoice('p1', ['nested']).ok, true);
  assert.equal(game.player('p1').hand.length, 0);
  assert.deepEqual(game.pending.options.map((option) => option.id), ['draw', 'skip']);
  assert.equal(game.resolveChoice('p1', ['draw']).ok, true);
  assert.equal(game.pending, null);
  assert.equal(game.resolutionStack.length, 0);
  assert.equal(game.player('p1').hand.length, 3);
});

test('automatic choices deterministically select the first branch', () => {
  const game = gameFixture();
  game.runScript(scripts['06DE042'].script, 'play', null, game.player('p1'), { auto: true });
  assert.equal(game.pending, null);
  assert.deepEqual(game.player('p1').hand.map((card) => card.cardId), ['01DE032']);
});
