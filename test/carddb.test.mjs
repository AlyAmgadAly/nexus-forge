import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardDB } from '../server/engine/carddb.js';
import { cardTextHash, isVerified } from '../server/script-metadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function card(id, patch = {}) {
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
    text: '',
    collectible: true,
    enabled: true,
    set: 'Test',
    ...patch,
  };
}

test('status is derived from card text and script presence, not the pinned scriptStatus field', () => {
  const cards = [
    card('T01'),
    card('T02', { text: 'Play: Draw 1.' }),
    card('T03', { text: 'Play: Draw 1.' }),
    card('T04', { text: 'Deal 1.' }),
    card('T05', { text: 'Play: Draw 1.' }),
    card('T06', { text: 'Play: Draw 1.' }),
    card('T07', { text: 'Play: Draw 1.' }),
    card('T08', { text: 'Play: Draw 1.', scriptStatus: 'auto' }),
    card('T09', { scriptStatus: 'manual' }),
  ];
  const verification = {
    version: 1,
    cardTextHash: cardTextHash('Deal 1.'),
    verifiedAt: '2026-10-27T00:00:00.000Z',
    verifiedBy: 'test',
    test: 'test/carddb.test.mjs#status-fixture',
    clauses: ['Deal 1.'],
    notes: '',
  };
  const script = { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] };
  const db = new CardDB({
    riotPayload: { cards, globals: {} },
    scripts: {
      T03: { status: 'auto', script },
      T04: { status: 'curated', script, verification },
      T05: { status: 'custom', script },
      T06: { triggers: [] },
      T07: { status: 'none', script },
    },
    settings: {},
  });

  assert.equal(db.get('T01').scriptStatus, 'none');
  assert.equal(db.get('T02').scriptStatus, 'manual');
  assert.equal(db.get('T03').scriptStatus, 'auto');
  assert.equal(db.get('T04').scriptStatus, 'curated');
  assert.equal(db.get('T05').scriptStatus, 'custom');
  assert.equal(db.get('T06').scriptStatus, 'custom');
  assert.equal(db.get('T07').scriptStatus, 'custom');
  assert.equal(db.get('T08').scriptStatus, 'manual');
  assert.equal(db.get('T09').scriptStatus, 'none');
  assert.equal(db.get('T04').verified, true);
  assert.equal(db.get('T03').verified, false);
  assert.equal(isVerified({ status: 'curated', verification }, cards[3]), true);

  const stats = db.stats();
  assert.equal(stats.byStatus.none, 2);
  assert.equal(stats.byStatus.manual, 2);
  assert.equal(stats.byStatus.auto, 1);
  assert.equal(stats.byStatus.curated, 1);
  assert.equal(stats.byStatus.custom, 3);
  assert.equal(stats.textCards, 7);
  assert.equal(stats.scriptedText, 5);
  assert.equal(stats.missing, 2);
  assert.equal(stats.verified, 1);
  assert.equal(stats.unverified, 4);
});

test('a scripted entry labeled manual is reported custom, never hidden as unimplemented', () => {
  const cards = [card('T10', { text: 'Play: Draw 1.' })];
  const script = { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] };
  const db = new CardDB({
    riotPayload: { cards, globals: {} },
    scripts: { T10: { status: 'manual', script } },
    settings: {},
  });
  const decorated = db.get('T10');
  assert.equal(decorated.scriptStatus, 'custom');
  assert.equal(decorated.script, script);
  assert.equal(db.stats().scriptedText, 1);
  assert.equal(db.stats().missing, 0);
});

test('pinned catalog counts remain consistent as reviewed batches are added', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
  const db = new CardDB({ riotPayload: payload, scripts, settings: {} });
  const stats = db.stats();

  assert.equal(stats.total, 1647);
  assert.equal(stats.textCards, 1552);
  const textCards = db.collectible().filter((card) => String(card.text || '').trim());
  assert.equal(stats.scriptedText, textCards.filter((card) => card.script).length);
  assert.equal(stats.missing, textCards.filter((card) => !card.script).length);
  assert.equal(stats.verified, textCards.filter((card) => isVerified(scripts[card.id], card)).length);
  assert.equal(stats.unverified, stats.scriptedText - stats.verified);
  assert.equal(stats.byStatus.none, 95);
  assert.equal(stats.byStatus.manual, stats.missing);
  assert.equal(stats.byStatus.auto + stats.byStatus.partial + stats.byStatus.curated, stats.scriptedText);
  assert.equal(stats.byStatus.custom, 0);
  assert.equal(stats.coverage, stats.scriptedText / stats.textCards);
  assert.equal(stats.verifiedCoverage, stats.verified / stats.textCards);

  const mislabeled = db.collectible().filter((entry) => String(entry.text || '').trim() && !entry.script && entry.scriptStatus !== 'manual');
  assert.equal(mislabeled.length, 0);
});
