import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';
import { isSiteOwner, filterUsageEvents, aggregateUsageEvents, activityCsv, validateReportChanges, summarizeUsageActors, initAdminPage } from '../assets/site-admin.js';

const owner = () => ({ uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true });
const event = (overrides = {}) => ({ id: 'event-1', eventId: 'event-1', name: 'page_view', app: 'Movie Memory', path: '/Movie-Memory/', action: 'page', sessionId: 'session-a', actorUid: 'u1', actorName: 'One', actorEmail: 'one@example.com', clientAt: '2026-11-20T18:00:00.000Z', createdAt: '2026-11-20T18:00:01.000Z', consentVersion: 1, durationSeconds: 0, device: 'desktop', ...overrides });

test('only the exact verified owner email is admitted', () => {
  assert.equal(isSiteOwner(owner()), true);
  assert.equal(isSiteOwner({ ...owner(), email: ' TAITHAI5002@GMAIL.COM ' }), true);
  assert.equal(isSiteOwner({ ...owner(), emailVerified: false }), false);
  assert.equal(isSiteOwner({ ...owner(), email: 'taithai5002@gmail.com.attacker.test' }), false);
  assert.equal(isSiteOwner({ ...owner(), email: 'different@example.com' }), false);
  assert.equal(isSiteOwner(null), false);
});

test('filters enforce consent, date bounds, known event names, app, and identity search', () => {
  const events = [event(), event({ eventId: 'e2', actorName: 'ไทย', app: 'Chordly' }), event({ consentVersion: 0 }), event({ name: 'private_text' }), event({ createdAt: 'bad', clientAt: 'bad' })];
  assert.equal(filterUsageEvents(events).length, 2);
  assert.equal(filterUsageEvents(events, { app: 'Chordly', actor: 'ไทย', event: 'page_view' }).length, 1);
  assert.equal(filterUsageEvents(events, { actor: 'ONE@EXAMPLE' }).length, 2);
  assert.equal(filterUsageEvents(events, { from: '2026-11-21T00:00:00Z' }).length, 0);
  assert.equal(filterUsageEvents(events, { to: '2026-11-19T00:00:00Z' }).length, 0);
});

test('aggregation uses real consented records, Bangkok days, unique accounts/sessions, and bounded heartbeat time', () => {
  const events = [event(), event({ eventId: 'e2', name: 'app_open' }), event({ eventId: 'e3', name: 'click', action: 'save', actorUid: '', sessionId: 'session-b' }), event({ eventId: 'e4', name: 'heartbeat', durationSeconds: 15 }), event({ eventId: 'e5', name: 'heartbeat', durationSeconds: 100 }), event({ eventId: 'e6', name: 'heartbeat', durationSeconds: -3 }), event({ eventId: 'e7', name: 'heartbeat', durationSeconds: 'private text' }), event({ eventId: 'e8', consentVersion: 0, name: 'page_view' })];
  const result = aggregateUsageEvents(events);
  assert.deepEqual([result.pageViews, result.appOpens, result.clicks, result.sessions, result.accounts, result.activeSeconds], [1, 1, 1, 2, 1, 75]);
  assert.deepEqual(result.daily, [{ date: '2026-11-21', count: 7 }]);
  assert.equal(result.apps[0].count, 7);
  const empty = aggregateUsageEvents([], { from: '2026-11-19T00:00:00Z', to: '2026-11-21T00:00:00Z' });
  assert.equal(empty.total, 0);
  assert.equal(empty.daily.length, 3);
  assert.ok(empty.daily.every(day => day.count === 0));
});

test('CSV exports only consented rows and neutralizes formulas, quotes, commas, and newlines', () => {
  const csv = activityCsv([event({ actorName: '=HYPERLINK("bad")', actorEmail: ' \t+SUM(1,1)', action: 'line1\nline2', path: '/safe,"path' }), event({ consentVersion: 0, actorName: 'should-not-export' })]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /'\=HYPERLINK\(""bad""\)/);
  assert.match(csv, /' \t\+SUM\(1,1\)/);
  assert.match(csv, /"line1\nline2"/);
  assert.match(csv, /"\/safe,""path"/);
  assert.doesNotMatch(csv, /should-not-export/);
});

test('report validation accepts four statuses and rejects unsafe or oversized replies', () => {
  for (const status of ['open', 'in_progress', 'resolved', 'closed']) assert.deepEqual(validateReportChanges({ status, publicReply: '  Done\nThanks  ' }), { status, publicReply: 'Done\nThanks' });
  assert.throws(() => validateReportChanges({ status: 'ignored', publicReply: '' }), /INVALID_STATUS/);
  assert.throws(() => validateReportChanges({ status: 'open', publicReply: 'x'.repeat(4001) }), /INVALID_REPLY/);
  assert.throws(() => validateReportChanges({ status: 'open', publicReply: 'bad\u0000' }), /INVALID_REPLY/);
});

class Element {
  constructor(tag, document) { this.tagName = tag; this.document = document; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = {}; this.hidden = false; this.disabled = false; this._text = ''; this.classList = { add: value => this.className = [this.className, value].filter(Boolean).join(' ') }; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async fire(name, event = {}) { await Promise.all((this.listeners[name] || []).map(callback => callback({ preventDefault() {}, ...event }))); }
  focus() { this.document.activeElement = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function createDOM() {
  let currentLanguage = 'en'; const document = { documentElement: { lang: 'en' }, activeElement: null };
  const root = new Element('div', document); root.id = 'adminPanel';
  document.createElement = tag => new Element(tag, document); document.createElementNS = (_, tag) => new Element(tag, document);
  function find(predicate, element = root) { if (predicate(element)) return element; for (const child of element.children) { const result = find(predicate, child); if (result) return result; } return null; }
  document.getElementById = id => find(element => element.id === id);
  const events = new EventTarget();
  const window = { document, navigator: { onLine: true }, setTimeout, clearTimeout, CustomEvent, Blob, URL,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), confirm: () => true,
    TaithaiPreferences: { get: () => ({ language: currentLanguage }) } };
  return { root, window, document, find, language(value) { currentLanguage = value; window.dispatchEvent(new CustomEvent('taithai:preferences')); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(user, overrides = {}) {
  const dom = createDOM(); let notify; let dataLoads = 0; const calls = { events: [], reports: [], writes: [], appReads: [], appWrites: [] };
  const data = { async getAppVisibilitySettings() { calls.appReads.push(true); return normalizeAppSettings(null); }, async updateAppVisibilitySettings(input) { calls.appWrites.push(input); return { ...normalizeAppSettings(null), exists: true, revision: input.expectedRevision + 1, apps: input.apps }; }, async listEvents(args) { calls.events.push(args); return { items: [], nextCursor: null }; }, async listReports(args) { calls.reports.push(args); return { items: [], nextCursor: null }; }, async updateReport(id, changes) { calls.writes.push({ id, changes }); return { id, ...changes }; }, ...overrides.data };
  const auth = { subscribeAuth(fn) { notify = fn; fn(user); return () => {}; }, async loginWithGoogle() { notify(owner()); return owner(); }, async logout() { notify(null); }, ...overrides.auth };
  const controller = await initAdminPage({ ...dom, loadAuth: async () => auth, loadData: async () => { dataLoads++; return data; }, now: () => new Date('2026-11-21T05:00:00Z') });
  await flush();
  return { ...dom, controller, calls, auth, data, notify: value => notify(value), get dataLoads() { return dataLoads; } };
}

test('signed-out, unverified, and non-owner users never load or query owner data', async () => {
  for (const user of [null, { ...owner(), emailVerified: false }, { ...owner(), email: 'stranger@example.com' }]) {
    const app = await setup(user);
    assert.equal(app.dataLoads, 0);
    assert.equal(app.calls.events.length, 0);
    assert.equal(app.calls.reports.length, 0);
    assert.equal(app.document.getElementById('adminTab-overview'), null);
    assert.match(app.root.textContent, /Administrator access only/);
    app.controller.destroy();
  }
});

test('owner loads bounded activity, uses exact date range, and reports are loaded lazily', async () => {
  const app = await setup(owner());
  assert.equal(app.calls.events.length, 1);
  assert.equal(app.calls.events[0].limit, 500);
  assert.equal(app.calls.events[0].from, '2026-11-14T05:00:00.000Z');
  assert.equal(app.calls.events[0].to, '2026-11-21T05:00:00.000Z');
  assert.equal(app.calls.reports.length, 0);
  assert.match(app.root.textContent, /No matching activity/);
  assert.match(app.root.textContent, /only visitors who opted in/);
  await app.document.getElementById('adminTab-reports').fire('click'); await flush();
  assert.equal(app.calls.reports.length, 1);
  assert.equal(app.calls.reports[0].limit, 50);
  assert.equal(app.calls.reports[0].status, 'open');
  app.controller.destroy();
});

test('late owner queries do not reveal data after the account changes', async () => {
  let release;
  const app = await setup(owner(), { data: { listEvents: () => new Promise(resolve => { release = resolve; }) } });
  app.notify({ uid: 'other', email: 'other@example.com', emailVerified: true });
  release({ items: [event({ actorName: 'MUST-NOT-RENDER' })], nextCursor: null }); await flush();
  assert.doesNotMatch(app.root.textContent, /MUST-NOT-RENDER/);
  assert.equal(app.document.getElementById('adminTab-activity'), null);
  app.controller.destroy();
});

test('reports preserve drafts on cancelled close, show full details, and acknowledge real saves', async () => {
  const report = { id: 'r1', app: 'Movie Memory', type: 'bug', subject: '<img src=x>', description: 'Full problem', steps: 'Open the app\nSave', expected: 'A saved movie', contact: 'reply@example.com', ownerName: 'Visitor', ownerEmail: 'visitor@example.com', status: 'open', publicReply: '', createdAt: '2026-11-20T18:00:00Z' };
  const app = await setup(owner(), { data: { async listReports(args) { return { items: [report], nextCursor: null }; } } });
  await app.document.getElementById('adminTab-reports').fire('click'); await flush();
  await app.find(item => item.tagName === 'button' && item.textContent === 'View report').fire('click');
  assert.match(app.document.getElementById('adminReportDialog').textContent, /Full problem/);
  assert.match(app.document.getElementById('adminReportDialog').textContent, /A saved movie/);
  assert.match(app.document.getElementById('adminReportDialog').textContent, /visitor@example.com/);
  const reply = app.document.getElementById('adminReportReply'); reply.value = 'We fixed this'; await reply.fire('input');
  app.window.confirm = () => false;
  await app.document.getElementById('adminReportDialog').fire('cancel');
  assert.ok(app.document.getElementById('adminReportDialog'));
  assert.equal(app.document.getElementById('adminReportReply').value, 'We fixed this');
  const status = app.document.getElementById('adminReportStatus'); status.value = 'resolved'; await status.fire('change');
  await app.document.getElementById('adminReportForm').fire('submit');
  assert.deepEqual(app.calls.writes, [{ id: 'r1', changes: { status: 'resolved', publicReply: 'We fixed this' } }]);
  assert.equal(app.document.getElementById('adminReportMessage').textContent, 'Status and reply saved');
  app.controller.destroy();
});

test('uncertain saves are not called successful and can be checked against the saved report', async () => {
  const report = { id: 'r1', subject: 'Problem', description: 'Description', status: 'open', publicReply: '', createdAt: '2026-11-20T18:00:00Z' };
  const app = await setup(owner(), { data: { async listReports() { return { items: [report], nextCursor: null }; }, async updateReport() { throw Object.assign(new Error('uncertain'), { code: 'site/timeout-uncertain', deliveryUnknown: true }); }, async getReport() { return { ...report, publicReply: 'Reply' }; } } });
  await app.document.getElementById('adminTab-reports').fire('click'); await flush();
  await app.find(item => item.tagName === 'button' && item.textContent === 'View report').fire('click');
  const input = app.document.getElementById('adminReportReply'); input.value = 'Reply'; await input.fire('input');
  await app.document.getElementById('adminReportForm').fire('submit');
  assert.match(app.document.getElementById('adminReportMessage').textContent, /could not confirm/);
  await app.find(item => item.tagName === 'button' && item.textContent === 'Check saved version').fire('click');
  assert.equal(app.document.getElementById('adminReportMessage').textContent, 'Status and reply saved');
  app.controller.destroy();
});

test('activity pagination stays bounded and deduplicates overlapping pages', async () => {
  let reads = 0;
  const firstPage = Array.from({ length: 500 }, (_, i) => event({ id: 'e' + i, eventId: 'e' + i }));
  const app = await setup(owner(), { data: { async listEvents() { return ++reads === 1 ? { items: firstPage, nextCursor: 'next500' } : { items: [firstPage[499], event({ id: 'e500', eventId: 'e500' })], nextCursor: null }; } } });
  assert.match(app.root.textContent, /500 events loaded/);
  assert.match(app.root.textContent, /loaded events only/);
  await app.find(item => item.tagName === 'button' && item.textContent === 'Load more activity').fire('click');
  assert.match(app.root.textContent, /501 events loaded/);
  await app.document.getElementById('adminTab-activity').fire('click');
  assert.match(app.root.textContent, /Showing 1–50 \/ 501 rows/);
  app.controller.destroy();
});

test('old activity pagination cannot contaminate a newly selected date range', async () => {
  let reads = 0; let release;
  const app = await setup(owner(), { data: { async listEvents() {
    reads++;
    if (reads === 1) return { items: [event()], nextCursor: 'old-cursor' };
    if (reads === 2) return new Promise(resolve => { release = resolve; });
    return { items: [event({ id: 'fresh', eventId: 'fresh', actorName: 'FRESH_RANGE_USER' })], nextCursor: null };
  } } });
  const oldRequest = app.find(item => item.tagName === 'button' && item.textContent === 'Load more activity').fire('click');
  const days = app.document.getElementById('adminDays'); days.value = '30'; await days.fire('change'); await flush();
  release({ items: [event({ id: 'old', eventId: 'old', actorName: 'OLD_RANGE_USER' })], nextCursor: null }); await oldRequest; await flush();
  await app.document.getElementById('adminTab-activity').fire('click');
  assert.match(app.root.textContent, /FRESH_RANGE_USER/); assert.doesNotMatch(app.root.textContent, /OLD_RANGE_USER/);
  app.controller.destroy();
});

test('switching accounts during a save clears private details and does not disable a later owner session', async () => {
  let release;
  const report = { id: 'r1', subject: 'Owner report', description: 'Private details', status: 'open', publicReply: '', createdAt: '2026-11-20T00:00:00Z' };
  const app = await setup(owner(), { data: { async listReports() { return { items: [report], nextCursor: null }; }, updateReport: () => new Promise(resolve => { release = resolve; }) } });
  await app.document.getElementById('adminTab-reports').fire('click'); await flush();
  await app.find(item => item.tagName === 'button' && item.textContent === 'View report').fire('click');
  const reply = app.document.getElementById('adminReportReply'); reply.value = 'A reply'; await reply.fire('input');
  const saving = app.document.getElementById('adminReportForm').fire('submit'); await flush();
  app.notify(null); assert.doesNotMatch(app.root.textContent, /Private details/);
  release({ id: 'r1', status: 'open', publicReply: 'A reply' }); await saving;
  app.notify(owner()); await flush(); await app.document.getElementById('adminTab-reports').fire('click'); await flush();
  await app.find(item => item.tagName === 'button' && item.textContent === 'View report').fire('click');
  assert.equal(app.document.getElementById('adminSaveReport').disabled, false);
  app.controller.destroy();
});

test('per-account and anonymous-session summaries use only loaded consented records without merging identities', () => {
  const rows = [event({ createdAt: '2026-11-20T12:00:00Z' }), event({ eventId: 'click', name: 'click', sessionId: 'second-session', app: 'Chordly', createdAt: '2026-11-20T14:00:00Z' }), event({ eventId: 'beat', name: 'heartbeat', durationSeconds: 20, createdAt: '2026-11-20T15:00:00Z' }), event({ eventId: 'anon', actorUid: '', actorName: 'ignored without UID', actorEmail: 'not-an-account@example.com', sessionId: 'anon-session', name: 'click', createdAt: '2026-11-20T16:00:00Z' }), event({ eventId: 'declined', actorUid: 'private-user', consentVersion: 0 })];
  const groups = summarizeUsageActors(rows); assert.equal(groups.length, 2);
  const account = groups.find(group => group.actorUid === 'u1');
  assert.equal(account.firstSeen, '2026-11-20T12:00:00.000Z'); assert.equal(account.lastSeen, '2026-11-20T15:00:00.000Z');
  assert.equal(account.pageViews, 1); assert.equal(account.clicks, 1); assert.equal(account.activeSeconds, 20); assert.equal(account.sessions, 2); assert.deepEqual(account.apps, ['Chordly', 'Movie Memory']);
  const anonymous = groups.find(group => group.sessionId === 'anon-session'); assert.equal(anonymous.actorUid, ''); assert.equal(anonymous.actorName, ''); assert.equal(anonymous.actorEmail, ''); assert.equal(anonymous.clicks, 1);
  assert.equal(filterUsageEvents(rows, { actor: 'anon-session' }).length, 1);
});

test('overview account-summary actions open activity filtered to the exact account or anonymous session', async () => {
  const app = await setup(owner(), { data: { async listEvents() { return { items: [event({ actorUid: '', actorEmail: '', actorName: '', sessionId: 'anon-session' })], nextCursor: null }; } } });
  await app.find(item => item.tagName === 'button' && item.textContent === 'View activity').fire('click');
  assert.equal(app.document.getElementById('adminActorFilter').value, 'anon-session'); assert.equal(app.document.getElementById('adminTab-activity').attributes['aria-selected'], 'true');
  assert.match(app.root.textContent, /Showing 1–1 \/ 1 rows/); app.controller.destroy();
});

async function openApps(app) { await app.document.getElementById('adminTab-apps').fire('click'); await flush(); }
async function appMode(app, id, visibility) { const input = app.document.getElementById(`adminAppVisibility-${id}`); input.value = visibility; await input.fire('change'); }
const appSettings = (revision, changes = {}) => ({ ...normalizeAppSettings(null), exists: revision > 0, revision, apps: { ...normalizeAppSettings(null).apps, ...changes } });

test('app settings load only for the owner Apps tab; drafts require an explicit save', async () => {
  const app = await setup(owner()); assert.equal(app.calls.appReads.length, 0);
  await openApps(app); assert.equal(app.calls.appReads.length, 1);
  assert.equal(app.document.getElementById('adminUsageControls').hidden, true);
  assert.equal(app.document.getElementById('adminAppVisibility-private-drive').disabled, true);
  assert.equal(app.document.getElementById('adminAppsSave').disabled, true);
  await appMode(app, 'movie-memory', 'private');
  assert.equal(app.calls.appWrites.length, 0); assert.equal(app.document.getElementById('adminAppsSave').disabled, false);
  assert.match(app.root.textContent, /Anyone with a direct link can still open it/);
  assert.match(app.root.textContent, /Only the signed-in website owner can open it for testing/);
  assert.equal(app.document.activeElement.id, 'adminAppVisibility-movie-memory');
  await app.document.getElementById('adminAppsForm').fire('submit');
  assert.equal(app.calls.appWrites.length, 1); assert.equal(app.calls.appWrites[0].expectedRevision, 0);
  assert.equal(app.calls.appWrites[0].apps['movie-memory'].visibility, 'private');
  assert.equal(app.calls.appWrites[0].apps['private-drive'].visibility, 'private');
  assert.equal(app.document.getElementById('adminAppsMessage').textContent, 'App visibility saved');
  assert.equal(app.document.getElementById('adminAppsSave').disabled, true);
  app.controller.destroy();
});

test('discard restores all app modes without writing and rejects a locked app change', async () => {
  const app = await setup(owner()); await openApps(app);
  await appMode(app, 'movie-memory', 'unlisted'); await appMode(app, 'private-drive', 'public');
  await app.document.getElementById('adminAppsCancel').fire('click');
  assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'public');
  assert.equal(app.document.getElementById('adminAppVisibility-private-drive').value, 'private');
  assert.equal(app.calls.appWrites.length, 0); app.controller.destroy();
});

test('a save failure preserves the visibility draft and never reports success', async () => {
  const app = await setup(owner(), { data: { async updateAppVisibilitySettings() { throw new Error('offline'); } } }); await openApps(app);
  await appMode(app, 'movie-memory', 'unlisted'); await app.document.getElementById('adminAppsForm').fire('submit');
  assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'unlisted');
  assert.equal(app.document.getElementById('adminAppsSave').disabled, false);
  assert.match(app.root.textContent, /Could not save. Your changes are still here/);
  assert.doesNotMatch(app.root.textContent, /App visibility saved/); app.controller.destroy();
});

test('concurrent edits block overwrite until an explicit saved-version reload', async () => {
  let reads = 0;
  const app = await setup(owner(), { data: { async getAppVisibilitySettings() { return ++reads === 1 ? appSettings(1) : appSettings(2, { 'movie-memory': { visibility: 'unlisted' } }); }, async updateAppVisibilitySettings() { throw Object.assign(new Error('changed'), { code: 'site/conflict' }); } } }); await openApps(app);
  await appMode(app, 'movie-memory', 'private'); await app.document.getElementById('adminAppsForm').fire('submit');
  assert.match(app.root.textContent, /changed in another window/); assert.equal(app.document.getElementById('adminAppsSave').disabled, true);
  assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'private');
  app.window.confirm = () => false; await app.document.getElementById('adminAppsReload').fire('click'); assert.equal(reads, 1);
  app.window.confirm = () => true; await app.document.getElementById('adminAppsReload').fire('click');
  assert.equal(reads, 2); assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'unlisted');
  assert.doesNotMatch(app.root.textContent, /changed in another window/); app.controller.destroy();
});

test('uncertain app saves require checking the stored value before retrying', async () => {
  let reads = 0;
  const app = await setup(owner(), { data: { async getAppVisibilitySettings() { return ++reads === 1 ? appSettings(0) : appSettings(1, { 'movie-memory': { visibility: 'private' } }); }, async updateAppVisibilitySettings() { throw Object.assign(new Error('unknown'), { code: 'site/timeout-uncertain', deliveryUnknown: true }); } } }); await openApps(app);
  await appMode(app, 'movie-memory', 'private'); await app.document.getElementById('adminAppsForm').fire('submit');
  assert.match(app.root.textContent, /has not confirmed this save/);
  assert.equal(app.document.getElementById('adminAppsSave').disabled, true);
  await app.document.getElementById('adminAppsVerify').fire('click');
  assert.equal(app.document.getElementById('adminAppsMessage').textContent, 'App visibility saved');
  assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'private');
  assert.equal(app.document.getElementById('adminAppsVerify'), null); app.controller.destroy();
});

test('late app-setting loads and saves cannot surface after switching away from the owner', async () => {
  let releaseRead;
  const app = await setup(owner(), { data: { getAppVisibilitySettings: () => new Promise(resolve => { releaseRead = resolve; }) } });
  await openApps(app); app.notify(null); releaseRead(appSettings(3, { ace: { visibility: 'private' } })); await flush();
  assert.equal(app.document.getElementById('adminAppsForm'), null); assert.equal(app.document.getElementById('adminTab-apps'), null);
  app.controller.destroy();
  let releaseSave;
  const next = await setup(owner(), { data: { updateAppVisibilitySettings: input => new Promise(resolve => { releaseSave = () => resolve(appSettings(1, input.apps)); }) } });
  await openApps(next); await appMode(next, 'movie-memory', 'private');
  const pending = next.document.getElementById('adminAppsForm').fire('submit'); await flush(); next.notify(null); releaseSave(); await pending;
  assert.equal(next.document.getElementById('adminAppsForm'), null); assert.doesNotMatch(next.root.textContent, /App visibility saved/);
  next.notify(owner()); await flush(); assert.ok(next.document.getElementById('adminAppsForm')); assert.equal(next.document.getElementById('adminAppsSave').disabled, true);
  next.controller.destroy();
});

test('unsaved app settings trigger the normal leave warning and prevent accidental sign-out', async () => {
  const app = await setup(owner()); await openApps(app); await appMode(app, 'movie-memory', 'unlisted');
  const leaving = new Event('beforeunload', { cancelable: true }); app.window.dispatchEvent(leaving); assert.equal(leaving.defaultPrevented, true);
  app.window.confirm = () => false;
  await app.find(item => item.tagName === 'button' && item.textContent === 'Sign out').fire('click');
  assert.ok(app.document.getElementById('adminAppsForm')); assert.equal(app.calls.appWrites.length, 0);
  app.language('th'); assert.equal(app.document.getElementById('adminTab-apps').textContent, 'จัดการแอป');
  assert.equal(app.document.getElementById('adminAppVisibility-movie-memory').value, 'unlisted'); app.controller.destroy();
});
