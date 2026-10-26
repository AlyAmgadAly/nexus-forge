// Deck validation, auto-building, starter decks and deck-code conversion.
import { decodeDeckCode, encodeDeckCode, parseCardCode } from '../shared/deckcode.js';
import { shuffle } from './engine/constants.js';

export function validateDeck(cards, cardDB, rules = {}, selectedRegions = null) {
  const deckSize = rules.deckSize ?? 40;
  const maxCopies = rules.maxCopies ?? 3;
  const maxRegions = rules.maxRegions ?? 2;
  const errors = [];
  const warnings = [];
  const regionSets = [];
  const counts = new Map();
  let total = 0;
  for (const entry of cards || []) {
    const id = entry.cardId || entry.id;
    const count = Number(entry.count || 0);
    if (!id || !Number.isInteger(count) || count < 1) {
      errors.push(`Invalid card entry: ${JSON.stringify(entry)}`);
      continue;
    }
    if (count > maxCopies) errors.push(`Too many copies of ${id} (${count}/${maxCopies})`);
    const card = cardDB.get(id);
    if (!card) { errors.push(`Unknown card: ${id}`); continue; }
    if (!card.collectible) errors.push(`Token cards can't be in a deck: ${card.name}`);
    if (!card.enabled) warnings.push(`${card.name} is disabled in the current pool`);
    if (card.type === 'Ability' || card.type === 'Trap') errors.push(`${card.name} can't be in a deck`);
    counts.set(id, (counts.get(id) || 0) + count);
    total += count;
    regionSets.push({ card, regions: (card.regions || []).filter((r) => r !== 'Runeterra') });
  }
  let regions = selectedRegions ? [...selectedRegions].filter((r) => r !== 'Runeterra') : null;
  if (regions && regions.length > maxRegions) {
    errors.push(`Deck uses ${regions.length} regions; maximum is ${maxRegions} (${regions.join(', ')})`);
  }
  if (regions) {
    for (const { card, regions: cardRegions } of regionSets) {
      if (!cardRegions.length) continue;
      if (!cardRegions.some((r) => regions.includes(r))) {
        errors.push(`${card.name} doesn't belong to ${regions.join(' + ')}`);
      }
    }
  }
  if (!regions) {
    const found = findDeckRegions(regionSets, maxRegions);
    if (found) {
      regions = found;
    } else if (regionSets.some((x) => x.regions.length)) {
      errors.push('Deck cannot be covered by two regions');
    }
  }
  if (total !== deckSize) errors.push(`Deck has ${total} cards; exactly ${deckSize} required`);
  return { ok: errors.length === 0, errors, warnings, total, regions: regions || [], counts: Object.fromEntries(counts) };
}

export function findDeckRegions(regionSets, maxRegions = 2) {
  const all = [...new Set(regionSets.flatMap((x) => x.regions))].sort();
  if (!all.length) return [];
  const covers = (selected) => regionSets.every(({ regions }) => !regions.length || regions.some((r) => selected.includes(r)));
  for (let size = 1; size <= Math.min(maxRegions, all.length); size++) {
    const combos = combinations(all, size);
    for (const combo of combos) {
      if (covers(combo)) return combo;
    }
  }
  return null;
}

function combinations(list, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) { out.push([...prefix]); return out; }
  for (let i = start; i < list.length; i++) {
    prefix.push(list[i]);
    combinations(list, size, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

export function deckFromCode(code, cardDB) {
  const decoded = decodeDeckCode(code);
  const cards = [];
  const missing = [];
  for (const entry of decoded) {
    const card = cardDB.get(entry.cardId);
    if (!card) missing.push(entry.cardId);
    else cards.push({ cardId: entry.cardId, count: entry.count });
  }
  const regionSets = cards.map((c) => {
    const card = cardDB.get(c.cardId);
    return { card, regions: (card?.regions || []).filter((r) => r !== 'Runeterra') };
  });
  const regions = findDeckRegions(regionSets, 2) || [...new Set(regionSets.flatMap((x) => x.regions))];
  return { cards, missing, regions, code: code.toUpperCase() };
}

export function deckToCode(cards) {
  const normalized = cards.map((c) => ({ cardId: c.cardId || c.id, count: c.count }));
  // Riot deck codes can only represent official card codes. Card Forge cards
  // still live in the saved deck JSON and can be submitted to a room; only the
  // optional share code is unavailable for those decks.
  if (normalized.some((card) => !parseCardCode(card.cardId))) return '';
  return encodeDeckCode(normalized);
}

export function normalizeCards(cards) {
  const map = new Map();
  for (const c of cards || []) {
    const id = c.cardId || c.id;
    const count = Number(c.count || 0);
    if (!id || !count) continue;
    map.set(id, Math.min(40, (map.get(id) || 0) + count));
  }
  return [...map.entries()].map(([cardId, count]) => ({ cardId, count }));
}

export function cardPool(cardDB, regions = [], { includeDisabled = false } = {}) {
  const regionSet = new Set(regions);
  return cardDB.collectible().filter((c) => {
    if (!includeDisabled && !c.enabled) return false;
    if (!regionSet.size) return true;
    const cardRegions = (c.regions || []).filter((r) => r !== 'Runeterra');
    // Runeterra champions are neutral; always allow them.
    if (!cardRegions.length) return true;
    return cardRegions.some((r) => regionSet.has(r));
  });
}

function take(pool, count, chosen, rng, maxCopies = 3) {
  const available = pool.filter((c) => (chosen.get(c.id) || 0) < maxCopies);
  if (!available.length) return false;
  for (let i = 0; i < count; i++) {
    const c = available[Math.floor(rng() * available.length)];
    chosen.set(c.id, (chosen.get(c.id) || 0) + 1);
    const idx = available.indexOf(c);
    if (idx >= 0 && (chosen.get(c.id) || 0) >= maxCopies) available.splice(idx, 1);
  }
  return true;
}

export function autoBuildDeck(cardDB, { regions = [], preferredChampions = [], seed = Date.now(), rules = {} } = {}) {
  const rng = (() => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const deckSize = rules.deckSize ?? 40;
  const chosen = new Map();
  const add = (card, count) => {
    if (!card) return;
    const current = chosen.get(card.id) || 0;
    const room = Math.min(count, 3 - current, deckSize - [...chosen.values()].reduce((a, b) => a + b, 0));
    if (room > 0) chosen.set(card.id, current + room);
  };
  const pool = cardPool(cardDB, regions);
  const byCost = (c) => c.cost ?? 0;
  const units = pool.filter((c) => c.type === 'Unit');
  const spells = pool.filter((c) => c.type === 'Spell' || c.type === 'Landmark' || c.type === 'Equipment');
  // Preferred champions (2 copies each) give each starter deck a face.
  for (const name of preferredChampions) {
    const card = pool.find((c) => c.name === name);
    if (card) add(card, 2);
  }
  // Fill a curve, alternating units and spells.
  const curve = [
    [1, 8], [2, 9], [3, 8], [4, 6], [5, 4], [6, 3], [7, 2],
  ];
  const fill = (list, target, maxCost = 99) => {
    let guard = 0;
    while ([...chosen.values()].reduce((a, b) => a + b, 0) < target && guard++ < 200) {
      const options = list.filter((c) => (chosen.get(c.id) || 0) < 3 && cardCost(c) <= maxCost && (regions.length === 0 || (c.regions || []).some((r) => regions.includes(r)) || (c.regions || []).every((r) => r === 'Runeterra')));
      if (!options.length) break;
      const card = options[Math.floor(rng() * options.length)];
      chosen.set(card.id, (chosen.get(card.id) || 0) + 1);
    }
  };
  const cardCost = (c) => c.cost ?? 0;
  // Fill each cost bucket with a mix of units and spells.
  for (const [cost, target] of curve) {
    const bucketUnits = units.filter((c) => cardCost(c) === cost);
    const bucketSpells = spells.filter((c) => cardCost(c) === cost);
    const wantUnits = Math.max(1, Math.round(target * 0.7));
    for (let i = 0; i < wantUnits; i++) {
      if (bucketUnits.length) {
        const card = bucketUnits[Math.floor(rng() * bucketUnits.length)];
        add(card, 1);
      }
    }
    for (let i = 0; i < target - wantUnits; i++) {
      if (bucketSpells.length) {
        const card = bucketSpells[Math.floor(rng() * bucketSpells.length)];
        add(card, 1);
      }
    }
  }
  // Guarantee at least 20 units and fill to 40.
  let total = [...chosen.values()].reduce((a, b) => a + b, 0);
  if (total < deckSize) {
    fill(units, Math.min(deckSize, total + 20));
    total = [...chosen.values()].reduce((a, b) => a + b, 0);
  }
  if (total < deckSize) fill([...units, ...spells], deckSize);
  // Trim if over.
  while ([...chosen.values()].reduce((a, b) => a + b, 0) > deckSize) {
    const entries = [...chosen.entries()];
    entries.sort((a, b) => b[1] - a[1]);
    const [id, count] = entries[0];
    if (count <= 1) chosen.delete(id); else chosen.set(id, count - 1);
  }
  const cards = [...chosen.entries()].map(([cardId, count]) => ({ cardId, count })).sort((a, b) => {
    const ca = cardDB.get(a.cardId), cb = cardDB.get(b.cardId);
    return (ca?.cost ?? 0) - (cb?.cost ?? 0) || (ca?.name || '').localeCompare(cb?.name || '');
  });
  return cards;
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
  for (let i = 0; i < STARTER_RECIPES.length; i++) {
    const recipe = STARTER_RECIPES[i];
    let cards = autoBuildDeck(cardDB, { regions: recipe.regions, preferredChampions: recipe.champions, seed: 1000 + i, rules });
    let validation = validateDeck(cards, cardDB, rules, recipe.regions);
    // If a recipe's region combination is thin, fill with neutral Runeterra cards.
    if (!validation.ok) {
      cards = autoBuildDeck(cardDB, { regions: [...recipe.regions, 'Runeterra'], preferredChampions: recipe.champions, seed: 2000 + i, rules });
      validation = validateDeck(cards, cardDB, rules, recipe.regions);
    }
    if (!validation.ok) continue;
    decks.push({
      id: recipe.id,
      name: recipe.name,
      regions: validation.regions,
      cards,
      code: deckToCode(cards),
      author: 'Nexus Forge',
      starter: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return decks;
}

export function randomDeck(cardDB, rules = {}) {
  const regions = [...new Set(cardDB.collectible().flatMap((c) => c.regions || []).filter((r) => r !== 'Runeterra'))];
  shuffle(regions, Math.random);
  const picked = regions.slice(0, 2);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cards = autoBuildDeck(cardDB, { regions: picked, seed: Date.now() + attempt * 37, rules });
    if (validateDeck(cards, cardDB, rules).ok) return { cards, regions: picked };
  }
  const cards = autoBuildDeck(cardDB, { regions: [], seed: Date.now(), rules });
  return { cards, regions: [...new Set(cards.flatMap((c) => cardDB.get(c.cardId)?.regions || []).filter((r) => r !== 'Runeterra'))].slice(0, 2) };
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
  for (const c of list) curve[c.cost] = (curve[c.cost] || 0) + c.count;
  return { cards: list, total, curve, regions: [...new Set(list.flatMap((c) => c.regions || []).filter((r) => r !== 'Runeterra'))] };
}

export { decodeDeckCode, encodeDeckCode, parseCardCode };
