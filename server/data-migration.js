// Explicit, backed-up migration of the legacy project data directory into the
// desktop per-user directory. Only writable user files are copied; immutable
// seed cards stay in the packaged seed folder.
import path from 'node:path';
import { access, copyFile, cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { mergeSeedScripts, DEFAULT_SEED_META } from './scripts-upgrade.js';

export const WRITABLE_FILES = [
  'settings.json',
  'custom-cards.json',
  'scripts.json',
  'mechanics.json',
  'keywords.json',
  'decks.json',
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

async function upgradeScriptsInPlace({ seedDir, dataDir, logger = () => {} }) {
  const seedScripts = await readJson(path.join(seedDir, 'scripts.json'), null);
  if (!seedScripts) return null;
  const seedMeta = { ...DEFAULT_SEED_META, ...(await readJson(path.join(seedDir, 'scripts-seed.json'), {})) };
  let userMeta = await readJson(path.join(dataDir, 'scripts-upgrade.json'), null);
  let userScripts = {};
  let corrupt = false;
  try {
    userScripts = await readJson(path.join(dataDir, 'scripts.json'), {});
  } catch {
    corrupt = true;
    userMeta = null;
  }
  const cardsPayload = await readJson(path.join(seedDir, 'cards.json'), { cards: [] });
  const cardsById = new Map((cardsPayload.cards || []).map((card) => [card.id, card]));
  const { scripts, report } = mergeSeedScripts({ seedScripts, seedMeta, userScripts, userMeta, cardsById });
  report.corruptUserFile = corrupt;
  if (report.changed) {
    const backupDir = path.join(dataDir, 'backups');
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `scripts-${stamp}.json`);
    await writeFile(backupFile, JSON.stringify(userScripts, null, 2));
    report.backupFile = backupFile;
    await writeJsonAtomic(path.join(dataDir, 'scripts.json'), scripts);
    logger(`Upgraded card scripts to seed ${seedMeta.version}. Backup: ${backupFile}`);
  }
  const keepUserVersion = report.skipped === 'up-to-date-or-newer';
  await writeJsonAtomic(path.join(dataDir, 'scripts-upgrade.json'), {
    version: keepUserVersion ? (userMeta?.version || seedMeta.version) : seedMeta.version,
    scriptsVersion: keepUserVersion ? (userMeta?.scriptsVersion ?? seedMeta.scriptsVersion ?? 0) : (seedMeta.scriptsVersion ?? 0),
    origin: keepUserVersion ? (userMeta?.origin || seedMeta.origin || 'seed') : (seedMeta.origin || 'seed'),
    mergedAt: new Date().toISOString(),
    lastReport: report,
  });
  return report;
}

async function copyIfPresent(fromDir, toDir, names) {
  const copied = [];
  for (const name of names) {
    const source = path.join(fromDir, name);
    if (!(await exists(source))) continue;
    await copyFile(source, path.join(toDir, name));
    copied.push(name);
  }
  return copied;
}

export async function prepareUserData({
  seedDir,
  dataDir,
  legacyDir = null,
  logger = () => {},
  force = false,
} = {}) {
  if (!seedDir || !dataDir) throw new Error('seedDir and dataDir are required.');
  const targetSeed = path.resolve(seedDir);
  const targetData = path.resolve(dataDir);
  await mkdir(targetData, { recursive: true });
  const markerFile = path.join(targetData, '.migration.json');
  const hasSettings = await exists(path.join(targetData, 'settings.json'));
  const targetHasData = hasSettings
    || (await Promise.all(WRITABLE_FILES.map((name) => exists(path.join(targetData, name))))).some(Boolean)
    || await exists(path.join(targetData, 'art'));
  const sameDirectory = legacyDir && path.resolve(legacyDir) === targetData;

  if (hasSettings && !force) {
    return { migrated: false, reason: 'existing-data', dataDir: targetData, backupDir: null, copied: [] };
  }
  if (!legacyDir || sameDirectory) {
    return { migrated: false, reason: sameDirectory ? 'same-directory' : 'no-legacy-data', dataDir: targetData, backupDir: null, copied: [] };
  }

  const source = path.resolve(legacyDir);
  if (!(await exists(path.join(source, 'settings.json')))) {
    return { migrated: false, reason: 'no-legacy-settings', dataDir: targetData, backupDir: null, copied: [] };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(path.dirname(targetData), 'backups', `data-${stamp}`);
  await mkdir(backupDir, { recursive: true });
  // Back up the legacy source itself before any copy. This is a complete copy of
  // the small writable files and the art directory, not the immutable card seed.
  const sourceBackup = path.join(backupDir, 'legacy');
  await mkdir(sourceBackup, { recursive: true });
  const copiedSource = await copyIfPresent(source, sourceBackup, WRITABLE_FILES);
  if (await exists(path.join(source, 'art'))) {
    await cp(path.join(source, 'art'), path.join(sourceBackup, 'art'), { recursive: true });
  }

  // If the target already has files, preserve them too before overwriting.
  let targetBackup = null;
  if (targetHasData) {
    targetBackup = path.join(backupDir, 'target');
    await mkdir(targetBackup, { recursive: true });
    await copyIfPresent(targetData, targetBackup, WRITABLE_FILES);
    if (await exists(path.join(targetData, 'art'))) {
      await cp(path.join(targetData, 'art'), path.join(targetBackup, 'art'), { recursive: true });
    }
  }

  const copied = await copyIfPresent(source, targetData, WRITABLE_FILES);
  if (await exists(path.join(source, 'art'))) {
    await cp(path.join(source, 'art'), path.join(targetData, 'art'), { recursive: true, force: false, errorOnExist: false });
  }
  const scriptsUpgrade = await upgradeScriptsInPlace({ seedDir: targetSeed, dataDir: targetData, logger });
  const marker = {
    migratedAt: new Date().toISOString(),
    source,
    seed: targetSeed,
    backupDir,
    copied,
    targetBackup,
    scriptsUpgrade,
  };
  await writeFile(markerFile, JSON.stringify(marker, null, 2));
  logger(`Migrated legacy data from ${source} to ${targetData}. Backup: ${backupDir}`);
  return { migrated: true, reason: 'migrated', dataDir: targetData, backupDir, copied, targetBackup, marker, scriptsUpgrade };
}

export async function migrationInfo(dataDir) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, '.migration.json'), 'utf8'));
  } catch {
    return null;
  }
}
