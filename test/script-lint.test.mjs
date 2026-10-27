import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintScript, lintScripts } from '../server/script-lint.js';
import { sanitizeContentOffer, sanitizeRoomCatalog } from '../server/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function script(actions, patch = {}) {
  return { triggers: [{ on: 'play', actions }], ...patch };
}

test('a valid declarative script passes with no warnings', () => {
  const result = lintScript(script([{ type: 'damage', amount: 2, target: { type: 'enemyUnit' } }]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('unknown action, target, and condition types are errors', () => {
  const action = lintScript(script([{ type: 'teleport' }]));
  assert.equal(action.ok, false);
  assert.match(action.errors.join(' '), /unknown action type "teleport"/);

  const target = lintScript(script([{ type: 'damage', amount: 1, target: 'notATarget' }]));
  assert.equal(target.ok, false);
  assert.match(target.errors.join(' '), /unknown target type "notATarget"/);

  const condition = lintScript({ triggers: [{ on: 'play', condition: { type: 'moonPhase' }, actions: [{ type: 'draw' }] }] });
  assert.equal(condition.ok, false);
  assert.match(condition.errors.join(' '), /unknown condition type "moonPhase"/);
});

test('the removed custom condition is rejected', () => {
  const result = lintScript({ triggers: [{ on: 'play', condition: { type: 'custom' }, actions: [{ type: 'draw' }] }] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unsupported condition "custom"/);
});

test('empty trigger action lists are errors', () => {
  const result = lintScript({ triggers: [{ on: 'play', actions: [] }] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /actions must not be empty/);
});

test('required action fields are enforced', () => {
  const cases = [
    [{ type: 'damage', target: 'enemyUnit' }, /requires amount or value/],
    [{ type: 'grantKeyword', target: 'self' }, /keyword is required/],
    [{ type: 'summon' }, /requires name, cardName, or cardId/],
    [{ type: 'transform' }, /cardId is required/],
    [{ type: 'strike' }, /target is required/],
  ];
  for (const [action, pattern] of cases) {
    const result = lintScript(script([action]));
    assert.equal(result.ok, false, action.type);
    assert.match(result.errors.join(' '), pattern);
  }
});

test('nested control-flow actions are validated', () => {
  const result = lintScript(script([
    { type: 'if', condition: { type: 'always' }, actions: [{ type: 'damage', amount: 1, target: 'notATarget' }] },
    { type: 'random', branches: [[{ type: 'teleport' }]] },
    { type: 'repeat', actions: [{ type: 'grantKeyword' }] },
  ]));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unknown target type "notATarget"/);
  assert.match(result.errors.join(' '), /unknown action type "teleport"/);
  assert.match(result.errors.join(' '), /keyword is required/);
});

test('duplicate triggers and unknown triggers are warnings, not errors', () => {
  const duplicate = script([
    { type: 'draw', amount: 1 },
  ]);
  duplicate.triggers.push({ on: 'play', actions: [{ type: 'draw', amount: 1 }] });
  const duplicateResult = lintScript(duplicate);
  assert.equal(duplicateResult.ok, true);
  assert.match(duplicateResult.warnings.join(' '), /duplicates/);

  const unknown = lintScript({ triggers: [{ on: 'drawCard', actions: [{ type: 'draw' }] }] });
  assert.equal(unknown.ok, true);
  assert.match(unknown.warnings.join(' '), /not a built-in event/);

  const strict = lintScript({ triggers: [{ on: 'drawCard', actions: [{ type: 'draw' }] }] }, { strict: true });
  assert.equal(strict.ok, false);
});

test('using both spellCast and castSpell warns about the alias double-fire', () => {
  const result = lintScript({
    triggers: [
      { on: 'spellCast', actions: [{ type: 'draw' }] },
      { on: 'castSpell', actions: [{ type: 'draw' }] },
    ],
  });
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(' '), /dispatch as one alias and would fire twice/);
});

test('champion level-up blocks require a condition and behold requires a filter', () => {
  const levelUp = lintScript({ levelUp: {}, triggers: [{ on: 'play', actions: [{ type: 'draw' }] }] });
  assert.equal(levelUp.ok, false);
  assert.match(levelUp.errors.join(' '), /levelUp\.condition is required/);
  const behold = lintScript({ triggers: [{ on: 'summon', condition: { type: 'behold' }, actions: [{ type: 'draw' }] }] });
  assert.equal(behold.ok, false);
  assert.match(behold.errors.join(' '), /filter must be an object for behold/);
});

test('curated champions with a level-2 card must declare a level-up condition', () => {
  const card = { id: 'CH1', supertype: 'Champion', level2Id: 'CH2' };
  const missing = lintScripts({
    CH1: { status: 'curated', script: { triggers: [{ on: 'play', actions: [{ type: 'draw' }] }] } },
  }, { strict: true, cardsById: new Map([['CH1', card]]) });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /must declare script\.levelUp\.condition/);

  const present = lintScripts({
    CH1: {
      status: 'curated',
      script: { levelUp: { condition: { type: 'always' } }, triggers: [{ on: 'play', actions: [{ type: 'draw' }] }] },
    },
  }, { strict: true, cardsById: new Map([['CH1', card]]) });
  assert.equal(present.ok, true);
});

test('first-time conditions are accepted now that the engine owns their flags', () => {
  const round = lintScript({ triggers: [{ on: 'play', condition: { type: 'firstTimeThisRound', flag: 'played' }, actions: [{ type: 'draw' }] }] });
  assert.equal(round.ok, true);
  assert.deepEqual(round.warnings, []);
  const game = lintScript({ triggers: [{ on: 'play', condition: { type: 'firstTimeThisGame', flag: 'played' }, actions: [{ type: 'draw' }] }] });
  assert.equal(game.ok, true);
  assert.deepEqual(game.warnings, []);
  const source = lintScript({ triggers: [{ on: 'play', condition: { type: 'firstTimeThisGame', flag: 'played', scope: 'source' }, actions: [{ type: 'draw' }] }] });
  assert.equal(source.ok, true);
  const invalid = lintScript({ triggers: [{ on: 'play', condition: { type: 'firstTimeThisGame', scope: 'team' }, actions: [{ type: 'draw' }] }] });
  assert.equal(invalid.ok, false);
});

test('eventCard requires a filter object', () => {
  const missing = lintScript({ triggers: [{ on: 'summonOther', condition: { type: 'eventCard' }, actions: [{ type: 'draw' }] }] });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /filter must be an object for eventCard/);

  const valid = lintScript({ triggers: [{ on: 'summonOther', condition: { type: 'eventCard', filter: { subtype: 'ELITE' } }, actions: [{ type: 'draw' }] }] });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);
});

test('choose validates unique string ids, labels, nonempty branches and nested actions', () => {
  const check = (options) => lintScript({ triggers: [{ on: 'play', actions: [{ type: 'choose', options }] }] });
  const option = { id: 'first', label: 'First', actions: [{ type: 'draw', amount: 1 }] };
  assert.equal(check([option]).ok, true);
  for (const options of [[], [option, option], [{ ...option, id: 1 }], [{ ...option, label: '' }], [{ ...option, actions: [] }], [{ ...option, actions: [{ type: 'unknownEffect' }] }]]) {
    assert.equal(check(options).ok, false);
  }
});

test('curated champion lint uses the raw catalog levelup text too', () => {
  const result = lintScripts({ CH1: { status: 'curated', script: { triggers: [{ on: 'summon', actions: [{ type: 'draw' }] }] } } }, {
    strict: true,
    cardsById: new Map([['CH1', { id: 'CH1', supertype: 'Champion', levelup: "I've struck twice." }]]),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /must declare script\.levelUp\.condition/);
});

test('shipped seed scripts pass strict semantic lint', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
  const result = lintScripts(scripts, { strict: true });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.ok, true);
});

test('peer content rejects semantic errors and strips verification/seed metadata', () => {
  const customCard = {
    id: 'CABC123',
    name: 'Peer Test',
    type: 'Unit',
    cost: 1,
    attack: 1,
    health: 1,
    regions: ['Demacia'],
    text: 'Play: Draw 1.',
    collectible: true,
    enabled: true,
  };
  const bad = sanitizeContentOffer({
    cards: [customCard],
    scripts: { CABC123: { script: { triggers: [{ on: 'play', actions: [{ type: 'teleport' }] }] }, status: 'curated' } },
  });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /unknown action type "teleport"/);

  const good = sanitizeContentOffer({
    cards: [customCard],
    scripts: {
      CABC123: {
        script: { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] },
        status: 'curated',
        verification: { version: 1, test: 'test/engine.test.mjs#x', cardTextHash: 'a'.repeat(64) },
        seed: { version: '9.9.9', origin: 'seed' },
      },
    },
  });
  assert.equal(good.ok, true);
  assert.deepEqual(Object.keys(good.scripts.CABC123).sort(), ['script', 'status']);
  assert.equal(good.scripts.CABC123.status, 'custom');
  assert.equal(good.scripts.CABC123.verification, undefined);
  assert.equal(good.scripts.CABC123.seed, undefined);

  const room = sanitizeRoomCatalog([customCard], {
    CABC123: { script: good.scripts.CABC123.script, status: 'curated', verification: { version: 1 }, seed: { version: '9.9.9' } },
  });
  assert.equal(room.ok, true);
  assert.deepEqual(Object.keys(room.scripts.CABC123).sort(), ['script', 'status']);
  assert.equal(room.scripts.CABC123.status, 'custom');
});
