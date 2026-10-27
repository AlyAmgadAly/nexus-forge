import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyBatch } from '../scripts/apply-batch.mjs';
import { cardTextHash } from '../server/script-metadata.js';

function card(id, text = 'Play: Draw 1.') {
  return {
    id,
    name: `Card ${id}`,
    cost: 1,
    attack: 1,
    health: 1,
    type: 'Unit',
    supertype: '',
    subtypes: [],
    regions: ['Demacia'],
    keywords: [],
    text,
    collectible: true,
    enabled: true,
    set: 'Test',
  };
}

function script(amount = 1) {
  return { triggers: [{ on: 'play', actions: [{ type: 'draw', amount }] }] };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function setup(userScripts = { A: { status: 'auto', script: script(1) }, B: { status: 'auto', script: script(1) } }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-batch-'));
  const cardsFile = path.join(root, 'cards.json');
  const scriptsFile = path.join(root, 'scripts.json');
  const customCardsFile = path.join(root, 'custom-cards.json');
  const batchFile = path.join(root, 'batch.json');
  const backupDir = path.join(root, 'backups');
  writeJson(cardsFile, { cards: [card('A'), card('B')] });
  writeJson(scriptsFile, userScripts);
  return { root, cardsFile, scriptsFile, customCardsFile, batchFile, backupDir };
}

function batch(cards) {
  return { batch: 'test-batch', cards };
}

function apply(fixture, cards, options = {}) {
  writeJson(fixture.batchFile, batch(cards));
  return applyBatch({
    batchFile: fixture.batchFile,
    scriptsFile: fixture.scriptsFile,
    cardsFile: fixture.cardsFile,
    customCardsFile: fixture.customCardsFile,
    backupDir: fixture.backupDir,
    ...options,
  });
}

test('applyBatch rejects a curated champion missing its printed level-up implementation', () => {
  const fixture = setup();
  writeJson(fixture.cardsFile, { cards: [{ ...card('A'), supertype: 'Champion', levelup: "I've struck twice." }] });
  const result = apply(fixture, { A: { status: 'curated', script: script() } });
  assert.equal(result.ok, false);
  assert.equal(result.written, false);
  assert.match(result.errors.join(' '), /must declare script\.levelUp\.condition/);
});

test('applyBatch rejects warning-only strict lint failures instead of reporting success', () => {
  const fixture = setup();
  const before = fs.readFileSync(fixture.scriptsFile, 'utf8');
  const result = apply(fixture, { A: { status: 'auto', script: { triggers: [{ on: 'notAnEvent', actions: [{ type: 'draw' }] }] } } });
  assert.equal(result.ok, false);
  assert.equal(result.written, false);
  assert.ok(result.warnings.length > 0);
  assert.equal(fs.readFileSync(fixture.scriptsFile, 'utf8'), before);
});

test('applyBatch validates, sorts, writes atomically, and backs up the previous file', () => {
  const fixture = setup();
  const result = apply(fixture, {
    B: { status: 'auto', script: script(2) },
    A: { status: 'partial', script: script(2) },
  });
  assert.equal(result.ok, true);
  assert.equal(result.written, true);
  assert.equal(result.changed.length, 2);
  assert.ok(result.backupFile && fs.existsSync(result.backupFile));

  const written = JSON.parse(fs.readFileSync(fixture.scriptsFile, 'utf8'));
  assert.deepEqual(Object.keys(written), ['A', 'B']);
  assert.equal(written.A.status, 'partial');
  assert.equal(written.A.script.triggers[0].actions[0].amount, 2);
  assert.equal(written.B.status, 'auto');
  assert.equal(written.B.script.triggers[0].actions[0].amount, 2);

  const backup = JSON.parse(fs.readFileSync(result.backupFile, 'utf8'));
  assert.equal(backup.A.script.triggers[0].actions[0].amount, 1);
});

test('applyBatch refuses to overwrite a custom entry unless forced', () => {
  const fixture = setup({ B: { status: 'custom', script: script(1) } });
  const refused = apply(fixture, { B: { status: 'auto', script: script(2) } });
  assert.equal(refused.ok, false);
  assert.equal(refused.written, false);
  assert.match(refused.errors.join(' '), /refusing to overwrite a custom entry/);

  const forced = apply(fixture, { B: { status: 'auto', script: script(2) } }, { force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.written, true);
  const written = JSON.parse(fs.readFileSync(fixture.scriptsFile, 'utf8'));
  assert.equal(written.B.status, 'auto');
});

test('applyBatch refuses to downgrade a curated entry unless forced', () => {
  const verification = {
    version: 1,
    cardTextHash: cardTextHash('Play: Draw 1.'),
    verifiedAt: '2026-10-27T00:00:00.000Z',
    verifiedBy: 'test',
    test: 'test/apply-batch.test.mjs#fixture',
    clauses: ['Play: Draw 1.'],
  };
  const fixture = setup({ A: { status: 'curated', script: script(1), verification } });
  const refused = apply(fixture, { A: { status: 'auto', script: script(2) } });
  assert.equal(refused.ok, false);
  assert.match(refused.errors.join(' '), /refusing to downgrade a curated entry/);
});

test('applyBatch requires valid verification metadata for curated entries', () => {
  const fixture = setup();
  const missing = apply(fixture, { A: { status: 'curated', script: script(2) } });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /curated entries require verification metadata/);

  const wrongHash = apply(fixture, {
    A: {
      status: 'curated',
      script: script(2),
      verification: { version: 1, test: 'test/apply-batch.test.mjs#fixture', cardTextHash: cardTextHash('Other text.') },
    },
  });
  assert.equal(wrongHash.ok, false);
  assert.match(wrongHash.errors.join(' '), /does not match the current card text/);

  const valid = apply(fixture, {
    A: {
      status: 'curated',
      script: script(2),
      verification: { version: 1, test: 'test/apply-batch.test.mjs#fixture', clauses: ['Play: Draw 1.'] },
    },
  });
  assert.equal(valid.ok, true);
  const written = JSON.parse(fs.readFileSync(fixture.scriptsFile, 'utf8'));
  assert.equal(written.A.status, 'curated');
  assert.equal(written.A.verification.cardTextHash, cardTextHash('Play: Draw 1.'));
});

test('applyBatch --check validates without writing', () => {
  const fixture = setup();
  const before = fs.readFileSync(fixture.scriptsFile, 'utf8');
  const result = apply(fixture, { A: { status: 'partial', script: script(2) } }, { check: true });
  assert.equal(result.ok, true);
  assert.equal(result.check, true);
  assert.equal(result.written, false);
  assert.equal(fs.readFileSync(fixture.scriptsFile, 'utf8'), before);
});

test('applyBatch rejects custom statuses, unknown cards, and invalid scripts', () => {
  const fixture = setup();
  const custom = apply(fixture, { A: { status: 'custom', script: script(1) } });
  assert.equal(custom.ok, false);
  assert.match(custom.errors.join(' '), /batch status must be auto, partial, or curated/);

  const unknown = apply(fixture, { Z: { status: 'auto', script: script(1) } });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join(' '), /card not found/);

  const invalid = apply(fixture, { A: { status: 'auto', script: { triggers: [{ on: 'play', actions: [{ type: 'teleport' }] }] } } });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /unknown action type/);
});
