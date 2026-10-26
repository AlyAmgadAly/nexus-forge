// Explicit, backed-up migration of the legacy project data directory into the
// desktop per-user directory. Only writable user files are copied; immutable
// seed cards stay in the packaged seed folder.
import path from 'node:path';
import { access, copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

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
  const marker = {
    migratedAt: new Date().toISOString(),
    source,
    seed: targetSeed,
    backupDir,
    copied,
    targetBackup,
  };
  await writeFile(markerFile, JSON.stringify(marker, null, 2));
  logger(`Migrated legacy data from ${source} to ${targetData}. Backup: ${backupDir}`);
  return { migrated: true, reason: 'migrated', dataDir: targetData, backupDir, copied, targetBackup, marker };
}

export async function migrationInfo(dataDir) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, '.migration.json'), 'utf8'));
  } catch {
    return null;
  }
}
