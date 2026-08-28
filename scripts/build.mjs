import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const excluded = new Set([
  '.git', '.github', '.agents', '.codex', 'api', '.gitignore', 'node_modules',
  'public', 'scripts', 'chordly', 'package.json', 'package-lock.json', 'server.js',
  'vercel.json', 'README.md', 'firebase-blueprint.json', 'firebase.json',
  '.firebaserc', 'firestore.rules', 'storage.rules', 'ticket-analyzer.js'
]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (excluded.has(entry.name) || entry.name.startsWith('.env')) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name), { recursive: true });
}

const movieMemorySource = path.join(root, 'Movie Memory');
const movieMemoryAssets = path.join(output, 'movie-memory-assets');
await mkdir(movieMemoryAssets, { recursive: true });
for (const asset of ['styles.css', 'app.js', 'ticket-movie-resolver.js', 'account.js', 'account-loader.js', 'auth-feedback.js', 'game.css', 'game.js', 'feature-pages.css', 'dashboard.js', 'recommendations.css', 'recommendations.js', 'preferences.css', 'preferences.js', 'settings.css', 'settings.js']) {
  await cp(path.join(movieMemorySource, asset), path.join(movieMemoryAssets, asset));
}
for (const folder of ['feature-icons', 'app-icons']) {
  await cp(path.join(movieMemorySource, 'assets', folder), path.join(movieMemoryAssets, folder), { recursive: true });
}
await cp(path.join(movieMemorySource, 'manifest.webmanifest'), path.join(movieMemoryAssets, 'manifest.webmanifest'));

const movieMemoryRoutes = path.join(output, 'Movie-Memory');
await mkdir(movieMemoryRoutes, { recursive: true });
await cp(path.join(movieMemorySource, 'index.html'), path.join(movieMemoryRoutes, 'index.html'));
for (const route of ['add', 'movie', 'account', 'posters', 'rewatch', 'review']) {
  const routeDirectory = path.join(movieMemoryRoutes, route);
  await mkdir(routeDirectory, { recursive: true });
  await cp(path.join(movieMemorySource, 'index.html'), path.join(routeDirectory, 'index.html'));
}
for (const [route, source] of [['game', 'game.html'], ['dashboard', 'dashboard.html'], ['recommendations', 'recommendations.html'], ['install', 'install.html'], ['tutorial', 'tutorial.html'], ['settings', 'settings.html'], ['profile', 'profile.html']]) {
  const routeDirectory = path.join(movieMemoryRoutes, route);
  await mkdir(routeDirectory, { recursive: true });
  await cp(path.join(movieMemorySource, source), path.join(routeDirectory, 'index.html'));
}

await run(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', 'chordly']);
await cp(path.join(root, 'chordly', 'out'), path.join(output, 'Chordly'), { recursive: true });

console.log('Static site and Chordly prepared in public/');
