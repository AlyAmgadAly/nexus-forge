import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { startNexusService } from '../server/service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('card faces retain their proportions without replacing gameplay illustration caches', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-card-art-'));
  const art = await sharp({ create: { width: 340, height: 512, channels: 3, background: '#996633' } })
    .png({ compressionLevel: 0 }).toBuffer();
  const requests = [];
  const upstream = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(art);
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let service;
  t.after(async () => {
    if (service) await service.stop();
    await new Promise(resolve => upstream.close(resolve));
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  service = await startNexusService({
    dataDir: dir, seedDir: path.join(ROOT, 'data'), desktop: true, port: 0,
    logger: { log() {}, error() {}, warn() {} },
  });
  const card = service.store.cardDB.get('06NX012');
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  card.art = `${origin}/face.png`;
  card.fullArt = `${origin}/illustration.png`;

  const illustration = await fetch(`${service.url}/art/${card.id}`);
  assert.equal(illustration.status, 200);
  const original = Buffer.from(await illustration.arrayBuffer());
  const fullSize = await sharp(original).metadata();
  assert.deepEqual([fullSize.width, fullSize.height], [600, 856]);

  const face = await fetch(`${service.url}/art/${card.id}?face=1`);
  assert.equal(face.status, 200);
  const faceSize = await sharp(Buffer.from(await face.arrayBuffer())).metadata();
  assert.deepEqual([faceSize.width, faceSize.height], [340, 512]);
  assert.deepEqual(requests, ['/illustration.png', '/face.png']);

  const cachedFace = await fetch(`${service.url}/art/${card.id}?face=1`);
  await cachedFace.arrayBuffer();
  const cachedFull = Buffer.from(await (await fetch(`${service.url}/art/${card.id}`)).arrayBuffer());
  assert.deepEqual(cachedFull, original);
  assert.equal(requests.length, 2, 'both variants should be cached separately');
  const pool = await (await fetch(`${service.url}/api/cardpool`)).json();
  assert.deepEqual(pool.cards.find(c => c.id === card.id).formats, card.formats || []);
});
