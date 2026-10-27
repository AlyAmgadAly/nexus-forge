// Backed-up seed script merging.
//
// This module is deliberately pure: callers provide the seed scripts, the user
// scripts, and the seed/user version metadata. Store and migration code own the
// file I/O, backups, and reporting.
//
// Rules:
//   - custom entries are never touched;
//   - curated entries and verified partial entries are never touched;
//   - locally modified auto/partial entries are never overwritten;
//   - unmodified auto/partial entries upgrade to the packaged seed;
//   - user-only entries are kept, even if the seed no longer has the card.
import { scriptHash } from './script-metadata.js';

export const DEFAULT_SEED_META = Object.freeze({
  version: '0.0.0',
  scriptsVersion: 0,
  origin: 'seed',
});

export function compareVersions(a, b) {
  // Seed versions are release versions. Prerelease/build suffixes do not
  // change the seed ordering, so compare the numeric core only.
  const core = (value) => String(value || '0').split(/[+-]/)[0].split('.');
  const left = core(a);
  const right = core(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? '0';
    const r = right[i] ?? '0';
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn)) {
      if (ln !== rn) return ln > rn ? 1 : -1;
    } else if (l !== r) {
      return l > r ? 1 : -1;
    }
  }
  return 0;
}

export function entryScript(entry) {
  if (!entry) return null;
  if (entry.script) return entry.script;
  if (Array.isArray(entry.triggers)) return entry;
  return null;
}

export function entryStatus(entry) {
  if (!entry) return null;
  if (entry.status) return entry.status;
  return entryScript(entry) ? 'custom' : null;
}

function hasCard(cardsById, id) {
  if (!cardsById) return true;
  if (cardsById instanceof Map) return cardsById.has(id);
  return Object.prototype.hasOwnProperty.call(cardsById, id);
}

function seedRecord(seedEntry, seedMeta) {
  const script = entryScript(seedEntry);
  return {
    ...seedEntry,
    seed: {
      version: seedMeta.version || '0.0.0',
      origin: seedMeta.origin || 'seed',
      scriptHash: scriptHash(script),
    },
  };
}

export function mergeSeedScripts({
  seedScripts = {},
  seedMeta = DEFAULT_SEED_META,
  userScripts = {},
  userMeta = null,
  cardsById = null,
  now = null,
} = {}) {
  const report = {
    seedVersion: seedMeta.version || '0.0.0',
    scriptsVersion: seedMeta.scriptsVersion ?? 0,
    previousVersion: userMeta?.version || null,
    origin: seedMeta.origin || 'seed',
    mergedAt: now || null,
    added: [],
    upgraded: [],
    metadataUpdated: [],
    kept: [],
    excluded: [],
    userOnly: [],
    changed: false,
    backupRecommended: false,
    skipped: null,
  };
  const result = { ...(userScripts || {}) };

  if (!seedScripts || !Object.keys(seedScripts).length) {
    report.skipped = 'seed-missing';
    return { scripts: result, report };
  }

  // Never downgrade a user file that is newer than the packaged seed.
  if (userMeta?.version && compareVersions(seedMeta.version || '0.0.0', userMeta.version) <= 0) {
    report.skipped = 'up-to-date-or-newer';
    return { scripts: result, report };
  }

  for (const [id, seedEntry] of Object.entries(seedScripts)) {
    const script = entryScript(seedEntry);
    if (!script) {
      report.excluded.push({ id, reason: 'seed-entry-has-no-script' });
      continue;
    }
    if (!hasCard(cardsById, id)) {
      report.excluded.push({ id, reason: 'card-not-in-seed-catalog' });
      continue;
    }
    const next = seedRecord(seedEntry, seedMeta);
    const existing = result[id];
    if (!existing) {
      result[id] = next;
      report.added.push(id);
      continue;
    }

    const status = entryStatus(existing);
    if (status === 'custom') {
      report.kept.push({ id, reason: 'custom' });
      continue;
    }
    if (status === 'curated') {
      report.kept.push({ id, reason: 'curated' });
      continue;
    }
    if (status === 'partial' && existing.verification) {
      report.kept.push({ id, reason: 'verified-partial' });
      continue;
    }
    if (status !== 'auto' && status !== 'partial') {
      report.kept.push({ id, reason: `status-${status || 'unknown'}` });
      continue;
    }

    const existingScript = entryScript(existing);
    const existingHash = scriptHash(existingScript);
    const seedHash = next.seed.scriptHash;
    const baselineHash = existing.seed?.scriptHash || null;
    let modified;
    if (baselineHash) {
      modified = existingHash !== baselineHash;
    } else if (existingHash === seedHash) {
      modified = false;
    } else if (existing.updatedAt && seedEntry.updatedAt) {
      // Legacy entry with no seed.scriptHash baseline. The admin save path
      // stamps updatedAt with the edit time; an entry newer than the packaged
      // seed is treated as locally modified. Older/equal entries are assumed
      // unmodified and can upgrade.
      const existingTime = Date.parse(existing.updatedAt);
      const seedTime = Date.parse(seedEntry.updatedAt);
      modified = Number.isFinite(existingTime) && Number.isFinite(seedTime)
        ? existingTime > seedTime
        : true;
    } else {
      modified = true;
    }
    if (modified) {
      report.kept.push({ id, reason: 'locally-modified' });
      continue;
    }

    if (existingHash === seedHash && status === entryStatus(seedEntry)) {
      const metadataChanged = existing.seed?.scriptHash !== next.seed.scriptHash
        || existing.seed?.version !== next.seed.version
        || existing.seed?.origin !== next.seed.origin;
      result[id] = { ...existing, seed: next.seed };
      if (metadataChanged) report.metadataUpdated.push(id);
      else report.kept.push({ id, reason: 'unchanged' });
      continue;
    }
    result[id] = next;
    report.upgraded.push(id);
  }

  report.userOnly = Object.keys(result).filter((id) => !seedScripts[id]);
  report.changed = report.added.length > 0 || report.upgraded.length > 0 || report.metadataUpdated.length > 0;
  report.backupRecommended = report.changed;
  return { scripts: result, report };
}
