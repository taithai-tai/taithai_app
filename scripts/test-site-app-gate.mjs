import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CATALOG, normalizeAppSettings } from '../assets/site-app-catalog.js';
import { createAppGate, createAccessSessionHandler, loadAppVisibility, verifyOwnerToken, OWNER_COOKIE } from '../server-lib/site-app-gate.js';

const origin = 'https://taithai.app';
const ownerEmail = 'taithai5002@gmail.com';
const now = Date.UTC(2026, 10, 21, 12);
const claims = { aud: 'gen-lang-client-0141234491', iss: 'https://securetoken.google.com/gen-lang-client-0141234491', sub: 'owner-user', email: ownerEmail, email_verified: true, iat: now / 1000 - 1, exp: now / 1000 + 600 };
function token(overrides = {}) { return `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url')}.signature`; }
const ownerToken = token();
function settings(overrides = {}) {
  const value = normalizeAppSettings(null);
  return normalizeAppSettings({ schemaVersion: 1, revision: 1, apps: { ...value.apps, ...Object.fromEntries(Object.entries(overrides).map(([id, visibility]) => [id, { visibility }])) }, updatedBy: 'owner', updatedAt: new Date(now).toISOString() });
}
const request = (path, init = {}) => new Request(origin + path, init);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fakeOwner = async value => value === ownerToken ? { uid: 'owner-user', expiresAt: now + 600000 } : null;

test('public app requests continue; unlisted continue with noindex; shared auth remains reachable during outage', async () => {
  const gate = createAppGate({ loadSettings: async () => settings({ 'movie-memory': 'unlisted' }) });
  assert.equal((await gate(request('/QR%20Code%20Reader/'))).response, null);
  const unlisted = await gate(request('/Movie-Memory/'));
  assert.equal(unlisted.response, null);
  assert.match(unlisted.headers['X-Robots-Tag'], /noindex/);
  assert.match(unlisted.headers['Cache-Control'], /no-store/);
  const offline = createAppGate({ loadSettings: async () => { throw new Error('offline'); } });
  assert.equal((await offline(request('/assets/site-app-access.js'))).response, null);
  assert.equal((await offline(request('/firebase-auth.js'))).response, null);
  assert.equal((await offline(request('/app-access/'))).response, null);
  assert.equal((await offline(request('/Movie-Memory/'))).response.status, 503);
});

test('private app aliases, script assets, generated copies, and APIs never continue for guests', async () => {
  const gate = createAppGate({ loadSettings: async () => settings(Object.fromEntries(APP_CATALOG.filter(app => !app.locked).map(app => [app.id, 'private']))), verifyOwner: fakeOwner });
  const paths = ['/Movie-Memory/', '/Movie%20Memory/index.html', '/movie-memory-assets/app.js', '/Movie-Memory/profile/', '/Chordly/_next/static/a.js', '/api/chordly/charts', '/api/ace', '/api/shortlinks', '/api/shortlinks.js', '/api/movie-poster?url=test', '/api/analyze-movie-ticket', '/S/abc123', '/temporary%20chat/', '/QR%20Code%20Generator%20/', '/QR%20Code%20Reader/', '/Bangkok%20Doctor%20Plan/', '/Public%20Drive/', '/Private%20Drive/'];
  for (const path of paths) {
    const result = await gate(request(path));
    assert.ok(result.response, path);
    assert.ok([303, 403].includes(result.response.status), path);
    assert.match(result.response.headers.get('Cache-Control'), /no-store/, path);
    if (path.startsWith('/api/') || path.endsWith('.js')) assert.equal(result.response.status, 403, path);
  }
  const navigation = await gate(request('/Movie-Memory/add/?title=test'));
  const next = new URL(navigation.response.headers.get('Location'), origin);
  assert.equal(next.pathname, '/app-access/');
  assert.equal(next.searchParams.get('app'), 'movie-memory');
  assert.equal(next.searchParams.get('next'), '/Movie-Memory/add/?title=test');
});

test('private app access depends on a verified cookie; client headers and duplicate cookies do not grant access', async () => {
  const gate = createAppGate({ loadSettings: async () => settings({ 'movie-memory': 'private' }), verifyOwner: fakeOwner });
  const allowed = await gate(request('/Movie-Memory/app.js', { headers: { cookie: `${OWNER_COOKIE}=${ownerToken}` } }));
  assert.equal(allowed.response, null);
  assert.match(allowed.headers['Cache-Control'], /private, no-store/);
  const spoofed = await gate(request('/Movie-Memory/app.js', { headers: { 'x-user-email': ownerEmail, cookie: `${OWNER_COOKIE}=forged` } }));
  assert.equal(spoofed.response.status, 403);
  const duplicates = await gate(request('/Movie-Memory/app.js', { headers: { cookie: `${OWNER_COOKIE}=${ownerToken}; ${OWNER_COOKIE}=forged` } }));
  assert.equal(duplicates.response.status, 403);
});

test('malformed, partial settings and encoded path confusion fail closed', async () => {
  const gate = createAppGate({ loadSettings: async () => ({ valid: false, apps: {} }) });
  assert.equal((await gate(request('/Movie-Memory/'))).response.status, 503);
  for (const path of ['/Movie-Memory/%zz/', '/Movie-Memory/%252e%252e/app.js', '/Movie-Memory%252fapp.js', '/Movie-Memory/%255capp.js', '/Movie-Memory/%00/']) {
    assert.equal((await gate(request(path))).response.status, 400, path);
  }
});

test('Firebase lookup is authoritative: owner claims alone cannot authenticate, expiration and project are checked', async () => {
  const success = { users: [{ localId: claims.sub, email: ownerEmail, emailVerified: true }] };
  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.match(url, /^https:\/\/identitytoolkit\.googleapis\.com\//); assert.equal(JSON.parse(options.body).idToken, ownerToken); return json(success); };
  const cache = new Map();
  const verified = await verifyOwnerToken(ownerToken, { fetchImpl, now, cache });
  assert.equal(verified.uid, claims.sub);
  assert.equal(verified.expiresAt, now + 600000);
  await verifyOwnerToken(ownerToken, { fetchImpl, now: now + 20000, cache });
  assert.equal(calls, 1);
  assert.equal(await verifyOwnerToken(ownerToken, { fetchImpl: async () => json({ error: 'INVALID_ID_TOKEN' }, 400), now, cache: new Map() }), null);
  for (const override of [{ exp: now / 1000 - 1 }, { aud: 'other-project' }, { email_verified: false }, { email: 'someone@example.com' }]) {
    assert.equal(await verifyOwnerToken(token(override), { fetchImpl: async () => { throw new Error('must not fetch'); }, now, cache: new Map() }), null);
  }
  for (const user of [{ localId: 'other-user', email: ownerEmail, emailVerified: true }, { localId: claims.sub, email: ownerEmail, emailVerified: false }, { localId: claims.sub, email: ownerEmail, emailVerified: true, disabled: true }]) {
    assert.equal(await verifyOwnerToken(ownerToken, { fetchImpl: async () => json({ users: [user] }), now, cache: new Map() }), null);
  }
});

test('session endpoint binds cookie to origin and owner token, keeps it HttpOnly and token-limited, supports logout', async () => {
  const handler = createAccessSessionHandler({ verifyOwner: fakeOwner, now: () => now });
  const authenticated = await handler(request('/api/app-access', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${ownerToken}` } }));
  assert.equal(authenticated.status, 200);
  const cookie = authenticated.headers.get('set-cookie');
  assert.ok(cookie.startsWith(`${OWNER_COOKIE}=${ownerToken};`));
  for (const part of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=600']) assert.ok(cookie.includes(part), part);
  assert.equal((await handler(request('/api/app-access', { method: 'POST', headers: { Origin: 'https://evil.example', Authorization: `Bearer ${ownerToken}` } }))).status, 403);
  assert.equal((await handler(request('/api/app-access', { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` } }))).status, 403);
  assert.equal((await handler(request('/api/app-access', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer nope' } }))).status, 403);
  const logout = await handler(request('/api/app-access', { method: 'DELETE', headers: { Origin: origin } }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await handler(request('/api/app-access'))).status, 405);
  const local = await handler(new Request('http://127.0.0.1:3000/api/app-access', { method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', Authorization: `Bearer ${ownerToken}` } }));
  assert.match(local.headers.get('set-cookie'), /^taithai_owner_dev=/);
  assert.doesNotMatch(local.headers.get('set-cookie'), /; Secure/);
});

test('Firestore missing config uses safe deployed defaults; malformed or denied reads do not become public', async () => {
  const missing = await loadAppVisibility({ fetchImpl: async () => json({}, 404) });
  assert.equal(missing.apps['private-drive'].visibility, 'private');
  assert.equal(missing.apps['movie-memory'].visibility, 'public');
  await assert.rejects(loadAppVisibility({ fetchImpl: async () => json({}, 403) }), /SETTINGS_UNAVAILABLE/);
  await assert.rejects(loadAppVisibility({ fetchImpl: async () => json({ fields: { schemaVersion: { integerValue: '1' } } }) }), /SETTINGS_INVALID/);
});
