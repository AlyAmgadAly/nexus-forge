import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CardDB } from '../server/engine/carddb.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
  return execFileSync(process.execPath, ['scripts/coverage-report.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

test('coverage report matches the current catalog and is deterministic', () => {
  const before = fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8');
  const report = JSON.parse(run(['--json']));
  const second = JSON.parse(run(['--json']));
  const stats = new CardDB({
    riotPayload: JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8')),
    scripts: JSON.parse(before), settings: {},
  }).stats();
  assert.deepEqual(second, report);

  assert.equal(report.total, 1647);
  assert.equal(report.textCards, 1552);
  assert.equal(report.none, 95);
  for (const status of ['manual', 'auto', 'partial', 'curated']) assert.equal(report[status], stats.byStatus[status]);
  assert.equal(report.scripted, stats.scriptedText);
  assert.equal(report.missingCount, stats.missing);
  assert.equal(report.verified, stats.verified);
  assert.equal(report.unverified, stats.unverified);
  assert.equal(report.byType.Unit.total, 773);
  assert.equal(report.byType.Champion.total, 105);
  assert.equal(report.byType.Spell.total, 566);
  assert.equal(report.byType.Landmark.total, 81);
  assert.equal(report.byType.Equipment.total, 27);
  assert.equal(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'), before);
});

test('coverage report filters missing cards by set, type, and starter cohort', () => {
  const filtered = JSON.parse(run(['--json', '--missing', '--set', 'Set1', '--type', 'Unit']));
  assert.ok(filtered.missing.length > 0);
  assert.ok(filtered.missing.every((card) => card.set === 'Set1' && card.type === 'Unit'));

  const starter = JSON.parse(run(['--json', '--missing', '--starter']));
  assert.equal(starter.missing.length, starter.starter.missing);
  assert.ok(starter.missing.length > 0);
});

test('coverage markdown distinguishes scripts present from verified effects', () => {
  const markdown = run(['--markdown', '--missing']);
  const report = JSON.parse(run(['--json']));
  assert.match(markdown, /# Nexus Forge script coverage/);
  assert.ok(markdown.includes(`Scripts present: ${report.scripted} (${(report.scripted / report.textCards * 100).toFixed(1)}%)`));
  assert.ok(markdown.includes(`Verified effects: ${report.verified} (${(report.verified / report.textCards * 100).toFixed(1)}%)`));
  assert.match(markdown, /## Starter-deck cohort/);
  assert.match(markdown, /## Missing cards/);
});
