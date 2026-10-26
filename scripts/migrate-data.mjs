#!/usr/bin/env node
// Migrate browser/server data into a desktop user-data directory with a backup.
// Usage: node scripts/migrate-data.mjs [--from data] [--to <dir>] [--force]
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { prepareUserData, migrationInfo } from '../server/data-migration.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}
const from = path.resolve(value('--from', path.join(root, 'data')));
const to = path.resolve(value('--to', path.join(root, 'data-desktop')));
const force = args.includes('--force');

if (from === to) {
  console.error('Source and destination are the same directory. Nothing to do.');
  process.exit(1);
}

const result = await prepareUserData({
  seedDir: from,
  dataDir: to,
  legacyDir: from,
  force,
  logger: console.log,
});
console.log(JSON.stringify(result, null, 2));
if (result.migrated) {
  console.log(`Migration marker: ${JSON.stringify(await migrationInfo(to))}`);
}
