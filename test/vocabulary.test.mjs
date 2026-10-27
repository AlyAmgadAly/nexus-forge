import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTION_TYPES, CONDITION_TYPES, CONTROL_FLOW_ACTIONS, EVENTS,
  KNOWN_TRIGGERS, TARGET_TYPES, TRIGGER_NAMES,
} from '../shared/script-vocabulary.js';
import { KNOWN_TRIGGERS as MANIFEST_TRIGGERS } from '../shared/manifest.js';
import { targetOptions } from '../server/engine/effects.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const effects = fs.readFileSync(path.join(root, 'server', 'engine', 'effects.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'server', 'engine', 'game.js'), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return source.slice(from, to);
}

function cases(source) {
  return [...source.matchAll(/case\s+'([^']+)'/g)].map((match) => match[1]);
}

test('manifest re-exports the single trigger registry', () => {
  assert.deepEqual([...MANIFEST_TRIGGERS].sort(), [...TRIGGER_NAMES].sort());
  assert.deepEqual([...KNOWN_TRIGGERS].sort(), [...TRIGGER_NAMES].sort());
  assert.ok(KNOWN_TRIGGERS.has('allyAttack'));
});

test('every registered event has a dispatch/read site in game.js', () => {
  const used = new Set([...game.matchAll(/EVENTS\.([A-Z_]+)/g)].map((match) => match[1]));
  assert.deepEqual([...used].sort(), Object.keys(EVENTS).sort());
});

test('implemented target cases match the declared target vocabulary', () => {
  const targetOptions = between(effects, 'export function targetOptions', 'export function autoTargetIds');
  const autoTargets = between(effects, 'export function autoTargetIds', 'export function resolveEntity');
  const implemented = new Set([...cases(targetOptions), ...cases(autoTargets)]);
  assert.deepEqual([...implemented].sort(), [...TARGET_TYPES].sort());
});

test('implemented action cases match the declared action vocabulary', () => {
  const pump = between(effects, '  pump() {', '  execute(action, res, path) {');
  const execute = between(effects, '  execute(action, res, path) {', 'export function promptForTarget');
  const controlFlow = new Set([...pump.matchAll(/action\.type === '([^']+)'/g)].map((match) => match[1]));
  assert.deepEqual([...controlFlow].sort(), [...CONTROL_FLOW_ACTIONS].sort());
  const implemented = new Set([...cases(execute), ...controlFlow]);
  assert.deepEqual([...implemented].sort(), [...ACTION_TYPES].sort());
});

test('implemented condition cases match the declared condition vocabulary', () => {
  const conditionStart = effects.indexOf('switch (c.type) {', effects.indexOf('export function evalCondition'));
  assert.ok(conditionStart >= 0);
  const conditionEnd = effects.indexOf('    default:', conditionStart);
  const implemented = new Set(cases(effects.slice(conditionStart, conditionEnd)));
  assert.deepEqual([...implemented].sort(), [...CONDITION_TYPES].sort());
});

test('allUnits excludes landmarks so a unit sweeper does not destroy landmarks', () => {
  const ally = { uid: 'u1', name: 'Ally', team: 'A', card: { supertype: 'Unit' } };
  const landmark = { uid: 'u2', name: 'Landmark', team: 'A', isLandmark: true, card: { type: 'Landmark' } };
  const enemy = { uid: 'u3', name: 'Enemy', team: 'B', card: { supertype: 'Unit' } };
  const game = {
    otherTeam: () => 'B',
    unitsOnTeam: (team) => (team === 'A' ? [ally, landmark] : [enemy]),
    log: () => {},
  };
  const options = targetOptions(game, 'allUnits', { controller: { team: 'A' }, source: ally });
  assert.deepEqual(options.map((option) => option.uid), ['u1', 'u3']);
});

test('an unknown target resolves to no options and logs an error instead of all units', () => {
  const logs = [];
  const ally = { uid: 'u1', name: 'Ally', team: 'A', card: { supertype: 'Unit' } };
  const enemy = { uid: 'u2', name: 'Enemy', team: 'B', card: { supertype: 'Unit' } };
  const game = {
    otherTeam: () => 'B',
    unitsOnTeam: (team) => (team === 'A' ? [ally] : [enemy]),
    log: (message, level) => logs.push({ message, level }),
  };
  const options = targetOptions(game, { type: 'notATarget' }, {
    controller: { team: 'A' },
    source: ally,
  });
  assert.deepEqual(options, []);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'error');
  assert.match(logs[0].message, /Unknown target type "notATarget"/);
});
