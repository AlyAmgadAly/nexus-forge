#!/usr/bin/env node
// Syntax gate for the server, shared wire modules, browser client, desktop shell
// and tooling. Node's --check honors the package "type": "module" setting.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['server', 'shared', 'desktop', 'public/js', 'scripts'];
const extensions = new Set(['.js', '.mjs', '.cjs']);
const skip = new Set(['node_modules', 'vendor', 'release', 'dist', '.git']);

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = roots.flatMap((dir) => {
  const full = path.join(root, dir);
  return fs.existsSync(full) ? walk(full) : [];
});

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\nSyntax error: ${path.relative(root, file)}`);
    console.error((result.stderr || result.stdout || '').trim());
  }
}

if (failed) {
  console.error(`\n${failed} file${failed === 1 ? '' : 's'} failed syntax validation.`);
  process.exit(1);
}
console.log(`Syntax OK: ${files.length} files checked.`);
