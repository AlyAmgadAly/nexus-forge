import { decodeDeckCode, encodeDeckCode, parseCardCode } from '../shared/deckcode.js';
import { findDeckRegions, validateDeck, validateDeckAddition } from '../shared/deck-validator.js';
import { shuffle } from './engine/constants.js';

export { findDeckRegions, validateDeck };

export function deckFromCode(code, cardDB) {
  const decoded = decodeDeckCode(code);
  const cards = decoded.map((entry) => ({ cardId: entry.cardId, count: entry.count }));
  const missing = cards.filter((entry) => !cardDB.get(entry.cardId)).map((entry) => entry.cardId);
  const regionSets = cards.flatMap((entry) => {
    const card = cardDB.get(entry.cardId);
    return card ? [{ card, regions: (card.regions || []).filter((region) => region !== 'Runeterra') }] : [];
  });
  const regions = findDeckRegions(regionSets, 2, cardDB)
    || [...new Set(regionSets.flatMap((entry) => entry.regions))];
  return { cards, missing, regions, code: code.toUpperCase() };
}

export function deckToCode(cards) {
  const normalized = cards.map((card) => ({ cardId: card.cardId || card.id, count: card.count }));
  if (!normalized.length || normalized.some((card) => !parseCardCode(card.cardId))) return '';
  return encodeDeckCode(normalized);
}

export function normalizeCards(cards) {
  const map = new Map();
  for (const entry of cards || []) {
    const id = entry.cardId || entry.id;
    const count = Number(entry.count || 0);
    if (!id || !count) continue;
    map.set(id, (map.get(id) || 0) + count);
  }
  return [...map.entries()].map(([cardId, count]) => ({ cardId, count }));
}

export function cardPool(cardDB, regions = [], { includeDisabled = false } = {}) {
  const regionSet = new Set(regions);
  return cardDB.collectible().filter((card) => {
    if (!includeDisabled && !card.enabled) return false;
    if (!regionSet.size) return true;
    const cardRegions = (card.regions || []).filter((region) => region !== 'Runeterra');
    if (!cardRegions.length) return true;
    return cardRegions.some((region) => regionSet.has(region));
  });
}

export function autoBuildDeck(cardDB, {
  regions = [], preferredChampions = [], seed = Date.now(), rules = {}, format = rules.format || 'Eternal',
} = {}) {
  let state = seed >>> 0;
  const rng = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const deckSize = rules.deckSize ?? 40;
  const maxCopies = rules.maxCopies ?? 3;
  const selectedRegions = regions.filter((region) => region !== 'Runeterra');
  const pool = cardDB.collectible().filter((card) => card.enabled);
  let cards = [];
  let total = 0;
  const add = (card, count = 1) => {
    for (let index = 0; index < count && total < deckSize; index++) {
      const current = cards.find((entry) => entry.cardId === card?.id)?.count || 0;
      if (!card || current >= maxCopies) return;
      const result = validateDeckAddition(cards, card.id, cardDB, rules, selectedRegions, { format });
      if (!result.ok) return;
      cards = result.cards;
      total++;
    }
  };
  for (const name of preferredChampions) add(pool.find((card) => card.name === name), 2);

  const byId = new Map(pool.map((card) => [card.id, card]));
  const ordered = [];
  for (let cost = 0; cost <= 30; cost++) {
    const bucket = pool.filter((card) => (card.cost ?? 0) === cost);
    const units = bucket.filter((card) => card.type === 'Unit');
    const other = bucket.filter((card) => card.type !== 'Unit');
    shuffle(units, rng);
    shuffle(other, rng);
    ordered.push(...units, ...other);
  }
  const remaining = pool.filter((card) => !ordered.includes(card));
  shuffle(remaining, rng);
  ordered.push(...remaining);

  for (let pass = 0; pass < 12 && total < deckSize; pass++) {
    const before = total;
    for (const card of ordered) {
      if (total >= deckSize) break;
      add(card);
    }
    if (total === before) break;
  }
  return cards
    .map((entry) => ({ ...entry, card: byId.get(entry.cardId) }))
    .sort((a, b) => (a.card?.cost ?? 0) - (b.card?.cost ?? 0) || (a.card?.name || '').localeCompare(b.card?.name || ''))
    .map(({ cardId, count }) => ({ cardId, count }));
}

export const STARTER_RECIPES = [
  { id: 'starter-demacia-ionia', name: 'Vanguard Disciplines', regions: ['Demacia', 'Ionia'], champions: ['Garen', 'Lux', 'Shen', 'Zed'] },
  { id: 'starter-noxus-isles', name: 'Reckless Revenants', regions: ['Noxus', 'ShadowIsles'], champions: ['Darius', 'Draven', 'Elise', 'Thresh'] },
  { id: 'starter-freljord-pz', name: 'Frost & Flame', regions: ['Freljord', 'PiltoverZaun'], champions: ['Braum', 'Tryndamere', 'Jinx', 'Heimerdinger'] },
  { id: 'starter-bilgewater-targon', name: 'Tides of the Peak', regions: ['Bilgewater', 'Targon'], champions: ['Miss Fortune', 'Gangplank', 'Leona', 'Aphelios'] },
  { id: 'starter-shurima-bandle', name: 'Sands & Secrets', regions: ['Shurima', 'BandleCity'], champions: ['Azir', "Rek'Sai", 'Teemo', 'Tristana'] },
  { id: 'starter-runeterra', name: 'Runeterra Wanderers', regions: ['Targon'], champions: ['Bard', 'Jax', 'Evelynn', 'Neeko'] },
];

export function makeStarterDecks(cardDB, rules = {}) {
  const decks = [];
  for (let index = 0; index < STARTER_RECIPES.length; index++) {
    const recipe = STARTER_RECIPES[index];
    const cards = autoBuildDeck(cardDB, {
      regions: recipe.regions,
      preferredChampions: recipe.champions,
      seed: 1000 + index,
      rules,
    });
    const validation = validateDeck(cards, cardDB, rules, recipe.regions);
    if (!validation.ok) continue;
    decks.push({
      id: recipe.id,
      name: recipe.name,
      regions: validation.regions,
      cards,
      code: deckToCode(cards),
      format: validation.format,
      author: 'Nexus Forge',
      starter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return decks;
}

export function randomDeck(cardDB, rules = {}) {
  const regions = [...new Set(cardDB.collectible().flatMap((card) => card.regions || []).filter((region) => region !== 'Runeterra'))];
  shuffle(regions, Math.random);
  const picked = regions.slice(0, 2);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cards = autoBuildDeck(cardDB, { regions: picked, seed: Date.now() + attempt * 37, rules });
    if (validateDeck(cards, cardDB, rules, picked).ok) return { cards, regions: picked };
  }
  const cards = autoBuildDeck(cardDB, { regions: [], seed: Date.now(), rules });
  return { cards, regions: validateDeck(cards, cardDB, rules).regions };
}

export function summarizeDeck(cards, cardDB) {
  const list = [];
  let total = 0;
  for (const entry of cards) {
    const card = cardDB.get(entry.cardId || entry.id);
    if (!card) continue;
    total += entry.count;
    list.push({ ...entry, cardId: card.id, name: card.name, cost: card.cost, type: card.type, regions: card.regions, art: card.art, fullArt: card.fullArt, attack: card.attack, health: card.health, keywords: card.keywords, text: card.text });
  }
  const curve = {};
  for (const card of list) curve[card.cost] = (curve[card.cost] || 0) + card.count;
  return { cards: list, total, curve, regions: [...new Set(list.flatMap((card) => card.regions || []).filter((region) => region !== 'Runeterra'))] };
}

export { decodeDeckCode, encodeDeckCode, parseCardCode };
