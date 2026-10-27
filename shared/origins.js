const subtypes = (card) => (card?.subtypes || []).map((value) => String(value).toUpperCase());
const rulesText = (card) => String(card?.text || '');
const isFollower = (card) => card?.type === 'Unit' && card?.supertype !== 'Champion';
const hasSubtype = (card, values) => values.some((value) => subtypes(card).includes(value));

function followerHasSkill(card, cardDB) {
  if (typeof card?.hasSkill === 'boolean') return card.hasSkill;
  return (card?.associatedCardRefs || []).some((id) => {
    const associated = cardDB?.get(id);
    return associated?.type === 'Ability' && (associated.keywords || associated.rawKeywords || []).includes('Skill');
  });
}

function targetedSpell(card) {
  if (typeof card?.targeted === 'boolean') return card.targeted;
  if (card?.targetSpecs?.length) return true;
  const text = rulesText(card);
  return /\b(?:deal|give|grant|heal|stun|recall|kill|destroy|obliterate|capture|frostbite|strike|transform|silence|detain|devour|equip|forge|drain|revive|swap)\b[^.\r\n]*\b(?:an?|the|another|other|2|two|3|three)\s+(?:enemy(?!\s+Nexus)|enemies|ally|allies|unit|units|champion|champions|follower|followers|landmark|landmarks|equipment|anything)/i.test(text);
}

export const ORIGIN_DEFINITIONS = Object.freeze({
  '06RU001': {
    id: '06RU001T9', championId: '06RU001', name: 'The Wandering Caretaker',
    allows: (card) => /\bplant(?:s|ing)?\b[^.\r\n]*\bchimes?\b/i.test(rulesText(card)),
  },
  '06RU002': {
    id: '06RU002T5', championId: '06RU002', name: 'The Virtuoso',
    allows: (card, cardDB) => isFollower(card) && followerHasSkill(card, cardDB),
  },
  '06RU025': {
    id: '06RU025T14', championId: '06RU025', name: "Agony's Embrace",
    allows: (card) => /\bsummon(?:s|ing)?\b[^.\r\n]*\bhusks?\b/i.test(rulesText(card)),
  },
  '06RU005': {
    id: '06RU005T6', championId: '06RU005', name: 'The Shadow Reaper',
    allows: (card) => hasSubtype(card, ['CULTIST']),
  },
  '06RU006': {
    id: '06RU006T8', championId: '06RU006', name: 'The Rune Mage',
    allows: (card) => card?.type === 'Spell'
      && ['Burst', 'Focus'].includes(card.spellSpeed || (card.keywords || []).find((keyword) => ['Burst', 'Focus'].includes(keyword)))
      && !targetedSpell(card),
  },
  '06RU008': {
    id: '06RU008T5', championId: '06RU008', name: 'Grandmaster at Arms',
    allows: (card) => hasSubtype(card, ['WEAPONMASTER']),
  },
  '06RU009': {
    id: '06RU009T11', championId: '06RU009', name: 'The Arrow of Retribution',
    allows: (card) => hasSubtype(card, ['CULTIST']),
  },
  '06RU026': {
    id: '06RU026T6', championId: '06RU026', name: 'The World Ender',
    allows: (card) => card?.supertype !== 'Champion' && hasSubtype(card, ['DARKIN']),
  },
  '07RU012': {
    id: '07RU012T4', championId: '07RU012', name: 'Many-Shaped Jungle Friends!',
    allows: (card) => isFollower(card) && hasSubtype(card, ['BIRD', 'CAT', 'DOG', 'ELNUK', 'FAE', 'REPTILE', 'SPIDER']),
  },
  '07RU015': {
    id: '07RU015T1', championId: '07RU015', name: "The Poro King's Decree",
    allows: (card) => card?.supertype !== 'Champion'
      && (/\bporo\b/i.test(card?.name || '') || /\bporo\b/i.test(rulesText(card)) || hasSubtype(card, ['PORO'])),
  },
  '08RU014': {
    id: '08RU014T3', championId: '08RU014', name: 'Aspect of the Dragon',
    allows: (card) => isFollower(card) && Number(card?.cost || 0) >= 6,
  },
});

export function originForChampion(card) {
  return ORIGIN_DEFINITIONS[card?.id] || null;
}

export function activeOrigins(cards, cardDB) {
  const origins = new Map();
  for (const entry of cards || []) {
    const card = entry?.card || cardDB?.get(entry?.cardId || entry?.id) || entry;
    if (card?.supertype !== 'Champion') continue;
    const origin = originForChampion(card);
    if (origin) origins.set(origin.championId, origin);
  }
  return [...origins.values()];
}

export function isCardAllowedByOrigins(card, origins, cardDB) {
  return (origins || []).some((origin) => origin.allows(card, cardDB));
}
