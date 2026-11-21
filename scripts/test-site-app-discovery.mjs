import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';
import { canDiscoverApp, isDiscoveryOwner, supportAppId, initAppDiscovery } from '../assets/site-app-discovery.js';
const owner = { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true };
const settings = () => ({ ...normalizeAppSettings(null), apps: { ...normalizeAppSettings(null).apps, 'movie-memory': { visibility: 'unlisted' }, ace: { visibility: 'private' } } });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('discovery filters hidden apps and trusts only the verified owner or a known selected support topic', () => {
  assert.equal(canDiscoverApp('movie-memory', settings()), false);
  assert.equal(canDiscoverApp('ace', settings()), false);
  assert.equal(canDiscoverApp('chordly', settings()), true);
  assert.equal(canDiscoverApp('ace', settings(), { isOwner: true }), true);
  assert.equal(canDiscoverApp('movie-memory', settings(), { selectedAppId: 'movie-memory' }), true);
  assert.equal(canDiscoverApp('unknown-app', settings(), { isOwner: true }), false);
  assert.equal(canDiscoverApp('chordly', null), false);
  assert.equal(isDiscoveryOwner(owner), true);
  assert.equal(isDiscoveryOwner({ ...owner, emailVerified: false }), false);
  assert.equal(isDiscoveryOwner({ ...owner, email: 'taithai5002@gmail.com.evil.test' }), false);
  assert.equal(supportAppId('Temporary Chat'), 'temporary-chat');
  assert.equal(supportAppId('Private Drive'), 'private-drive');
  assert.equal(supportAppId('Movie Memory'), 'movie-memory');
});

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== fn); }
  async fire(name) { await Promise.all((this.listeners[name] || []).map(fn => fn({ target: this }))); }
  querySelectorAll(selector) {
    const result = []; const keys = selector.split(',').map(part => part.trim().slice(1, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/^data/, ''));
    const datasetKeys = keys.map(key => key[0].toLowerCase() + key.slice(1));
    function scan(node) { for (const child of node.children) { if (datasetKeys.some(key => key in child.dataset)) result.push(child); scan(child); } }
    scan(this); return result;
  }
}
function fixture({ selected = 'Taithai website', query = '', user = null, load } = {}) {
  const body = new Element('body'); const ids = new Map();
  const add = (tag, id, dataset = {}, parent = body) => { const node = new Element(tag); node.dataset = dataset; if (id) { node.id = id; ids.set(id, node); } parent.append(node); return node; };
  const help = add('div', 'helpGuides'); help.dataset.discoveryPending = 'true';
  const publicGuide = add('article', '', { appDiscovery: 'chordly' }, help); publicGuide.hidden = true;
  const hiddenGuide = add('article', '', { appDiscovery: 'movie-memory' }, help); hiddenGuide.hidden = true;
  const privateGuide = add('article', '', { appDiscovery: 'ace' }, help); privateGuide.hidden = true;
  const support = add('select', 'reportApp'); support.value = selected;
  const hiddenOption = add('option', '', { appDiscovery: 'movie-memory' }, support); hiddenOption.hidden = hiddenOption.disabled = true;
  const privateOption = add('option', '', { appDiscovery: 'ace' }, support); privateOption.hidden = privateOption.disabled = true;
  const status = add('p', '', { appDiscoveryStatus: '' }); const shortcut = add('section', '', { ownerAppSettings: '' }); shortcut.hidden = true;
  const group = add('section', '', { appDiscoveryGroup: '' }); group.hidden = true;
  const settingsLink = add('a', '', { appDiscovery: 'movie-memory' }, group); settingsLink.hidden = true;
  const preservedReport = add('p', 'private-report-data'); preservedReport.textContent = 'Existing report for Movie Memory: unchanged';
  const doc = { body, documentElement: { lang: 'en' }, querySelectorAll: body.querySelectorAll.bind(body), getElementById: id => ids.get(id), createElement: tag => new Element(tag) };
  const eventTarget = new EventTarget(); let notify; let reads = 0;
  const win = { document: doc, location: { search: query }, CustomEvent, TaithaiPreferences: { get: () => ({ language: 'en' }) }, addEventListener: eventTarget.addEventListener.bind(eventTarget), removeEventListener: eventTarget.removeEventListener.bind(eventTarget), dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget) };
  const controller = initAppDiscovery({ document: doc, window: win, loadData: async () => ({ getAppVisibilitySettings: async () => { reads++; return load ? load() : settings(); } }), loadAuth: async () => ({ subscribeAuth(fn) { notify = fn; fn(user); return () => {}; } }) });
  return { controller, body, help, publicGuide, hiddenGuide, privateGuide, hiddenOption, privateOption, support, status, shortcut, group, settingsLink, preservedReport, notify: value => notify(value), get reads() { return reads; } };
}

test('pending discovery stays hidden, then exposes only public links and preserves report data', async () => {
  let resolve; const app = fixture({ load: () => new Promise(done => { resolve = done; }) });
  assert.equal(app.publicGuide.hidden, true); assert.equal(app.hiddenGuide.hidden, true); assert.equal(app.settingsLink.hidden, true);
  await flush(); resolve(settings()); await flush();
  assert.equal(app.publicGuide.hidden, false); assert.equal(app.hiddenGuide.hidden, true); assert.equal(app.privateGuide.hidden, true);
  assert.equal(app.hiddenOption.disabled, true); assert.equal(app.shortcut.hidden, true); assert.equal(app.group.hidden, true);
  assert.equal(app.preservedReport.textContent, 'Existing report for Movie Memory: unchanged');
  assert.equal(app.help.dataset.discoveryPending, 'false'); app.controller.destroy();
});

test('known direct support links and selected draft topics survive hidden app filtering', async () => {
  const queryApp = fixture({ query: '?app=Movie%20Memory' }); await flush();
  assert.equal(queryApp.hiddenOption.hidden, false); assert.equal(queryApp.hiddenOption.disabled, false);
  assert.equal(queryApp.hiddenGuide.hidden, true); assert.equal(queryApp.settingsLink.hidden, true); queryApp.controller.destroy();
  const draft = fixture({ selected: 'ACE' }); await flush();
  assert.equal(draft.privateOption.hidden, false); assert.equal(draft.support.value, 'ACE');
  assert.equal(draft.privateGuide.hidden, true); draft.controller.destroy();
});

test('owner discovery and settings shortcut disappear immediately when the account changes', async () => {
  const app = fixture({ user: owner }); await flush();
  assert.equal(app.hiddenGuide.hidden, false); assert.equal(app.privateGuide.hidden, false); assert.equal(app.shortcut.hidden, false); assert.equal(app.group.hidden, false);
  app.notify({ ...owner, emailVerified: false });
  assert.equal(app.hiddenGuide.hidden, true); assert.equal(app.privateGuide.hidden, true); assert.equal(app.shortcut.hidden, true);
  assert.equal(app.hiddenOption.hidden, true); assert.equal(app.group.hidden, true); app.controller.destroy();
});

test('load failure remains closed and displays a retry without erasing the selected report topic', async () => {
  let attempts = 0; const app = fixture({ selected: 'Movie Memory', load: async () => { if (++attempts === 1) throw new Error('offline'); return settings(); } }); await flush();
  assert.equal(app.publicGuide.hidden, true); assert.equal(app.hiddenGuide.hidden, true); assert.equal(app.hiddenOption.hidden, false);
  assert.equal(app.support.value, 'Movie Memory'); assert.equal(app.help.dataset.discoveryError, 'true'); assert.match(app.status.textContent, /could not load/);
  await app.status.children.find(node => node.tagName === 'BUTTON').fire('click'); await flush();
  assert.equal(app.publicGuide.hidden, false); assert.equal(app.status.hidden, true); app.controller.destroy();
});

test('service HTML keeps app discovery hidden before any module can execute', () => {
  const help = fs.readFileSync(new URL('../help/index.html', import.meta.url), 'utf8');
  const cards = [...help.matchAll(/<article[^>]*data-help-card[^>]*>/g)]; assert.equal(cards.length, 10); assert.ok(cards.every(([tag]) => /data-app-discovery="[a-z-]+" hidden/.test(tag)));
  const support = fs.readFileSync(new URL('../support/index.html', import.meta.url), 'utf8');
  const options = [...support.matchAll(/<option[^>]*data-app-discovery[^>]*>/g)]; assert.equal(options.length, 10); assert.ok(options.every(([tag]) => /hidden disabled/.test(tag)));
  const settings = fs.readFileSync(new URL('../settings/index.html', import.meta.url), 'utf8');
  assert.match(settings, /data-owner-app-settings hidden/); assert.match(settings, /href="\/admin\/#apps"/);
});
