import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const excluded = new Set([
  '.git',
  '.github',
  '.agents',
  '.codex',
  '.gitignore',
  'node_modules',
  'public',
  'scripts',
  'package.json',
  'package-lock.json',
  'server.js',
  'vercel.json',
  'README.md',
  'firebase-blueprint.json',
  'firebase.json',
  '.firebaserc',
  'firestore.rules'
]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (excluded.has(entry.name) || entry.name.startsWith('.env')) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name), {
    recursive: true
  });
}

console.log('Static site prepared in public/');
