import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, DEFAULT_RULES } from '../server/store.js';
import {
  cardTextHash, isVerified, normalizeCardText, prepareVerification,
  scriptHash, validateVerification, verificationState,
} from '../server/script-metadata.js';

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NBSP = String.fromCharCode(160);

function card(id, text) {
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

function fixtureStore(text = 'Play: Draw 1.') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-meta-'));
  const store = new Store({ dataDir: dir, seedDir: dir });
  store.settings = { rules: DEFAULT_RULES, pool: {} };
  store.cardsPayload = { cards: [card('T1', text)], globals: {} };
  store.scripts = {};
  store.customCards = [];
  store.mechanics = [];
  store.rebuild();
  return { store, dir };
}

function script(amount = 1) {
  return { triggers: [{ on: 'play', actions: [{ type: 'draw', amount }] }] };
}

function verificationFor(text, testName = 'test/script-metadata.test.mjs#fixture') {
  return {
    version: 1,
    cardTextHash: cardTextHash(text),
    verifiedAt: '2026-10-27T00:00:00.000Z',
    verifiedBy: 'test',
    test: testName,
    clauses: ['Play: Draw 1.'],
    notes: '',
  };
}

test('card text normalization ignores line endings and insignificant whitespace', () => {
  const raw = `  Play:${CR}${LF}  Draw${NBSP}1.  `;
  assert.equal(normalizeCardText(raw), `Play:${LF}Draw 1.`);
  assert.equal(cardTextHash('Play: Draw 1.'), cardTextHash('  Play: Draw 1.  '));
  assert.notEqual(cardTextHash('Play: Draw 1.'), cardTextHash('Play: Draw 2.'));
});

test('verification metadata requires a hash, a test, and a matching card text', () => {
  const text = 'Play: Draw 1.';
  const valid = verificationFor(text);
  assert.equal(validateVerification(valid, { card: card('T1', text) }).ok, true);

  const missingTest = { ...valid, test: '' };
  assert.equal(validateVerification(missingTest, { card: card('T1', text) }).ok, false);

  const stale = { ...valid, cardTextHash: cardTextHash('Different text.') };
  assert.equal(validateVerification(stale, { card: card('T1', text) }).ok, false);

  const badPath = { ...valid, test: 'engine.test.mjs#x' };
  assert.equal(validateVerification(badPath, { card: card('T1', text) }).ok, false);

  const prepared = prepareVerification({ test: valid.test }, card('T1', text));
  assert.equal(prepared.cardTextHash, valid.cardTextHash);
  assert.equal(prepared.version, 1);
});

test('verification state distinguishes missing, stale, invalid, and verified', () => {
  const text = 'Play: Draw 1.';
  const entry = { status: 'curated', script: script(), verification: verificationFor(text) };
  assert.equal(verificationState(entry, card('T1', text)), 'verified');
  assert.equal(isVerified(entry, card('T1', text)), true);
  assert.equal(verificationState({ status: 'curated', script: script() }, card('T1', text)), 'missing');
  assert.equal(verificationState(entry, card('T1', 'Changed text.')), 'stale');
  assert.equal(verificationState({ status: 'auto', script: script(), verification: verificationFor(text) }, card('T1', text)), 'not-curated');
  assert.equal(verificationState({ status: 'curated', script: script(), verification: { ...verificationFor(text), test: '' } }, card('T1', text)), 'invalid');
});

test('setScript preserves verification when the body is unchanged', () => {
  const { store } = fixtureStore();
  const text = 'Play: Draw 1.';
  const verification = verificationFor(text);
  const first = store.setScript('T1', script(), 'curated', { verification });
  assert.equal(first.status, 'curated');
  assert.equal(first.verification.test, verification.test);
  assert.equal(store.cardDB.get('T1').verified, true);

  const second = store.setScript('T1', script(), 'curated');
  assert.equal(second.status, 'curated');
  assert.deepEqual(second.verification, first.verification);
  assert.equal(store.cardDB.get('T1').verified, true);
});

test('setScript invalidates verification and downgrades curated entries when the script changes', () => {
  const { store } = fixtureStore();
  const text = 'Play: Draw 1.';
  store.setScript('T1', script(), 'curated', { verification: verificationFor(text) });

  const changed = store.setScript('T1', script(2), 'curated');
  assert.equal(changed.status, 'partial');
  assert.equal(changed.verification, undefined);
  assert.equal(store.cardDB.get('T1').verified, false);
  assert.equal(store.cardDB.get('T1').scriptStatus, 'partial');
});

test('setScript invalidates verification when the card text changes', () => {
  const { store } = fixtureStore();
  store.setScript('T1', script(), 'curated', { verification: verificationFor('Play: Draw 1.') });
  store.cardsPayload.cards[0].text = 'Play: Draw 2.';
  store.rebuild();

  const changed = store.setScript('T1', script(), 'curated');
  assert.equal(changed.status, 'partial');
  assert.equal(changed.verification, undefined);
  assert.equal(store.cardDB.get('T1').verified, false);
});

test('setScript preserves seed metadata and drops verification for non-curated statuses', () => {
  const { store } = fixtureStore();
  const seed = { version: '0.3.0', origin: 'seed', scriptHash: scriptHash(script()) };
  store.setScript('T1', script(), 'curated', { verification: verificationFor('Play: Draw 1.'), seed });
  assert.deepEqual(store.scripts.T1.seed, seed);

  const custom = store.setScript('T1', script(), 'custom');
  assert.equal(custom.status, 'custom');
  assert.equal(custom.verification, undefined);
  assert.deepEqual(custom.seed, seed);

  assert.equal(store.setScript('T1', null, 'none'), null);
  assert.equal(store.scripts.T1, undefined);
});

test('setScript accepts new verification metadata and stores a matching hash', () => {
  const { store } = fixtureStore();
  const text = 'Play: Draw 1.';
  const entry = store.setScript('T1', script(), 'curated', {
    verification: { version: 1, verifiedBy: 'reviewer', test: 'test/script-metadata.test.mjs#fixture', clauses: ['Play: Draw 1.'] },
  });
  assert.equal(entry.status, 'curated');
  assert.equal(entry.verification.cardTextHash, cardTextHash(text));
  assert.equal(entry.verification.verifiedBy, 'reviewer');
  assert.equal(store.cardDB.get('T1').verified, true);
});
