#!/usr/bin/env node
// Read-only coverage report for the declarative card scripts.
//
// Usage:
//   npm run scripts:coverage
//   npm run scripts:coverage -- --json
//   npm run scripts:coverage -- --markdown --missing
//   npm run scripts:coverage -- --set Set1 --type Unit --missing
//   npm run scripts:coverage -- --starter --missing
//
// This script never writes data/scripts.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardDB } from '../server/engine/carddb.js';
import { makeStarterDecks } from '../server/decks.js';
import { DEFAULT_RULES } from '../server/store.js';
import { verificationState } from '../server/script-metadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
}
function listOption(name) {
  const value = option(name);
  if (!value) return null;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const format = hasFlag('--json') ? 'json' : hasFlag('--markdown') ? 'markdown' : 'text';
const outFile = option('--out');
const showMissing = hasFlag('--missing');
const setFilter = listOption('--set');
const typeFilter = listOption('--type');
const starterOnly = hasFlag('--starter');

const cardsPayload = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
const settings = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'data', 'settings.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const db = new CardDB({ riotPayload: cardsPayload, scripts, settings });
const collectible = db.collectible();
const textCards = collectible.filter((card) => String(card.text || '').trim());
const stats = db.stats();

function textCard(card) {
  return String(card.text || '').trim();
}

function typeKey(card) {
  return card.supertype === 'Champion' ? 'Champion' : (card.type || 'Unknown');
}

const decks = makeStarterDecks(db, settings.rules || DEFAULT_RULES);
const starterIds = new Set();
for (const deck of decks) {
  for (const entry of deck.cards || []) starterIds.add(entry.cardId);
}
const starterCards = [...starterIds].sort().map((id) => db.get(id)).filter(Boolean);
const starterText = starterCards.filter(textCard);

function countBy(cards, keyFn) {
  const out = {};
  for (const card of cards) {
    const keys = keyFn(card);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const label = key || 'Unknown';
      out[label] = out[label] || { total: 0, scripted: 0, verified: 0, missing: 0 };
      out[label].total++;
      if (card.script) out[label].scripted++;
      if (card.verified) out[label].verified++;
      if (!card.script) out[label].missing++;
    }
  }
  return out;
}

const bySet = countBy(textCards, (card) => card.set || 'Unknown');
const byType = countBy(textCards, typeKey);
const byRegion = countBy(textCards, (card) => (card.regions?.length ? card.regions : ['Unknown']));

function missingCard(card) {
  return {
    id: card.id,
    name: card.name,
    set: card.set || '',
    type: typeKey(card),
    regions: card.regions || [],
    cost: card.cost ?? null,
    text: card.text || '',
  };
}

function matchesFilters(card) {
  if (starterOnly && !starterIds.has(card.id)) return false;
  if (setFilter && !setFilter.includes(card.set)) return false;
  if (typeFilter && !typeFilter.includes(typeKey(card))) return false;
  return true;
}

const missing = textCards.filter((card) => !card.script);
const filteredMissing = missing.filter(matchesFilters).sort((a, b) => a.id.localeCompare(b.id));

function walkActions(actions, counts, targetCounts) {
  for (const action of actions || []) {
    if (!action || typeof action !== 'object') continue;
    counts[action.type] = (counts[action.type] || 0) + 1;
    if (action.target) {
      const type = typeof action.target === 'string' ? action.target : action.target.type;
      if (type) targetCounts[type] = (targetCounts[type] || 0) + 1;
    }
    walkActions(action.actions, counts, targetCounts);
    walkActions(action.elseActions, counts, targetCounts);
    walkActions(action.then, counts, targetCounts);
    for (const branch of action.branches || []) {
      walkActions(Array.isArray(branch) ? branch : branch.actions, counts, targetCounts);
    }
    for (const option of action.options || []) walkActions(option.actions, counts, targetCounts);
  }
}

function walkConditions(condition, counts) {
  if (!condition || typeof condition !== 'object') return;
  counts[condition.type] = (counts[condition.type] || 0) + 1;
  walkConditions(condition.condition, counts);
  for (const child of condition.conditions || []) walkConditions(child, counts);
}

const triggerCounts = {};
const actionCounts = {};
const targetCounts = {};
const conditionCounts = {};
let levelUpScripts = 0;
let verificationStale = 0;
let verificationMissing = 0;
let verificationInvalid = 0;

for (const [id, entry] of Object.entries(scripts)) {
  const card = db.get(id);
  if (!card) continue;
  const script = entry?.script || entry;
  if (!script) continue;
  if (script.levelUp) levelUpScripts++;
  for (const trigger of script.triggers || []) {
    triggerCounts[trigger.on] = (triggerCounts[trigger.on] || 0) + 1;
    walkConditions(trigger.condition, conditionCounts);
    walkActions(trigger.actions, actionCounts, targetCounts);
  }
  walkConditions(script.levelUp?.condition, conditionCounts);
  if (entry?.status === 'curated') {
    const state = verificationState(entry, card);
    if (state === 'stale') verificationStale++;
    else if (state === 'missing') verificationMissing++;
    else if (state === 'invalid') verificationInvalid++;
  }
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

const starterByDeck = decks.map((deck) => {
  const cards = (deck.cards || []).map((entry) => db.get(entry.cardId)).filter(Boolean);
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const text = unique.filter(textCard);
  return {
    name: deck.name,
    unique: unique.length,
    text: text.length,
    scripted: text.filter((card) => card.script).length,
    verified: text.filter((card) => card.verified).length,
    missing: text.filter((card) => !card.script).length,
  };
});

const report = {
  source: 'data/cards.json + data/scripts.json',
  rules: settings.rules || DEFAULT_RULES,
  filters: {
    set: setFilter,
    type: typeFilter,
    starter: starterOnly,
    missing: showMissing,
  },
  total: stats.total,
  textCards: stats.textCards,
  none: stats.byStatus.none || 0,
  manual: stats.byStatus.manual || 0,
  auto: stats.byStatus.auto || 0,
  partial: stats.byStatus.partial || 0,
  curated: stats.byStatus.curated || 0,
  custom: stats.byStatus.custom || 0,
  scripted: stats.scriptedText,
  missingCount: stats.missing,
  coverage: stats.coverage,
  verified: stats.verified,
  unverified: stats.unverified,
  verifiedCoverage: stats.verifiedCoverage,
  verificationStale,
  verificationMissing,
  verificationInvalid,
  levelUpScripts,
  bySet: sortedObject(bySet),
  byType: sortedObject(byType),
  byRegion: sortedObject(byRegion),
  starter: {
    decks: starterByDeck,
    unique: starterCards.length,
    text: starterText.length,
    scripted: starterText.filter((card) => card.script).length,
    verified: starterText.filter((card) => card.verified).length,
    missing: starterText.filter((card) => !card.script).length,
  },
  frequency: {
    triggers: sortedObject(triggerCounts),
    actions: sortedObject(actionCounts),
    targets: sortedObject(targetCounts),
    conditions: sortedObject(conditionCounts),
  },
  missing: filteredMissing.map(missingCard),
};

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function markdown(report) {
  const lines = [
    '# Nexus Forge script coverage',
    '',
    `- Source: \`${report.source}\``,
    `- Total collectible cards: ${report.total}`,
    `- Text cards: ${report.textCards}`,
    `- Scripts present: ${report.scripted} (${percent(report.coverage)})`,
    `- Verified effects: ${report.verified} (${percent(report.verifiedCoverage)})`,
    `- Missing: ${report.missingCount}`,
    '',
    '## Status',
    '',
    table(['Status', 'Count'], [
      ['none', report.none],
      ['manual', report.manual],
      ['auto', report.auto],
      ['partial', report.partial],
      ['curated', report.curated],
      ['custom', report.custom],
    ]),
    '',
    '## Missing by set',
    '',
    table(['Set', 'Text cards', 'Scripted', 'Missing'], Object.entries(report.bySet).map(([set, info]) => [set, info.total, info.scripted, info.missing])),
    '',
    '## Missing by type',
    '',
    table(['Type', 'Text cards', 'Scripted', 'Missing'], Object.entries(report.byType).map(([type, info]) => [type, info.total, info.scripted, info.missing])),
    '',
    '## Starter-deck cohort',
    '',
    table(['Deck', 'Unique', 'Text', 'Scripted', 'Verified', 'Missing'], report.starter.decks.map((deck) => [deck.name, deck.unique, deck.text, deck.scripted, deck.verified, deck.missing])),
    '',
    `Cohort total: ${report.starter.unique} unique, ${report.starter.text} text, ${report.starter.scripted} scripted, ${report.starter.verified} verified, ${report.starter.missing} missing.`,
    '',
    '## Trigger frequency',
    '',
    table(['Trigger', 'Entries'], Object.entries(report.frequency.triggers)),
    '',
    '## Action frequency',
    '',
    table(['Action', 'Uses'], Object.entries(report.frequency.actions)),
  ];
  if (showMissing) {
    lines.push('', '## Missing cards', '', table(['ID', 'Name', 'Set', 'Type', 'Text'], report.missing.map((card) => [card.id, card.name, card.set, card.type, String(card.text).replace(/\|/g, '\\|').replace(/\n/g, ' ')])));
  }
  return `${lines.join('\n')}\n`;
}

function text(report) {
  const lines = [
    'Nexus Forge script coverage',
    `Source: ${report.source}`,
    `Collectible: ${report.total} · Text cards: ${report.textCards}`,
    `Scripts present: ${report.scripted} (${percent(report.coverage)}) · Verified: ${report.verified} (${percent(report.verifiedCoverage)})`,
    `Status: none ${report.none} · manual ${report.manual} · auto ${report.auto} · partial ${report.partial} · curated ${report.curated} · custom ${report.custom}`,
    `Missing: ${report.missingCount}`,
    `Starter cohort: ${report.starter.unique} unique · ${report.starter.text} text · ${report.starter.scripted} scripted · ${report.starter.verified} verified · ${report.starter.missing} missing`,
    '',
    'Missing by set:',
    ...Object.entries(report.bySet).map(([set, info]) => `  ${set}: ${info.missing} missing / ${info.total} text`),
    '',
    'Missing by type:',
    ...Object.entries(report.byType).map(([type, info]) => `  ${type}: ${info.missing} missing / ${info.total} text`),
  ];
  if (showMissing) {
    lines.push('', `Missing cards (${report.missing.length}):`);
    for (const card of report.missing) {
      lines.push(`  ${card.id}  ${card.name}  [${card.set}/${card.type}]  ${String(card.text).replace(/\s+/g, ' ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : format === 'markdown' ? markdown(report) : text(report);
if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(path.resolve(outFile), output);
  console.log(`Wrote ${outFile}`);
} else {
  process.stdout.write(output);
}
