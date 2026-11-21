import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIL_RECIPIENT_HEADERS, knownMailboxRecipientAddresses, mailRecipientMetadata, mailRecipientCandidates } from '../server-lib/site-mail-recipients.js';
import { createSiteMail, createMailProtocolAdapters, encryptMailboxCredential, decryptMailboxCredential } from '../server-lib/site-mail.js';

const primary = 'official@taithai.app';
const record = { uid: 'fixture_user', id: 'fixture_user', address: primary, localPart: 'official', status: 'active', provider: 'hostinger',
  aliases: ['news@taithai.app'], previousAddresses: ['social@taithai.app'] };
const known = knownMailboxRecipientAddresses(record, [{ address: 'updates@taithai.app', kind: 'alias' }]);
const parsed = (to = [], cc = [], headers) => ({ envelope: { to: to.map(address => ({ address })), cc: cc.map(address => ({ address })) }, headers });
const result = (address, kind, ...sources) => ({ address, kind, sources });

test('visible recipients match parsed addresses rather than address-like display names', () => {
  const raw = parsed(['NEWS@TAITHAI.APP']);
  raw.envelope.to.push({ name: 'official@taithai.app', address: 'stranger@example.org' });
  assert.deepEqual(mailRecipientMetadata(raw, known), { recipientMatches: [result('news@taithai.app', 'alias', 'to')], recipientMatchStatus: 'matched' });
});

test('matches preserve all own addresses, deduplicate evidence and distinguish history', () => {
  const raw = parsed([primary, 'news@taithai.app', primary], ['news@taithai.app', 'social@taithai.app'],
    Buffer.from('Delivered-To: news@taithai.app\r\nX-Original-To: social@taithai.app\r\n\r\n'));
  assert.deepEqual(mailRecipientMetadata(raw, known).recipientMatches, [result(primary, 'primary', 'to'),
    result('news@taithai.app', 'alias', 'to', 'cc', 'delivered-to'), result('social@taithai.app', 'previous', 'cc', 'x-original-to')]);
});

test('hidden-recipient delivery fields remain evidence hints without invented Bcc', () => {
  const dto = mailRecipientMetadata(parsed(['list@example.org'], [], Buffer.from('Delivered-To: <updates@taithai.app>\r\n\r\n')), known);
  assert.deepEqual(dto, { recipientMatches: [result('updates@taithai.app', 'alias', 'delivered-to')], recipientMatchStatus: 'matched' });
  assert.equal(JSON.stringify(dto).toLowerCase().includes('bcc'), false);
  assert.equal('verified' in dto, false);
});

test('missing, unknown and other mailbox recipients never default to the primary', () => {
  for (const headers of [undefined, Buffer.from('Delivered-To: another@taithai.app\r\nEnvelope-To: official@elsewhere.app\r\nBcc: official@taithai.app\r\n\r\n')]) {
    assert.deepEqual(mailRecipientMetadata(parsed(['other@example.org'], [], headers), known), { recipientMatches: [], recipientMatchStatus: 'unavailable' });
  }
});

test('folded, repeated and conflicting delivery hints are retained without choosing a route', () => {
  const headers = Buffer.from('dElIvErEd-To: news@taithai.app\r\nDelivered-To:\r\n\t<updates@taithai.app>\r\nEnvelope-To: social@taithai.app, news@taithai.app\r\n\r\n');
  assert.deepEqual(mailRecipientMetadata(parsed([], [], headers), known).recipientMatches, [
    result('news@taithai.app', 'alias', 'delivered-to', 'envelope-to'), result('updates@taithai.app', 'alias', 'delivered-to'),
    result('social@taithai.app', 'previous', 'envelope-to')]);
});

test('raw header fallback uses parsed address objects and not display-name decoys', () => {
  assert.deepEqual(mailRecipientMetadata({ headers: Buffer.from('To: "official@taithai.app" <external@example.org>\r\nCc: "Team" <news@taithai.app>\r\n\r\n') }, known).recipientMatches,
    [result('news@taithai.app', 'alias', 'cc')]);
});

test('invalid and oversized header input drops hints while parsed visible recipients still work', () => {
  for (const headers of [Buffer.from('Delivered-To: official@taithai.app\rBAD\r\n'), Buffer.from('Delivered-To: official@taithai.app\x00\r\n'),
    Buffer.from('Delivered-To: official@taithai.app' + ' '.repeat(17000) + '\r\n\r\n'), Buffer.from('Delivered-To: ' + ' '.repeat(4200) + 'official@taithai.app\r\n\r\n')]) {
    assert.deepEqual(mailRecipientMetadata(parsed(['news@taithai.app'], [], headers), known).recipientMatches, [result('news@taithai.app', 'alias', 'to')]);
  }
  const noBodyScan = mailRecipientMetadata(parsed([], [], Buffer.from('Subject: fixture\r\n\r\nDelivered-To: official@taithai.app\r\n')), known);
  assert.equal(noBodyScan.recipientMatchStatus, 'unavailable');
});

test('known address set is bounded, mailbox-domain scoped and rejects inactive alias records', () => {
  const found = knownMailboxRecipientAddresses({ ...record, aliases: [...record.aliases,
    { address: 'revoked@taithai.app', status: 'deleted' }, { address: 'pending@taithai.app', status: 'provisioning' }, { address: 'disabled@taithai.app', active: false }] },
  [{ address: 'foreign@example.org', kind: 'alias' }, { address: 'alternate@taithai.app', kind: 'primary' }, { address: 'bad\r\n@taithai.app', kind: 'alias' }]);
  assert.deepEqual(found, knownMailboxRecipientAddresses(record));
  assert.ok(knownMailboxRecipientAddresses(record, Array.from({ length: 2000 }, (_, index) => ({ address: `alias${index}@taithai.app`, kind: 'alias' }))).length <= 1500);
});

test('catch-all name candidates remain bounded header evidence and never scan body or Bcc', () => {
  const candidates = mailRecipientCandidates({headers:Buffer.from('To: "fake@taithai.app" <external@example.org>\r\nCc: Fresh@taithai.app\r\nDelivered-To: fresh@taithai.app\r\nBcc: secret@taithai.app\r\n\r\nTo: body@taithai.app')});
  assert.deepEqual(candidates,[{address:'fresh@taithai.app',sources:['cc','delivered-to']}]);
  assert.equal(mailRecipientCandidates(parsed(Array.from({length:300},(_,i)=>`name${i}@taithai.app`))).length,128);
});

test('a name discovered after the first 128 stored names still labels its message', () => {
  const addresses=knownMailboxRecipientAddresses(record,Array.from({length:500},(_,i)=>({address:`name${i}@taithai.app`,kind:'alias'})));
  assert.deepEqual(mailRecipientMetadata(parsed(['name499@taithai.app']),addresses).recipientMatches,[result('name499@taithai.app','alias','to')]);
});

const env = { OWNER_MAIL_ENABLED: 'true', MAIL_READY: 'true', MAIL_DOMAIN: 'taithai.app', MAIL_PROVIDER: 'hostinger',
  HOSTINGER_API_TOKEN: 'fixture-hostinger-token-not-real', HOSTINGER_MAIL_ORDER_ID: 'OR_fixture', MAIL_CREDENTIAL_SECRET: Buffer.alloc(32, 42).toString('base64') };
const user = { uid: record.uid, email_verified: true, email: 'fixture@example.org' };
function mailboxFixture(recipientAddresses, override = {}) {
  const saved = { ...record, ...override };
  saved.credential = encryptMailboxCredential('fixture-password', { env, userId: user.uid, mailboxAddress: saved.address });
  const docs = new Map([[`siteMailboxes/${user.uid}`, saved]]);
  const store = { get: async key => structuredClone(docs.get(key)), set: async (key, value) => docs.set(key, structuredClone(value)),
    async runTransaction(operation) { return operation({ get: store.get, set: store.set }); } };
  const raw = { uid: 42, ...parsed([primary], ['news@taithai.app'], Buffer.from('Delivered-To: updates@taithai.app\r\n\r\n')),
    flags: new Set(), size: 1024, text: 'Synthetic fixture', source: Buffer.from('private raw source'), password: 'not public' };
  const service = createSiteMail({ env, store, recipientAddresses, getMembership: async () => ({ active: true, adminAccess: true, mailAccess: true, role: 'admin' }),
    provider: { id: 'hostinger' }, smtp: {}, imap: { async list() { return { uidValidity: '123', messages: [raw], nextCursor: null }; }, async message() { return raw; } } });
  return { service, raw, saved };
}

test('list/detail use the same server-resolved address set and expose no raw header data', async () => {
  const calls = [];
  const f = mailboxFixture(async (caller, owned) => { calls.push([caller.uid, owned.id]); return [{ address: 'updates@taithai.app', kind: 'alias' }]; });
  const list = await f.service.list(user, { recipientAddresses: ['attacker@taithai.app'] });
  const detail = (await f.service.message(user, { id: list.messages[0].id })).message;
  assert.deepEqual(detail.recipientMatches, list.messages[0].recipientMatches);
  assert.deepEqual(detail.recipientMatches, [result(primary, 'primary', 'to'), result('news@taithai.app', 'alias', 'cc'), result('updates@taithai.app', 'alias', 'delivered-to')]);
  assert.deepEqual(calls, [[user.uid, record.id], [user.uid, record.id]]);
  for (const item of [list.messages[0], detail]) for (const key of ['headers', 'source', 'password', 'credential']) assert.equal(key in item, false);
});

test('optional alias lookup failure preserves inbox reads and saved address history', async () => {
  const f = mailboxFixture(async () => { throw new Error('fixture alias store unavailable'); });
  f.raw.envelope.to = [{ address: 'social@taithai.app' }];
  const list = await f.service.list(user);
  assert.deepEqual(list.messages[0].recipientMatches, [result('social@taithai.app', 'previous', 'to'), result('news@taithai.app', 'alias', 'cc')]);
  assert.equal((await f.service.message(user, { id: list.messages[0].id })).message.text, 'Synthetic fixture');
});

test('trusted reserved primary credentials work, remain address-bound and do not relax public creation', async () => {
  const f = mailboxFixture();
  assert.equal(decryptMailboxCredential(f.saved, { env }), 'fixture-password');
  assert.throws(() => decryptMailboxCredential({ ...f.saved, address: 'social@taithai.app', localPart: 'social' }, { env }), /MAIL_CREDENTIAL_UNAVAILABLE/);
  for (const mailboxAddress of ['official@elsewhere.app', 'Official@taithai.app', 'official@taithai.app\r\n', 'bad..local@taithai.app']) {
    assert.throws(() => encryptMailboxCredential('fixture-password', { env, userId: user.uid, mailboxAddress }));
  }
  await assert.rejects(f.service.create(user, { localPart: 'official' }), /RESERVED_LOCAL_PART/);
});

test('real IMAP adapter requests only selected PEEK headers for both list/detail and tolerates absent header fixtures', async () => {
  const queries = [];
  class FakeImap {
    constructor() { this.mailbox = { uidValidity: 123n, exists: 1 }; }
    on() {} async connect() {} async logout() {} close() {}
    async list() { return [{ path: 'INBOX', name: 'Inbox', flags: new Set() }]; }
    async getMailboxLock() { return { release() {} }; }
    async fetchAll(range, query) { queries.push(query); return [{ uid: 42, envelope: {}, flags: new Set() }]; }
    async fetchOne(id, query, options) { assert.equal(options.uid, true); queries.push(query); return { uid: id, envelope: {}, flags: new Set() }; }
    async download() { throw new Error('Do not download a body for recipient headers'); }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: FakeImap, createTransport() {}, simpleParser() {}, env });
  const credentials = { address: primary, provider: 'hostinger', password: 'fixture-password' };
  assert.equal((await imap.list(credentials, { folder: 'INBOX', limit: 25 })).messages.length, 1);
  assert.equal((await imap.message(credentials, { folder: 'INBOX', uid: 42, uidValidity: '123' })).text, '');
  for (const query of queries) { assert.deepEqual(query.headers, [...MAIL_RECIPIENT_HEADERS]); assert.equal('source' in query, false); assert.equal('markSeen' in query, false); }
});


test('SMTP connection diagnostic never sends and exposes only bounded error classification',async()=>{
 let sent=0,closed=0,fail=true;
 const protocols=createMailProtocolAdapters({ImapFlow:class{},simpleParser(){},createTransport:options=>({async verify(){assert.equal(options.host,'smtp.hostinger.com');if(fail)throw Object.assign(Error('private-password'),{code:'EAUTH',responseCode:535,command:'AUTH PLAIN',response:'private-provider-response'});return true;},async sendMail(){sent++;throw Error('Do not send');},close(){closed++;}}),env});
 const credential={address:primary,password:'private-password',provider:'hostinger'};
 assert.deepEqual(await protocols.smtp.verifyCredentials(credential),{connected:false,code:'EAUTH',responseCode:535,stage:'authentication'});fail=false;assert.deepEqual(await protocols.smtp.verifyCredentials(credential),{connected:true});assert.equal(sent,0);assert.equal(closed,2);
});
