import { activeOrigins, isCardAllowedByOrigins, originForChampion } from './origins.js';

export const STANDARD_REGIONS = Object.freeze([
  'Demacia', 'Noxus', 'Freljord', 'Ionia', 'PiltoverZaun',
  'ShadowIsles', 'Bilgewater', 'Targon', 'Shurima', 'BandleCity',
]);

export function normalizeFormat(format) {
  const value = String(format || 'Eternal').toLowerCase();
  if (value === 'standard' || value.includes('formats_standard')) return 'Standard';
  if (value === 'eternal' || value.includes('formats_eternal')) return 'Eternal';
  return null;
}

export function cardLegalInFormat(card, format) {
  const normalized = normalizeFormat(format);
  if (!normalized) return false;
  return (card?.formats || []).some((value) => normalizeFormat(value) === normalized);
}

function combinations(list, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) {
    out.push([...prefix]);
    return out;
  }
  for (let index = start; index < list.length; index++) {
    prefix.push(list[index]);
    combinations(list, size, index + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

function normalRegions(card) {
  return (card?.regions || []).filter((region) => STANDARD_REGIONS.includes(region));
}

function selectedRegionList(selectedRegions) {
  if (!Array.isArray(selectedRegions) || !selectedRegions.length) return null;
  return [...new Set(selectedRegions.filter((region) => region !== 'Runeterra'))];
}

function configurationErrors(entries, regions, origins, cardDB, maxRegions) {
  const errors = [];
  const uncovered = entries.filter(({ card, regions: cardRegions, origin }) => {
    if (origin) return false;
    if (!cardRegions.length) return false;
    return !cardRegions.some((region) => regions.includes(region)) && !isCardAllowedByOrigins(card, origins, cardDB);
  });
  if (uncovered.length) {
    errors.push(`Deck cards are not permitted by its regions or Origins: ${uncovered.map(({ card }) => card.name).join(', ')}`);
  }
  const monoRegions = entries.filter(({ regions: cardRegions }) => cardRegions.length === 1);
  const missingAnchors = entries.filter(({ card, regions: cardRegions }) => cardRegions.length > 1
    && !monoRegions.some(({ card: anchor, regions: anchorRegions }) => anchor.id !== card.id
      && anchorRegions.some((region) => cardRegions.includes(region))));
  for (const { card } of missingAnchors) errors.push(`${card.name} needs a mono-region card from one of its regions as an anchor`);
  if (regions.length + origins.length > maxRegions) {
    errors.push(`Deck uses ${regions.length + origins.length} region/Origin slots; maximum is ${maxRegions}`);
  }
  return errors;
}

function resolvedSlots(regions, origins) {
  return [
    ...regions.map((id) => ({ type: 'region', id })),
    ...origins.map((origin) => ({ type: 'origin', id: origin.id, championId: origin.championId, name: origin.name })),
  ];
}

export function resolveDeckConfiguration(entries, cardDB, {
  selectedRegions = null,
  maxRegions = 2,
  origins = null,
} = {}) {
  const active = origins || activeOrigins(entries.map((entry) => ({ card: entry.card, count: entry.count })), cardDB);
  const selected = selectedRegionList(selectedRegions);
  if (selected) {
    const unknown = selected.filter((region) => !STANDARD_REGIONS.includes(region));
    const errors = configurationErrors(entries, selected, active, cardDB, maxRegions);
    if (unknown.length) errors.push(`Unknown deck regions: ${unknown.join(', ')}`);
    return {
      regions: selected,
      origins: active,
      resolvedRegionsAndOrigins: resolvedSlots(selected, active),
      errors,
    };
  }

  const candidates = STANDARD_REGIONS.filter((region) => entries.some((entry) => entry.regions.includes(region)));
  const slotCount = Math.max(0, maxRegions - active.length);
  for (let size = 0; size <= Math.min(slotCount, candidates.length); size++) {
    for (const regions of combinations(candidates, size)) {
      const errors = configurationErrors(entries, regions, active, cardDB, maxRegions);
      if (!errors.length) {
        return { regions, origins: active, resolvedRegionsAndOrigins: resolvedSlots(regions, active), errors: [] };
      }
    }
  }
  const errors = [`Deck cannot be covered by ${maxRegions} region/Origin slots with the required mono-region anchors`];
  if (active.length > maxRegions) errors.push(`Deck uses ${active.length} Origins; maximum is ${maxRegions}`);
  return { regions: [], origins: active, resolvedRegionsAndOrigins: resolvedSlots([], active), errors };
}

export function findDeckRegions(regionSets, maxRegions = 2, cardDB = null) {
  const entries = (regionSets || []).map(({ card, regions }) => ({
    card,
    count: 1,
    regions: (regions || normalRegions(card)).filter((region) => STANDARD_REGIONS.includes(region)),
    origin: originForChampion(card),
  }));
  const resolved = resolveDeckConfiguration(entries, cardDB, { maxRegions });
  return resolved.errors.length ? null : resolved.regions;
}

export class DeckValidator {
  constructor(cardDB, { rules = {}, format = null, ownedCardIds = null, ownershipEnabled = null } = {}) {
    this.cardDB = cardDB;
    this.rules = rules;
    this.format = format || rules.format || 'Eternal';
    this.ownedCardIds = ownedCardIds;
    this.ownershipEnabled = ownershipEnabled;
  }

  validate(cards, {
    regions = null,
    format = this.format,
    ownedCardIds = this.ownedCardIds,
    ownershipEnabled = this.ownershipEnabled,
    ignoreDeckSize = false,
  } = {}) {
    const rules = this.rules || {};
    const deckSize = rules.deckSize ?? 40;
    const maxCopies = rules.maxCopies ?? 3;
    const maxRegions = rules.maxRegions ?? 2;
    const maxChampions = rules.maxChampions ?? 6;
    const errors = [];
    const warnings = [];
    const counts = new Map();
    const entriesById = new Map();
    const regionEntries = [];
    const normalizedFormat = normalizeFormat(format);
    let totalCards = 0;
    let championCopies = 0;

    if (!normalizedFormat) errors.push(`Unknown deck format: ${format}`);
    const owned = ownedCardIds == null ? null : new Set(ownedCardIds);
    const checkOwnership = ownershipEnabled ?? rules.ownershipEnabled ?? (owned !== null);

    for (const entry of cards || []) {
      const id = entry?.cardId || entry?.id;
      const count = Number(entry?.count || 0);
      if (!id || !Number.isInteger(count) || count < 1) {
        errors.push(`Invalid card entry: ${JSON.stringify(entry)}`);
        continue;
      }
      totalCards += count;
      counts.set(id, (counts.get(id) || 0) + count);
      if (!entriesById.has(id)) entriesById.set(id, { cardId: id, count: 0 });
      entriesById.get(id).count += count;
      const card = this.cardDB?.get(id);
      if (!card) {
        errors.push(`Unknown card: ${id}`);
        continue;
      }
      if (!card.collectible || card.type === 'Ability' || card.type === 'Trap') {
        errors.push(`${card.name} is not deck-collectible`);
      }
      if (card.enabled === false) errors.push(`${card.name} is disabled in the current pool`);
      if (normalizedFormat && !cardLegalInFormat(card, normalizedFormat)) {
        errors.push(`${card.name} is not legal in ${normalizedFormat}`);
      }
      if (checkOwnership && !owned?.has(id)) errors.push(`${card.name} is not in the enabled ownership collection`);
      if (card.supertype === 'Champion') championCopies += count;
      const origin = originForChampion(card);
      if (card.supertype === 'Champion' && normalRegions(card).length === 0 && (card.regions || []).includes('Runeterra') && !origin) {
        errors.push(`${card.name} has no supported Origin definition`);
      }
      regionEntries.push({ card, count, regions: normalRegions(card), origin });
    }

    for (const [id, count] of counts) {
      if (count > maxCopies) errors.push(`Too many copies of ${id} (${count}/${maxCopies})`);
    }
    if (championCopies > maxChampions) errors.push(`Deck has ${championCopies} champion cards; maximum is ${maxChampions}`);
    if (totalCards > deckSize) errors.push(`Deck has ${totalCards} cards; maximum is ${deckSize}`);

    const origins = activeOrigins(regionEntries, this.cardDB);
    const configuration = resolveDeckConfiguration(regionEntries, this.cardDB, {
      selectedRegions: regions,
      maxRegions,
      origins,
    });
    errors.push(...configuration.errors);
    const errorsBeforeSize = errors.length;
    if (!ignoreDeckSize && totalCards !== deckSize) errors.push(`Deck has ${totalCards} cards; exactly ${deckSize} required`);
    if (!ignoreDeckSize && totalCards < deckSize) warnings.push(`Deck is incomplete (${totalCards}/${deckSize})`);

    const isValid = errors.length === 0;
    const isPlayable = isValid && totalCards === deckSize;
    return {
      isValid,
      isPlayable,
      totalCards,
      championCopies,
      resolvedRegionsAndOrigins: configuration.resolvedRegionsAndOrigins,
      errors,
      warnings,
      ok: isPlayable,
      total: totalCards,
      regions: configuration.regions,
      origins: configuration.origins.map((origin) => origin.championId),
      counts: Object.fromEntries(counts),
      cards: [...entriesById.values()],
      format: normalizedFormat || format,
      status: isPlayable ? 'playable' : (totalCards < deckSize && errorsBeforeSize === 0 ? 'incomplete' : 'invalid'),
    };
  }

  validateAddition(cards, cardId, options = {}) {
    const card = this.cardDB?.get(cardId);
    if (!card) return { ok: false, reason: `Unknown card: ${cardId}`, validation: null, regions: [] };
    const next = (cards || []).map((entry) => ({ cardId: entry.cardId || entry.id, count: entry.count }));
    const existing = next.find((entry) => entry.cardId === cardId);
    if (existing) existing.count = Number(existing.count) + 1;
    else next.push({ cardId, count: 1 });
    const validation = this.validate(next, { ...options, ignoreDeckSize: true });
    return {
      ok: validation.errors.length === 0,
      reason: validation.errors[0] || '',
      validation,
      regions: validation.regions,
      cards: next,
    };
  }
}

export function validateDeck(cards, cardDB, rules = {}, selectedRegions = null, options = {}) {
  return new DeckValidator(cardDB, { rules, ...options }).validate(cards, {
    regions: selectedRegions,
    format: options.format || rules.format || 'Eternal',
    ignoreDeckSize: options.ignoreDeckSize || false,
  });
}

export function validateDeckAddition(cards, cardId, cardDB, rules = {}, selectedRegions = null, options = {}) {
  return new DeckValidator(cardDB, { rules, ...options }).validateAddition(cards, cardId, {
    regions: selectedRegions,
    format: options.format || rules.format || 'Eternal',
  });
}
