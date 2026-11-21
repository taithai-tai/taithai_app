import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Emitter {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); return !event.defaultPrevented; }
  async fire(type, detail = {}) { if (this.disabled && ['click', 'input', 'change'].includes(type)) return; const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, ...detail }; await Promise.all([...(this.listeners.get(type) || [])].map(fn => fn(event))); return event; }
}
function camel(value) { return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase()); }
function matches(element, selector) {
  return selector.split(',').some(raw => {
    const part = raw.trim();
    if (part.includes(' > ')) { const [parent, child] = part.split(' > '); return matches(element, child) && Boolean(element.parent && matches(element.parent, parent)); }
    if (part.startsWith('.')) return element.className.split(/\s+/).includes(part.slice(1));
    if (part.startsWith('#')) return element.id === part.slice(1);
    if (part.startsWith('[')) return [...part.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, key, value]) => {
      const actual = key.startsWith('data-') ? element.dataset[camel(key.slice(5))] : element.attributes[key];
      return actual !== undefined && (value === undefined || actual === value);
    });
    return element.tagName.toLowerCase() === part;
  });
}
class Element extends Emitter {
  constructor(tag, doc) { super(); this.tagName = tag.toUpperCase(); this.document = doc; this.children = []; this.dataset = {}; this.attributes = {}; this.style = {}; this.hidden = false; this.disabled = false; this.value = ''; this.initialValue = ''; this.checked = false; this._text = ''; this.className = ''; this.classList = { add: value => { if (!this.className.split(' ').includes(value)) this.className += ` ${value}`; }, remove: value => { this.className = this.className.split(' ').filter(x => x !== value).join(' '); }, toggle: (value, force) => { const next = force ?? !this.className.split(' ').includes(value); this.classList[next ? 'add' : 'remove'](value); return next; } }; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }
  querySelectorAll(selector) { const found = []; for (const child of this.children) { if (matches(child, selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let current = this; current; current = current.parent) if (matches(current, selector)) return current; return null; }
  get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
  focus() { this.document.activeElement = this; }
  click() { return this.fire('click'); }
  reset() { for (const control of this.querySelectorAll('input,textarea,select')) { control.value = control.initialValue; control.checked = false; } }
  get elements() { const controls = this.querySelectorAll('input,select,textarea,button'); controls.namedItem = name => controls.find(control => control.name === name); return controls; }
}
function fixture(page, { saved = {}, online = true, search = '', language = 'en', pathname = '/' } = {}) {
  const document = new Emitter(); document.documentElement = { lang: language }; document.createElement = tag => new Element(tag, document); document.body = document.createElement('body'); document.body.dataset.page = page; document.hidden = false;
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => selector === 'h1 [data-th]' ? document.body.querySelector('h1')?.querySelector('[data-th]') : document.body.querySelector(selector);
  document.getElementById = id => document.body.querySelector('#' + id);
  const window = new Emitter(); let prefs = { language, theme: 'system', accent: 'terracotta', fontSize: 'default', reduceMotion: 'system' };
  window.document = document; window.TaithaiPreferences = { get: () => ({ ...prefs }), set: changes => { prefs = { ...prefs, ...changes }; document.documentElement.lang = prefs.language; window.dispatchEvent({ type: 'taithai:preferences', detail: { source: 'set' } }); }, reset: () => window.TaithaiPreferences.set({ language: 'en', theme: 'system' }), storageAvailable: () => true, exportData: () => ({ version: 1, preferences: { ...prefs } }), importData: text => { const value = JSON.parse(text); if (value?.version !== 1 || !value.preferences) throw Error('invalid'); window.TaithaiPreferences.set(value.preferences); } };
  const storage = new Map(Object.entries(saved)); let blocked = false;
  const localStorage = { getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw Error('blocked'); storage.set(key, String(value)); }, removeItem: key => { if (blocked) throw Error('blocked'); storage.delete(key); } };
  let clock = Date.parse('2026-11-21T05:00:00Z'); let timerID = 0; const timers = new Map();
  const setTimeout = (fn, delay = 0) => { timers.set(++timerID, { fn, at: clock + Number(delay), interval: 0 }); return timerID; }; const clearTimeout = id => timers.delete(id);
  const setInterval = (fn, delay) => { timers.set(++timerID, { fn, at: clock + Number(delay), interval: Number(delay) }); return timerID; };
  function tick(ms) { const end = clock + ms; let iterations = 0; while (true) { const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; if (++iterations > 1000) throw Error('timer loop'); clock = next[1].at; if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]); next[1].fn(); } clock = end; }
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } preventDefault() { this.defaultPrevented = true; } }
  const location = { pathname, search, hash: '#private-fragment', origin: 'https://taithai.app', href: 'https://taithai.app' + pathname + search };
  const navigator = { onLine: online };
  let sequence = 0;
  const context = { window, document, localStorage, location, navigator, Date: FakeDate, Intl, URL, URLSearchParams, Blob, CustomEvent, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` }, setTimeout, clearTimeout, setInterval, clearInterval: clearTimeout, queueMicrotask, confirm: () => true, console };
  Object.assign(window, { localStorage, location, navigator, CustomEvent });
  function add(tag, id, parent = document.body, extras = {}) { const item = document.createElement(tag); item.id = id; Object.assign(item, extras); parent.append(item); return item; }
  function run(name, replacements = {}) { let source = fs.readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'); for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to); source = source.replace(/^export /gm, ''); vm.runInNewContext(source, context, { filename: name }); }
  return { context, window, document, add, run, tick, storage, blockStorage() { blocked = true; } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
function supportFixture(options = {}) {
  const f = fixture('support', { pathname: '/support/', ...options });
  const form = f.add('form', 'reportForm');
  for (const [name, id, tag, initial] of [['app', 'reportApp', 'select', 'Taithai website'], ['type', 'reportType', 'select', 'bug'], ['subject', 'reportSubject', 'input', ''], ['description', 'reportDescription', 'textarea', ''], ['steps', 'reportSteps', 'textarea', ''], ['expected', 'reportExpected', 'textarea', ''], ['contact', 'reportContact', 'input', '']]) {
    const input = f.add(tag, id, form, { name, value: initial, initialValue: initial });
    if (tag === 'select') for (const value of name === 'app' ? ['Taithai website', 'Movie Memory', 'Chordly'] : ['bug', 'complaint', 'feedback']) f.add('option', '', input, { value });
    else f.add('span', id + 'Error', form, { hidden: true });
  }
  f.add('input', 'reportConsent', form, { type: 'checkbox' }); f.add('span', 'reportConsentError', form, { hidden: true });
  for (const id of ['reportSubmit', 'reportSaveDraft', 'reportClearDraft']) f.add('button', id, form);
  for (const id of ['reportStatus', 'reportReceipt', 'reportAccountNote', 'myReports']) f.add('div', id);
  f.add('button', 'refreshMyReports');
  let authCallback;
  f.context.__loadAuth = async () => ({ subscribeAuth(callback) { authCallback = callback; callback(options.user || null); return () => {}; } });
  f.context.__data = { createReport: options.createReport || (async input => ({ id: input.reportId })), listMyReports: options.listMyReports || (async () => ({ items: [], nextCursor: null })) };
  f.run('site-support.js', { "import {createReport,listMyReports} from './site-data.js';": 'const {createReport,listMyReports}=__data;', "import('/firebase-auth.js?v=20260725-2')": '__loadAuth()' });
  function valid() { f.document.getElementById('reportSubject').value = 'A useful subject'; f.document.getElementById('reportDescription').value = 'A detailed description of what happened'; f.document.getElementById('reportConsent').checked = true; }
  return { ...f, form, valid, notify: value => authCallback(value) };
}

test('all seven service pages have shared preferences, navigation, feedback, and no-script fallback', () => {
  for (const page of ['settings', 'account', 'help', 'support', 'privacy', 'about', 'admin']) {
    const html = fs.readFileSync(new URL(`../${page}/index.html`, import.meta.url), 'utf8');
    assert.match(html, /site-preferences\.js/); assert.match(html, /site-pages\.js/); assert.match(html, /site-theme\.css/); assert.match(html, /id="offlineNotice"/); assert.match(html, /<noscript>/); assert.match(html, /href="\/settings\/"/); assert.match(html, /href="\/support\/"/);
  }
});

test('support validates fields and affirmative report consent before any write', async () => {
  let writes = 0; const app = supportFixture({ createReport: async () => { writes++; } }); await flush();
  await app.form.fire('submit'); assert.equal(writes, 0); assert.equal(app.document.getElementById('reportSubject').attributes['aria-invalid'], 'true'); assert.equal(app.document.activeElement.id, 'reportSubject');
  app.valid(); app.document.getElementById('reportConsent').checked = false; await app.form.fire('submit'); assert.equal(writes, 0); assert.equal(app.document.activeElement.id, 'reportConsent');
});

test('offline reports remain drafts and never attempt a backend write', async () => {
  let writes = 0; const app = supportFixture({ online: false, createReport: async () => { writes++; } }); await flush(); app.valid(); await app.form.fire('submit');
  assert.equal(writes, 0); assert.match(app.document.getElementById('reportStatus').textContent, /offline/); assert.ok(app.storage.has('taithai.support-draft.v1'));
});

test('one report submission freezes its controls, prevents double submits, and clears only after acknowledgement', async () => {
  let resolve; const calls = []; const app = supportFixture({ createReport: input => { calls.push(input); return new Promise(done => { resolve = done; }); } }); await flush(); app.valid();
  const pending = app.form.fire('submit'); await flush(); await app.form.fire('submit');
  assert.equal(calls.length, 1); assert.equal(app.document.getElementById('reportDescription').disabled, true); assert.equal(app.document.getElementById('reportClearDraft').disabled, true); assert.ok(app.storage.has('taithai.support-draft.v1'));
  resolve({ id: calls[0].reportId }); await pending;
  assert.equal(app.document.getElementById('reportDescription').value, ''); assert.equal(app.document.getElementById('reportReceipt').hidden, false); assert.match(app.document.getElementById('reportReceipt').textContent, /Report received/); assert.equal(app.storage.has('taithai.support-draft.v1'), false);
});

test('new typing after a saved draft warns before leaving until the new content is persisted', async () => {
  const app = supportFixture(); await flush(); app.valid(); await app.document.getElementById('reportSaveDraft').fire('click');
  app.document.getElementById('reportSubject').value = 'A new unsaved subject'; await app.form.fire('input');
  const event = { type: 'beforeunload', preventDefault() { this.defaultPrevented = true; } }; app.window.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  app.tick(300); const savedEvent = { type: 'beforeunload', preventDefault() { this.defaultPrevented = true; } }; app.window.dispatchEvent(savedEvent); assert.equal(savedEvent.defaultPrevented, undefined);
});

test('uncertain reports keep the same ID and locked snapshot while allowing original-request retry', async () => {
  const ids = []; let attempts = 0; const app = supportFixture({ createReport: async input => { ids.push(input.reportId); if (++attempts === 1) throw Object.assign(Error('uncertain'), { deliveryUnknown: true }); return { id: input.reportId }; } }); await flush(); app.valid(); await app.form.fire('submit');
  assert.match(app.document.getElementById('reportStatus').textContent, /not confirmed/); assert.equal(app.document.getElementById('reportDescription').disabled, true); assert.equal(app.document.getElementById('reportSubmit').disabled, false); assert.equal(app.document.getElementById('reportConsent').disabled, false); assert.equal(JSON.parse(app.storage.get('taithai.support-draft.v1')).uncertain, true);
  await app.form.fire('submit'); assert.deepEqual(ids, [ids[0], ids[0]]); assert.equal(app.document.getElementById('reportReceipt').hidden, false);
});

test('restored uncertain draft is not overwritten by query prefill, and consent remains usable', async () => {
  const draft = { version: 1, reportId: '00000000-0000-4000-8000-999999999999', uncertain: true, values: { app: 'Movie Memory', type: 'bug', subject: 'Saved subject', description: 'Saved description here', steps: '', expected: '', contact: '' } };
  const app = supportFixture({ saved: { 'taithai.support-draft.v1': JSON.stringify(draft) }, search: '?app=Chordly&type=feedback' }); await flush();
  assert.equal(app.document.getElementById('reportApp').value, 'Movie Memory'); assert.equal(app.document.getElementById('reportType').value, 'bug'); assert.equal(app.document.getElementById('reportConsent').checked, false); assert.equal(app.document.getElementById('reportConsent').disabled, false);
});

test('report pagination errors retain already loaded rows', async () => {
  let reads = 0; const app = supportFixture({ user: { uid: 'u1', displayName: 'User', email: 'u@example.com' }, listMyReports: async () => { if (++reads > 1) throw Error('offline'); return { items: [{ id: 'r1', subject: 'Previously loaded report', app: 'Movie Memory', status: 'open', createdAt: '2026-11-20T00:00:00Z' }], nextCursor: 'cursor1' }; } }); await flush();
  const button = app.document.getElementById('myReports').querySelector('[data-load-reports]'); assert.ok(button); await button.fire('click'); await flush();
  assert.match(app.document.getElementById('myReports').textContent, /Previously loaded report/); assert.match(app.document.getElementById('myReports').textContent, /Existing rows are kept/);
});

function pagesFixture(page) {
  const app = fixture(page); const heading = app.add('h1', ''); app.add('span', '', heading, { dataset: { th: 'ตั้งค่า', en: 'Settings' } });
  app.add('span', 'footerYear'); app.add('p', 'offlineNotice');
  for (const language of ['en', 'th']) app.add('button', '', app.document.body, { dataset: { language } });
  if (page === 'settings') {
    for (const id of ['settingsMessage', 'preferenceSaveState', 'consentState']) app.add('p', id);
    for (const [pref, value] of [['theme', 'dark'], ['theme', 'light'], ['language', 'th'], ['language', 'en']]) app.add('button', '', app.document.body, { dataset: { pref, value } });
    for (const consent of ['granted', 'denied']) app.add('button', '', app.document.body, { dataset: { consent } });
    for (const id of ['exportPreferences', 'resetPreferences']) app.add('button', id);
    app.add('input', 'importPreferences');
  }
  app.context.__loadSupport = async () => ({});
  app.run('site-pages.js', { "import('./site-support.js')": '__loadSupport()' });
  return app;
}

test('settings show persisted choices, sync language and controls, and follow offline status', async () => {
  const app = pagesFixture('settings');
  const dark = app.document.querySelectorAll('[data-pref]').find(button => button.dataset.value === 'dark'); await dark.fire('click'); assert.equal(app.window.TaithaiPreferences.get().theme, 'dark'); assert.equal(dark.attributes['aria-pressed'], 'true');
  app.window.TaithaiPreferences.set({ language: 'th' }); assert.equal(app.document.querySelector('h1 [data-th]').textContent, 'ตั้งค่า'); assert.match(app.document.getElementById('preferenceSaveState').textContent, /บันทึก/);
  app.context.navigator.onLine = false; app.window.dispatchEvent({ type: 'offline' }); assert.equal(app.document.getElementById('offlineNotice').hidden, false);
  app.context.navigator.onLine = true; app.window.dispatchEvent({ type: 'online' }); assert.equal(app.document.getElementById('offlineNotice').hidden, true);
});

function telemetryFixture(options = {}) {
  const app = fixture('help', { pathname: '/Movie%20Memory/profile/private-user/', search: '?token=SECRET_QUERY', ...options });
  const writes = []; let authCallback; let imports = 0;
  app.context.__loadData = options.loadData || (async () => { imports++; return { trackEvents: async batch => writes.push(batch) }; });
  app.context.__loadAuth = async () => ({ subscribeAuth(fn) { authCallback = fn; fn(null); return () => {}; } });
  app.run('site-telemetry.js', { "import('./site-data.js')": '__loadData()', "import('/firebase-auth.js?v=20260725-2')": '__loadAuth()' });
  return { ...app, writes, get imports() { return imports; }, notify: value => authCallback?.(value) };
}

test('telemetry makes no imports or writes before opt-in, after decline, or after revocation', async () => {
  const app = telemetryFixture(); app.tick(120000); await flush(); assert.equal(app.imports, 0); assert.equal(app.writes.length, 0);
  app.window.TaithaiAnalytics.setConsent('denied'); app.tick(120000); await flush(); assert.equal(app.imports, 0); assert.equal(app.writes.length, 0);
  app.window.TaithaiAnalytics.setConsent('granted'); app.tick(1200); await flush(); assert.equal(app.writes.length, 1);
  app.window.TaithaiAnalytics.setConsent('denied'); app.window.TaithaiAnalytics.track('click', { action: 'test' }); app.tick(120000); await flush(); assert.equal(app.writes.length, 1);
});

test('telemetry redacts identifiers from paths and never includes query, fragment, visible labels, or field values', async () => {
  const app = telemetryFixture(); app.window.TaithaiAnalytics.setConsent('granted');
  const button = app.add('button', 'saveMovie'); button.value = 'SECRET_FIELD'; button.textContent = 'SECRET_TEXT';
  await app.document.fire('click', { target: button, isTrusted: true });
  const form = app.add('form', 'reportForm'); const privateButton = app.add('button', 'sendPrivateReport', form); privateButton.value = 'SECRET_REPORT';
  await app.document.fire('click', { target: privateButton, isTrusted: true }); app.tick(1200); await flush();
  const serialized = JSON.stringify(app.writes); assert.match(serialized, /saveMovie/); assert.doesNotMatch(serialized, /SECRET|private-user|token=|private-fragment|sendPrivateReport/);
  assert.equal(app.context.telemetryContext('/Private%20Drive/private-access-code').path, '/Private-Drive/');
});

test('offline telemetry does not write and a fresh online flush uses only consented queued events', async () => {
  const app = telemetryFixture({ online: false }); app.window.TaithaiAnalytics.setConsent('granted'); app.tick(1200); await flush(); assert.equal(app.writes.length, 0);
  app.context.navigator.onLine = true; app.window.dispatchEvent({ type: 'online' }); await flush(); assert.equal(app.writes.length, 1);
});

test('revoke and regrant cannot resurrect a pre-revocation batch waiting for SDK import', async () => {
  let release; const writes = []; const app = telemetryFixture({ loadData: () => new Promise(resolve => { release = () => resolve({ trackEvents: async batch => writes.push(batch) }); }) });
  app.window.TaithaiAnalytics.setConsent('granted'); app.window.TaithaiAnalytics.track('click', { action: 'OLD_CONSENT_EVENT' }); app.tick(1200); await flush();
  app.window.TaithaiAnalytics.setConsent('denied'); app.window.TaithaiAnalytics.setConsent('granted'); release(); await flush(); app.tick(1200); await flush();
  assert.doesNotMatch(JSON.stringify(writes), /OLD_CONSENT_EVENT/);
});

test('a short visible visit contributes bounded active seconds before becoming hidden', async () => {
  const app = telemetryFixture(); app.window.TaithaiAnalytics.setConsent('granted'); app.tick(25000); await flush(); app.document.hidden = true; app.document.dispatchEvent({ type: 'visibilitychange' }); await flush();
  const beats = app.writes.flat().filter(event => event.name === 'heartbeat'); assert.ok(beats.length > 0); assert.ok(beats.some(event => event.durationSeconds > 0 && event.durationSeconds <= 25));
});

test('closing an already hidden tab never counts its hidden time as active use', async () => {
  const app = telemetryFixture(); app.window.TaithaiAnalytics.setConsent('granted'); app.tick(20000); await flush();
  app.document.hidden = true; app.document.dispatchEvent({ type: 'visibilitychange' }); await flush();
  const before = app.writes.flat().filter(event => event.name === 'heartbeat').reduce((total, event) => total + event.durationSeconds, 0);
  app.tick(30000); await flush(); app.window.dispatchEvent({ type: 'pagehide' }); await flush();
  const after = app.writes.flat().filter(event => event.name === 'heartbeat').reduce((total, event) => total + event.durationSeconds, 0);
  assert.equal(before, 20); assert.equal(after, before);
});

test('consent changes in another tab stop analytics and no-detail preference events are harmless', async () => {
  const app = telemetryFixture(); app.window.TaithaiAnalytics.setConsent('granted'); app.tick(1200); await flush(); const sent = app.writes.length;
  app.window.dispatchEvent({ type: 'storage', key: 'taithai.analytics-consent.v1', newValue: JSON.stringify({ version: 1, choice: 'denied' }) });
  app.window.dispatchEvent({ type: 'taithai:preferences' }); app.window.TaithaiAnalytics.track('click', { action: 'after-revocation' }); app.tick(120000); await flush();
  assert.equal(app.writes.length, sent); assert.equal(app.window.TaithaiAnalytics.getConsent(), 'denied');
});

function homeFixture() {
  const app = fixture('home');
  const search = app.add('input', 'appSearch'); const clear = app.add('button', 'clearAppSearch'); app.add('p', 'appSearchEmpty', app.document.body, { hidden: true }); app.add('p', 'appSearchCount');
  const grid = app.add('div', 'appDirectory', app.document.body, { className: 'apps-grid' });
  const cards = [app.add('a', '', grid, { className: 'app-card' }), app.add('a', '', grid, { className: 'app-card' }), app.add('a', '', grid, { className: 'app-card' })];
  const text = { en: ['Temporary Chat · Create a room', 'Movie Memory · Save your movie tickets', 'Public Drive · Share your files'], th: ['Temporary Chat · สร้างห้องแชต', 'Movie Memory · เก็บตั๋วหนัง', 'Public Drive · แชร์ไฟล์'] };
  cards.forEach((card, i) => { card.textContent = text.en[i]; });
  app.run('site-pages.js', { "import('./site-support.js')": '__loadSupport()' });
  // Homepage's independent i18n renderer can run later in the same event dispatch.
  app.window.addEventListener('taithai:preferences', () => cards.forEach((card, i) => { card.textContent = text[app.window.TaithaiPreferences.get().language][i]; }));
  return { ...app, search, clear, cards };
}

test('homepage search is case-insensitive, recovers from no results, and clears back to all apps with focus', async () => {
  const app = homeFixture();
  assert.equal(app.document.getElementById('appSearchCount').textContent, '3 apps to choose from');
  app.search.value = '  MOVIE  '; await app.search.fire('input');
  assert.deepEqual(app.cards.map(card => card.hidden), [true, false, true]);
  assert.equal(app.document.getElementById('appSearchCount').textContent, '1 of 3 apps');
  assert.equal(app.clear.hidden, false);
  app.search.value = 'not-an-existing-app'; await app.search.fire('input');
  assert.equal(app.document.getElementById('appSearchEmpty').hidden, false); assert.ok(app.cards.every(card => card.hidden));
  await app.clear.fire('click');
  assert.equal(app.search.value, ''); assert.ok(app.cards.every(card => !card.hidden)); assert.equal(app.document.getElementById('appSearchEmpty').hidden, true); assert.equal(app.clear.hidden, true); assert.equal(app.document.activeElement, app.search);
});

test('homepage search updates Thai matches and counts after a later preference translation renderer', async () => {
  const app = homeFixture(); app.search.value = 'ตั๋ว'; await app.search.fire('input'); assert.equal(app.document.getElementById('appSearchEmpty').hidden, false);
  app.window.TaithaiPreferences.set({ language: 'th' }); await flush();
  assert.deepEqual(app.cards.map(card => card.hidden), [true, false, true]);
  assert.equal(app.document.getElementById('appSearchCount').textContent, 'พบ 1 จาก 3 แอป');
  assert.equal(app.document.getElementById('appSearchEmpty').hidden, true);
  app.window.TaithaiPreferences.set({ language: 'en' }); await flush();
  assert.ok(app.cards.every(card => card.hidden)); assert.equal(app.document.getElementById('appSearchCount').textContent, '0 of 3 apps');
});

test('homepage search and clearing never rediscover an unpublished app', async () => {
  const app = homeFixture(); app.cards[1].dataset.catalogVisible = 'false';
  app.window.dispatchEvent({ type: 'taithai:app-visibility' });
  assert.equal(app.document.getElementById('appSearchCount').textContent, '2 apps to choose from');
  app.search.value = 'movie'; await app.search.fire('input'); assert.ok(app.cards.every(card => card.hidden));
  assert.equal(app.document.getElementById('appSearchCount').textContent, '0 of 2 apps');
  await app.clear.fire('click'); assert.deepEqual(app.cards.map(card => card.hidden), [false, true, false]);
});

function notFoundFixture(pathname) {
  const app = fixture('404', { pathname, search: '?private=SECRET_QUERY' });
  app.add('p', 'legacyLink', app.document.body, { hidden: true }); app.add('a', 'legacyLinkAction');
  const redirects = []; app.context.location.replace = url => redirects.push(url);
  const html = fs.readFileSync(new URL('../404.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1]; assert.ok(script);
  vm.runInNewContext(script, app.context, { filename: '404-inline.js' });
  return { ...app, redirects };
}

test('404 redirects only explicit generated codes and offers legacy recovery without surprising navigation', () => {
  for (const pathname of ['/g-Abc_123/', '/S/g-Abc_123/']) {
    const app = notFoundFixture(pathname); assert.deepEqual(app.redirects, ['/S/?c=g-Abc_123']); assert.doesNotMatch(app.redirects[0], /SECRET_QUERY/);
  }
  for (const pathname of ['/ABCD123/', '/S/ABCD123/']) {
    const app = notFoundFixture(pathname); assert.deepEqual(app.redirects, []); assert.equal(app.document.getElementById('legacyLink').hidden, false); assert.equal(app.document.getElementById('legacyLinkAction').href, '/S/?c=ABCD123');
  }
  for (const pathname of ['/settings/', '/account/', '/admin/', '/unknown/deeper/', '/x<script>/']) {
    const app = notFoundFixture(pathname); assert.deepEqual(app.redirects, []); assert.equal(app.document.getElementById('legacyLink').hidden, true);
  }
});
