import test from 'node:test';
import assert from 'node:assert/strict';
import { compareManifests } from '../shared/manifest.js';
import { sanitizeContentOffer, sanitizeCustomCard, sanitizeDeckPayload } from '../server/content.js';
import { validateScript } from '../server/script-validation.js';
import { deckToCode } from '../server/decks.js';

const manifest = {
  protocol: 1,
  schema: 1,
  cardsHash: 'cards-a',
  cardsVersion: 'v1',
  appVersion: '0.2.0',
  rulesHash: 'rules-a',
  poolHash: 'pool-a',
  scriptsHash: 'scripts-a',
};

test('manifest compatibility fails on protocol, schema, or card data only', () => {
  assert.deepEqual(compareManifests(manifest, { ...manifest }), { ok: true, errors: [], warnings: [] });

  const hard = compareManifests(manifest, {
    ...manifest, protocol: 2, schema: 2, cardsHash: 'cards-b',
  });
  assert.equal(hard.ok, false);
  assert.equal(hard.errors.length, 3);
  assert.match(hard.errors.join(' '), /Protocol mismatch/);
  assert.match(hard.errors.join(' '), /Game schema mismatch/);
  assert.match(hard.errors.join(' '), /Card data differs/);

  const soft = compareManifests(manifest, {
    ...manifest,
    appVersion: '0.1.0',
    rulesHash: 'rules-b',
    poolHash: 'pool-b',
    scriptsHash: 'scripts-b',
  });
  assert.equal(soft.ok, true);
  assert.equal(soft.warnings.length, 4);

  assert.equal(compareManifests(manifest, null).ok, false);
  assert.equal(compareManifests(null, manifest).ok, false);
});

test('custom cards are sanitized and raw scripts never enter the card payload', () => {
  const clean = sanitizeCustomCard({
    id: 'TEST_CARD_1',
    name: 'Test Card',
    type: 'Unit',
    cost: 2,
    attack: 3,
    health: 2,
    regions: ['Demacia'],
    script: { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] },
    art: '/art/local-only.webp',
    enabled: false,
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.card.script, null);
  assert.equal(clean.card.enabled, true);
  assert.equal(clean.card.art, null);
  assert.equal(sanitizeCustomCard({ id: 'x', name: 'Bad id' }).ok, false);
  assert.equal(sanitizeCustomCard({ id: 'GOOD_ID', name: '' }).ok, false);

  const oversized = `data:image/png;base64,${'A'.repeat(200 * 1024)}`;
  const art = sanitizeCustomCard({ id: 'BIG_ART_1', name: 'Big Art', art: oversized });
  assert.equal(art.ok, true);
  assert.equal(art.card.art, null);
  assert.match(art.warnings.join(' '), /exceeds the transfer limit/);
});

test('content offers validate scripts and reject duplicate cards', () => {
  const card = {
    id: 'OFFER_CARD_1',
    name: 'Offered Card',
    type: 'Unit',
    cost: 1,
    attack: 1,
    health: 1,
    regions: ['Noxus'],
  };
  const offer = sanitizeContentOffer({
    cards: [card],
    scripts: { OFFER_CARD_1: { script: { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] } } },
  });
  assert.equal(offer.ok, true);
  assert.equal(offer.cards.length, 1);
  assert.deepEqual(offer.scripts.OFFER_CARD_1, {
    script: { triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] },
    status: 'custom',
  });

  const duplicate = sanitizeContentOffer({ cards: [card, card] });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join(' '), /Duplicate custom card/);

  const badScript = sanitizeContentOffer({
    cards: [card],
    scripts: { OFFER_CARD_1: { script: { triggers: 'nope' } } },
  });
  assert.equal(badScript.ok, false);
  assert.match(badScript.errors.join(' '), /triggers must be an array/);

  const ignoredScript = sanitizeContentOffer({
    cards: [card],
    scripts: { NOT_OFFERED: { script: { triggers: [] } } },
  });
  assert.equal(ignoredScript.ok, true);
  assert.deepEqual(ignoredScript.scripts, {});
});

test('declarative scripts stay bounded and reject non-object shapes', () => {
  assert.equal(validateScript({ triggers: [{ on: 'play', actions: [{ type: 'draw', amount: 1 }] }] }).ok, true);
  const unknown = validateScript({ triggers: [{ on: 'custom-event', actions: [{ type: 'draw' }] }] });
  assert.equal(unknown.ok, true);
  assert.match(unknown.warnings.join(' '), /not a built-in event/);
  assert.equal(validateScript(null).ok, false);
  assert.equal(validateScript({ triggers: 'x' }).ok, false);
  assert.equal(validateScript({ triggers: [{ on: 'play', actions: {} }] }).ok, false);
  assert.equal(validateScript({ triggers: [{ on: 'play', actions: [{}] }] }).ok, false);
  assert.equal(validateScript({ triggers: Array.from({ length: 41 }, () => ({ on: 'play', actions: [] })) }).ok, false);
});

test('submitted decks deduplicate ids and reject malformed entries', () => {
  const clean = sanitizeDeckPayload({
    name: '<Deck>\u0001 Name',
    cards: [
      { cardId: 'A', count: 2 },
      { id: 'A', count: 1 },
      { cardId: 'B', count: 3 },
    ],
    regions: ['Demacia', 'Noxus', 'Ionia', 'Freljord', 'Shadow Isles'],
  });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.deck.cards, [
    { cardId: 'A', count: 3 },
    { cardId: 'B', count: 3 },
  ]);
  assert.equal(clean.deck.name, 'Deck Name');
  assert.deepEqual(clean.deck.regions, ['Demacia', 'Noxus', 'Ionia', 'Freljord']);

  assert.equal(sanitizeDeckPayload({ cards: [{ cardId: 'A', count: 0 }] }).ok, false);
  assert.equal(sanitizeDeckPayload({ cards: [] }).ok, false);
  assert.equal(sanitizeDeckPayload({ cards: [{ cardId: 'A', count: 1 }], extra: 'x'.repeat(200 * 1024) }).ok, false);
});

test('deck codes gracefully omit Card Forge cards while base decks still encode', () => {
  const base = deckToCode([{ cardId: '01DE001', count: 3 }, { cardId: '01IO001', count: 2 }]);
  assert.ok(base.length > 0);
  assert.equal(deckToCode([{ cardId: '01DE001', count: 3 }, { cardId: 'C343DC2', count: 1 }]), '');
  assert.equal(deckToCode([{ cardId: '99RU001', count: 1 }]).length > 0, true);
});
