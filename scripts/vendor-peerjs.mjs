#!/usr/bin/env node
// Copies the pinned PeerJS browser bundle into public/vendor. Keeping the exact
// version in package-lock.json and this checksum guards the shipped runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/peerjs/package.json'), 'utf8'));
if (pkg.version !== '1.5.5') {
  console.error(`Expected peerjs 1.5.5, found ${pkg.version}.`);
  process.exit(1);
}
const source = path.join(root, 'node_modules/peerjs/dist/peerjs.min.js');
const licenseSource = path.join(root, 'node_modules/peerjs/LICENSE');
const targetDir = path.join(root, 'public/vendor');
fs.mkdirSync(targetDir, { recursive: true });
const data = fs.readFileSync(source);
fs.writeFileSync(path.join(targetDir, 'peerjs.min.js'), data);
fs.copyFileSync(licenseSource, path.join(targetDir, 'peerjs.LICENSE.txt'));
const digest = crypto.createHash('sha256').update(data).digest('hex');
fs.writeFileSync(path.join(targetDir, 'peerjs.VERSION'), `peerjs@${pkg.version}\nsha256 ${digest}\n`);
console.log(`Vendored peerjs@${pkg.version} (${data.length} bytes, sha256 ${digest}).`);
