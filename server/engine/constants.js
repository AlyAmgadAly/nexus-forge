// Shared vocabulary for the Nexus Forge rules engine.
export const KEYWORD_ALIASES = {
  QuickStrike: 'Quick Attack',
  DoubleStrike: 'Double Attack',
  LastBreath: 'Last Breath',
  SpellShield: 'Spell Shield',
  CantBlock: "Can't Block",
  PlaySkillMark: 'Play',
  AttackSkillMark: 'Attack',
  LandmarkVisualOnly: 'Landmark',
  AuraVisualFakeKeyword: 'Aura',
  Skill: 'Skill',
  ElementalSkill: 'Elemental Skill',
  Focus: 'Focus',
  Burst: 'Burst',
  Fast: 'Fast',
  Slow: 'Slow',
  Fleeting: 'Fleeting',
  Attach: 'Attach',
  Countdown: 'Countdown',
  Deep: 'Deep',
  Spirit: 'Spirit',
  Gloom: 'Gloom',
  Impact: 'Impact',
  Hallowed: 'Hallowed',
  Deathless: 'Deathless',
  Brash: 'Brash',
  Immobile: 'Immobile',
  Formidable: 'Formidable',
  Fury: 'Fury',
  Augment: 'Augment',
  Flow: 'Flow',
  Plunder: 'Plunder',
  Nightfall: 'Nightfall',
  Daybreak: 'Daybreak',
  Lurk: 'Lurk',
  Attune: 'Attune',
  Allegiance: 'Allegiance',
  Enlightened: 'Enlightened',
  Evolve: 'Evolve',
  Fated: 'Fated',
  Sharpsight: 'Sharpsight',
};

export const SPEED = {
  BURST: 'Burst',
  FOCUS: 'Focus',
  FAST: 'Fast',
  SLOW: 'Slow',
  SKILL: 'Skill',
};

export const TYPE = {
  UNIT: 'Unit',
  SPELL: 'Spell',
  LANDMARK: 'Landmark',
  EQUIPMENT: 'Equipment',
  ABILITY: 'Ability',
  TRAP: 'Trap',
};

export const HIDDEN_KEYWORDS = new Set([
  'LandmarkVisualOnly',
  'AuraVisualFakeKeyword',
  'PlaySkillMark',
  'AttackSkillMark',
  'Story:Slow',
  'Story:Focus',
  'ClobberNoEmptySlotRequirement',
  'SilenceIndividualKeyword',
  'Skill',
  'ElementalSkill',
  'SpellOverwhelm',
]);

export const REGION_SHORT = {
  Demacia: 'DE',
  Noxus: 'NX',
  Freljord: 'FR',
  Ionia: 'IO',
  PiltoverZaun: 'PZ',
  ShadowIsles: 'SI',
  Bilgewater: 'BW',
  Targon: 'MT',
  Shurima: 'SH',
  BandleCity: 'BC',
  Runeterra: 'RU',
  SpiritBlossom: 'SP',
  ElderDragon: 'ELD',
  Ryze: 'RYZE',
  Jhin: 'Jhin',
  Varus: 'Varus',
  Aatrox: 'Aatrox',
  Neeko: 'Neeko',
  Jax: 'Jax',
  Kayn: 'Kayn',
  PoroKing: 'POROKING',
  Evelynn: 'Evelynn',
  Bard: 'Bard',
};

export function canonicalKeyword(kw) {
  return KEYWORD_ALIASES[kw] || kw;
}

export function cleanKeywords(list = []) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const kw = canonicalKeyword(raw);
    if (!kw || HIDDEN_KEYWORDS.has(raw) || HIDDEN_KEYWORDS.has(kw)) continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
  }
  return out;
}

export function otherTeam(team) {
  return team === 'A' ? 'B' : 'A';
}

export function teamOf(team) {
  return team === 'A' ? 'B' : 'A';
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function idSeq(prefix, n) {
  return `${prefix}${n}`;
}
