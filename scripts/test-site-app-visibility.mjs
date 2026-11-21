import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerSessionManager } from '../assets/site-owner-session.js';
import { safeAppReturnPath, initAppAccess } from '../assets/site-app-access.js';
import { initHomeApps } from '../assets/site-home-apps.js';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';

const owner = { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true, getIdToken: async () => 'OWNER_TOKEN' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('private-app return paths cannot redirect externally or open an API/script', () => {
  const origin = 'https://taithai.app';
  for (const path of ['https://evil.example/', '//evil.example/', '/\\evil.example/', '/api/ace', '/Movie-Memory/app.js', '/Movie-Memory/../../admin/', '/unrecognized/', '/Movie-Memory/\u0000']) assert.equal(safeAppReturnPath(path, origin), null, path);
  assert.equal(safeAppReturnPath('/Movie-Memory/add/?title=Film#view', origin).path, '/Movie-Memory/add/?title=Film#view');
  assert.equal(safeAppReturnPath('/QR%20Code%20Generator%20/', origin).app.id, 'qr-generator');
});

test('a Firebase user without the verified owner identity never requests a cookie grant', async () => {
  let user = { ...owner, email: 'visitor@example.com' }; const calls = [];
  const manager = createOwnerSessionManager({ getUser: () => user, request: async (_, options) => { calls.push(options); return { ok: true }; } });
  await manager.refresh(user);
  assert.deepEqual(calls.map(call => call.method), ['DELETE']);
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('sign-out waits for an in-flight cookie grant and clears it last', async () => {
  let user = owner; const post = deferred(); const calls = [];
  const manager = createOwnerSessionManager({ getUser: () => user, request: async (_, options) => { calls.push(options.method); if (options.method === 'POST') return post.promise; return { ok: true }; } });
  const refresh = manager.refresh(); await tick();
  const clear = manager.clear(); user = null; await tick();
  assert.deepEqual(calls, ['POST']);
  post.resolve({ ok: true }); await Promise.all([refresh, clear]);
  assert.equal(calls.at(-1), 'DELETE');
});

test('account changes while obtaining a token cannot mint an owner session', async () => {
  const token = deferred(); const currentOwner = { ...owner, getIdToken: () => token.promise }; let user = currentOwner; let writes = 0;
  const manager = createOwnerSessionManager({ getUser: () => user, request: async () => { writes++; return { ok: true }; } });
  const refresh = manager.refresh(); user = { uid: 'visitor' }; token.resolve('OLD_OWNER_TOKEN');
  assert.equal(await refresh, false); assert.equal(writes, 0);
});

function element(text = '', href = '') {
  const node = new EventTarget(); Object.assign(node, { textContent: text, hidden: false, disabled: false, dataset: {}, attributes: {}, classList: { toggle() {} }, getAttribute: key => key === 'href' ? href : node.attributes[key], setAttribute: (key, value) => { node.attributes[key] = value; } });
  return node;
}
function environment() {
  const win = new EventTarget(); Object.assign(win, { CustomEvent, location: { origin: 'https://taithai.app', search: '' }, setTimeout, clearTimeout, TaithaiPreferences: { get: () => ({ language: 'en' }) } });
  const doc = new EventTarget(); doc.hidden = false; return { win, doc };
}
function homeFixture(loadSettings) {
  const { win, doc } = environment(); const nodes = Object.fromEntries(['appDirectory', 'appCatalogError', 'reloadAppCatalog', 'appSearchCount'].map(id => [id, element()]));
  const cards = [element('Movies', './Movie-Memory/'), element('Chat', './temporary%20chat/'), element('QR', './QR%20Code%20Reader/')];
  const shortcuts = [element('Movies', './Movie-Memory/'), element('Chat', './temporary%20chat/')];
  const toolkit = element(), total = element(), hero = element();
  doc.getElementById = id => nodes[id];
  doc.querySelectorAll = selector => selector === '.toolkit-item' ? shortcuts : cards;
  doc.querySelector = selector => ({ '.toolkit': toolkit, '.stat-num': total, '.hero': hero })[selector];
  return { win, doc, nodes, cards, shortcuts, toolkit, total, start: () => initHomeApps({ win, doc, loadSettings }) };
}
function settings(overrides) {
  const value = normalizeAppSettings(null);
  for (const [id, visibility] of Object.entries(overrides)) value.apps[id] = { visibility };
  return value;
}

test('home discovery hides private/unlisted cards and hero links until a verified settings response', async () => {
  const pending = deferred(); const app = homeFixture(() => pending.promise); const setup = app.start();
  assert.equal(app.nodes.appDirectory.hidden, true); assert.ok(app.cards.every(card => card.hidden)); assert.equal(app.toolkit.hidden, true);
  pending.resolve(settings({ 'movie-memory': 'unlisted', 'temporary-chat': 'private' })); const control = await setup;
  assert.deepEqual(app.cards.map(card => card.dataset.catalogVisible), ['false', 'false', 'true']); assert.ok(app.shortcuts.every(link => link.hidden)); assert.equal(app.nodes.appDirectory.hidden, false);
  assert.equal(app.total.textContent, '7'); control.destroy();
});

test('a failed or malformed catalog closes discovery and offers retry without restoring old private links', async () => {
  let value = settings({}); const app = homeFixture(async () => { if (value instanceof Error) throw value; return value; }); const control = await app.start();
  assert.ok(app.cards.every(card => !card.hidden)); value = Error('offline'); await control.refresh();
  assert.ok(app.cards.every(card => card.hidden)); assert.equal(app.nodes.appCatalogError.hidden, false); assert.equal(app.nodes.reloadAppCatalog.disabled, false);
  value = { valid: false }; await control.refresh(); assert.equal(app.nodes.appDirectory.hidden, true);
  value = settings({ 'movie-memory': 'private' }); await control.refresh(); assert.equal(app.nodes.appCatalogError.hidden, true); assert.equal(app.cards[0].hidden, true); assert.equal(app.cards[1].hidden, false); control.destroy();
});

function accessFixture(user, options = {}) {
  const { win, doc } = environment(); win.location.search = '?next=%2FMovie-Memory%2Fadd%2F'; const redirects = []; win.location.replace = path => redirects.push(path);
  const nodes = Object.fromEntries(['appAccessPanel','appAccessName','appAccessStatus','appAccessHint','appAccessSignIn','appAccessRetry','appAccessSwitch','appAccessContinue'].map(id => [id, element()])); doc.getElementById = id => nodes[id];
  let callback; let writes = 0;
  const auth = { subscribeAuth(fn) { callback = fn; fn(user); return () => {}; }, refreshOwnerAppSession: options.grant || (async () => { writes++; return true; }), loginWithGoogle: async () => {}, logout: async () => { callback(null); } };
  return { win, doc, nodes, redirects, auth, writes: () => writes, notify: next => callback(next), start: () => initAppAccess({ win, doc, loadAuth: async () => auth }) };
}

test('access page denies a visitor but returns a verified owner to the requested app', async () => {
  const visitor = accessFixture({ uid: 'visitor', email: 'visitor@example.com', emailVerified: true }); const v = await visitor.start();
  assert.equal(visitor.writes(), 0); assert.equal(visitor.nodes.appAccessSwitch.hidden, false); assert.equal(visitor.redirects.length, 0); v.destroy();
  const admin = accessFixture(owner); const a = await admin.start(); await tick();
  assert.deepEqual(admin.redirects, ['/Movie-Memory/add/']); a.destroy();
});

test('access-page account changes discard an in-flight successful grant instead of redirecting', async () => {
  const pending = deferred(); const app = accessFixture(owner, { grant: () => pending.promise }); const control = await app.start();
  app.notify({ uid: 'visitor', email: 'visitor@example.com', emailVerified: true }); pending.resolve(true); await tick();
  assert.equal(app.redirects.length, 0); assert.match(app.nodes.appAccessStatus.textContent, /cannot open/); control.destroy();
});
