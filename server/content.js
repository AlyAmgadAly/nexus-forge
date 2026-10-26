// Canonical content fingerprints, bounded peer payload sanitizers and room catalogs.
import crypto from 'node:crypto';
import {
  APP_VERSION, ENGINE_SCHEMA, PROTOCOL_VERSION, MAX_CONTENT_TRANSFER_BYTES,
  MAX_CUSTOM_ART_BYTES, MAX_CUSTOM_CARDS, MAX_DECK_BYTES,
} from '../shared/protocol.js';
import { validateScript } from './script-validation.js';

export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function hashJson(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function cardDefinition(card) {
  return [
    card.id, card.name, card.cost, card.attack, card.health, card.type, card.supertype,
    card.subtypes || [], card.regions || [], card.rarity, card.keywords || [], card.text || '',
    card.levelup || '', card.spellSpeed || '', !!card.collectible, card.set || '',
  ];
}

export function hashCard(card) {
  return hashJson(cardDefinition(card));
}

export function sanitizeCustomCard(input) {
  const warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Custom card must be an object.'], warnings };
  }
  const id = String(input.id || input.code || '').trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) return { ok: false, errors: ['Custom card id is invalid.'], warnings };
  const name = String(input.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  if (!name) return { ok: false, errors: [`Custom card ${id} needs a name.`], warnings };
  const int = (value, fallback = 0, min = -99, max = 999) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  const strings = (value, limit, length) => (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim().slice(0, length)).filter(Boolean).slice(0, limit);
  const text = String(input.text || '').slice(0, 2000);
  const art = typeof input.art === 'string' && /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(input.art)
    ? input.art : null;
  if (art && Buffer.byteLength(art) > MAX_CUSTOM_ART_BYTES) {
    warnings.push(`Art for ${name} was dropped because it exceeds the transfer limit.`);
  }
  const fullArt = typeof input.fullArt === 'string' && /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(input.fullArt)
    && Buffer.byteLength(input.fullArt) <= MAX_CUSTOM_ART_BYTES ? input.fullArt : null;
  const card = {
    id,
    code: id,
    name,
    cost: int(input.cost, 0, 0, 30),
    attack: int(input.attack, 0, 0, 30),
    health: int(input.health, 1, 1, 30),
    type: ['Unit', 'Spell', 'Landmark', 'Equipment'].includes(input.type) ? input.type : 'Unit',
    supertype: String(input.supertype || '').slice(0, 40),
    subtypes: strings(input.subtypes, 12, 40),
    regions: strings(input.regions, 4, 40).length ? strings(input.regions, 4, 40) : ['Runeterra'],
    rarity: String(input.rarity || 'COMMON').slice(0, 30),
    rarityName: String(input.rarityName || 'Common').slice(0, 30),
    keywords: strings(input.keywords, 20, 50),
    rawKeywords: strings(input.rawKeywords?.length ? input.rawKeywords : input.keywords, 20, 50),
    text,
    levelup: String(input.levelup || '').slice(0, 1000),
    flavor: String(input.flavor || '').slice(0, 1000),
    artist: String(input.artist || '').slice(0, 100),
    set: 'Custom',
    setName: 'Custom Forge',
    collectible: true,
    spellSpeed: String(input.spellSpeed || '').slice(0, 20),
    formats: ['Standard'],
    associatedCardRefs: strings(input.associatedCardRefs, 10, 40),
    art: art && Buffer.byteLength(art) <= MAX_CUSTOM_ART_BYTES ? art : null,
    fullArt: fullArt || null,
    source: 'custom',
    enabled: true,
    script: null,
    scriptStatus: text ? 'manual' : 'none',
    notes: String(input.notes || '').slice(0, 500),
  };
  return { ok: true, card, warnings, errors: [] };
}

export function sanitizeContentOffer(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, cards: [], scripts: {}, errors: ['Content offer must be an object.'], warnings };
  }
  const cards = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw.cards) ? raw.cards : []) {
    if (cards.length >= MAX_CUSTOM_CARDS) { errors.push(`A content offer may contain at most ${MAX_CUSTOM_CARDS} cards.`); break; }
    const clean = sanitizeCustomCard(entry);
    warnings.push(...clean.warnings);
    if (!clean.ok) { errors.push(...clean.errors); continue; }
    if (seen.has(clean.card.id)) { errors.push(`Duplicate custom card ${clean.card.id}.`); continue; }
    seen.add(clean.card.id);
    cards.push(clean.card);
  }
  const scripts = {};
  for (const [id, entry] of Object.entries(raw.scripts && typeof raw.scripts === 'object' ? raw.scripts : {})) {
    if (!seen.has(id)) continue;
    const script = entry?.script ?? entry;
    const validation = validateScript(script);
    if (!validation.ok) { errors.push(`Script for ${id}: ${validation.errors.join('; ')}`); continue; }
    warnings.push(...validation.warnings.map((warning) => `Script for ${id}: ${warning}`));
    scripts[id] = { script, status: 'custom' };
  }
  const payload = { cards, scripts };
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_CONTENT_TRANSFER_BYTES) {
    errors.push('Content offer exceeds the room transfer limit.');
  }
  return { ok: errors.length === 0, cards, scripts, errors, warnings };
}

export function sanitizeDeckPayload(raw, { maxBytes = MAX_DECK_BYTES } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, deck: null, errors: ['Deck payload must be an object.'] };
  }
  try {
    if (Buffer.byteLength(JSON.stringify(raw)) > maxBytes) {
      return { ok: false, deck: null, errors: ['Deck payload is too large.'] };
    }
  } catch {
    return { ok: false, deck: null, errors: ['Deck payload is not serializable.'] };
  }
  const map = new Map();
  let total = 0;
  for (const entry of Array.isArray(raw.cards) ? raw.cards : []) {
    const id = String(entry?.cardId || entry?.id || '').trim();
    const count = Number(entry?.count);
    if (!id || !Number.isInteger(count) || count < 1 || count > 40) {
      errors.push('Deck contains an invalid card entry.');
      continue;
    }
    map.set(id, (map.get(id) || 0) + count);
    total += count;
    if (total > 500) { errors.push('Deck contains too many cards.'); break; }
  }
  if (!map.size) errors.push('Deck contains no cards.');
  const cards = [...map.entries()].map(([cardId, count]) => ({ cardId, count }));
  const regions = Array.isArray(raw.regions)
    ? raw.regions.map((region) => String(region || '').slice(0, 40)).filter(Boolean).slice(0, 4)
    : undefined;
  const name = String(raw.name || 'Submitted deck').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Submitted deck';
  return {
    ok: errors.length === 0,
    deck: errors.length ? null : { name, cards, regions },
    errors,
  };
}

export function unknownDeckCards(deck, cardDB) {
  const unknown = [];
  for (const entry of deck?.cards || []) {
    if (!cardDB.get(entry.cardId)) unknown.push(entry.cardId);
  }
  return unknown;
}

export function contentManifest(store) {
  const cards = (store.cardsPayload?.cards || []).map(cardDefinition).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const pool = (store.cardDB?.enabledCards() || []).map((card) => card.id).sort();
  const rules = store.rules || {};
  const customCards = (store.customCards || []).map((card) => ({
    id: card.id,
    name: card.name,
    hash: hashJson({ card: cardDefinition(card), script: store.scripts?.[card.id]?.script || null }),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const customKeywords = (store.keywords || []).map((keyword) => keyword.name).sort();
  return {
    protocol: PROTOCOL_VERSION,
    schema: ENGINE_SCHEMA,
    appVersion: APP_VERSION,
    cardsVersion: store.cardsPayload?.version || '',
    cardsHash: hashJson(cards),
    scriptsHash: hashJson(store.scripts || {}),
    mechanicsHash: hashJson(store.mechanics || []),
    keywordsHash: hashJson(customKeywords),
    rulesHash: hashJson(rules),
    poolHash: hashJson({ pool, rules }),
    rules: { ...rules },
    customCards,
  };
}

export function roomManifest(room) {
  return {
    ...room.manifestBase,
    roomCode: room.code,
    catalogVersion: room.catalogVersion || 1,
    contentLocked: !!room.contentLocked,
    customCards: (room.catalogCards || []).map((card) => ({
      id: card.id,
      name: card.name,
      hash: room.cardHashes?.get(card.id) || hashCard(card),
    })),
  };
}

export function sanitizeRoomCatalog(cards, scripts, mechanics = []) {
  const cleanCards = [];
  const cleanScripts = {};
  for (const card of cards) {
    const clean = sanitizeCustomCard(card);
    if (clean.ok) {
      cleanCards.push(clean.card);
      const entry = scripts?.[card.id];
      if (entry?.script) {
        const validation = validateScript(entry.script);
        if (validation.ok) cleanScripts[card.id] = { script: entry.script, status: entry.status || 'custom' };
      }
    }
  }
  const cleanMechanics = (Array.isArray(mechanics) ? mechanics : []).slice(0, 100).map((mechanic) => ({
    id: String(mechanic.id || '').slice(0, 60),
    name: String(mechanic.name || '').slice(0, 60),
    description: String(mechanic.description || '').slice(0, 400),
    template: mechanic.template && typeof mechanic.template === 'object' ? mechanic.template : { triggers: [] },
  })).filter((mechanic) => mechanic.id && mechanic.name);
  const payload = { cards: cleanCards, scripts: cleanScripts, mechanics: cleanMechanics };
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_CONTENT_TRANSFER_BYTES) {
    return { ok: false, cards: [], scripts: {}, mechanics: [], error: 'The room custom content is too large to transfer.' };
  }
  return { ok: true, ...payload };
}
