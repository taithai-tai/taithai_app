import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteDataClient, isSiteAdmin } from '../assets/site-data.js';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';

const goodReport = { app: 'site', type: 'bug', subject: 'A useful subject', description: 'A concrete description of what happened.' };
const user = { uid: 'user-1234567890', email: 'user@example.com', displayName: 'Example User', emailVerified: true };
const timestamp = { toDate: () => new Date('2026-11-21T01:00:00.000Z') };
const snap = (docId, data, exists = true) => ({ id: docId, data: () => data, exists: () => exists });

function setup(options = {}) {
  const auth = { currentUser: options.user === undefined ? user : options.user };
  if (options.authStateReady) auth.authStateReady = () => options.authStateReady(auth);
  const writes = [], batches = [], queries = [], transactionWrites = [], serverReads = [];
  let sequence = 0, loads = 0;
  const data = new Map();
  const sdk = {
    doc: (_db, collection, docId) => ({ collection, id: docId }),
    collection: (_db, name) => ({ name }),
    serverTimestamp: () => 'SERVER_TIME',
    async setDoc(ref, payload) {
      writes.push({ ref, payload });
      if (options.write) return options.write(ref, payload);
      data.set(ref.id, payload);
    },
    where: (field, comparator, value) => ({ where: [field, comparator, value] }),
    orderBy: (field, direction) => ({ orderBy: [field, direction] }),
    startAfter: cursor => ({ startAfter: cursor }),
    limit: limit => ({ limit }),
    query: (collection, ...constraints) => ({ collection, constraints }),
    async getDocs(query) {
      queries.push(query);
      if (options.read) return options.read(query);
      return { docs: options.rows || [] };
    },
    async getDoc(ref) { return options.snapshot || snap(ref.id, data.get(ref.id), data.has(ref.id)); },
    async getDocFromServer(ref) { serverReads.push(ref); if (options.serverRead) return options.serverRead(ref); return options.snapshot || snap(ref.id, data.get(ref.id), data.has(ref.id)); },
    async runTransaction(_db, callback) {
      const staged = [];
      const result = await callback({
        get: async ref => options.snapshot || snap(ref.id, data.get(ref.id), data.has(ref.id)),
        update: (ref, payload) => staged.push({ kind: 'update', ref, payload }),
        set: (ref, payload) => staged.push({ kind: 'set', ref, payload })
      });
      transactionWrites.push(...staged);
      return result;
    },
    writeBatch() {
      const staged = [];
      return { set: (ref, payload) => staged.push({ ref, payload }), async commit() { batches.push(staged); if (options.commit) return options.commit(staged); } };
    },
    Timestamp: { fromDate: date => ({ timestamp: date.toISOString() }) }
  };
  const client = createSiteDataClient({
    loadDependencies: async () => { loads++; if (options.load) await options.load(); return { sdk, db: {}, auth }; },
    generateId: () => 'generated-id-' + (++sequence).toString().padStart(4, '0'),
    now: () => new Date('2026-11-21T01:00:00.000Z'),
    getDevice: () => 'desktop',
    getSessionStorage: () => { throw new Error('Storage blocked'); },
    timeoutMs: options.timeoutMs || 100
  });
  return { client, auth, writes, batches, queries, transactionWrites, serverReads, get loads() { return loads; }, data };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

const visibilityOwner = { uid: 'owner-1234567890', email: 'taithai5002@gmail.com', emailVerified: true };
const visibilityConfig = (patch = {}) => ({ schemaVersion: 1, revision: 2, apps: normalizeAppSettings(null).apps, updatedAt: timestamp, updatedBy: 'owner', ...patch });

test('public visibility read is a fresh exact-document read and missing configuration retains existing defaults', async () => {
  const ctx = setup({ user: null });
  const initial = await ctx.client.getAppVisibilitySettings();
  assert.equal(initial.exists, false);
  assert.equal(initial.apps['movie-memory'].visibility, 'public');
  assert.equal(initial.apps['private-drive'].visibility, 'private');
  assert.deepEqual(ctx.serverReads, [{ collection: 'siteConfig', id: 'appVisibility' }]);
  const stored = setup({ snapshot: snap('appVisibility', visibilityConfig()) });
  assert.equal((await stored.client.getAppVisibilitySettings()).updatedAt, '2026-11-21T01:00:00.000Z');
  const offline = setup({ serverRead: async () => { throw Object.assign(new Error('Offline'), { code: 'unavailable' }); } });
  await assert.rejects(offline.client.getAppVisibilitySettings(), error => error.code === 'unavailable');
});

test('corrupt visibility configuration is not silently treated as a public default', async () => {
  for (const value of [{}, visibilityConfig({ schemaVersion: 2 }), visibilityConfig({ apps: { ace: { visibility: 'public' } } })]) {
    const ctx = setup({ snapshot: snap('appVisibility', value) });
    await rejectsCode(ctx.client.getAppVisibilitySettings(), 'site/invalid-config');
    ctx.auth.currentUser = visibilityOwner;
    await rejectsCode(ctx.client.updateAppVisibilitySettings({ apps: normalizeAppSettings(null).apps, expectedRevision: 0 }), 'site/invalid-config');
    assert.equal(ctx.transactionWrites.length, 0);
  }
});

test('only verified owner can update visibility and Private Drive cannot be made public', async () => {
  for (const currentUser of [null, user, { ...visibilityOwner, emailVerified: false }]) {
    const ctx = setup({ user: currentUser });
    await rejectsCode(ctx.client.updateAppVisibilitySettings({ apps: normalizeAppSettings(null).apps, expectedRevision: 0 }), 'site/permission-denied');
    assert.equal(ctx.transactionWrites.length, 0);
  }
  const ctx = setup({ user: visibilityOwner });
  const apps = normalizeAppSettings(null).apps; apps['private-drive'].visibility = 'public';
  for (const input of [{ apps, expectedRevision: 0 }, { apps: {}, expectedRevision: 0 }, { apps: normalizeAppSettings(null).apps, expectedRevision: -1 }, { apps: normalizeAppSettings(null).apps, expectedRevision: 1.5 }, { apps: normalizeAppSettings(null).apps, expectedRevision: 0, ownerUid: 'spoof' }]) await rejectsCode(ctx.client.updateAppVisibilitySettings(input), 'site/invalid-input');
  assert.equal(ctx.loads, 0);
});

test('owner visibility save creates a complete configuration and compares revisions before writes', async () => {
  const ctx = setup({ user: visibilityOwner });
  const apps = normalizeAppSettings(null).apps;
  apps['movie-memory'].visibility = 'unlisted'; apps.ace.visibility = 'private';
  const save = ctx.client.updateAppVisibilitySettings({ apps, expectedRevision: 0 });
  apps.ace.visibility = 'public';
  const result = await save;
  assert.equal(result.revision, 1); assert.equal(result.apps.ace.visibility, 'private');
  const [{ kind, ref, payload }] = ctx.transactionWrites;
  assert.equal(kind, 'set'); assert.deepEqual(ref, { collection: 'siteConfig', id: 'appVisibility' });
  assert.equal(payload.schemaVersion, 1); assert.equal(payload.revision, 1);
  assert.equal(payload.apps['movie-memory'].visibility, 'unlisted'); assert.equal(payload.updatedAt, 'SERVER_TIME'); assert.equal(payload.updatedBy, 'owner');
  assert.equal(JSON.stringify(payload).includes(visibilityOwner.email), false);
  const stale = setup({ user: visibilityOwner, snapshot: snap('appVisibility', visibilityConfig()) });
  await rejectsCode(stale.client.updateAppVisibilitySettings({ apps: normalizeAppSettings(null).apps, expectedRevision: 1 }), 'site/conflict');
  assert.equal(stale.transactionWrites.length, 0);
  const updated = await stale.client.updateAppVisibilitySettings({ apps: normalizeAppSettings(null).apps, expectedRevision: 2 });
  assert.equal(updated.revision, 3);
});

test('report payload validates and derives ownership from current Firebase auth', async () => {
  const ctx = setup();
  const result = await ctx.client.createReport({ ...goodReport, steps: '  First step  ', contact: ' reply@example.com ' });
  assert.equal(result.id, 'generated-id-0001');
  const { ref, payload } = ctx.writes[0];
  assert.equal(ref.collection, 'siteReports');
  assert.equal(payload.ownerUid, user.uid);
  assert.equal(payload.ownerEmail, user.email);
  assert.equal(payload.ownerName, user.displayName);
  assert.equal(payload.steps, 'First step');
  assert.equal(payload.contact, 'reply@example.com');
  assert.equal(payload.status, 'open');
  assert.equal(payload.publicReply, '');
  assert.equal(payload.createdAt, 'SERVER_TIME');
  assert.equal(payload.updatedAt, 'SERVER_TIME');
  assert.equal(Object.hasOwn(payload, 'reportId'), false);
});

test('anonymous reports require neither email nor login and are honest about identity', async () => {
  const ctx = setup({ user: null });
  await ctx.client.createReport(goodReport);
  assert.equal(ctx.writes[0].payload.ownerUid, '');
  assert.equal(ctx.writes[0].payload.ownerEmail, '');
  assert.equal(ctx.writes[0].payload.contact, '');
  await rejectsCode(ctx.client.listMyReports(), 'site/auth-required');
});

test('invalid report inputs fail before any SDK request', async () => {
  const ctx = setup();
  for (const input of [
    null, [], { ...goodReport, ownerUid: 'spoof' }, { ...goodReport, subject: 'tiny' },
    { ...goodReport, description: '' }, { ...goodReport, description: 'x'.repeat(6001) },
    { ...goodReport, type: 'unknown' }, { ...goodReport, steps: 'x'.repeat(3001) },
    { ...goodReport, contact: 'x'.repeat(255) }, { ...goodReport, reportId: '../escape' },
    { ...goodReport, app: 'x\u0000y' }
  ]) await rejectsCode(ctx.client.createReport(input), 'site/invalid-input');
  assert.equal(ctx.loads, 0);
  assert.equal(ctx.writes.length, 0);
});

test('same report ID confirms one pending write across uncertain timeout and retries', async () => {
  let finish;
  const ctx = setup({ timeoutMs: 10, write: () => new Promise(resolve => { finish = resolve; }) });
  const input = { ...goodReport, reportId: 'stable-report-123456' };
  await assert.rejects(ctx.client.createReport(input), error => error.code === 'site/timeout-uncertain' && error.deliveryUnknown === true);
  const retry = ctx.client.createReport(input);
  finish();
  assert.deepEqual(await retry, { id: input.reportId });
  assert.equal(ctx.writes.length, 1);
  assert.deepEqual(await ctx.client.createReport(input), { id: input.reportId });
  assert.equal(ctx.writes.length, 1);
  await rejectsCode(ctx.client.createReport({ ...input, description: 'Different report details than the original' }), 'site/report-id-reused');
});

test('actual write failures remain actual failures and permit a later acknowledged retry', async () => {
  let attempts = 0;
  const denied = Object.assign(new Error('Denied by Firestore'), { code: 'permission-denied' });
  const ctx = setup({ write: async () => { if (++attempts === 1) throw denied; } });
  const input = { ...goodReport, reportId: 'retry-report-123456' };
  await assert.rejects(ctx.client.createReport(input), error => error === denied);
  assert.deepEqual(await ctx.client.createReport(input), { id: input.reportId });
  assert.equal(ctx.writes.length, 2);
});

test('my reports query is owner-filtered, newest first, limited, paginated and normalized', async () => {
  const finalSnapshot = snap('report-id-123456', { createdAt: timestamp, updatedAt: timestamp, ownerUid: user.uid });
  const cursor = { cursor: true };
  const ctx = setup({ rows: [finalSnapshot] });
  const result = await ctx.client.listMyReports({ limit: 1, cursor });
  assert.equal(result.items[0].createdAt, '2026-11-21T01:00:00.000Z');
  assert.equal(result.items[0].id, finalSnapshot.id);
  assert.equal(result.nextCursor, finalSnapshot);
  assert.deepEqual(ctx.queries[0].constraints, [
    { where: ['ownerUid', '==', user.uid] }, { orderBy: ['createdAt', 'desc'] }, { startAfter: cursor }, { limit: 1 }
  ]);
});

test('report detail requires auth and missing rows do not look successful', async () => {
  const ctx = setup();
  await rejectsCode(ctx.client.getReport('report-id-123456'), 'site/not-found');
  await rejectsCode(ctx.client.getReport('../../bad'), 'site/invalid-input');
  ctx.auth.currentUser = null;
  await rejectsCode(ctx.client.getReport('report-id-123456'), 'site/auth-required');
});

test('admin report filtering happens in Firestore before limit, not after a truncated page', async () => {
  const ctx = setup();
  assert.deepEqual(await ctx.client.listReports({ status: 'open', limit: 25 }), { items: [], nextCursor: null });
  assert.deepEqual(ctx.queries[0].constraints, [
    { where: ['status', '==', 'open'] }, { orderBy: ['createdAt', 'desc'] }, { limit: 25 }
  ]);
  await rejectsCode(ctx.client.listReports({ limit: 51 }), 'site/invalid-input');
  await rejectsCode(ctx.client.listReports({ status: 'invented' }), 'site/invalid-input');
  ctx.auth.currentUser = null;
  await rejectsCode(ctx.client.listReports(), 'site/auth-required');
});

test('admin update and audit record are staged atomically with current authenticated actor', async () => {
  const previous = { ...goodReport, status: 'open', publicReply: '', createdAt: timestamp };
  const ctx = setup({ snapshot: snap('report-id-123456', previous) });
  const result = await ctx.client.updateReport('report-id-123456', { status: 'in_progress', publicReply: ' We are investigating ' });
  assert.deepEqual(result, { id: 'report-id-123456', status: 'in_progress', publicReply: 'We are investigating' });
  assert.equal(ctx.transactionWrites.length, 2);
  assert.equal(ctx.transactionWrites[0].ref.collection, 'siteReports');
  assert.deepEqual(ctx.transactionWrites[0].payload, { status: 'in_progress', publicReply: 'We are investigating', updatedAt: 'SERVER_TIME' });
  assert.equal(ctx.transactionWrites[1].ref.collection, 'siteAdminAudit');
  assert.equal(ctx.transactionWrites[1].payload.actorUid, user.uid);
  assert.equal(ctx.transactionWrites[1].payload.actorEmail, user.email);
  assert.equal(ctx.transactionWrites[1].payload.fromStatus, 'open');
  assert.equal(ctx.transactionWrites[1].payload.toStatus, 'in_progress');
  assert.equal(ctx.transactionWrites[1].payload.action, 'report_update');
});

test('admin update cannot smuggle ownership, content or arbitrary status changes', async () => {
  const ctx = setup();
  for (const changes of [{}, { ownerUid: 'spoof' }, { description: 'rewrite' }, { status: 'deleted' }, { publicReply: 'x'.repeat(6001) }]) {
    await rejectsCode(ctx.client.updateReport('report-id-123456', changes), 'site/invalid-input');
  }
  assert.equal(ctx.transactionWrites.length, 0);
});

test('analytics uses one bounded batch, omits query/hash, derives identities and records duration', async () => {
  const ctx = setup();
  const result = await ctx.client.trackEvents([
    { name: 'page_view', app: 'site', path: '/settings/?email=private@example.com#secret' },
    { name: 'heartbeat', app: 'chordly', path: '/Chordly/', durationSeconds: 30, action: 'active' }
  ]);
  assert.equal(result.ids.length, 2);
  assert.equal(ctx.batches.length, 1);
  const [page, heartbeat] = ctx.batches[0].map(item => item.payload);
  assert.equal(page.path, '/settings/');
  assert.equal(page.actorUid, user.uid);
  assert.equal(page.actorEmail, user.email);
  assert.equal(page.actorName, user.displayName);
  assert.equal(page.consentVersion, 1);
  assert.equal(page.createdAt, 'SERVER_TIME');
  assert.equal(page.clientAt, '2026-11-21T01:00:00.000Z');
  assert.equal(page.device, 'desktop');
  assert.equal(page.sessionId, heartbeat.sessionId);
  assert.equal(heartbeat.durationSeconds, 30);
  assert.equal(JSON.stringify(ctx.batches).includes('private@example.com'), false);
});

test('anonymous analytics has empty identity, never adopts caller-supplied identity', async () => {
  const ctx = setup({ user: null });
  await ctx.client.trackEvents([{ name: 'click', path: '/', action: 'open_help' }]);
  assert.equal(ctx.batches[0][0].payload.actorUid, '');
  assert.equal(ctx.batches[0][0].payload.actorEmail, '');
  await rejectsCode(ctx.client.trackEvents([{ name: 'click', actorUid: 'spoof' }]), 'site/invalid-input');
});

test('analytics rejects invalid fields and excessive batches before SDK writes', async () => {
  const ctx = setup();
  const invalid = [[], Array.from({ length: 21 }, () => ({ name: 'click' })), [{ name: 'unknown' }],
    [{ name: 'click', durationSeconds: 61 }], [{ name: 'heartbeat', durationSeconds: -1 }],
    [{ name: 'heartbeat', durationSeconds: 1.5 }], [{ name: 'click', path: 'https://elsewhere.test/' }],
    [{ name: 'click', path: '//elsewhere.test/' }], [{ name: 'click', path: '/' + 'x'.repeat(240) }],
    [{ name: 'click', action: 'x'.repeat(81) }], [{ name: 'click', device: 'watch' }],
    [{ name: 'click', app: 0 }], [{ name: 'click', path: 0 }]
  ];
  for (const events of invalid) await rejectsCode(ctx.client.trackEvents(events), 'site/invalid-input');
  assert.equal(ctx.loads, 0);
  assert.equal(ctx.batches.length, 0);
});

test('analytics admin query enforces bounded range, desc order and cursor', async () => {
  const ctx = setup();
  const cursor = { cursor: true };
  await ctx.client.listEvents({ from: '2026-11-20', to: '2026-11-21', limit: 500, cursor });
  assert.deepEqual(ctx.queries[0].constraints, [
    { where: ['createdAt', '>=', { timestamp: '2026-11-20T00:00:00.000Z' }] },
    { where: ['createdAt', '<=', { timestamp: '2026-11-21T00:00:00.000Z' }] },
    { orderBy: ['createdAt', 'desc'] }, { startAfter: cursor }, { limit: 500 }
  ]);
  for (const options of [{ limit: 501 }, { from: 'bad' }, { from: null }, { from: '2026-11-22', to: '2026-11-21' }]) {
    await rejectsCode(ctx.client.listEvents(options), 'site/invalid-input');
  }
});

test('read timeout never returns a fake empty result and dependency failures can be retried', async () => {
  const ctx = setup({ timeoutMs: 10, read: () => new Promise(() => {}) });
  await assert.rejects(ctx.client.listReports(), error => error.code === 'site/timeout' && error.deliveryUnknown === false);
  let attempt = 0;
  const retry = setup({ load: async () => { if (++attempt === 1) throw new Error('Network unavailable'); } });
  await assert.rejects(retry.client.listReports(), /Network unavailable/);
  assert.deepEqual(await retry.client.listReports(), { items: [], nextCursor: null });
  assert.equal(retry.loads, 2);
});

test('admin helper requires verified exact owner email; rules remain final authority', () => {
  assert.equal(isSiteAdmin(null), false);
  assert.equal(isSiteAdmin(user), false);
  assert.equal(isSiteAdmin({ email: 'taithai5002@gmail.com', emailVerified: false }), false);
  assert.equal(isSiteAdmin({ email: 'taithai5002@gmail.com.evil.test', emailVerified: true }), false);
  assert.equal(isSiteAdmin({ email: 'TAITHAI5002@GMAIL.COM', emailVerified: true }), true);
});

test('cold persisted authentication resolves before a report is attributed, without an extra sign-in', async () => {
  let readyCalls = 0;
  const ctx = setup({ user: null, authStateReady: async auth => {
    readyCalls++;
    await Promise.resolve();
    auth.currentUser = user;
  } });
  await ctx.client.createReport(goodReport);
  assert.equal(ctx.writes[0].payload.ownerUid, user.uid);
  assert.equal(ctx.writes[0].payload.ownerEmail, user.email);
  await ctx.client.trackEvents([{ name: 'page_view', path: '/' }]);
  assert.equal(ctx.batches[0][0].payload.actorUid, user.uid);
  assert.equal(readyCalls, 1, 'session restoration is awaited once per SDK load');
});

test('authentication restoration failures never write a falsely anonymous report', async () => {
  const ctx = setup({ user: null, authStateReady: async () => { throw new Error('Session restoration unavailable'); } });
  await assert.rejects(ctx.client.createReport(goodReport), /Session restoration unavailable/);
  assert.equal(ctx.writes.length, 0);
});

test('private Drive configuration is fetched only for verified owner and returns a strict endpoint whitelist', async () => {
  const config = { shareUrl: 'https://files.example.com/share/example', smbUrl: 'smb://nas.example.com/', smbShareUrl: 'smb://nas.example.com/shared', webdavUrl: 'https://dav.example.com/', internalNote: 'not-exported' };
  const ctx = setup({ user: { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true }, snapshot: snap('privateDrive', config) });
  assert.deepEqual(await ctx.client.getPrivateDriveConfig(), { shareUrl: config.shareUrl, smbUrl: config.smbUrl, smbShareUrl: config.smbShareUrl, webdavUrl: config.webdavUrl });
  for (const account of [null, user, { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: false }]) {
    const denied = setup({ user: account, snapshot: snap('privateDrive', config) });
    await rejectsCode(denied.client.getPrivateDriveConfig(), 'site/permission-denied');
  }
});

test('private Drive rejects unsafe or missing endpoints without leaking their value in errors', async () => {
  const owner = { uid: 'owner', email: 'taithai5002@gmail.com', emailVerified: true };
  for (const config of [{}, { shareUrl: 'javascript:alert(1)' }, { shareUrl: 'http://files.example.com/' }, { shareUrl: 'https://user:secret@files.example.com/' }, { shareUrl: 'https://files.example.com/', smbUrl: 'https://wrong.example.com/' }, { shareUrl: 'https://files.example.com/', webdavUrl: 'http://dav.example.com/' }, { shareUrl: 'https://files.example.com/ secret' }]) {
    const ctx = setup({ user: owner, snapshot: snap('privateDrive', config) });
    await assert.rejects(ctx.client.getPrivateDriveConfig(), error => error.code === 'site/invalid-config' && !error.message.includes('secret') && !error.message.includes('files.example.com'));
  }
  const missing = setup({ user: owner });
  await rejectsCode(missing.client.getPrivateDriveConfig(), 'site/not-found');
  const optional = setup({ user: owner, snapshot: snap('privateDrive', { shareUrl: 'https://files.example.com/' }) });
  assert.deepEqual(await optional.client.getPrivateDriveConfig(), { shareUrl: 'https://files.example.com/', smbUrl: '', smbShareUrl: '', webdavUrl: '' });
});
