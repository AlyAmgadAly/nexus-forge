// Riot's official Legends of Runeterra deck code format (Base32 + varints).
// Ported from the public Riot deck-code specification implementation.
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CHAR_MAP = Object.fromEntries([...DIGITS].map((c, i) => [c, i]));
const SHIFT = 5;
const MASK = 31;

export const FACTIONS = {
  DE: [0, 1], FR: [1, 1], IO: [2, 1], NX: [3, 1], PZ: [4, 1], SI: [5, 1],
  BW: [6, 2], MT: [9, 2], SH: [7, 3], BC: [10, 4], RU: [12, 5],
};
const FACTION_BY_ID = Object.fromEntries(Object.entries(FACTIONS).map(([code, [id, version]]) => [id, { code, id, version }]));
const FORMAT = 1;
const MAX_VERSION = 5;

function base32Decode(encoded) {
  const clean = String(encoded || '').trim().replace(/-/g, '').replace(/=+$/g, '').toUpperCase();
  if (!clean) throw new TypeError('Invalid deck code');
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (const c of clean) {
    const v = CHAR_MAP[c];
    if (v === undefined) throw new TypeError(`Invalid deck code character: ${c}`);
    buffer = (buffer << SHIFT) | v;
    bits += SHIFT;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

function base32Encode(bytes) {
  if (!bytes.length) return '';
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | (b & 0xff);
    bits += 8;
    while (bits >= SHIFT) {
      out += DIGITS[(buffer >> (bits - SHIFT)) & MASK];
      bits -= SHIFT;
    }
  }
  if (bits > 0) out += DIGITS[(buffer << (SHIFT - bits)) & MASK];
  return out;
}

function popVarInt(bytes) {
  let result = 0;
  let shift = 0;
  let popped = 0;
  for (let i = 0; i < bytes.length; i++) {
    popped++;
    const current = bytes[i] & 0x7f;
    result |= current << shift;
    if ((bytes[i] & 0x80) !== 0x80) {
      bytes.splice(0, popped);
      return result >>> 0;
    }
    shift += 7;
  }
  throw new TypeError('Invalid varint in deck code');
}

function varInt(value) {
  const out = [];
  let v = Number(value) >>> 0;
  if (v === 0) return [0];
  while (v !== 0) {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  }
  return out;
}

export function parseCardCode(cardId) {
  const code = String(cardId || '').toUpperCase();
  const m = /^(\d{2})([A-Z]{2})(\d{3})$/.exec(code);
  if (!m) return null;
  const faction = FACTIONS[m[2]];
  if (!faction) return null;
  return { code, set: Number(m[1]), faction: m[2], factionId: faction[0], version: faction[1], number: Number(m[3]) };
}

export function decodeDeckCode(code) {
  const bytes = base32Decode(code);
  if (!bytes.length) throw new TypeError('Invalid deck code');
  const first = bytes.shift();
  const format = first >> 4;
  const version = first & 0xf;
  if (format !== FORMAT) throw new TypeError('This is not a deck code');
  if (version > MAX_VERSION) throw new TypeError('This deck code is from a newer version');
  const result = [];
  for (let count = 3; count >= 1; count--) {
    const groups = popVarInt(bytes);
    for (let g = 0; g < groups; g++) {
      const inGroup = popVarInt(bytes);
      const set = popVarInt(bytes);
      const factionId = popVarInt(bytes);
      const faction = FACTION_BY_ID[factionId];
      if (!faction) throw new TypeError(`Unknown faction id ${factionId}`);
      for (let i = 0; i < inGroup; i++) {
        const number = popVarInt(bytes);
        result.push({
          cardId: `${String(set).padStart(2, '0')}${faction.code}${String(number).padStart(3, '0')}`,
          count,
        });
      }
    }
  }
  while (bytes.length > 0) {
    const count = popVarInt(bytes);
    const set = popVarInt(bytes);
    const factionId = popVarInt(bytes);
    const number = popVarInt(bytes);
    const faction = FACTION_BY_ID[factionId];
    if (!faction) throw new TypeError(`Unknown faction id ${factionId}`);
    result.push({
      cardId: `${String(set).padStart(2, '0')}${faction.code}${String(number).padStart(3, '0')}`,
      count,
    });
  }
  return result;
}

function groupCards(cards) {
  const groups = [];
  const remaining = [...cards];
  while (remaining.length) {
    const first = remaining.shift();
    const group = [first];
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].set === first.set && remaining[i].faction === first.faction) {
        group.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }
    group.sort((a, b) => a.code.localeCompare(b.code));
    groups.push(group);
  }
  return groups.sort((a, b) => a.length - b.length);
}

function encodeGroup(group) {
  const out = [...varInt(group.length)];
  const first = group[0];
  out.push(...varInt(first.set), ...varInt(first.factionId));
  for (const card of group) out.push(...varInt(card.number));
  return out;
}

export function encodeDeckCode(cards) {
  if (!Array.isArray(cards) || !cards.length) throw new TypeError('Deck is empty');
  const normalized = cards.map((c) => {
    const count = Number(c.count || 0);
    if (!Number.isInteger(count) || count < 1) throw new TypeError('Invalid card count');
    const parsed = parseCardCode(c.cardId || c.id || c);
    if (!parsed) throw new TypeError(`Invalid card code: ${c.cardId || c.id || c}`);
    return { ...parsed, count };
  });
  const version = Math.max(1, ...normalized.map((c) => c.version || 1));
  const grouped3 = groupCards(normalized.filter((c) => c.count === 3));
  const grouped2 = groupCards(normalized.filter((c) => c.count === 2));
  const grouped1 = groupCards(normalized.filter((c) => c.count === 1));
  const over = normalized.filter((c) => c.count > 3).sort((a, b) => a.code.localeCompare(b.code));
  const bytes = [((FORMAT << 4) | version) & 0xff];
  for (const group of [grouped3, grouped2, grouped1]) {
    bytes.push(...varInt(group.length));
    for (const list of group) bytes.push(...encodeGroup(list));
  }
  for (const c of over) {
    bytes.push(...varInt(c.count), ...varInt(c.set), ...varInt(c.factionId), ...varInt(c.number));
  }
  return base32Encode(bytes);
}

export function deckCodeSummary(code) {
  const cards = decodeDeckCode(code);
  return cards.reduce((n, c) => n + c.count, 0);
}
