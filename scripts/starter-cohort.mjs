#!/usr/bin/env node
// Read-only starter-cohort inventory. Generates docs/scripts/starter-cohort.md
// from the same card database and starter-deck builder used by the game.
//
// Usage:
//   npm run scripts:starter-cohort
//   npm run scripts:starter-cohort -- --out docs/scripts/starter-cohort.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardDB } from '../server/engine/carddb.js';
import { makeStarterDecks } from '../server/decks.js';
import { DEFAULT_RULES } from '../server/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
}
const outFile = option('--out') || path.join(root, 'docs', 'scripts', 'starter-cohort.md');

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
const decks = makeStarterDecks(db, settings.rules || DEFAULT_RULES);

const MECHANICS = [
  { label: 'Support', test: (card) => card.keywords?.includes('Support') || /Support:/i.test(card.text || '') },
  { label: 'Lurk', test: (card) => card.keywords?.includes('Lurker') || /\bLurk\b/i.test(card.text || '') },
  { label: 'Behold', test: (card) => /Behold/i.test(card.text || '') },
  { label: 'Nightfall', test: (card) => /Nightfall/i.test(card.text || '') },
  { label: 'Daybreak', test: (card) => /Daybreak/i.test(card.text || '') },
  { label: 'Allegiance', test: (card) => /Allegiance/i.test(card.text || '') },
  { label: 'Reputation', test: (card) => /Reputation/i.test(card.text || '') },
  { label: 'Fated', test: (card) => /Fated/i.test(card.text || '') },
  { label: 'Last Breath', test: (card) => /Last Breath/i.test(card.text || '') },
  { label: 'Nexus Strike', test: (card) => /Nexus Strike/i.test(card.text || '') },
  { label: 'Attack', test: (card) => /(^|\n)Attack:/i.test(card.text || '') },
  { label: 'Strike', test: (card) => /(^|\n)Strike:/i.test(card.text || '') },
  { label: 'Round Start', test: (card) => /Round Start/i.test(card.text || '') },
  { label: 'Round End', test: (card) => /Round End/i.test(card.text || '') },
  { label: 'Play', test: (card) => /(^|\n)Play:/i.test(card.text || '') },
  { label: 'Summon', test: (card) => /When I'm summoned|When you summon|summon another/i.test(card.text || '') },
  { label: 'Death watcher', test: (card) => /When an ally dies|When another ally dies|when a unit dies/i.test(card.text || '') },
  { label: 'Equipment', test: (card) => card.type === 'Equipment' || /equip/i.test(card.text || '') },
  { label: 'Countdown', test: (card) => /Countdown/i.test(card.text || '') },
  { label: 'Predict', test: (card) => /Predict/i.test(card.text || '') },
  { label: 'Toss', test: (card) => /Toss/i.test(card.text || '') },
  { label: 'Recall', test: (card) => /Recall/i.test(card.text || '') },
  { label: 'Stun', test: (card) => /Stun/i.test(card.text || '') },
  { label: 'Frostbite', test: (card) => /Frostbite/i.test(card.text || '') },
  { label: 'Damage', test: (card) => /Deal \d+|deal \d+|damage/i.test(card.text || '') },
  { label: 'Heal', test: (card) => /Heal|heal/i.test(card.text || '') },
  { label: 'Draw', test: (card) => /Draw|draw/i.test(card.text || '') },
  { label: 'Create/Summon', test: (card) => /Create|Summon|summon/i.test(card.text || '') },
  { label: 'Buff/Grant', test: (card) => /Give|Grant|grant|give|\+\d+\|\+\d+/i.test(card.text || '') },
];

const GAPS = [
  { label: 'player choice', test: /(^|\n)\s*Pick |(^|\n)\s*Choose /i },
  { label: 'manifest/invoke', test: /Manifest|Invoke/i },
  { label: 'curse', test: /Curse/i },
  { label: 'capture', test: /Capture/i },
  { label: 'steal', test: /Steal/i },
  { label: 'sleep', test: /Sleep/i },
  { label: 'updraft', test: /Updraft/i },
  { label: 'everywhere', test: /Everywhere/i },
  { label: 'revive', test: /Revive|revived/i },
  { label: 'countdown action', test: /Countdown|advance them/i },
  { label: 'set/swap/double stats', test: /set its (Power|Health|stats)|swap.*stats|double.*Power/i },
  { label: 'cost modification', test: /cost \d+ less|costs? \d+ less|costs? \d+ more|reduce the cost|increase the cost/i },
  { label: 'copy variants', test: /copy it|exact copy|copy of/i },
  { label: 'set mechanic', test: /\b(Spirit|Gloom|Boost|Ambush|Forge)\b/i },
  { label: 'trap/chime', test: /plant|Chime|Trap/i },
  { label: 'top/bottom deck selection', test: /top \d+ cards|bottom of your deck/i },
  { label: 'missing trigger/state', test: /When you draw|When you spend mana|When you play a card with cost|When you summon a champion|When an ally transforms|When an ally is revived|When I would gain/i },
  { label: 'alternate play cost', test: /To play me/i },
  { label: 'self cost modifier', test: /(^|\n)I cost /i },
  { label: 'hand buff', test: /grant.*in hand|in hand.*grant/i },
  { label: 'ally-or-nexus target', test: /an ally or your Nexus/i },
  { label: 'random region exclusion', test: /random \d+\+ cost spell from a region other than/i },
  { label: 'barrier trigger', test: /When an ally gets Barrier/i },
  { label: 'choice create', test: /Create a .*?, .*?, or /i },
  { label: 'event card strike', test: /it strikes me/i },
  { label: 'modal or equip from hand', test: / or equip it with an equipment in hand/i },
  { label: 'equipment target required', test: /Destroy a unit's equipment/i },
  { label: 'ally equip watcher', test: /first time an ally is Equipped/i },
  { label: 'transform and recall', test: /Recall me and transform me/i },
  { label: 'recall trigger', test: /When I'm Recalled/i },
  { label: 'choice discard', test: /discard a card|discard 1/i },
  { label: 'predict auto (approximation)', test: /Predict/i },
];

function text(card) {
  return String(card.text || '').replace(/\s+/g, ' ').trim();
}

function mechanic(card) {
  const match = MECHANICS.find((entry) => entry.test(card));
  if (match) return match.label;
  if (card.keywords?.length) return 'Keyword';
  return 'Other';
}

function gaps(card) {
  const body = text(card);
  return GAPS.filter((entry) => entry.test.test(body)).map((entry) => entry.label);
}

function status(card) {
  if (card.verified) return 'verified';
  if (card.script) return card.scriptStatus === 'curated' ? 'curated' : 'script present';
  return 'missing';
}

function triage(card) {
  if (card.verified) return 'verified';
  if (card.script) return 'verify';
  return gaps(card).length ? 'engine' : 'ready';
}

function typeKey(card) {
  return card.supertype === 'Champion' ? 'Champion' : (card.type || 'Unknown');
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function tableRow(card) {
  const gapText = gaps(card).join(', ') || '—';
  return `| ${escapeCell(card.id)} | ${escapeCell(card.name)} | ${card.cost ?? '—'} | ${escapeCell(typeKey(card))} | ${status(card)} | ${triage(card)} | ${escapeCell(mechanic(card))} | ${escapeCell(gapText)} |`;
}

const uniqueIds = new Set();
for (const deck of decks) for (const entry of deck.cards || []) uniqueIds.add(entry.cardId);
const uniqueCards = [...uniqueIds].sort().map((id) => db.get(id)).filter(Boolean);
const uniqueText = uniqueCards.filter((card) => text(card));
const summary = {
  uniqueCards: uniqueCards.length,
  uniqueText: uniqueText.length,
  scripted: uniqueText.filter((card) => card.script).length,
  verified: uniqueText.filter((card) => card.verified).length,
  missing: uniqueText.filter((card) => !card.script).length,
  ready: uniqueText.filter((card) => triage(card) === 'ready').length,
  engine: uniqueText.filter((card) => triage(card) === 'engine').length,
  verify: uniqueText.filter((card) => triage(card) === 'verify').length,
};

const lines = [];
lines.push('# Starter-deck cohort');
lines.push('');
lines.push('Generated by `npm run scripts:starter-cohort` from `data/cards.json`, `data/scripts.json`, and the starter-deck builder. Do not hand-edit the card rows; re-run the generator after card or script changes.');
lines.push('');
lines.push('Coverage is not correctness. **Script present** means an entry exists; **verified** means the script is curated with matching verification metadata and a passing test.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Metric | Value |');
lines.push('| --- | ---: |');
lines.push(`| Unique starter cards | ${summary.uniqueCards} |`);
lines.push(`| Unique starter text cards | ${summary.uniqueText} |`);
lines.push(`| Text cards with a script | ${summary.scripted} |`);
lines.push(`| Text cards verified | ${summary.verified} |`);
lines.push(`| Text cards missing a script | ${summary.missing} |`);
lines.push(`| Triage: ready | ${summary.ready} |`);
lines.push(`| Triage: engine gap | ${summary.engine} |`);
lines.push(`| Triage: verify existing script | ${summary.verify} |`);
lines.push('');
lines.push('Triage labels: `ready` means the current DSL can express the printed text; `engine` means a gap is listed and an engine batch is needed; `verify` means an existing script needs clause-by-clause review before it can be marked curated.');
lines.push('');
lines.push('## Decks');
lines.push('');

for (const deck of decks) {
  const cards = (deck.cards || []).map((entry) => db.get(entry.cardId)).filter(Boolean).filter((card) => text(card));
  const groups = new Map();
  for (const card of cards) {
    const key = mechanic(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  lines.push(`### ${deck.name}`);
  lines.push('');
  lines.push(`Regions: ${(deck.regions || []).join(', ') || '—'}. Text cards: ${cards.length}; scripted: ${cards.filter((card) => card.script).length}; verified: ${cards.filter((card) => card.verified).length}; missing: ${cards.filter((card) => !card.script).length}.`);
  lines.push('');
  for (const [group, groupCards] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groupCards.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    lines.push(`#### ${group}`);
    lines.push('');
    lines.push('| ID | Card | Cost | Type | Status | Triage | Mechanic | Likely gap |');
    lines.push('| --- | --- | ---: | --- | --- | --- | --- | --- |');
    for (const card of groupCards) lines.push(tableRow(card));
    lines.push('');
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${lines.join('\n').trimEnd()}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outFile)}: ${summary.uniqueText} text cards, ${summary.scripted} scripted, ${summary.missing} missing, ${summary.verified} verified.`);
