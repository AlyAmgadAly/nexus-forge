// CI gate: semantic lint for the shipped seed scripts and verification checks
// for curated entries. Read-only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintScripts } from '../server/script-lint.js';
import { validateVerification } from '../server/script-metadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
const cardsPayload = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
const customCards = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'data', 'custom-cards.json'), 'utf8'));
  } catch {
    return [];
  }
})();
const cardsById = new Map([
  ...(cardsPayload.cards || []).map((card) => [card.id, card]),
  ...(Array.isArray(customCards) ? customCards : []).map((card) => [card.id, card]),
]);

const errors = [];
const warnings = [];
const lint = lintScripts(scripts, { strict: true, cardsById });
errors.push(...lint.errors);
warnings.push(...lint.warnings);

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const testNames = new Map();
for (const file of fs.readdirSync(path.join(root, 'test')).filter((name) => name.endsWith('.test.mjs'))) {
  const source = fs.readFileSync(path.join(root, 'test', file), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\btest\(\s*['"`]([^'"`]+)['"`]/g)) names.add(slugify(match[1]));
  testNames.set(`test/${file}`, names);
}

for (const [id, entry] of Object.entries(scripts)) {
  if (entry?.status !== 'curated') continue;
  const card = cardsById.get(id) || null;
  const check = validateVerification(entry.verification, { card });
  errors.push(...check.errors.map((error) => `${id}: verification: ${error}`));
  warnings.push(...check.warnings.map((warning) => `${id}: verification: ${warning}`));
  const test = String(entry.verification?.test || '');
  if (!test) continue;
  const [file, caseName] = test.split('#');
  const names = testNames.get(file);
  if (!names) {
    errors.push(`${id}: verification test file does not exist: ${file}`);
  } else if (caseName && !names.has(slugify(caseName))) {
    errors.push(`${id}: verification test case not found: ${file}#${caseName}`);
  }
}

if (warnings.length) {
  console.warn(`Warnings (${warnings.length}):`);
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
if (errors.length || warnings.length) {
  console.error(`Script lint failed with ${errors.length} error(s) and ${warnings.length} warning(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Script lint OK: ${Object.keys(scripts).length} entries, 0 errors, 0 warnings.`);
