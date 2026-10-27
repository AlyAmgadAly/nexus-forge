import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScripts } from '../scripts/autoscript.mjs';

const FIXED_NOW = '2026-10-27T00:00:00.000Z';

function payload() {
  return {
    cards: [
      { id: 'A', name: 'Recruit', collectible: true, enabled: true, text: '', keywords: ['Tough'], regions: ['Demacia'], type: 'Unit' },
      { id: 'B', name: 'Draw Dude', collectible: true, enabled: true, text: 'Play: Draw 1.', keywords: [], regions: ['Demacia'], type: 'Spell' },
      { id: 'C', name: 'Unclear Card', collectible: true, enabled: true, text: 'Do something unusual.', keywords: [], regions: ['Noxus'], type: 'Unit' },
      { id: 'D', name: 'Token', collectible: false, enabled: true, text: 'Play: Draw 1.', keywords: [], regions: ['Noxus'], type: 'Unit' },
    ],
  };
}

function draw(amount) {
  return { triggers: [{ on: 'play', actions: [{ type: 'draw', amount }] }] };
}

test('generateScripts only creates auto entries for fully translated cards', () => {
  const { next, report } = generateScripts({ payload: payload(), scripts: {}, now: () => FIXED_NOW });
  assert.equal(report.total, 3);
  assert.equal(report.scripted, 1);
  assert.equal(report.keywordsOnly, 1);
  assert.equal(report.manual, 1);
  assert.equal(next.A, undefined);
  assert.equal(next.B.status, 'auto');
  assert.equal(next.B.updatedAt, FIXED_NOW);
  assert.equal(next.C, undefined);
  assert.equal(next.D, undefined);
  assert.deepEqual(report.changes, ['B']);
});

test('generateScripts preserves curated, custom, and partial entries', () => {
  const scripts = {
    A: { status: 'partial', script: draw(1) },
    B: { status: 'curated', script: draw(1) },
    C: { status: 'custom', script: draw(1) },
  };
  const { next, report } = generateScripts({ payload: payload(), scripts, now: () => FIXED_NOW });
  assert.equal(report.skipped, 3);
  assert.deepEqual(report.changes, []);
  assert.deepEqual(next, scripts);
});

test('generateScripts preserves manual entries it cannot translate', () => {
  const scripts = { C: { status: 'manual', script: draw(1) } };
  const { next } = generateScripts({ payload: payload(), scripts, now: () => FIXED_NOW });
  assert.deepEqual(next.C, scripts.C);
});

test('generateScripts --only leaves other entries untouched', () => {
  const scripts = { A: { status: 'custom', script: draw(2) } };
  const { next, report } = generateScripts({ payload: payload(), scripts, only: ['B'], now: () => FIXED_NOW });
  assert.equal(report.total, 1);
  assert.deepEqual(next.A, scripts.A);
  assert.equal(next.B.status, 'auto');
});

test('generateScripts reports unknown --only ids and is deterministic', () => {
  const unknown = generateScripts({ payload: payload(), scripts: {}, only: ['NOPE'], now: () => FIXED_NOW });
  assert.deepEqual(unknown.report.unknownOnly, ['NOPE']);
  assert.equal(unknown.report.total, 0);

  const first = generateScripts({ payload: payload(), scripts: {}, now: () => FIXED_NOW });
  const second = generateScripts({ payload: payload(), scripts: first.next, now: () => FIXED_NOW });
  assert.deepEqual(second.report.changes, []);
  assert.deepEqual(second.next, first.next);
});

test('generateScripts regenerates a changed auto entry and deletes a stale auto entry', () => {
  const scripts = {
    B: { status: 'auto', script: draw(99), updatedAt: FIXED_NOW },
    C: { status: 'auto', script: draw(1), updatedAt: FIXED_NOW },
  };
  const { next, report } = generateScripts({ payload: payload(), scripts, now: () => FIXED_NOW });
  assert.ok(report.changes.includes('B'));
  assert.ok(report.changes.includes('C'));
  assert.equal(next.B.script.triggers[0].actions[0].amount, 1);
  assert.equal(next.C, undefined);
});
