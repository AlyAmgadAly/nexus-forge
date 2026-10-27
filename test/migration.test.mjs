import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareUserData, migrationInfo } from '../server/data-migration.js';

async function tempDir(t, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));
  return dir;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

test('migration copies legacy writable data and art, leaving the seed alone', async (t) => {
  const root = await tempDir(t, 'nf-migrate-');
  const legacy = path.join(root, 'legacy');
  const seed = path.join(root, 'seed');
  const target = path.join(root, 'user', 'data');
  await writeJson(path.join(legacy, 'settings.json'), { gameName: 'Legacy Forge' });
  await writeJson(path.join(legacy, 'decks.json'), [{ id: 'deck-legacy', name: 'Legacy Deck' }]);
  await writeJson(path.join(legacy, 'custom-cards.json'), [{ id: '99RU001', name: 'Legacy Card' }]);
  await fs.mkdir(path.join(legacy, 'art'), { recursive: true });
  await fs.writeFile(path.join(legacy, 'art', '99RU001.webp'), 'legacy-art');
  await writeJson(path.join(seed, 'cards.json'), [{ id: 'SEED_CARD' }]);
  await writeJson(path.join(seed, 'scripts.json'), {});

  const result = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: legacy });
  assert.equal(result.migrated, true);
  assert.equal(result.reason, 'migrated');
  assert.deepEqual(result.copied.sort(), ['custom-cards.json', 'decks.json', 'settings.json']);
  assert.deepEqual(await readJson(path.join(target, 'settings.json')), { gameName: 'Legacy Forge' });
  assert.equal(await fs.readFile(path.join(target, 'art', '99RU001.webp'), 'utf8'), 'legacy-art');
  assert.equal(await fs.readFile(path.join(seed, 'cards.json'), 'utf8').then((text) => text.includes('Legacy')), false);

  const backup = await readJson(path.join(result.backupDir, 'legacy', 'settings.json'));
  assert.equal(backup.gameName, 'Legacy Forge');
  assert.equal(await fs.readFile(path.join(result.backupDir, 'legacy', 'art', '99RU001.webp'), 'utf8'), 'legacy-art');
  const marker = await migrationInfo(target);
  assert.equal(marker.backupDir, result.backupDir);

  const second = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: legacy });
  assert.equal(second.migrated, false);
  assert.equal(second.reason, 'existing-data');
});

test('migration upgrades legacy scripts with a backup and preserves custom entries', async (t) => {
  const root = await tempDir(t, 'nf-migrate-scripts-');
  const legacy = path.join(root, 'legacy');
  const seed = path.join(root, 'seed');
  const target = path.join(root, 'user', 'data');
  const draw = (amount) => ({ triggers: [{ on: 'play', actions: [{ type: 'draw', amount }] }] });

  await writeJson(path.join(legacy, 'settings.json'), { gameName: 'Legacy Forge' });
  await writeJson(path.join(legacy, 'scripts.json'), {
    A: { status: 'auto', script: draw(1), updatedAt: '2026-10-26T00:00:00.000Z' },
    B: { status: 'custom', script: draw(1) },
    C: { status: 'custom', script: draw(3) },
  });
  await writeJson(path.join(seed, 'cards.json'), { cards: [{ id: 'A' }, { id: 'B' }] });
  await writeJson(path.join(seed, 'scripts.json'), {
    A: { status: 'auto', script: draw(2), updatedAt: '2026-10-27T00:00:00.000Z' },
    B: { status: 'auto', script: draw(1), updatedAt: '2026-10-27T00:00:00.000Z' },
  });
  await writeJson(path.join(seed, 'scripts-seed.json'), { version: '0.3.0', scriptsVersion: 1, origin: 'seed' });

  const result = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: legacy });
  assert.equal(result.migrated, true);
  assert.ok(result.scriptsUpgrade);
  assert.ok(result.scriptsUpgrade.upgraded.includes('A'));
  assert.ok(result.scriptsUpgrade.backupFile);
  assert.equal(await fs.readFile(result.scriptsUpgrade.backupFile, 'utf8').then((text) => text.includes('"amount": 1')), true);

  const scripts = await readJson(path.join(target, 'scripts.json'));
  assert.equal(scripts.A.script.triggers[0].actions[0].amount, 2);
  assert.equal(scripts.A.seed.version, '0.3.0');
  assert.equal(scripts.B.status, 'custom');
  assert.equal(scripts.B.script.triggers[0].actions[0].amount, 1);
  assert.equal(scripts.C.status, 'custom');
  assert.equal(scripts.C.script.triggers[0].actions[0].amount, 3);

  const upgrade = await readJson(path.join(target, 'scripts-upgrade.json'));
  assert.equal(upgrade.version, '0.3.0');
  assert.ok(upgrade.lastReport.upgraded.includes('A'));
  const marker = await migrationInfo(target);
  assert.ok(marker.scriptsUpgrade.upgraded.includes('A'));
});

test('migration backs up a partial target before writing legacy data', async (t) => {
  const root = await tempDir(t, 'nf-migrate-partial-');
  const legacy = path.join(root, 'legacy');
  const seed = path.join(root, 'seed');
  const target = path.join(root, 'user', 'data');
  await writeJson(path.join(legacy, 'settings.json'), { gameName: 'Legacy Forge' });
  await writeJson(path.join(legacy, 'decks.json'), [{ id: 'deck-legacy' }]);
  await fs.mkdir(path.join(target), { recursive: true });
  await writeJson(path.join(target, 'decks.json'), [{ id: 'deck-local-partial' }]);
  await fs.mkdir(path.join(target, 'art'), { recursive: true });
  await fs.writeFile(path.join(target, 'art', 'local.png'), 'local-art');

  const result = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: legacy });
  assert.equal(result.migrated, true);
  assert.ok(result.targetBackup);
  assert.deepEqual(await readJson(path.join(result.targetBackup, 'decks.json')), [{ id: 'deck-local-partial' }]);
  assert.equal(await fs.readFile(path.join(result.targetBackup, 'art', 'local.png'), 'utf8'), 'local-art');
  assert.deepEqual(await readJson(path.join(target, 'decks.json')), [{ id: 'deck-legacy' }]);
});

test('migration refuses unsafe or empty sources', async (t) => {
  const root = await tempDir(t, 'nf-migrate-empty-');
  const seed = path.join(root, 'seed');
  const target = path.join(root, 'data');
  await fs.mkdir(target, { recursive: true });

  const same = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: target });
  assert.equal(same.migrated, false);
  assert.equal(same.reason, 'same-directory');

  const missing = path.join(root, 'legacy');
  await fs.mkdir(missing, { recursive: true });
  await writeJson(path.join(missing, 'decks.json'), []);
  const noSettings = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: missing });
  assert.equal(noSettings.migrated, false);
  assert.equal(noSettings.reason, 'no-legacy-settings');

  const none = await prepareUserData({ seedDir: seed, dataDir: target, legacyDir: null });
  assert.equal(none.migrated, false);
  assert.equal(none.reason, 'no-legacy-data');
});
