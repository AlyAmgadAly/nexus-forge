// Build the packaged seed script file.
//
// data/scripts.json is also the local writable user file in development, so it
// can contain entries for custom cards. Packages must only ship entries for
// cards in the pinned data/cards.json catalog. This script writes the filtered
// seed to dist/seed/ without touching data/scripts.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scripts-seed.json'), 'utf8'));
const pinned = new Set((cards.cards || []).map((card) => card.id));

const filtered = {};
const excluded = [];
for (const id of Object.keys(scripts).sort()) {
  if (!pinned.has(id)) {
    excluded.push(id);
    continue;
  }
  filtered[id] = scripts[id];
}

const outDir = path.join(root, 'dist', 'seed');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'scripts.json'), `${JSON.stringify(filtered, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'scripts-seed.json'), `${JSON.stringify(meta, null, 2)}\n`);
const suffix = excluded.length ? ` (${excluded.join(', ')})` : '';
console.log(`Seed scripts: ${Object.keys(filtered).length} pinned entries; excluded ${excluded.length} non-pinned${suffix}.`);
