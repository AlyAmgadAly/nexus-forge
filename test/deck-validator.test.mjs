import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CardDB } from '../server/engine/carddb.js';
import { DeckValidator, cardLegalInFormat, validateDeck } from '../shared/deck-validator.js';
import { ORIGIN_DEFINITIONS } from '../shared/origins.js';
import { decodeDeckCode, encodeDeckCode } from '../shared/deckcode.js';

function makeCard(id, overrides = {}) {
  return {
    id, name: id, cost: 1, attack: 1, health: 1, type: 'Unit', supertype: '',
    subtypes: [], regions: ['Demacia'], keywords: [], text: '', collectible: true,
    enabled: true, formats: ['Standard', 'Eternal'], associatedCardRefs: [],
    ...overrides,
  };
}

const fixtureCards = [
  ...Array.from({ length: 20 }, (_, index) => makeCard(`D${index + 1}`)),
  makeCard('N1', { regions: ['Noxus'] }),
  makeCard('I1', { regions: ['Ionia'] }),
  makeCard('M1', { regions: ['Demacia', 'Noxus'] }),
  makeCard('M2', { regions: ['Demacia', 'Ionia'] }),
  makeCard('C1', { supertype: 'Champion' }),
  makeCard('C2', { supertype: 'Champion' }),
  makeCard('C3', { supertype: 'Champion' }),
  makeCard('06RU005', { regions: ['Runeterra'], supertype: 'Champion' }),
  makeCard('06RU009', { regions: ['Runeterra'], supertype: 'Champion' }),
  makeCard('CULTIST_N', { regions: ['Noxus'], subtypes: ['CULTIST'] }),
  makeCard('CULTIST_I', { regions: ['Ionia'], subtypes: ['CULTIST'] }),
  makeCard('ETERNAL_ONLY', { formats: ['Eternal'] }),
  makeCard('STANDARD_ONLY', { formats: ['Standard'] }),
  makeCard('NO_FORMAT', { formats: [] }),
  makeCard('TOKEN', { collectible: false }),
  makeCard('DISABLED', { enabled: false }),
];
const db = new CardDB({ riotPayload: { cards: fixtureCards, globals: {} } });
const rules = { deckSize: 40, maxCopies: 3, maxRegions: 2, maxChampions: 6 };

function filled(entries = []) {
  const cards = entries.map((entry) => ({ ...entry }));
  let total = cards.reduce((sum, entry) => sum + entry.count, 0);
  for (let index = 1; index <= 20 && total < 40; index++) {
    const cardId = `D${index}`;
    const existing = cards.find((entry) => entry.cardId === cardId);
    const count = Math.min(3 - (existing?.count || 0), 40 - total);
    if (count <= 0) continue;
    if (existing) existing.count += count;
    else cards.push({ cardId, count });
    total += count;
  }
  return cards;
}

function check(cards, options = {}) {
  return new DeckValidator(db, { rules }).validate(cards, { ignoreDeckSize: true, ...options });
}

test('40 cards are playable, 0-39 are incomplete, and 41+ are invalid', () => {
  const playable = validateDeck(filled(), db, rules);
  assert.equal(playable.totalCards, 40);
  assert.equal(playable.championCopies, 0);
  assert.equal(playable.isValid, true);
  assert.equal(playable.isPlayable, true);
  assert.equal(playable.ok, true);

  for (const total of [0, 1, 39]) {
    let remaining = total;
    const cards = filled().map((entry) => {
      const count = Math.min(entry.count, remaining);
      remaining -= count;
      return { ...entry, count };
    }).filter((entry) => entry.count);
    const result = validateDeck(cards, db, rules);
    assert.equal(result.totalCards, total);
    assert.equal(result.isPlayable, false);
    assert.equal(result.status, 'incomplete');
    assert.match(result.warnings.join(' '), /incomplete/);
  }
  const over = validateDeck([{ cardId: 'D1', count: 41 }], db, rules);
  assert.equal(over.isValid, false);
  assert.equal(over.status, 'invalid');
  assert.match(over.errors.join(' '), /41 cards; maximum is 40/);
});

test('copy limits aggregate duplicate entries and champion copies cap at six', () => {
  const duplicate = check([{ cardId: 'D1', count: 2 }, { cardId: 'D1', count: 2 }]);
  assert.match(duplicate.errors.join(' '), /Too many copies of D1 \(4\/3\)/);

  const six = validateDeck(filled([{ cardId: 'C1', count: 3 }, { cardId: 'C2', count: 3 }]), db, rules);
  assert.equal(six.championCopies, 6);
  assert.equal(six.isPlayable, true);
  const seven = check([{ cardId: 'C1', count: 3 }, { cardId: 'C2', count: 3 }, { cardId: 'C3', count: 1 }]);
  assert.equal(seven.championCopies, 7);
  assert.match(seven.errors.join(' '), /maximum is 6/);
});

test('region assignment backtracks and multi-region cards require a mono-region anchor', () => {
  const oneRegion = validateDeck(filled(), db, rules);
  assert.deepEqual(oneRegion.regions, ['Demacia']);
  assert.equal(oneRegion.isPlayable, true);

  const greedyTrap = check([
    { cardId: 'M1', count: 1 }, { cardId: 'N1', count: 1 },
    { cardId: 'M2', count: 1 }, { cardId: 'I1', count: 1 },
  ]);
  assert.deepEqual(greedyTrap.regions, ['Noxus', 'Ionia']);
  assert.equal(greedyTrap.errors.length, 0);

  const anchored = check([{ cardId: 'M1', count: 1 }, { cardId: 'D1', count: 1 }]);
  assert.deepEqual(anchored.regions, ['Demacia']);
  assert.equal(anchored.errors.length, 0);
  assert.match(check([{ cardId: 'M1', count: 1 }]).errors.join(' '), /mono-region anchors/);
  assert.equal(check([{ cardId: 'D1', count: 1 }, { cardId: 'N1', count: 1 }, { cardId: 'I1', count: 1 }]).isValid, false);
});

test('Origins consume slots, grant permissions only while present, and permit compatible pairs', () => {
  const kayn = { cardId: '06RU005', count: 1 };
  const varus = { cardId: '06RU009', count: 1 };
  const cultist = { cardId: 'CULTIST_I', count: 1 };
  const withOrigin = check([kayn, cultist], { regions: ['Noxus'] });
  assert.equal(withOrigin.isValid, true);
  assert.deepEqual(withOrigin.regions, ['Noxus']);
  assert.equal(withOrigin.resolvedRegionsAndOrigins.filter((slot) => slot.type === 'origin').length, 1);
  assert.equal(check([cultist], { regions: ['Noxus'] }).isValid, false);

  assert.equal(check([kayn, { cardId: 'N1', count: 1 }]).isValid, true);
  assert.equal(check([kayn, varus, cultist]).isValid, true);
  assert.equal(check([kayn, varus, { cardId: 'N1', count: 1 }]).isValid, false);
  assert.equal(check([kayn, { cardId: 'D1', count: 1 }, { cardId: 'N1', count: 1 }]).isValid, false);

  const recalculated = check([kayn, { cardId: 'CULTIST_N', count: 1 }], { regions: ['Noxus'] });
  assert.equal(recalculated.isValid, true);
  const afterRemoval = check([{ cardId: 'CULTIST_N', count: 1 }], { regions: ['Noxus'] });
  assert.equal(afterRemoval.isValid, true);
  assert.deepEqual(afterRemoval.origins, []);
});

test('format, collectibility, enabled state, and optional ownership are enforced independently', () => {
  assert.equal(cardLegalInFormat(db.get('ETERNAL_ONLY'), 'Eternal'), true);
  assert.equal(cardLegalInFormat(db.get('ETERNAL_ONLY'), 'Standard'), false);
  assert.equal(cardLegalInFormat(db.get('NO_FORMAT'), 'Eternal'), false);
  assert.match(check([{ cardId: 'ETERNAL_ONLY', count: 1 }], { format: 'Standard' }).errors.join(' '), /not legal in Standard/);
  assert.equal(check([{ cardId: 'STANDARD_ONLY', count: 1 }], { format: 'Standard' }).isValid, true);
  assert.match(check([{ cardId: 'STANDARD_ONLY', count: 1 }], { format: 'Eternal' }).errors.join(' '), /not legal in Eternal/);
  assert.match(check([{ cardId: 'TOKEN', count: 1 }]).errors.join(' '), /not deck-collectible/);
  assert.match(check([{ cardId: 'DISABLED', count: 1 }]).errors.join(' '), /disabled/);
  assert.match(check([{ cardId: 'D1', count: 1 }], { ownershipEnabled: true, ownedCardIds: [] }).errors.join(' '), /ownership collection/);
  assert.equal(check([{ cardId: 'D1', count: 1 }], { ownershipEnabled: true, ownedCardIds: ['D1'] }).isValid, true);
});

test('all eleven structured Origins accept their card predicates and reject a generic follower', () => {
  const allowed = {
    '06RU001': makeCard('BARD_CARD', { type: 'Spell', text: 'Plant 2 Chimes.' }),
    '06RU002': makeCard('JHIN_CARD', { hasSkill: true }),
    '06RU025': makeCard('EVELYNN_CARD', { text: 'Summon a Husk.' }),
    '06RU005': makeCard('KAYN_CARD', { subtypes: ['CULTIST'] }),
    '06RU006': makeCard('RYZE_CARD', { type: 'Spell', spellSpeed: 'Burst', text: 'Draw 1.' }),
    '06RU008': makeCard('JAX_CARD', { subtypes: ['WEAPONMASTER'] }),
    '06RU009': makeCard('VARUS_CARD', { subtypes: ['CULTIST'] }),
    '06RU026': makeCard('AATROX_CARD', { subtypes: ['DARKIN'] }),
    '07RU012': makeCard('NEEKO_CARD', { subtypes: ['BIRD'] }),
    '07RU015': makeCard('PORO_CARD', { name: 'Plucky Poro' }),
    '08RU014': makeCard('DRAGON_CARD', { cost: 6 }),
  };
  assert.equal(Object.keys(ORIGIN_DEFINITIONS).length, 11);
  for (const [championId, origin] of Object.entries(ORIGIN_DEFINITIONS)) {
    assert.equal(origin.allows(allowed[championId], db), true, origin.name);
    assert.equal(origin.allows(makeCard('GENERIC'), db), false, `${origin.name} rejected generic follower`);
  }
  const targeted = makeCard('TARGETED', { type: 'Spell', spellSpeed: 'Burst', text: 'Deal 1 to an enemy unit.' });
  assert.equal(ORIGIN_DEFINITIONS['06RU006'].allows(targeted, db), false);
});

test('pinned card data supports Jhin Skills and excludes targeted spells from Ryze', async () => {
  const payload = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
  const realDB = new CardDB({ riotPayload: payload });
  assert.equal(ORIGIN_DEFINITIONS['06RU002'].allows(realDB.get('01FR036'), realDB), true);
  assert.equal(ORIGIN_DEFINITIONS['06RU002'].allows(realDB.get('01DE001'), realDB), false);
  assert.equal(ORIGIN_DEFINITIONS['06RU006'].allows(realDB.get('01DE019'), realDB), true);
  for (const id of ['01PZ052', '01IO010', '04IO007', '01NX025', '01FR042']) {
    assert.equal(ORIGIN_DEFINITIONS['06RU006'].allows(realDB.get(id), realDB), false, realDB.get(id)?.name);
  }
});

test('official Riot deck-code vectors decode and re-encode without count changes', async () => {
  const vectors = JSON.parse(await readFile(new URL('./deckCodesTestData.json', import.meta.url), 'utf8'));
  assert.equal(vectors.length, 24);
  for (const vector of vectors) {
    const decoded = decodeDeckCode(vector.code);
    const actual = Object.fromEntries(decoded.map((entry) => [entry.cardId, entry.count]));
    const expected = Object.fromEntries(vector.cards.map((entry) => {
      const [count, cardId] = entry.split(':');
      return [cardId, Number(count)];
    }));
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.fromEntries(decodeDeckCode(encodeDeckCode(decoded)).map((entry) => [entry.cardId, entry.count])), expected);
  }
});
