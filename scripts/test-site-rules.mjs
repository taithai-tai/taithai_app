/* Real Firestore Rules emulator tests. Never connects to a production project.
   Install test-only dependencies outside the app:
   npm install --prefix /tmp/taithai-rules-test @firebase/rules-unit-testing firebase
   Run with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test scripts/test-site-rules.mjs */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { normalizeAppSettings } from '../assets/site-app-catalog.js';

const require = createRequire('/tmp/taithai-rules-test/package.json');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, setLogLevel } = require('firebase/firestore');
setLogLevel('silent'); // Expected permission denials are assertions, not operational errors.
const PROJECT_ID = 'demo-taithai-rules';
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) {
  throw new Error('Tests require a local FIRESTORE_EMULATOR_HOST; production endpoints are forbidden');
}
const [host, rawPort] = emulator.split(':');
let environment;
let owner, alice, bob, guest, unverified, impostor;
const OWNER_EMAIL = 'taithai5002@gmail.com';
const oldTime = Timestamp.fromDate(new Date('2026-11-20T00:00:00Z'));
const reportId = 'sample-report-123456';

function report(overrides = {}) {
  return {
    app: 'site', type: 'bug', subject: 'The page does not work', description: 'A detailed explanation of the problem.',
    steps: '', expected: '', contact: '', ownerUid: 'alice', ownerEmail: 'alice@example.com', ownerName: 'Alice',
    status: 'open', publicReply: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
  };
}
function event(eventId, overrides = {}) {
  return {
    eventId, name: 'page_view', app: 'site', path: '/settings/', action: '', durationSeconds: 0, device: 'desktop',
    clientAt: '2026-11-21T01:23:45.678Z', sessionId: 'session-id-123456', actorUid: 'alice', actorEmail: 'alice@example.com', actorName: 'Alice',
    createdAt: serverTimestamp(), consentVersion: 1, ...overrides
  };
}
function audit(overrides = {}) {
  return {
    reportId, action: 'report_update', actorUid: 'owner', actorEmail: OWNER_EMAIL,
    fromStatus: 'open', toStatus: 'in_progress', publicReply: 'We are investigating', createdAt: serverTimestamp(), ...overrides
  };
}
async function seed(collectionName, documentId, payload) {
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), collectionName, documentId), payload));
}
async function seedReport(overrides = {}) {
  await seed('siteReports', reportId, report({ createdAt: oldTime, updatedAt: oldTime, ...overrides }));
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host, port: Number(rawPort), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
  owner = environment.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: true }).firestore();
  alice = environment.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore();
  bob = environment.authenticatedContext('bob', { email: 'bob@example.com', email_verified: true }).firestore();
  guest = environment.unauthenticatedContext().firestore();
  unverified = environment.authenticatedContext('unverified', { email: OWNER_EMAIL, email_verified: false }).firestore();
  impostor = environment.authenticatedContext('impostor', { email: 'attacker@example.com', email_verified: true, role: 'admin', admin: true }).firestore();
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());

function visibilityConfig(overrides = {}) {
  return { schemaVersion: 1, revision: 1, apps: normalizeAppSettings(null).apps, updatedAt: serverTimestamp(), updatedBy: 'owner', ...overrides };
}

test('only the visibility metadata document is publicly readable, never the rest of the site config collection', async () => {
  await seed('siteConfig', 'appVisibility', visibilityConfig({ updatedAt: oldTime }));
  await seed('siteConfig', 'otherConfig', { private: 'not public' });
  for (const db of [guest, alice, owner]) {
    await assertSucceeds(getDoc(doc(db, 'siteConfig', 'appVisibility')));
    await assertFails(getDoc(doc(db, 'siteConfig', 'otherConfig')));
    await assertFails(getDocs(query(collection(db, 'siteConfig'), limit(1))));
  }
});

test('verified owner can create and revise a complete app policy; other identities cannot change availability', async () => {
  for (const db of [guest, alice, bob, unverified, impostor]) await assertFails(setDoc(doc(db, 'siteConfig', 'appVisibility'), visibilityConfig()));
  const initial = visibilityConfig();
  initial.apps['movie-memory'].visibility = 'unlisted'; initial.apps.ace.visibility = 'private';
  await assertSucceeds(setDoc(doc(owner, 'siteConfig', 'appVisibility'), initial));
  const second = visibilityConfig({ revision: 2 }); second.apps.chordly.visibility = 'private';
  await assertSucceeds(setDoc(doc(owner, 'siteConfig', 'appVisibility'), second));
  assert.equal((await getDoc(doc(guest, 'siteConfig', 'appVisibility'))).data().apps.chordly.visibility, 'private');
  for (const db of [guest, alice, owner]) await assertFails(deleteDoc(doc(db, 'siteConfig', 'appVisibility')));
});

test('visibility policy rejects missing apps, unknown fields, public Private Drive and invalid revision/timestamps', async () => {
  const missing = visibilityConfig(); delete missing.apps.ace;
  const extra = visibilityConfig(); extra.apps.unknown = { visibility: 'public' };
  const extraEntry = visibilityConfig(); extraEntry.apps.ace.beta = true;
  const exposedDrive = visibilityConfig(); exposedDrive.apps['private-drive'].visibility = 'public';
  const invalidMode = visibilityConfig(); invalidMode.apps.ace.visibility = 'enabled';
  const bad = [missing, extra, extraEntry, exposedDrive, invalidMode,
    visibilityConfig({ extra: 'bad' }), visibilityConfig({ revision: 0 }), visibilityConfig({ revision: 2 }),
    visibilityConfig({ revision: 1.5 }), visibilityConfig({ schemaVersion: 2 }), visibilityConfig({ updatedAt: oldTime }), visibilityConfig({ updatedBy: 'attacker' })];
  for (const payload of bad) await assertFails(setDoc(doc(owner, 'siteConfig', 'appVisibility'), payload));
  await assertSucceeds(setDoc(doc(owner, 'siteConfig', 'appVisibility'), visibilityConfig()));
  await assertFails(setDoc(doc(owner, 'siteConfig', 'appVisibility'), visibilityConfig()));
  await assertFails(setDoc(doc(owner, 'siteConfig', 'appVisibility'), visibilityConfig({ revision: 3 })));
  for (const db of [guest, alice, unverified, impostor]) await assertFails(updateDoc(doc(db, 'siteConfig', 'appVisibility'), { revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(owner, 'siteConfig', 'anotherPolicy'), visibilityConfig()));
});

test('authenticated users can create bounded reports only under their own identity', async () => {
  await assertSucceeds(setDoc(doc(alice, 'siteReports', reportId), report()));
  await assertFails(setDoc(doc(alice, 'siteReports', 'spoof-owner-123456'), report({ ownerUid: 'bob' })));
  await assertFails(setDoc(doc(alice, 'siteReports', 'spoof-email-123456'), report({ ownerEmail: OWNER_EMAIL })));
  await assertFails(setDoc(doc(alice, 'siteReports', 'guest-owner-123456'), report({ ownerUid: '', ownerEmail: '', ownerName: '' })));
});

test('guest reports work without a contact email but cannot impersonate an account', async () => {
  await assertSucceeds(setDoc(doc(guest, 'siteReports', reportId), report({ ownerUid: '', ownerEmail: '', ownerName: '' })));
  await assertFails(setDoc(doc(guest, 'siteReports', 'guest-spoof-123456'), report()));
  await assertFails(setDoc(doc(guest, 'siteReports', 'guest-name-123456'), report({ ownerUid: '', ownerEmail: '', ownerName: 'Site owner' })));
});

test('report schema rejects missing, extra, malformed, control and overlong content', async () => {
  const missing = report(); delete missing.expected;
  const invalid = [
    missing, report({ arbitrary: true }), report({ type: 'admin' }), report({ subject: 'tiny' }),
    report({ subject: '     ' }), report({ description: 'x'.repeat(6001) }), report({ steps: 'x'.repeat(3001) }),
    report({ contact: 'x'.repeat(255) }), report({ subject: 'Bad\u0000subject' }), report({ ownerName: 'x'.repeat(161) }),
    report({ status: 'resolved' }), report({ publicReply: 'Fake owner response' }),
    report({ createdAt: oldTime }), report({ updatedAt: oldTime })
  ];
  for (const [index, value] of invalid.entries()) await assertFails(setDoc(doc(alice, 'siteReports', 'invalid-report-' + index.toString().padStart(4, '0')), value));
  await assertFails(setDoc(doc(alice, 'siteReports', 'short'), report()));
});

test('multiline Thai descriptions with valid bounds remain usable', async () => {
  await assertSucceeds(setDoc(doc(alice, 'siteReports', reportId), report({
    subject: 'เปลี่ยนธีมแล้วหน้าไม่เปลี่ยน', description: 'เปิดหน้าตั้งค่า\nเลือกธีมมืด แต่หน้าจอยังเป็นสีขาว', steps: '1. เปิดหน้าตั้งค่า\n2. เลือกธีมมืด'
  })));
});

test('report privacy: author and verified owner can read, other users and guessed guest IDs cannot', async () => {
  await seedReport();
  await assertSucceeds(getDoc(doc(alice, 'siteReports', reportId)));
  await assertSucceeds(getDoc(doc(owner, 'siteReports', reportId)));
  for (const db of [bob, guest, unverified, impostor]) await assertFails(getDoc(doc(db, 'siteReports', reportId)));
  await seedReport({ ownerUid: '', ownerEmail: '', ownerName: '' });
  await assertFails(getDoc(doc(guest, 'siteReports', reportId)));
  await assertSucceeds(getDoc(doc(owner, 'siteReports', reportId)));
});

test('users can list only their reports with a bounded query; admins also require bounds', async () => {
  await seedReport();
  await assertSucceeds(getDocs(query(collection(alice, 'siteReports'), where('ownerUid', '==', 'alice'), orderBy('createdAt', 'desc'), limit(50))));
  await assertFails(getDocs(query(collection(alice, 'siteReports'), limit(50))));
  await assertFails(getDocs(query(collection(alice, 'siteReports'), where('ownerUid', '==', 'alice'), limit(51))));
  await assertFails(getDocs(query(collection(alice, 'siteReports'), where('ownerUid', '==', 'alice'))));
  await assertSucceeds(getDocs(query(collection(owner, 'siteReports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50))));
  await assertFails(getDocs(collection(owner, 'siteReports')));
  await assertFails(getDocs(query(collection(owner, 'siteReports'), limit(51))));
  await assertFails(getDocs(query(collection(guest, 'siteReports'), limit(50))));
});

test('report authors cannot rewrite or delete submitted reports, nor reset acknowledged report IDs', async () => {
  await seedReport();
  for (const db of [alice, bob, guest, unverified, impostor]) {
    await assertFails(updateDoc(doc(db, 'siteReports', reportId), { status: 'closed', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'siteReports', reportId)));
  }
  await assertFails(setDoc(doc(alice, 'siteReports', reportId), report()));
  await assertFails(deleteDoc(doc(owner, 'siteReports', reportId)));
});

test('verified owner updates only status, public reply and server timestamp', async () => {
  await seedReport();
  await assertSucceeds(updateDoc(doc(owner, 'siteReports', reportId), { status: 'in_progress', publicReply: 'Investigating', updatedAt: serverTimestamp() }));
  for (const patch of [{ ownerUid: 'owner' }, { subject: 'Rewritten complaint' }, { status: 'deleted' }, { publicReply: 'x'.repeat(6001) }, { updatedAt: oldTime }]) {
    await assertFails(updateDoc(doc(owner, 'siteReports', reportId), { ...patch, ...(Object.hasOwn(patch, 'updatedAt') ? {} : { updatedAt: serverTimestamp() }) }));
  }
});

test('events accept consent-schema guest and user batches with trustworthy identity', async () => {
  await assertSucceeds(setDoc(doc(alice, 'siteEvents', 'sample-event-123456'), event('sample-event-123456')));
  await assertSucceeds(setDoc(doc(guest, 'siteEvents', 'guest-event-123456'), event('guest-event-123456', { actorUid: '', actorEmail: '', actorName: '', name: 'heartbeat', durationSeconds: 30 })));
  await assertFails(setDoc(doc(alice, 'siteEvents', 'spoof-event-123456'), event('spoof-event-123456', { actorUid: 'owner', actorEmail: OWNER_EMAIL })));
  await assertFails(setDoc(doc(guest, 'siteEvents', 'fake-guest-123456'), event('fake-guest-123456')));
});

test('events reject sensitive URL query/hash, arbitrary fields, invalid bounds and mismatched IDs', async () => {
  const invalid = [
    { path: '/settings/?email=secret@example.com' }, { path: '/settings/#token' }, { path: 'https://evil.test/' }, { path: '//evil.test/' },
    { arbitrary: 'secret' }, { consentVersion: 0 }, { durationSeconds: 61 }, { durationSeconds: -1 }, { durationSeconds: 1.5 },
    { device: 'watch' }, { name: 'input_contents' }, { action: 'x'.repeat(81) }, { actorName: 'x'.repeat(161) },
    { sessionId: 'tiny' }, { sessionId: 'x'.repeat(65) }, { clientAt: 'not-a-date' }, { createdAt: oldTime }, { eventId: 'different-event-123456' }
  ];
  for (const [index, patch] of invalid.entries()) {
    const eventId = 'invalid-event-' + index.toString().padStart(4, '0');
    await assertFails(setDoc(doc(alice, 'siteEvents', eventId), event(eventId, patch)));
  }
});

test('only verified owner can read analytics and only with bounded lists; nobody can rewrite or delete', async () => {
  const eventId = 'sample-event-123456';
  await seed('siteEvents', eventId, event(eventId, { createdAt: oldTime }));
  await assertSucceeds(getDoc(doc(owner, 'siteEvents', eventId)));
  await assertSucceeds(getDocs(query(collection(owner, 'siteEvents'), orderBy('createdAt', 'desc'), limit(500))));
  await assertFails(getDocs(query(collection(owner, 'siteEvents'), limit(501))));
  await assertFails(getDocs(collection(owner, 'siteEvents')));
  for (const db of [alice, bob, guest, unverified, impostor]) {
    await assertFails(getDoc(doc(db, 'siteEvents', eventId)));
    await assertFails(getDocs(query(collection(db, 'siteEvents'), limit(1))));
  }
  for (const db of [owner, alice]) {
    await assertFails(updateDoc(doc(db, 'siteEvents', eventId), { action: 'rewrite' }));
    await assertFails(deleteDoc(doc(db, 'siteEvents', eventId)));
  }
});

test('owner report change and audit atomically match the same transition and public reply', async () => {
  await seedReport();
  const batch = writeBatch(owner);
  batch.update(doc(owner, 'siteReports', reportId), { status: 'in_progress', publicReply: 'We are investigating', updatedAt: serverTimestamp() });
  batch.set(doc(owner, 'siteAdminAudit', 'sample-audit-123456'), audit());
  await assertSucceeds(batch.commit());
  const updated = await getDoc(doc(owner, 'siteReports', reportId));
  assert.equal(updated.data().status, 'in_progress');
});

test('audit cannot fabricate an actor or transition, and failure prevents report change', async () => {
  await seedReport();
  for (const [index, patch] of [{ actorUid: 'alice' }, { actorEmail: 'wrong@example.com' }, { fromStatus: 'closed' }, { toStatus: 'resolved' }, { publicReply: 'Different reply' }, { reportId: 'absent-report-123456' }, { action: 'delete_user' }, { extra: 'x' }].entries()) {
    const batch = writeBatch(owner);
    batch.update(doc(owner, 'siteReports', reportId), { status: 'in_progress', publicReply: 'We are investigating', updatedAt: serverTimestamp() });
    batch.set(doc(owner, 'siteAdminAudit', 'invalid-audit-' + index.toString().padStart(4, '0')), audit(patch));
    await assertFails(batch.commit());
  }
  assert.equal((await getDoc(doc(owner, 'siteReports', reportId))).data().status, 'open');
  await assertFails(setDoc(doc(owner, 'siteAdminAudit', 'unpaired-audit-123456'), audit()));
  await assertFails(setDoc(doc(alice, 'siteAdminAudit', 'nonowner-audit-123456'), audit()));
});

test('audit logs are owner-only, bounded and immutable', async () => {
  const auditId = 'sample-audit-123456';
  await seed('siteAdminAudit', auditId, audit({ createdAt: oldTime }));
  await assertSucceeds(getDoc(doc(owner, 'siteAdminAudit', auditId)));
  await assertSucceeds(getDocs(query(collection(owner, 'siteAdminAudit'), limit(50))));
  await assertFails(getDocs(query(collection(owner, 'siteAdminAudit'), limit(51))));
  await assertFails(getDocs(collection(owner, 'siteAdminAudit')));
  for (const db of [alice, guest, unverified, impostor]) await assertFails(getDoc(doc(db, 'siteAdminAudit', auditId)));
  await assertFails(updateDoc(doc(owner, 'siteAdminAudit', auditId), { publicReply: 'rewrite' }));
  await assertFails(deleteDoc(doc(owner, 'siteAdminAudit', auditId)));
});

test('previous user-profile and public-movie authorization behavior is preserved', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users', 'alice'), { displayName: 'Alice' }));
  await assertSucceeds(getDoc(doc(alice, 'users', 'alice')));
  await assertFails(getDoc(doc(bob, 'users', 'alice')));
  await assertFails(getDoc(doc(guest, 'users', 'alice')));
  await assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'publicMovies', 'movie-1'), { title: 'Example' }));
  await assertSucceeds(getDoc(doc(guest, 'users', 'alice', 'publicMovies', 'movie-1')));
  await assertFails(setDoc(doc(bob, 'users', 'alice', 'publicMovies', 'movie-2'), { title: 'Spoof' }));
});

test('private connection config is owner-get only: no public enumeration and no client writes', async () => {
  await seed('sitePrivateConfig', 'privateDrive', { shareUrl: 'https://files.example.com/share/example' });
  await seed('sitePrivateConfig', 'otherConfig', { privateValue: 'example' });
  await assertSucceeds(getDoc(doc(owner, 'sitePrivateConfig', 'privateDrive')));
  await assertFails(getDoc(doc(owner, 'sitePrivateConfig', 'otherConfig')));
  for (const db of [guest, alice, bob, unverified, impostor]) {
    await assertFails(getDoc(doc(db, 'sitePrivateConfig', 'privateDrive')));
  }
  for (const db of [owner, guest, alice]) {
    await assertFails(getDocs(query(collection(db, 'sitePrivateConfig'), limit(1))));
    await assertFails(setDoc(doc(db, 'sitePrivateConfig', 'newConfig'), { shareUrl: 'https://files.example.com/' }));
    await assertFails(updateDoc(doc(db, 'sitePrivateConfig', 'privateDrive'), { shareUrl: 'https://elsewhere.example.com/' }));
    await assertFails(deleteDoc(doc(db, 'sitePrivateConfig', 'privateDrive')));
  }
});
