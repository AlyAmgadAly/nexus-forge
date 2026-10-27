#!/usr/bin/env node
// Merge a reviewed card-script batch into data/scripts.json.
//
// Usage:
//   npm run scripts:apply -- scripts/batches/2026-10-27-support-01.json
//   npm run scripts:apply -- scripts/batches/... --check
//
// The tool validates every entry, sorts keys deterministically, writes
// atomically, backs up the previous file, and refuses to overwrite a custom
// entry unless --force is supplied.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintScript } from '../server/script-lint.js';
import { prepareVerification, validateVerification } from '../server/script-metadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sortScripts(scripts) {
  return Object.fromEntries(Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b)));
}

export function applyBatch({
  batchFile,
  scriptsFile = path.join(root, 'data', 'scripts.json'),
  cardsFile = path.join(root, 'data', 'cards.json'),
  customCardsFile = path.join(root, 'data', 'custom-cards.json'),
  backupDir = path.join(root, 'data', 'backups'),
  check = false,
  force = false,
} = {}) {
  const batch = readJson(batchFile, null);
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
    throw new Error('Batch file must be a JSON object.');
  }
  if (!batch.cards || typeof batch.cards !== 'object' || Array.isArray(batch.cards)) {
    throw new Error('Batch file must have a cards object.');
  }
  const scripts = readJson(scriptsFile, {});
  const cardsPayload = readJson(cardsFile, { cards: [] });
  const customCards = readJson(customCardsFile, []);
  const cardsById = new Map([
    ...(cardsPayload.cards || []).map((card) => [card.id, card]),
    ...(Array.isArray(customCards) ? customCards : []).map((card) => [card.id, card]),
  ]);

  const errors = [];
  const warnings = [];
  const next = { ...scripts };
  for (const [id, input] of Object.entries(batch.cards)) {
    const card = cardsById.get(id);
    if (!card) {
      errors.push(`${id}: card not found in cards.json or custom-cards.json.`);
      continue;
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      errors.push(`${id}: batch entry must be an object.`);
      continue;
    }
    const status = input.status;
    if (!['auto', 'partial', 'curated'].includes(status)) {
      errors.push(`${id}: batch status must be auto, partial, or curated.`);
      continue;
    }
    const existing = scripts[id];
    if (existing?.status === 'custom' && !force) {
      errors.push(`${id}: refusing to overwrite a custom entry (use --force only after review).`);
      continue;
    }
    if (existing?.status === 'curated' && status !== 'curated' && !force) {
      errors.push(`${id}: refusing to downgrade a curated entry (use --force only after review).`);
      continue;
    }
    const lint = lintScript(input.script, { strict: true, card, status });
    if (!lint.ok) {
      errors.push(...lint.errors.map((error) => `${id}: ${error}`));
      if (!lint.errors.length) errors.push(`${id}: strict semantic lint rejected warnings.`);
      warnings.push(...lint.warnings.map((warning) => `${id}: ${warning}`));
      continue;
    }
    let verification = null;
    if (status === 'curated') {
      if (!input.verification) {
        errors.push(`${id}: curated entries require verification metadata.`);
        continue;
      }
      verification = prepareVerification(input.verification, card);
      const checkResult = validateVerification(verification, { card });
      if (!checkResult.ok) {
        errors.push(...checkResult.errors.map((error) => `${id}: verification: ${error}`));
        continue;
      }
      warnings.push(...checkResult.warnings.map((warning) => `${id}: verification: ${warning}`));
    } else if (input.verification) {
      errors.push(`${id}: verification metadata is only valid for curated entries.`);
      continue;
    }
    next[id] = {
      ...(existing || {}),
      script: input.script,
      status,
      updatedAt: input.updatedAt || new Date().toISOString(),
    };
    if (verification) next[id].verification = verification;
    else delete next[id].verification;
    if (existing?.seed) next[id].seed = existing.seed;
  }

  if (errors.length) {
    return { ok: false, errors, warnings, changed: [], check, written: false };
  }

  const sorted = sortScripts(next);
  const changed = Object.keys(batch.cards).filter((id) => JSON.stringify(scripts[id] || null) !== JSON.stringify(sorted[id] || null));
  if (check || !changed.length) {
    return { ok: true, errors: [], warnings, changed, check, written: false, scripts: sorted };
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `scripts-batch-${timestamp()}.json`);
  fs.writeFileSync(backupFile, `${JSON.stringify(scripts, null, 2)}\n`);
  fs.mkdirSync(path.dirname(scriptsFile), { recursive: true });
  const tmp = `${scriptsFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  fs.renameSync(tmp, scriptsFile);
  return { ok: true, errors: [], warnings, changed, check, written: true, backupFile, scripts: sorted };
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const batchFile = positional[0];
  if (!batchFile) {
    console.error('Usage: npm run scripts:apply -- <batch.json> [--check] [--force] [--scripts <file>]');
    process.exit(1);
  }
  const scriptsIndex = args.indexOf('--scripts');
  const cardsIndex = args.indexOf('--cards');
  try {
    const result = applyBatch({
      batchFile: path.resolve(batchFile),
      scriptsFile: scriptsIndex >= 0 ? path.resolve(args[scriptsIndex + 1]) : undefined,
      cardsFile: cardsIndex >= 0 ? path.resolve(args[cardsIndex + 1]) : undefined,
      check: flags.has('--check'),
      force: flags.has('--force'),
    });
    if (result.warnings.length) {
      for (const warning of result.warnings) console.warn(`warning: ${warning}`);
    }
    if (!result.ok) {
      console.error(`Batch rejected with ${result.errors.length} error(s):`);
      for (const error of result.errors) console.error(`  - ${error}`);
      process.exit(1);
    }
    if (result.check) {
      console.log(`Batch is valid. ${result.changed.length} card(s) would change.`);
    } else if (!result.changed.length) {
      console.log('Batch is valid. No card entries changed.');
    } else {
      console.log(`Applied ${result.changed.length} card(s). Backup: ${result.backupFile}`);
    }
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
