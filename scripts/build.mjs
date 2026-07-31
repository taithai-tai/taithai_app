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
  'api',
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
  'firestore.rules',
  'storage.rules',
  'ticket-analyzer.js'
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

// Stable, space-free URLs for Movie Memory assets used by rewritten routes.
const movieMemorySource = path.join(root, 'Movie Memory');
const movieMemoryAssets = path.join(output, 'movie-memory-assets');
await mkdir(movieMemoryAssets, { recursive: true });
for (const asset of ['styles.css', 'app.js', 'account.js', 'account-loader.js', 'auth-feedback.js', 'game.css', 'game.js', 'feature-pages.css', 'dashboard.js', 'recommendations.css', 'recommendations.js', 'preferences.css', 'preferences.js', 'settings.css', 'settings.js']) {
  await cp(path.join(movieMemorySource, asset), path.join(movieMemoryAssets, asset));
}
await cp(
  path.join(movieMemorySource, 'assets', 'feature-icons'),
  path.join(movieMemoryAssets, 'feature-icons'),
  { recursive: true }
);
await cp(
  path.join(movieMemorySource, 'assets', 'app-icons'),
  path.join(movieMemoryAssets, 'app-icons'),
  { recursive: true }
);
await cp(
  path.join(movieMemorySource, 'manifest.webmanifest'),
  path.join(movieMemoryAssets, 'manifest.webmanifest')
);

// Materialize every app route as a real static page so Vercel does not need rewrites.
const movieMemoryRoutes = path.join(output, 'Movie-Memory');
await mkdir(movieMemoryRoutes, { recursive: true });
await cp(path.join(movieMemorySource, 'index.html'), path.join(movieMemoryRoutes, 'index.html'));
for (const route of ['add', 'movie', 'account', 'posters', 'rewatch', 'review']) {
  const routeDirectory = path.join(movieMemoryRoutes, route);
  await mkdir(routeDirectory, { recursive: true });
  await cp(path.join(movieMemorySource, 'index.html'), path.join(routeDirectory, 'index.html'));
}
const gameRoute = path.join(movieMemoryRoutes, 'game');
await mkdir(gameRoute, { recursive: true });
await cp(path.join(movieMemorySource, 'game.html'), path.join(gameRoute, 'index.html'));
for (const [route, source] of [['dashboard', 'dashboard.html'], ['recommendations', 'recommendations.html'], ['install', 'install.html'], ['tutorial', 'tutorial.html'], ['settings', 'settings.html']]) {
  const routeDirectory = path.join(movieMemoryRoutes, route);
  await mkdir(routeDirectory, { recursive: true });
  await cp(path.join(movieMemorySource, source), path.join(routeDirectory, 'index.html'));
}
const profileRoute = path.join(movieMemoryRoutes, 'profile');
await mkdir(profileRoute, { recursive: true });
await cp(path.join(movieMemorySource, 'profile.html'), path.join(profileRoute, 'index.html'));

console.log('Static site prepared in public/');
