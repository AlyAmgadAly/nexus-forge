import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { compareVersions, mergeSeedScripts } from '../server/scripts-upgrade.js';
import { scriptHash } from '../server/script-metadata.js';

const SEED_META = { version: '0.3.0', scriptsVersion: 1, origin: 'seed' };

function card(id, text = 'Play: Draw 1.') {
  return {
    id,
    name: `Card ${id}`,
    cost: 1,
    attack: 1,
    health: 1,
    type: 'Unit',
    supertype: '',
    subtypes: [],
    regions: ['Demacia'],
    keywords: [],
    text,
    collectible: true,
    enabled: true,
    set: 'Test',
  };
}

function script(amount = 1) {
  return { triggers: [{ on: 'play', actions: [{ type: 'draw', amount }] }] };
}

function entry(amount, updatedAt = '2026-10-26T00:00:00.000Z', status = 'auto') {
  return { status, script: script(amount), updatedAt };
}

function seedScripts() {
  return {
    A: { status: 'auto', script: script(2), updatedAt: '2026-10-27T00:00:00.000Z' },
    B: { status: 'auto', script: script(1), updatedAt: '2026-10-27T00:00:00.000Z' },
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function tempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-seed-'));
  const seedDir = path.join(root, 'seed');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, seedDir, dataDir };
}

function setupSeed(seedDir, cards = [card('A'), card('B')], scripts = seedScripts(), meta = SEED_META) {
  writeJson(path.join(seedDir, 'cards.json'), { cards, globals: {} });
  writeJson(path.join(seedDir, 'scripts.json'), scripts);
  writeJson(path.join(seedDir, 'scripts-seed.json'), meta);
}

function backupFiles(dataDir) {
  const dir = path.join(dataDir, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

test('compareVersions orders release versions and ignores build suffixes', () => {
  assert.equal(compareVersions('0.3.0', '0.2.0'), 1);
  assert.equal(compareVersions('0.2.0', '0.3.0'), -1);
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0);
  assert.equal(compareVersions('0.3.0-beta', '0.3.0'), 0);
});

test('fresh installs receive every pinned seed entry with seed metadata', () => {
  const { scripts, report } = mergeSeedScripts({
    seedScripts: seedScripts(),
    seedMeta: SEED_META,
    userScripts: {},
    userMeta: null,
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.deepEqual(report.added.sort(), ['A', 'B']);
  assert.equal(report.changed, true);
  assert.equal(scripts.A.status, 'auto');
  assert.equal(scripts.A.seed.version, '0.3.0');
  assert.equal(scripts.A.seed.origin, 'seed');
  assert.equal(scripts.A.seed.scriptHash, scriptHash(script(2)));
});

test('old unmodified auto entries upgrade, custom entries stay untouched, and user-only entries survive', () => {
  const { scripts, report } = mergeSeedScripts({
    seedScripts: seedScripts(),
    seedMeta: SEED_META,
    userScripts: {
      A: entry(1),
      B: entry(1),
      C: { status: 'custom', script: script(9) },
      D: { status: 'auto', script: script(4) },
    },
    userMeta: { version: '0.2.0' },
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.deepEqual(report.upgraded.sort(), ['A']);
  assert.deepEqual(report.metadataUpdated.sort(), ['B']);
  assert.deepEqual(report.userOnly.sort(), ['C', 'D']);
  assert.equal(scripts.A.script.triggers[0].actions[0].amount, 2);
  assert.equal(scripts.B.seed.version, '0.3.0');
  assert.equal(scripts.C.status, 'custom');
  assert.equal(scripts.C.script.triggers[0].actions[0].amount, 9);
  assert.equal(scripts.D.status, 'auto');
});

test('locally modified auto entries are never overwritten', () => {
  const modifiedNewer = { ...entry(3, '2026-10-27T12:00:00.000Z') };
  const modifiedBaseline = { ...entry(3), seed: { version: '0.2.0', origin: 'seed', scriptHash: scriptHash(script(1)) } };
  const { scripts, report } = mergeSeedScripts({
    seedScripts: seedScripts(),
    seedMeta: SEED_META,
    userScripts: { A: modifiedNewer, B: modifiedBaseline },
    userMeta: { version: '0.2.0' },
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.equal(report.upgraded.length, 0);
  assert.ok(report.kept.some((item) => item.id === 'A' && item.reason === 'locally-modified'));
  assert.ok(report.kept.some((item) => item.id === 'B' && item.reason === 'locally-modified'));
  assert.equal(scripts.A.script.triggers[0].actions[0].amount, 3);
  assert.equal(scripts.B.script.triggers[0].actions[0].amount, 3);
});

test('curated and verified partial entries are preserved', () => {
  const curated = { status: 'curated', script: script(7), verification: { version: 1, test: 'test/x.test.mjs#x', cardTextHash: 'a'.repeat(64) } };
  const partial = { status: 'partial', script: script(8), verification: { version: 1, test: 'test/x.test.mjs#x', cardTextHash: 'a'.repeat(64) } };
  const { scripts, report } = mergeSeedScripts({
    seedScripts: seedScripts(),
    seedMeta: SEED_META,
    userScripts: { A: curated, B: partial },
    userMeta: { version: '0.2.0' },
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.equal(scripts.A.status, 'curated');
  assert.equal(scripts.B.status, 'partial');
  assert.ok(report.kept.some((item) => item.id === 'A' && item.reason === 'curated'));
  assert.ok(report.kept.some((item) => item.id === 'B' && item.reason === 'verified-partial'));
});

test('a newer user seed version is never downgraded', () => {
  const user = { A: entry(9) };
  const { scripts, report } = mergeSeedScripts({
    seedScripts: seedScripts(),
    seedMeta: SEED_META,
    userScripts: user,
    userMeta: { version: '0.4.0' },
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.equal(report.skipped, 'up-to-date-or-newer');
  assert.equal(report.changed, false);
  assert.equal(scripts.A.script.triggers[0].actions[0].amount, 9);
});

test('seed entries for cards outside the pinned catalog are excluded from packages', () => {
  const { scripts, report } = mergeSeedScripts({
    seedScripts: { ...seedScripts(), CUSTOM1: { status: 'auto', script: script(1) } },
    seedMeta: SEED_META,
    userScripts: { CUSTOM1: { status: 'custom', script: script(5) } },
    userMeta: { version: '0.2.0' },
    cardsById: new Map([['A', card('A')], ['B', card('B')]]),
  });
  assert.ok(report.excluded.some((item) => item.id === 'CUSTOM1'));
  assert.equal(scripts.CUSTOM1.status, 'custom');
  assert.equal(scripts.CUSTOM1.script.triggers[0].actions[0].amount, 5);
});

test('store.init upgrades an old user file with a backup and keeps custom entries', async () => {
  const { seedDir, dataDir } = tempDirs();
  setupSeed(seedDir);
  writeJson(path.join(dataDir, 'scripts.json'), {
    A: entry(1),
    B: { status: 'custom', script: script(1) },
    C: { status: 'custom', script: script(3) },
  });
  writeJson(path.join(dataDir, 'custom-cards.json'), [card('C')]);
  writeJson(path.join(dataDir, 'scripts-upgrade.json'), { version: '0.2.0' });

  const store = new Store({ dataDir, seedDir });
  await store.init();

  assert.equal(store.scripts.A.status, 'auto');
  assert.equal(store.scripts.A.script.triggers[0].actions[0].amount, 2);
  assert.equal(store.scripts.A.seed.version, '0.3.0');
  assert.equal(store.scripts.B.status, 'custom');
  assert.equal(store.scripts.B.script.triggers[0].actions[0].amount, 1);
  assert.equal(store.scripts.C.status, 'custom');

  const backups = backupFiles(dataDir);
  const upgradeBackup = backups.find((name) => name.startsWith('scripts-upgrade-'));
  assert.ok(upgradeBackup, 'expected an upgrade backup');
  const backup = JSON.parse(fs.readFileSync(path.join(dataDir, 'backups', upgradeBackup), 'utf8'));
  assert.equal(backup.A.script.triggers[0].actions[0].amount, 1);

  const upgrade = JSON.parse(fs.readFileSync(path.join(dataDir, 'scripts-upgrade.json'), 'utf8'));
  assert.equal(upgrade.version, '0.3.0');
  assert.ok(upgrade.lastReport.upgraded.includes('A'));
  assert.ok(upgrade.lastReport.kept.some((item) => item.id === 'B' && item.reason === 'custom'));
});

test('store.init backs up a corrupt user scripts file and falls back to the seed', async () => {
  const { seedDir, dataDir } = tempDirs();
  setupSeed(seedDir);
  fs.writeFileSync(path.join(dataDir, 'scripts.json'), '{not valid json');

  const store = new Store({ dataDir, seedDir });
  await store.init();

  assert.equal(store.scripts.A.status, 'auto');
  const backups = backupFiles(dataDir);
  const corruptBackup = backups.find((name) => name.startsWith('scripts-corrupt-'));
  assert.ok(corruptBackup, 'expected a corrupt-file backup');
  assert.equal(fs.readFileSync(path.join(dataDir, 'backups', corruptBackup), 'utf8'), '{not valid json');

  const upgrade = JSON.parse(fs.readFileSync(path.join(dataDir, 'scripts-upgrade.json'), 'utf8'));
  assert.equal(upgrade.lastReport.corruptUserFile, true);
});

test('store.init installs the seed on a fresh data directory', async () => {
  const { seedDir, dataDir } = tempDirs();
  setupSeed(seedDir);

  const store = new Store({ dataDir, seedDir });
  await store.init();

  assert.equal(store.scripts.A.status, 'auto');
  assert.equal(store.scripts.B.status, 'auto');
  assert.equal(fs.existsSync(path.join(dataDir, 'scripts.json')), true);
  assert.deepEqual(backupFiles(dataDir), []);
});

test('store.init preserves a newer user seed version and does not rewrite scripts', async () => {
  const { seedDir, dataDir } = tempDirs();
  setupSeed(seedDir);
  writeJson(path.join(dataDir, 'scripts.json'), { A: { status: 'custom', script: script(9) } });
  writeJson(path.join(dataDir, 'scripts-upgrade.json'), { version: '0.4.0', scriptsVersion: 2, origin: 'seed' });

  const store = new Store({ dataDir, seedDir });
  await store.init();

  assert.equal(store.scripts.A.status, 'custom');
  assert.equal(store.scripts.A.script.triggers[0].actions[0].amount, 9);
  const upgrade = JSON.parse(fs.readFileSync(path.join(dataDir, 'scripts-upgrade.json'), 'utf8'));
  assert.equal(upgrade.version, '0.4.0');
  assert.equal(upgrade.lastReport.skipped, 'up-to-date-or-newer');
  assert.deepEqual(backupFiles(dataDir), []);
});

test('store.init keeps a locally modified auto entry', async () => {
  const { seedDir, dataDir } = tempDirs();
  setupSeed(seedDir);
  writeJson(path.join(dataDir, 'scripts.json'), {
    A: entry(3, '2026-10-27T12:00:00.000Z'),
    B: entry(1),
  });
  writeJson(path.join(dataDir, 'scripts-upgrade.json'), { version: '0.2.0' });

  const store = new Store({ dataDir, seedDir });
  await store.init();

  assert.equal(store.scripts.A.script.triggers[0].actions[0].amount, 3);
  assert.equal(store.scripts.A.seed, undefined);
  assert.equal(store.scripts.B.script.triggers[0].actions[0].amount, 1);
  const upgrade = JSON.parse(fs.readFileSync(path.join(dataDir, 'scripts-upgrade.json'), 'utf8'));
  assert.ok(upgrade.lastReport.kept.some((item) => item.id === 'A' && item.reason === 'locally-modified'));
});
