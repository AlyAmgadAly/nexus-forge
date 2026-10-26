// Conservative auto-scripting pass for Data Dragon card text.
// Only cards whose entire text can be translated are given a script; everything else is
// left as "manual" so it can be resolved with the tabletop tools or edited in the admin forge.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

const TRIGGER_MAP = [
  [/^when i'?m summoned or attack\s*:/i, ['summon', 'attack']],
  [/^when i'?m summoned or round start\s*:/i, ['summon', 'roundStart']],
  [/^when i'?m summoned or strike\s*:/i, ['summon', 'strike']],
  [/^when i'?m summoned or nexus strike\s*:/i, ['summon', 'nexusStrike']],
  [/^when i'?m summoned\s*[:,]/i, ['summon']],
  [/^when you summon another ally\s*[:,]/i, ['summonOther']],
  [/^when you summon an ally\s*[:,]/i, ['summonOther']],
  [/^when an ally dies\s*[:,]/i, ['allyDeath']],
  [/^when another ally dies\s*[:,]/i, ['allyDeath']],
  [/^last breath\s*:/i, ['death']],
  [/^play\s*:/i, ['play']],
  [/^attack\s*:/i, ['attack']],
  [/^strike\s*:/i, ['strike']],
  [/^nexus strike\s*:/i, ['nexusStrike']],
  [/^round start\s*:/i, ['roundStart']],
  [/^round end\s*:/i, ['roundEnd']],
  [/^support\s*:/i, []],
  [/^allegiance\s*:/i, ['play']],
  [/^aura\s*:/i, ['aura']],
  [/^plunder\s*:/i, ['play']],
  [/^daybreak\s*:/i, ['play']],
  [/^nightfall\s*:/i, ['play']],
  [/^when i survive damage\s*[:,]/i, ['surviveDamage']],
  [/^when you cast a spell\s*[:,]/i, ['castSpell']],
  [/^when you play a spell\s*[:,]/i, ['castSpell']],
  [/^when you play a spell or skill\s*[:,]/i, ['castSpell']],
  [/^when you target me\s*[:,]/i, []],
  [/^when i'?m targeted\s*[:,]/i, []],
  [/^when i block\s*[:,]/i, []],
  [/^when i'?m blocked\s*[:,]/i, []],
  [/^when i attack\s*[:,]/i, ['attack']],
  [/^when i level up\s*[:,]/i, ['levelUp']],
  [/^when i transform\s*[:,]/i, ['transform']],
  [/^when you draw a card\s*[:,]/i, []],
  [/^when you discard a card\s*[:,]/i, []],
  [/^when you play a card\s*[:,]/i, []],
  [/^when you play a landmark\s*[:,]/i, []],
  [/^when you play a follower\s*[:,]/i, []],
  [/^when you play a champion\s*[:,]/i, []],
  [/^while i'?m attacking\s*,/i, []],
  [/^while i'?m defending\s*,/i, []],
];

const CONDITION_PREFIXES = [
  [/^if you have exactly (\d+) allies?\s*,\s*/i, (m) => ({ type: 'allyCount', op: '==', value: Number(m[1]) })],
  [/^if you have (\d+)\+ allies?\s*,\s*/i, (m) => ({ type: 'allyCount', op: '>=', value: Number(m[1]) })],
  [/^if you have an ally\s*,\s*/i, () => ({ type: 'allyCount', op: '>=', value: 1 })],
  [/^if an ally died this round\s*,\s*/i, () => ({ type: 'allyDiedThisRound' })],
  [/^if you'?re enlightened\s*,\s*/i, () => ({ type: 'enlightened' })],
  [/^if i have (\d+)\+ power\s*,\s*/i, (m) => ({ type: 'selfPower', op: '>=', value: Number(m[1]) })],
  [/^if i'?m leveled up\s*,\s*/i, () => ({ type: 'sourceLeveled' })],
];

const KEYWORDS = [
  'Barrier', 'Challenger', 'Elusive', 'Fearsome', 'Overwhelm', 'Quick Attack', 'Tough', 'Lifesteal',
  'Regeneration', 'Ephemeral', 'Double Attack', 'Spell Shield', 'Frostbite', 'Stun', 'Recall',
  'Fury', 'Impact', 'Attune', 'Augment', 'Deep', 'Fated', 'Flow', 'Formidable', 'Hallowed',
  'Lurk', 'Scout', 'Sharpsight', 'Spirit', 'Gloom', 'Deathless', 'Brash', 'Immobile', 'Can\'t Block',
  'Can\'t Attack', 'Allegiance', 'Enlightened', 'Evolve', 'Countdown', 'Attach', 'Plunder',
  'Daybreak', 'Nightfall', 'Nexus Strike',
];
const KEYWORD_RE = new RegExp(`\\b(${KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

const TARGET_MAP = [
  [/^me$/i, 'self'],
  [/^myself$/i, 'self'],
  [/^an ally in hand$/i, 'handCard'],
  [/^an ally$/i, 'allyUnit'],
  [/^another ally$/i, 'otherAllyUnit'],
  [/^allies$/i, 'allAllyUnits'],
  [/^all allies$/i, 'allAllyUnits'],
  [/^other allies$/i, 'allOtherAllyUnits'],
  [/^2 allies$/i, 'allyUnit', 2],
  [/^two allies$/i, 'allyUnit', 2],
  [/^an enemy unit$/i, 'enemyUnit'],
  [/^an enemy$/i, 'enemyUnit'],
  [/^enemies$/i, 'allEnemyUnits'],
  [/^all enemies$/i, 'allEnemyUnits'],
  [/^a unit$/i, 'anyUnit'],
  [/^anything$/i, 'anyTarget'],
  [/^the enemy nexus$/i, 'enemyNexus'],
  [/^your nexus$/i, 'allyNexus'],
  [/^the strongest enemy$/i, 'strongestEnemy'],
  [/^the weakest enemy$/i, 'weakestEnemy'],
  [/^the strongest ally$/i, 'strongestAlly'],
  [/^the weakest ally$/i, 'weakestAlly'],
  [/^a random enemy$/i, 'randomEnemyUnit'],
  [/^a random ally$/i, 'randomAllyUnit'],
  [/^a follower$/i, 'anyUnit', 1, { type: 'follower' }],
  [/^an elite ally$/i, 'allyUnit', 1, { subtype: 'ELITE' }],
  [/^elite allies$/i, 'allAllyUnits', 1, { subtype: 'ELITE' }],
  [/^all units$/i, 'allUnits'],
  [/^the enemy$/i, 'enemyNexus'],
];

function cleanText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function splitSentences(text) {
  // Keep card names like "For Demacia!" intact; split only on sentence boundaries followed by a capital letter.
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}

function normalizeTarget(phrase) {
  const p = phrase.trim().replace(/[.,]$/, '').toLowerCase();
  for (const [re, type, count, filter] of TARGET_MAP) {
    if (re.test(p)) return { type, count: count || 1, filter: filter || {} };
  }
  if (p.startsWith('all ') && p.endsWith(' enemies')) return { type: 'allEnemyUnits', count: 1, filter: {} };
  if (p.startsWith('all ') && p.endsWith(' allies')) return { type: 'allAllyUnits', count: 1, filter: {} };
  if (p.startsWith('all ') && p.endsWith(' units')) return { type: 'allUnits', count: 1, filter: {} };
  if (p.startsWith('other ') && p.endsWith(' allies')) return { type: 'allOtherAllyUnits', count: 1, filter: {} };
  return null;
}

function targetIsAll(type) {
  return ['allAllyUnits', 'allOtherAllyUnits', 'allEnemyUnits', 'allUnits', 'allAttackingUnits', 'allDefendingUnits'].includes(type);
}

function parseCondition(text) {
  const out = [];
  let rest = text.trim();
  while (rest) {
    let matched = false;
    for (const [re, fn] of CONDITION_PREFIXES) {
      const m = re.exec(rest);
      if (m) {
        out.push(fn(m));
        rest = rest.slice(m[0].length).trim();
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return { conditions: out, rest };
}

function trailingCondition(text) {
  const m = /\s+if (an ally died this round|you'?re enlightened|you have exactly (\d+) allies?|you have (\d+)\+ allies?|i have (\d+)\+ power)\.?$/i.exec(text);
  if (!m) return { text: text.trim(), condition: null };
  const phrase = m[1].toLowerCase();
  let condition = null;
  if (phrase.startsWith('an ally died')) condition = { type: 'allyDiedThisRound' };
  else if (phrase.startsWith("you're enlightened")) condition = { type: 'enlightened' };
  else if (m[2]) condition = { type: 'allyCount', op: '==', value: Number(m[2]) };
  else if (m[3]) condition = { type: 'allyCount', op: '>=', value: Number(m[3]) };
  else if (m[4]) condition = { type: 'selfPower', op: '>=', value: Number(m[4]) };
  return { text: text.slice(0, m.index).trim(), condition };
}

function parseTargetPhrase(phrase) {
  // "all enemies and the enemy Nexus" / "allies and your Nexus"
  const orParts = phrase.split(/\s+or\s+/i);
  if (orParts.length > 1) {
    const mapped = orParts.map((p) => normalizeTarget(p));
    if (mapped.every(Boolean)) return [{ type: 'anyTarget', count: 1, filter: {} }];
  }
  const parts = phrase.split(/\s+and\s+/i);
  if (parts.length > 1) {
    const mapped = parts.map((p) => normalizeTarget(p));
    if (mapped.every(Boolean)) return mapped;
  }
  const one = normalizeTarget(phrase);
  return one ? [one] : null;
}

function statPair(text) {
  const m = /^([+-]\d+)\|([+-]\d+)$/.exec(text.trim());
  if (!m) return null;
  return { power: Number(m[1]), health: Number(m[2]) };
}

function keywordFrom(text) {
  const clean = text.trim().replace(/[.,]$/, '');
  const found = KEYWORDS.find((k) => k.toLowerCase() === clean.toLowerCase());
  return found || null;
}

function makeBuff(target, power, health, duration = 'permanent') {
  if (!target) return null;
  const t = Array.isArray(target) ? target[0] : target;
  if (targetIsAll(t.type)) {
    return { type: 'buff', power, health, duration, target: { ...t, count: undefined } };
  }
  return { type: 'buff', power, health, duration, target: t };
}

function makeGrant(target, keyword, duration = 'permanent') {
  if (!target) return null;
  return { type: 'grantKeyword', keyword, duration, target: Array.isArray(target) ? target[0] : target };
}

function parseActionText(text, cardNames) {
  let t = text.trim().replace(/\.$/, '');
  if (!t) return null;
  const { text: body, condition } = trailingCondition(t);
  t = body.replace(/\.$/, '');

  // Split coordinated effects like "..., then ...".
  if (/\s+then\s+/i.test(t)) {
    const parts = t.split(/\s+then\s+/i);
    const all = [];
    for (const part of parts) {
      const parsed = parseActionText(part, cardNames);
      if (!parsed) return null;
      all.push(...parsed);
    }
    if (condition) for (const a of all) a.condition = condition;
    return all;
  }

  // "Deal X to Y and Z" -> separate damage actions.
  let m = /^deal (\d+) to (.+)$/i.exec(t);
  if (m) {
    const amount = Number(m[1]);
    const targets = parseTargetPhrase(m[2]);
    if (!targets) return null;
    return targets.map((target) => {
      if (target.type === 'allEnemyUnits') return { type: 'damageAll', team: 'enemy', amount, condition };
      if (target.type === 'allAllyUnits') return { type: 'damageAll', team: 'ally', amount, condition };
      if (target.type === 'allUnits') return [
        { type: 'damageAll', team: 'ally', amount, condition },
        { type: 'damageAll', team: 'enemy', amount, condition },
      ];
      return { type: 'damage', amount, target, condition };
    }).flat();
  }
  m = /^heal (.+?) (\d+)$/i.exec(t);
  if (m) {
    const targets = parseTargetPhrase(m[1]);
    if (!targets) return null;
    return targets.map((target) => ({ type: 'heal', amount: Number(m[2]), target, condition }));
  }
  m = /^heal (\d+)$/i.exec(t);
  if (m) return [{ type: 'healNexus', who: 'ally', amount: Number(m[1]), condition }];
  m = /^heal your nexus (\d+)$/i.exec(t);
  if (m) return [{ type: 'healNexus', who: 'ally', amount: Number(m[1]), condition }];
  m = /^fully heal (.+)$/i.exec(t);
  if (m) {
    const target = normalizeTarget(m[1]);
    if (!target) return null;
    return [{ type: 'heal', amount: 99, target, condition }];
  }
  m = /^(give|grant) (.+?) ([+-]\d+\|[+-]\d+)( this round)?(?: and ([A-Za-z' ]+?))?$/i.exec(t);
  if (m) {
    const target = normalizeTarget(m[2]);
    if (!target) return null;
    const stats = statPair(m[3]);
    if (!stats) return null;
    const duration = m[4] ? 'round' : (m[1].toLowerCase() === 'give' ? 'permanent' : 'permanent');
    const out = [makeBuff(target, stats.power, stats.health, duration)];
    if (m[5]) {
      const kw = keywordFrom(m[5]);
      if (!kw) return null;
      out.push(makeGrant(target, kw, m[4] ? 'round' : 'permanent'));
    }
    return out.filter(Boolean).map((a) => ({ ...a, condition }));
  }
  m = /^(give|grant) (.+?) ([A-Za-z' ]+?)( this round)?$/i.exec(t);
  if (m) {
    const target = normalizeTarget(m[2]);
    if (!target) return null;
    const kw = keywordFrom(m[3]);
    if (!kw) return null;
    return [{ ...makeGrant(target, kw, m[4] ? 'round' : 'permanent'), condition }];
  }
  m = /^draw (\d+|a card|one)$/i.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    return [{ type: 'draw', amount: n, who: 'ally', condition }];
  }
  m = /^refill your spell mana$/i.exec(t);
  if (m) return [{ type: 'spellMana', amount: 3, condition }];
  m = /^get an empty mana gem(?: and heal your nexus (\d+))?$/i.exec(t);
  if (m) {
    const out = [{ type: 'emptyManaGem', condition }];
    if (m[1]) out.push({ type: 'healNexus', who: 'ally', amount: Number(m[1]), condition });
    return out;
  }
  m = /^summon (?:(\d+) )?(?:a |an )?(.+?)(?:,? then .+)?$/i.exec(t);
  if (m) {
    const count = m[1] ? Number(m[1]) : 1;
    const name = m[2].trim().replace(/[.,!]$/, '');
    if (/^exact copy of me$/i.test(name)) return [{ type: 'copy', target: { type: 'self' }, condition }];
    if (/^random /i.test(name)) return null;
    const match = findCardName(name, cardNames);
    if (!match) return null;
    return [{ type: 'summon', cardId: match, count, condition }];
  }
  m = /^create (?:(\d+) )?(?:in (?:hand|your hand) )?(?:a |an )?(.+?) in (hand|your hand|deck)$/i.exec(t);
  if (!m) {
    const created = /^create (?:in (?:hand|your hand) )?(?:(\d+) )?(?:a |an )?(.+?)(?: in (hand|your hand|deck))?$/i.exec(t);
    if (created) {
      const count = created[1] ? Number(created[1]) : 1;
      const name = created[2].trim().replace(/[.,!]$/, '');
      const dest = /deck/i.test(created[3] || '') ? 'deck' : 'hand';
      if (/^random /i.test(name) || /^another random /i.test(name)) {
        const filter = parseRandomFilter(name.replace(/^another /i, ''));
        if (filter) return [{ type: 'createRandom', count, filter, destination: dest, condition }];
      }
      const match = findCardName(name, cardNames);
      if (match) return [{ type: 'create', cardId: match, count, destination: dest, condition }];
      return null;
    }
  }
  if (m) {
    const count = m[1] ? Number(m[1]) : 1;
    const name = m[2].trim();
    const dest = /deck/i.test(m[3]) ? 'deck' : 'hand';
    if (/^random /i.test(name)) {
      const filter = parseRandomFilter(name);
      if (!filter) return null;
      return [{ type: 'createRandom', count, filter, destination: dest, condition }];
    }
    if (/^another random /i.test(name)) {
      const filter = parseRandomFilter(name.replace(/^another /i, ''));
      if (!filter) return null;
      return [{ type: 'createRandom', count, filter, destination: dest, condition }];
    }
    const match = findCardName(name, cardNames);
    if (!match) return null;
    return [{ type: 'create', cardId: match, count, destination: dest, condition }];
  }
  m = /^create (?:(\d+) )?(?:a |an )?(.+?) in (hand|your hand)$/i.exec(t);
  if (m) {
    const count = m[1] ? Number(m[1]) : 1;
    const name = m[2].trim();
    if (/^random /i.test(name)) {
      const filter = parseRandomFilter(name);
      if (!filter) return null;
      return [{ type: 'createRandom', count, filter, destination: 'hand', condition }];
    }
    const match = findCardName(name, cardNames);
    if (!match) return null;
    return [{ type: 'create', cardId: match, count, destination: 'hand', condition }];
  }
  m = /^(frostbite|stun|recall|silence|kill|obliterate) (.+)$/i.exec(t);
  if (m) {
    const targets = parseTargetPhrase(m[2]);
    if (!targets) return null;
    return targets.map((target) => ({ type: m[1].toLowerCase(), target, condition }));
  }
  if (/^rally$/i.test(t)) return [{ type: 'rally', condition }];
  if (/^predict$/i.test(t)) return [{ type: 'predict', count: 3, condition }];
  if (/^shuffle your deck$/i.test(t)) return [{ type: 'shuffle', condition }];
  m = /^toss (\d+)$/i.exec(t);
  if (m) return [{ type: 'toss', amount: Number(m[1]), condition }];
  m = /^deal (\d+) to the enemy nexus$/i.exec(t);
  if (m) return [{ type: 'damageNexus', who: 'enemy', amount: Number(m[1]), condition }];
  m = /^give (.+?) (.+?) this round$/i.exec(t);
  if (m) {
    // Handled above for known keywords/stats; avoid false positives.
    return null;
  }
  // Unsupported sentence.
  return null;
}

function parseRandomFilter(text) {
  const filter = {};
  if (/\bspell\b/i.test(text)) filter.type = 'Spell';
  else if (/\bfollower\b/i.test(text)) filter.type = 'Unit';
  else if (/\bunit\b/i.test(text)) filter.type = 'Unit';
  else if (/\belite\b/i.test(text)) filter.subtype = 'ELITE';
  if (/\belite\b/i.test(text)) filter.subtype = 'ELITE';
  if (/\bchampion\b/i.test(text)) filter.supertype = 'Champion';
  if (/\b(6\+|six or more) cost\b/i.test(text)) filter.minCost = 6;
  if (/\b(3 or less|3-|low cost)\b/i.test(text)) filter.maxCost = 3;
  return Object.keys(filter).length ? filter : null;
}

const NAME_INDEX = new Map();
function buildNameIndex(cards) {
  for (const c of cards) {
    if (!c.name) continue;
    const key = c.name.toLowerCase();
    if (!NAME_INDEX.has(key)) NAME_INDEX.set(key, c.id);
  }
}
function findCardName(name, cardNames) {
  let clean = name.replace(/^another /i, '').replace(/^a /i, '').replace(/^an /i, '').trim();
  const exact = NAME_INDEX.get(clean.toLowerCase());
  if (exact) return exact;
  // Plural tokens: "Dauntless Vanguards" -> "Dauntless Vanguard".
  if (/s$/i.test(clean)) {
    const singular = NAME_INDEX.get(clean.slice(0, -1).toLowerCase());
    if (singular) return singular;
  }
  const candidates = [...NAME_INDEX.entries()].filter(([n]) => n === clean.toLowerCase() || n.startsWith(clean.toLowerCase() + ' '));
  if (candidates.length === 1) return candidates[0][1];
  return null;
}

function parseTriggerLine(line, card, cardNames) {
  let { conditions: prefixConds, rest } = parseCondition(line);
  let text = rest;
  let triggers = [];
  const pseudo = /^(plunder|daybreak|nightfall)\s*:\s*/i.exec(text);
  if (pseudo) {
    prefixConds = [...prefixConds, { type: pseudo[1].toLowerCase() }];
    triggers = ['play'];
    text = text.slice(pseudo[0].length).trim();
  }
  for (const [re, names] of TRIGGER_MAP) {
    if (triggers.length) break;
    const m = re.exec(text);
    if (m) {
      triggers = names;
      text = text.slice(m[0].length).trim();
      break;
    }
  }
  const { text: actionText, condition: tailCond } = trailingCondition(text);
  let actions = null;
  if (triggers.includes('aura')) {
    const aura = /^(other allies|allies|other units|all units|me|i) have ([+-]\d+\|[+-]\d+)(?: and ([A-Za-z' ]+))?$/i.exec(actionText);
    if (aura) {
      const targetType = /^other allies/i.test(aura[1]) ? 'allOtherAllyUnits'
        : /^allies/i.test(aura[1]) ? 'allAllyUnits'
          : /^other units/i.test(aura[1]) ? 'allOtherAllyUnits'
            : /^all units/i.test(aura[1]) ? 'allUnits' : 'self';
      const stats = statPair(aura[2]);
      if (stats) {
        actions = [{ type: 'buff', power: stats.power, health: stats.health, duration: 'permanent', target: { type: targetType } }];
        if (aura[3]) {
          const kw = keywordFrom(aura[3]);
          if (kw) actions.push({ type: 'grantKeyword', keyword: kw, duration: 'permanent', target: { type: targetType } });
        }
      }
    }
  }
  if (!actions) actions = parseActionText(actionText, cardNames);
  if (!actions) return null;
  const conditions = [...prefixConds];
  if (tailCond) conditions.push(tailCond);
  // Allegiance checks the top card of the deck.
  if (/^allegiance\s*:/i.test(line) && card.regions?.length) {
    conditions.push({ type: 'topDeckRegion', region: card.regions[0] });
  }
  const condition = conditions.length ? (conditions.length === 1 ? conditions[0] : { type: 'and', conditions }) : undefined;
  return { triggers, actions, condition };
}

function parseCard(card, cardNames) {
  const text = cleanText(card.text);
  if (!text) return null;
  if (/^to play/i.test(text)) return null;
  if (/\b(everywhere|while|battling|from your regions|other than|another random)\b/i.test(text)) return null;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const triggers = [];
  let current = null;
  for (const line of lines) {
    // A line beginning with a trigger keyword starts a new trigger block.
    const hasTrigger = TRIGGER_MAP.some(([re]) => re.test(line));
    if (hasTrigger) {
      const parsed = parseTriggerLine(line, card, cardNames);
      if (!parsed) return null;
      if (!parsed.triggers.length) return null;
      for (const on of parsed.triggers) {
        triggers.push({ on, actions: parsed.actions, condition: parsed.condition, auto: on === 'aura' });
      }
      current = { on: parsed.triggers[0], actions: parsed.actions, condition: parsed.condition };
      continue;
    }
    // Plain lines after a trigger are additional actions of that trigger.
    if (current) {
      const cond = parseCondition(line);
      const extra = parseActionText(cond.rest, cardNames);
      if (!extra) return null;
      current.actions.push(...extra);
      if (cond.conditions.length) {
        // Apply line conditions to the newly added actions.
        for (const a of extra) {
          a.condition = cond.conditions.length === 1 ? cond.conditions[0] : { type: 'and', conditions: cond.conditions };
        }
      }
      continue;
    }
    // Spells with no trigger are implicit Play effects. Units with no trigger are static and skipped.
    if (card.type === 'Spell') {
      const cond = parseCondition(line);
      const actions = parseActionText(cond.rest, cardNames);
      if (!actions) return null;
      triggers.push({ on: 'play', actions, condition: cond.conditions.length === 1 ? cond.conditions[0] : (cond.conditions.length ? { type: 'and', conditions: cond.conditions } : undefined) });
      current = triggers[triggers.length - 1];
    } else {
      return null;
    }
  }
  return triggers.length ? { triggers } : null;
}

async function main() {
  const payload = JSON.parse(await readFile(path.join(DATA, 'cards.json'), 'utf8'));
  let scripts = {};
  try { scripts = JSON.parse(await readFile(path.join(DATA, 'scripts.json'), 'utf8')); } catch {}
  buildNameIndex(payload.cards);
  const cards = payload.cards.filter((c) => c.collectible && c.enabled !== false);
  const report = { total: cards.length, scripted: 0, keywordsOnly: 0, manual: 0, byRegion: {}, manualCards: [] };
  const next = { ...scripts };
  for (const card of cards) {
    const existing = scripts[card.id];
    if (existing && ['curated', 'custom'].includes(existing.status)) continue;
    const hasText = !!cleanText(card.text);
    if (!hasText) {
      delete next[card.id];
      report.keywordsOnly++;
      continue;
    }
    const script = parseCard(card, NAME_INDEX);
    if (script) {
      next[card.id] = { status: 'auto', script, updatedAt: new Date().toISOString() };
      report.scripted++;
      const region = (card.regions || ['Neutral'])[0];
      report.byRegion[region] = (report.byRegion[region] || 0) + 1;
    } else {
      delete next[card.id];
      report.manual++;
      report.manualCards.push({ id: card.id, name: card.name, text: card.text.replace(/\r\n/g, ' / ') });
    }
  }
  await writeFile(path.join(DATA, 'scripts.json'), JSON.stringify(next, null, 2));
  await writeFile(path.join(DATA, 'scripts-report.json'), JSON.stringify(report, null, 2));
  console.log(`Auto-scripted ${report.scripted}/${cards.length} cards. ${report.manual} need manual resolution; ${report.keywordsOnly} are keyword-only.`);
  console.log('By region:', report.byRegion);
}

main().catch((err) => { console.error(err); process.exit(1); });
