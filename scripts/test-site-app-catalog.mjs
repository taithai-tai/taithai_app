import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CATALOG, getPublicApps, getVisibleApps, normalizeCatalogPath, resolveApp, normalizeAppSettings, validAppVisibilityMap } from '../assets/site-app-catalog.js';

const stored = (patch = {}) => ({ schemaVersion: 1, revision: 1, apps: normalizeAppSettings(null).apps, updatedAt: '2026-11-21T02:00:00.000Z', updatedBy: 'owner', ...patch });

test('published app aliases and associated API routes resolve to the same app', () => {
  const routes = {
    'temporary-chat': ['/temporary%20chat/', '/Temporary-Chat/index.html'],
    'qr-generator': ['/QR%20Code%20Generator%20/', '/qr-code-generator/index.html'],
    'qr-reader': ['/QR%20Code%20Reader/', '/QR-Code-Reader/assets/icon.png'],
    shortlinks: ['/S/code/', '/URL%20Shortener/', '/api/shortlinks?code=one', '/api/shortlinks.js'],
    'bu-degree-plan': ['/Bangkok%20Doctor%20Plan/', '/bangkok-doctor-plan/index.html'],
    'movie-memory': ['/Movie%20Memory/index.html', '/Movie-Memory/movie/', '/movie-memory-assets/app.js', '/api/movie-poster?url=one', '/api/analyze-movie-ticket/'],
    'public-drive': ['/Public%20Drive/index.html', '/public-drive/'],
    chordly: ['/Chordly/_next/static/example.js', '/chordly/song/', '/api/chordly/charts/'],
    ace: ['/ACE/assets/main.js', '/api/ace/'],
    'private-drive': ['/Private%20Drive/', '/private-drive/index.html']
  };
  for (const [id, paths] of Object.entries(routes)) for (const path of paths) assert.equal(resolveApp(path)?.id, id, path);
  for (const path of ['/', '/account/', '/admin/', '/assets/site-data.js', '/api/app-access/', '/api/chordly-spoof/']) assert.equal(resolveApp(path), null, path);
});

test('route normalization handles encoded separators and traversal consistently without prefix overmatching', () => {
  assert.equal(resolveApp('/Movie%2520Memory%252fassets/app.js')?.id, 'movie-memory');
  assert.equal(resolveApp('/other/../PRIVATE%20DRIVE/index.html')?.id, 'private-drive');
  assert.equal(resolveApp('/Private%20Drive\\index.html')?.id, 'private-drive');
  assert.equal(resolveApp('https://taithai.app/Movie-Memory/?query=private')?.id, 'movie-memory');
  assert.equal(resolveApp('/Movie-Memory-copy/'), null);
  for (const path of ['/Movie%ZZMemory/', '/Movie%00Memory/', 'Movie-Memory/', '/%252525252fprivate-drive/']) assert.equal(normalizeCatalogPath(path), null, path);
});

test('missing config preserves current public apps while Private Drive remains owner-only', () => {
  const initial = normalizeAppSettings(null);
  assert.equal(initial.revision, 0); assert.equal(initial.exists, false); assert.equal(initial.valid, true);
  assert.equal(getPublicApps(initial).length, 9);
  assert.equal(getVisibleApps(initial, { isOwner: true }).length, 10);
  assert.equal(initial.apps['private-drive'].visibility, 'private');
  assert.equal(APP_CATALOG.find(app => app.id === 'private-drive').locked, true);
});

test('unlisted apps remain outside public discovery and saved objects cannot mutate normalization', () => {
  const raw = stored(); raw.apps['movie-memory'].visibility = 'unlisted';
  const settings = normalizeAppSettings(raw);
  assert.equal(settings.valid, true); assert.equal(getPublicApps(settings).length, 8);
  raw.apps.ace.visibility = 'private';
  assert.equal(settings.apps.ace.visibility, 'public');
});

test('partial, unsupported or corrupt stored configuration fails closed instead of restoring public defaults', () => {
  const incomplete = stored(); delete incomplete.apps.ace;
  const extra = stored(); extra.apps.unknown = { visibility: 'public' };
  const exposedDrive = stored(); exposedDrive.apps['private-drive'].visibility = 'public';
  const badMode = stored(); badMode.apps.ace.visibility = 'enabled';
  const badEntry = stored(); badEntry.apps.ace.extra = 'unsafe';
  for (const value of [{}, [], stored({ schemaVersion: 2 }), stored({ revision: 0 }), stored({ revision: 1.5 }), stored({ updatedAt: 'bad' }), stored({ updatedBy: 'untrusted' }), incomplete, extra, exposedDrive, badMode, badEntry]) {
    const result = normalizeAppSettings(value);
    assert.equal(result.valid, false, JSON.stringify(value));
    assert.equal(getPublicApps(result).length, 0);
    assert.ok(Object.values(result.apps).every(app => app.visibility === 'private'));
  }
  assert.equal(validAppVisibilityMap({}), false);
});
