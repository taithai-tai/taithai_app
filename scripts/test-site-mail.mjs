import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { withMembershipOperationBudget } from '../server-lib/site-operation-budget.js';
import { MAIL_LIMITS, MailError, createSiteMail, createMigaduProvider, createPurelymailProvider, createHostingerProvider, createMailProvider, createMailProtocolAdapters, mailConfiguration,
  encryptMailboxCredential, decryptMailboxCredential, encodeMailMessageId, decodeMailMessageId, readableMailHtml } from '../server-lib/site-mail.js';

const user = { uid: 'member_123', email: 'person@example.com', email_verified: true };
const env = { MAIL_READY: 'true', MAIL_DOMAIN: 'taithai.app', MAIL_PROVIDER: 'migadu',
  MAIL_CREDENTIAL_SECRET: Buffer.alloc(32, 42).toString('base64'), MIGADU_API_USER: 'owner@example.com', MIGADU_API_KEY: 'test-api-key-not-real' };
const purelyEnv = { ...env, MAIL_PROVIDER: 'purelymail', PURELYMAIL_API_TOKEN: 'purelymail-test-token-not-real' };
const hostingerEnv = { ...env, MAIL_PROVIDER: 'hostinger', HOSTINGER_API_TOKEN: 'hostinger-test-token-not-real', HOSTINGER_MAIL_ORDER_ID: 'OR_test_order' };
const clone = value => value === undefined ? undefined : structuredClone(value);
function memoryStore() {
  const docs = new Map(); let queue = Promise.resolve();
  return { docs, get: async key => clone(docs.get(key)), set: async (key, value) => docs.set(key, clone(value)),
    runTransaction(operation) {
      const result = queue.then(async () => {
        const writes = new Map(); const tx = { get: async key => clone(docs.get(key)), set: (key, value) => writes.set(key, clone(value)) };
        const value = await operation(tx); for (const [key, next] of writes) docs.set(key, next); return value;
      });
      queue = result.catch(() => {}); return result;
    } };
}
function fixture(overrides = {}) {
  const store = memoryStore(); let timestamp = Date.parse('2026-11-21T10:00:00Z'); let membership = { active: true, paid: true };
  const boxes = new Map(); const calls = { create: [], sending: [], list: [], messages: [], read: [], trash: [], send: [], append: [] };
  const raw = { uid: 42, envelope: { subject: '<img src=x onerror=alert(1)>', from: [{ name: '<script>Bad</script>', address: 'sender@example.com' }],
    to: [{ name: 'Member', address: 'sunny@taithai.app' }], cc: [], messageId: '<original@example.com>', date: new Date(timestamp) },
    flags: new Set(), size: 1234, text: 'Plain body with an https://example.com link', attachments: [{ filename: '<unsafe>.pdf', contentType: 'application/pdf', size: 123 }] };
  const provider = { async findMailbox(local) { return boxes.get(local) || null; },
    async createMailbox(input) { calls.create.push(input); boxes.set(input.localPart, { name: input.marker, address: `${input.localPart}@taithai.app` }); },
    async setSending(...args) { calls.sending.push(args); } };
  const imap = { async folders() { return [{ id: 'INBOX', name: 'Inbox', total: 1, unread: 1 }]; },
    async list(credentials, input) { calls.list.push({ credentials, input }); return { uidValidity: '123', messages: [raw], nextCursor: null }; },
    async message(credentials, input) { calls.messages.push({ credentials, input }); return raw; },
    async read(credentials, input) { calls.read.push({ credentials, input }); },
    async trash(credentials, input) { calls.trash.push({ credentials, input }); },
    async appendSent(credentials, bytes) { calls.append.push({ credentials, bytes }); } };
  const smtp = { async send(credentials, message) { calls.send.push({ credentials, message }); return { accepted: message.to, raw: Buffer.from('fixture-only') }; } };
  const service = createSiteMail({ store, getMembership: async () => membership, provider, imap, smtp, env, now: () => timestamp, ...overrides });
  return { service, store, boxes, calls, provider, imap, smtp, raw,
    setMembership(value) { membership = value; }, advance(ms) { timestamp += ms; } };
}
const code = expected => error => error instanceof MailError && error.code === expected;
const sendInput = (id = 'request_0123456789') => ({ requestId: id, to: ['friend@example.com'], subject: 'Hello', text: 'A real plain text message' });
const messageId = () => encodeMailMessageId({ folder: 'INBOX', uid: 42, uidValidity: '123' });
function purelyFixture() {
  const users = new Map(); const requests = []; const probes = [];
  const domain = { name: 'taithai.app', isShared: false, symbolicSubaddressing: false, allowAccountReset: false,
    dnsSummary: { passesMx: true, passesSpf: true, passesDkim: true, passesDmarc: true } };
  let loseCreateResponse = false;
  const provider = createPurelymailProvider({ env: purelyEnv, async fetchImpl(url, options) {
    const operation = url.split('/').pop(); const input = JSON.parse(options.body); requests.push({ url, options, operation, input });
    assert.equal(options.headers['Purelymail-Api-Token'], purelyEnv.PURELYMAIL_API_TOKEN);
    let result;
    if (operation === 'listDomains') result = { domains: [domain] };
    else if (operation === 'listUser') result = { users: [...users.keys()] };
    else if (operation === 'getUser') {
      if (!users.has(input.userName)) return new Response(JSON.stringify({ error: { code: 'undocumented-not-found', message: 'private provider detail' } }), { status: 400 });
      result = { enableSearchIndexing: false, recoveryEnabled: false, requireTwoFactorAuthentication: false, enableSpamFiltering: true, resetMethods: [] };
    } else if (operation === 'createUser') {
      const key = `${input.userName}@${input.domainName}`;
      if (users.has(key)) return new Response(JSON.stringify({ error: { code: 'duplicate', message: 'already exists' } }), { status: 400 });
      users.set(key, { password: input.password }); result = {};
      if (loseCreateResponse) throw new Error('response lost after provider commit');
    } else throw new Error('Unexpected provider mutation: ' + operation);
    return new Response(JSON.stringify({ result }));
  }, async verifyMailboxCredentials(credentials) {
    probes.push(credentials); return credentials.provider === 'purelymail' && users.get(credentials.address)?.password === credentials.password;
  } });
  return { provider, users, requests, probes, domain, loseCreateResponse() { loseCreateResponse = true; } };
}

function hostingerFixture() {
  const boxes = new Map(); const requests = []; const probes = [];
  const order = { id: hostingerEnv.HOSTINGER_MAIL_ORDER_ID, status: 'active', is_trial: false, seats: 5,
    domain: { id: 'DO_test_domain', name: 'taithai.app' }, expires_at: '2099-01-01T00:00:00Z' };
  const plan = { domain: { mailbox_quota: 5, is_imap_enabled: true }, mailbox: { max_outbound_recipient_limit: 50, max_outbound_message_size: 25000000 } };
  const resource = (local, i = boxes.size) => ({ id: `AC_test_${i}`, address: `${local}@taithai.app`, status: 'active', is_catchall: false,
    protocols: { is_imap_enabled: true, is_pop3_enabled: false, is_smtp_in_enabled: true, is_smtp_out_enabled: true } });
  let loseCreateResponse = false; let mutateResponse = value => value; let beforeRequest = () => {};
  const provider = createHostingerProvider({ env: hostingerEnv, async fetchImpl(url, options) {
    const parsed = new URL(url); const input = options.body ? JSON.parse(options.body) : null; requests.push({ url, options, input });
    await beforeRequest({ url, options, input });
    assert.equal(parsed.origin, 'https://developers.hostinger.com'); assert.equal(options.headers.Authorization, 'Bearer ' + hostingerEnv.HOSTINGER_API_TOKEN);
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    let body;
    const page = items => {
      const number = Number(parsed.searchParams.get('page')); const perPage = Number(parsed.searchParams.get('per_page'));
      return { data: items.slice((number - 1) * perPage, number * perPage), meta: { current_page: number, per_page: perPage, total: items.length } };
    };
    if (parsed.pathname === '/api/mail/v1/orders' && options.method === 'GET') body = page([order]);
    else if (parsed.pathname === '/api/mail/v1/orders/OR_test_order/plan' && options.method === 'GET') body = plan;
    else if (parsed.pathname === '/api/mail/v1/orders/OR_test_order/mailboxes' && options.method === 'GET') {
      const search = parsed.searchParams.get('search'); body = page([...boxes.values()].map(item => item.resource).filter(item => !search || item.address.includes(search)));
    } else if (parsed.pathname === '/api/mail/v1/orders/OR_test_order/mailboxes' && options.method === 'POST') {
      const key = `${input.local_part}@taithai.app`;
      if (boxes.has(key)) return new Response(JSON.stringify({ error: 'private duplicate provider detail' }), { status: 409 });
      body = resource(input.local_part); boxes.set(key, { resource: body, password: input.password });
      if (loseCreateResponse) throw new Error('Lost response after provider commit');
    } else throw new Error('Unexpected Hostinger operation: ' + parsed.pathname + ' ' + options.method);
    return new Response(JSON.stringify(mutateResponse(structuredClone(body), parsed, options)));
  }, async verifyMailboxCredentials(credentials) {
    probes.push(credentials); return credentials.provider === 'hostinger' && boxes.get(credentials.address)?.password === credentials.password;
  } });
  return { provider, boxes, requests, probes, order, plan, resource,
    loseCreateResponse() { loseCreateResponse = true; }, mutateResponse(fn) { mutateResponse = fn; }, beforeRequest(fn) { beforeRequest = fn; } };
}

test('mail readiness is fail-closed for incomplete credentials, wrong domain and existing unsupported hosting', () => {
  assert.equal(mailConfiguration(env).ready, true);
  for (const invalid of [{ MAIL_READY: 'false' }, { MAIL_DOMAIN: 'other.app' }, { MAIL_PROVIDER: 'godaddy' },
    { MAIL_CREDENTIAL_SECRET: 'short' }, { MIGADU_API_USER: '' }, { MIGADU_API_KEY: '' }]) assert.equal(mailConfiguration({ ...env, ...invalid }).ready, false);
});

test('Purelymail configuration/factory uses explicit token and provider-specific fixed MX settings', () => {
  assert.equal(mailConfiguration(purelyEnv).ready, true);
  assert.deepEqual(mailConfiguration(purelyEnv).expectedMxHosts, ['mailserver.purelymail.com']);
  assert.equal(createMailProvider({ env: purelyEnv }).id, 'purelymail'); assert.equal(createMailProvider({ env }).id, 'migadu');
  assert.equal(mailConfiguration({ ...purelyEnv, PURELYMAIL_API_TOKEN: '' }).ready, false);
  assert.equal(mailConfiguration({ ...purelyEnv, PURELYMAIL_API_TOKEN: 'bad\nheader' }).ready, false);
  assert.equal(mailConfiguration({ ...purelyEnv, MAIL_DOMAIN: 'elsewhere.app' }).ready, false);
  for (const name of ['constructor','__proto__','toString']) assert.equal(mailConfiguration({ ...purelyEnv, MAIL_PROVIDER: name }).ready, false);
});

test('legacy v1 ciphertext remains Migadu-only while v2 credentials bind the explicit provider', async () => {
  const f = fixture(); const iv = Buffer.alloc(12, 7); const cipher = createCipheriv('aes-256-gcm', Buffer.from(env.MAIL_CREDENTIAL_SECRET, 'base64'), iv);
  cipher.setAAD(Buffer.from(`${user.uid}\nsunny@taithai.app`));
  const ciphertext = Buffer.concat([cipher.update('legacy-server-secret'),cipher.final()]);
  const record = { uid: user.uid, address: 'sunny@taithai.app', localPart: 'sunny', status: 'active', credential: {
    version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64')
  } };
  assert.equal(decryptMailboxCredential(record, { env }), 'legacy-server-secret');
  assert.throws(() => decryptMailboxCredential({ ...record, provider: 'purelymail' }, { env }), code('MAIL_CREDENTIAL_UNAVAILABLE'));
  await f.store.set(`siteMailboxes/${user.uid}`, record); await f.service.list(user);
  assert.equal(f.calls.list[0].credentials.provider, 'migadu');
  assert.equal(f.calls.list[0].credentials.password, 'legacy-server-secret');
});

test('credential encryption uses authenticated random nonces bound to the exact user and mailbox', () => {
  const password = 'random-server-only-password'; const options = { env, userId: user.uid, mailboxAddress: 'sunny@taithai.app' };
  const credential = encryptMailboxCredential(password, options);
  const record = { uid: user.uid, localPart: 'sunny', address: options.mailboxAddress, provider: 'migadu', credential };
  assert.equal(decryptMailboxCredential(record, { env }), password);
  assert.notDeepEqual(credential, encryptMailboxCredential(password, options));
  assert.equal(JSON.stringify(credential).includes(password), false);
  assert.throws(() => decryptMailboxCredential({ ...record, uid: 'someone_else' }, { env }), code('MAIL_CREDENTIAL_UNAVAILABLE'));
  assert.throws(() => decryptMailboxCredential({ ...record, address: 'other@taithai.app', localPart: 'other' }, { env }), code('MAIL_CREDENTIAL_UNAVAILABLE'));
  assert.throws(() => decryptMailboxCredential({ ...record, provider: 'purelymail' }, { env }), code('MAIL_CREDENTIAL_UNAVAILABLE'));
  assert.throws(() => decryptMailboxCredential({ ...record, credential: { ...credential, tag: Buffer.alloc(16).toString('base64') } }, { env }), code('MAIL_CREDENTIAL_UNAVAILABLE'));
});

test('mail methods require a verified server identity and never use a client mailbox as an owner', async () => {
  const f = fixture();
  await assert.rejects(f.service.status(null), code('AUTH_REQUIRED'));
  await assert.rejects(f.service.status({ ...user, uid: '../victim' }), code('AUTH_REQUIRED'));
  await assert.rejects(f.service.status({ ...user, email_verified: false }), code('VERIFIED_EMAIL_REQUIRED'));
  await f.service.create(user, { localPart: 'sunny' });
  await assert.rejects(f.service.list(user, { mailbox: 'victim' }), code('MAILBOX_NOT_FOUND'));
  assert.equal(f.calls.list.length, 0);
});

test('creation requires an active paid entitlement, not trials, stale periods or client claims', async () => {
  const f = fixture();
  for (const value of [{ active: false, paid: true }, { active: true, paid: false }, { active: true, paid: true, currentPeriodEnd: '2020-01-01T00:00:00Z' }]) {
    f.setMembership(value);
    await assert.rejects(f.service.create({ ...user, paid: true }, { localPart: 'sunny', paid: true }), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  }
  assert.equal(f.calls.create.length, 0);
});

test('creation rejects reserved names, case variants, punctuation aliases and invalid local parts', async () => {
  for (const localPart of ['Admin', 'post.master', 'no-reply', 'taithai5002', 'owner', 'support-team', 'admin.notice', 'ab', 'a..bc', 'a@elsewhere.test', '../evil', 'ไทย', 'a'.repeat(31)]) {
    const f = fixture(); await assert.rejects(f.service.create(user, { localPart }), error => error instanceof MailError && ['RESERVED_LOCAL_PART', 'INVALID_LOCAL_PART'].includes(error.code));
    assert.equal(f.calls.create.length, 0);
  }
});

test('provisioning creates one real provider mailbox, stores ciphertext and never returns passwords', async () => {
  const f = fixture(); const result = await f.service.create(user, { localPart: 'Sunny' });
  assert.equal(result.mailbox.address, 'sunny@taithai.app'); assert.equal(result.mailbox.id, user.uid); assert.equal(result.canSend, true);
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.create[0].password.length, 43);
  const stored = await f.store.get(`siteMailboxes/${user.uid}`);
  assert.equal(decryptMailboxCredential(stored, { env }), f.calls.create[0].password);
  assert.equal(JSON.stringify(result).includes(f.calls.create[0].password), false);
  assert.equal(JSON.stringify(result).includes('ciphertext'), false);
  await f.service.create(user, { localPart: 'sunny' }); assert.equal(f.calls.create.length, 1);
  await assert.rejects(f.service.create(user, { localPart: 'second' }), code('MAILBOX_ALREADY_EXISTS'));
});

test('transactional reservations prevent two accounts claiming a name and concurrent second boxes', async () => {
  const f = fixture(); const other = { ...user, uid: 'member_456' };
  const results = await Promise.allSettled([f.service.create(user, { localPart: 'sunny' }), f.service.create(other, { localPart: 'sunny' })]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1); assert.equal(f.calls.create.length, 1);
  const g = fixture(); const ownResults = await Promise.allSettled([g.service.create(user, { localPart: 'first' }), g.service.create(user, { localPart: 'second' })]);
  assert.equal(ownResults.filter(item => item.status === 'fulfilled').length, 1); assert.equal(g.calls.create.length, 1);
});

test('preexisting provider mailbox is never adopted, reset, or deleted', async () => {
  const f = fixture(); f.boxes.set('sunny', { name: 'Existing real owner' });
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('ADDRESS_UNAVAILABLE'));
  assert.equal(f.calls.create.length, 0); assert.deepEqual(f.calls.sending, []);
  assert.equal((await f.service.status(user)).canCreate, true);
  await f.service.create(user, { localPart: 'different' }); assert.equal(f.calls.create.length, 1);
});

test('uncertain creation retains encrypted credential and only reconciles its own unique marker', async () => {
  const f = fixture(); const original = f.provider.createMailbox;
  f.provider.createMailbox = async input => { await original(input); throw new Error('private provider detail'); };
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  let status = await f.service.status(user); assert.deepEqual(status.mailboxes, []); assert.equal(status.mailbox.localPart, 'sunny');
  assert.equal(status.canRetryProvisioning, false); assert.equal(status.mailbox.retryAt, '2026-11-21T10:00:30.000Z');
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING'));
  f.advance(31000); status = await f.service.status(user); assert.equal(status.canRetryProvisioning, true);
  const result = await f.service.create(user, { localPart: 'sunny' });
  assert.equal(result.mailbox.status, 'active'); assert.equal(f.calls.create.length, 1);
});

test('Purelymail provisioning uses official API shapes, proves random-password ownership and never exposes secrets', async () => {
  const p = purelyFixture(); const f = fixture({ env: purelyEnv, provider: p.provider });
  const result = await f.service.create(user, { localPart: 'sunny.name' });
  assert.equal(result.mailbox.provider, 'purelymail'); assert.equal(result.mailbox.status, 'active');
  const created = p.requests.find(item => item.operation === 'createUser');
  assert.deepEqual(Object.keys(created.input).sort(), ['domainName','enablePasswordReset','enableSearchIndexing','password','sendWelcomeEmail','userName'].sort());
  assert.equal(created.url, 'https://purelymail.com/api/v0/createUser'); assert.equal(created.options.method, 'POST');
  assert.equal(created.input.userName, 'sunny.name'); assert.equal(created.input.domainName, 'taithai.app');
  assert.equal(created.input.enablePasswordReset, false); assert.equal(created.input.sendWelcomeEmail, false);
  assert.equal(p.probes.length, 1); assert.equal(p.probes[0].password, created.input.password);
  assert.equal(JSON.stringify(result).includes(created.input.password), false);
  assert.equal((await f.store.get(`siteMailboxes/${user.uid}`)).credential.version, 2);
  assert.equal(p.requests.some(item => /modify|delete|Routing|updateDomain/.test(item.operation)), false);
});

test('Purelymail uncertain creation authenticates only its persisted random secret before activation', async () => {
  const p = purelyFixture(); p.loseCreateResponse(); const f = fixture({ env: purelyEnv, provider: p.provider });
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  const stored = await f.store.get(`siteMailboxes/${user.uid}`); assert.ok(stored.creationAttemptedAt);
  f.advance(31000); const result = await f.service.create(user, { localPart: 'sunny' });
  assert.equal(result.mailbox.status, 'active'); assert.equal(p.requests.filter(item => item.operation === 'createUser').length, 1);
  assert.equal(p.probes[0].password, decryptMailboxCredential(stored, { env: purelyEnv }));
});

test('Purelymail never adopts a preexisting user or an uncertain user whose random secret cannot be proven', async () => {
  const p = purelyFixture(); p.users.set('sunny@taithai.app', { password: 'foreign-existing-secret' });
  const f = fixture({ env: purelyEnv, provider: p.provider });
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('ADDRESS_UNAVAILABLE'));
  assert.equal(p.probes.length, 0); assert.equal(p.requests.some(item => item.operation === 'createUser'), false);
  const q = purelyFixture(); q.loseCreateResponse(); const g = fixture({ env: purelyEnv, provider: q.provider });
  await assert.rejects(g.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  q.users.get('sunny@taithai.app').password = 'does-not-match-persisted-secret'; g.advance(31000);
  await assert.rejects(g.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal((await g.store.get(`siteMailboxes/${user.uid}`)).status, 'provisioning');
  assert.equal(q.requests.filter(item => item.operation === 'createUser').length, 1);
});

test('changing configured provider does not migrate a saved mailbox or send its password to another host', async () => {
  const mutableEnv = { ...env }; const f = fixture({ env: mutableEnv }); await f.service.create(user, { localPart: 'sunny' });
  Object.assign(mutableEnv, { MAIL_PROVIDER: 'purelymail', PURELYMAIL_API_TOKEN: purelyEnv.PURELYMAIL_API_TOKEN });
  assert.equal((await f.service.status(user)).ready, false);
  await assert.rejects(f.service.list(user), code('MAIL_PROVIDER_MISMATCH'));
  await assert.rejects(f.service.create(user, { localPart: 'different' }), code('MAIL_PROVIDER_MISMATCH'));
  assert.equal(f.calls.list.length, 0); assert.equal((await f.store.get(`siteMailboxes/${user.uid}`)).provider, 'migadu');
});

test('owner trial comes only from trusted verified-actor context, stays unpaid and expires without a client bypass', async () => {
  const p = purelyFixture(); const owner = { ...user, email: 'taithai5002@gmail.com' }; const contexts = [];
  const f = fixture({ env: purelyEnv, provider: p.provider, getMembership: async (id, context) => {
    contexts.push(context);
    return context.user?.uid === id && context.user.email === owner.email && context.user.email_verified === true
      ? { active: true, paid: false, ownerTrial: true, expiresAt: '2026-11-22T10:00:00Z' } : { active: false, paid: false };
  } });
  const state = await f.service.status(owner); assert.equal(state.ownerTrial, true); assert.equal(state.membership.paid, false);
  await f.service.create(owner, { localPart: 'trialbox', ownerTrial: true }); await f.service.send(owner, sendInput());
  assert.equal(f.calls.send.length, 1); assert.ok(contexts.every(item => item.user?.uid === owner.uid));
  await assert.rejects(f.service.create({ ...owner, uid: 'another', email: 'other@example.com' }, { localPart: 'another', ownerTrial: true }), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  f.advance(2 * 86400000); await assert.rejects(f.service.send(owner, sendInput('new_trial_send_after_expiry')), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  assert.equal(f.calls.send.length, 1);
});

test('expiration preserves inbox ownership and message controls while gating new sends and boxes', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' }); f.setMembership({ active: false, paid: true });
  const status = await f.service.status(user); assert.equal(status.canSend, false); assert.equal(status.canCreate, false); assert.equal(status.canManageMessages, true);
  await f.service.list(user); await f.service.message(user, { id: messageId() }); await f.service.read(user, { id: messageId(), read: true }); await f.service.trash(user, { id: messageId() });
  await assert.rejects(f.service.send(user, sendInput()), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  assert.deepEqual(await f.service.syncMembership(user.uid), { preserved: true, sendingEnabled: false });
  assert.equal((await f.store.get(`siteMailboxes/${user.uid}`)).status, 'active'); assert.deepEqual(f.calls.sending, []);
});

test('inbox outputs contain bounded inert metadata/plain text and no HTML, raw MIME, attachments or credentials', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  f.raw.html = '<script>bad</script>'; f.raw.source = Buffer.from('raw source'); f.raw.text = 't'.repeat(MAIL_LIMITS.maxReadText + 10);
  f.raw.attachments[0].content = Buffer.from('secret attachment');
  const list = await f.service.list(user); assert.equal(list.messages.length, 1); assert.equal(list.messages[0].unread, true);
  assert.equal(list.messages[0].subject.includes('<'), false); assert.equal(list.messages[0].from.includes('<'), false);
  const result = await f.service.message(user, { id: list.messages[0].id });
  assert.equal(result.message.text.length, MAIL_LIMITS.maxReadText); assert.equal(result.message.truncated, true);
  for (const key of ['html', 'source', 'headers', 'credential', 'password']) assert.equal(key in result.message, false);
  assert.equal('content' in result.message.attachments[0], false);
  assert.equal(f.calls.messages[0].credentials.address, 'sunny@taithai.app');
});

test('reply destination comes from parsed address fields, never an address-like sender display name', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  f.raw.envelope.from = [{ name: 'Friend <decoy@example.com>', address: 'real@example.org' }];
  assert.equal((await f.service.message(user, { id: messageId() })).message.replyToAddress, 'real@example.org');
  f.raw.envelope.replyTo = [{ name: 'Another <decoy@example.com>', address: 'intended@example.net' }];
  assert.equal((await f.service.message(user, { id: messageId() })).message.replyToAddress, 'intended@example.net');
  f.raw.envelope.replyTo[0].address = 'broken\r\nBcc:evil@example.com';
  assert.equal((await f.service.message(user, { id: messageId() })).message.replyToAddress, 'real@example.org');
});

test('message references bind UID validity and reject malformed command-like IDs', () => {
  assert.deepEqual(decodeMailMessageId(messageId()), { folder: 'INBOX', uidValidity: '123', uid: 42 });
  for (const value of ['42', 'm1.e30', 'm1.' + Buffer.from(JSON.stringify(['INBOX\r\nBAD', '123', 42])).toString('base64url')]) assert.throws(() => decodeMailMessageId(value), code('INVALID_MESSAGE'));
});

test('limits reject oversized pages, body text, too many recipients and header injection', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  await assert.rejects(f.service.list(user, { limit: 26 }), code('INVALID_PAGE_SIZE'));
  await assert.rejects(f.service.send(user, { ...sendInput(), to: ['friend@example.com\r\nBcc:evil@example.com'] }), code('INVALID_RECIPIENT'));
  await assert.rejects(f.service.send(user, { ...sendInput(), subject: 'Hello\r\nBcc: evil@example.com' }), code('INVALID_SUBJECT'));
  await assert.rejects(f.service.send(user, { ...sendInput(), to: Array(6).fill('friend@example.com') }), code('INVALID_RECIPIENTS'));
  await assert.rejects(f.service.send(user, { ...sendInput(), text: 'x'.repeat(MAIL_LIMITS.maxText + 1) }), code('INVALID_TEXT'));
  assert.equal(f.calls.send.length, 0);
});

test('sending uses only own sender, safe text, verified reply headers and an idempotent request', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  const input = { ...sendInput(), to: 'friend@example.com, other@example.org', from: 'victim@example.com', html: '<img src=x>',
    attachments: [{ path: '/etc/passwd' }], inReplyTo: messageId() };
  const result = await f.service.send(user, input); assert.equal(result.status, 'sent'); assert.equal(result.sentCopySaved, true);
  const sent = f.calls.send[0].message; assert.equal(sent.from, 'sunny@taithai.app'); assert.equal(sent.inReplyTo, '<original@example.com>');
  assert.deepEqual(sent.to, ['friend@example.com', 'other@example.org']); assert.equal('html' in sent, false); assert.equal('attachments' in sent, false);
  assert.deepEqual(await f.service.send(user, input), result); assert.equal(f.calls.send.length, 1);
  f.imap.message = async () => null;
  assert.deepEqual(await f.service.send(user, input), result); // A deleted original cannot invalidate a confirmed retry receipt.
  await assert.rejects(f.service.send(user, { ...input, text: 'Different content' }), code('REQUEST_ID_CONFLICT'));
});

test('partially accepted delivery identifies rejected recipients and preserves the same retry receipt', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  f.smtp.send = async (_, message) => ({ accepted: [message.to[0]], rejected: [message.to[1]], raw: Buffer.from('safe fixture') });
  const input = { ...sendInput(), to: ['good@example.com', 'bad@example.com'] };
  const result = await f.service.send(user, input);
  assert.equal(result.status, 'sent'); assert.equal(result.partial, true); assert.deepEqual(result.rejected, ['bad@example.com']);
  assert.deepEqual(await f.service.send(user, input), result);
});

test('concurrent double-send submits once and uncertain SMTP acceptance never automatically resends', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  await Promise.all([f.service.send(user, sendInput()), f.service.send(user, sendInput())]); assert.equal(f.calls.send.length, 1);
  const g = fixture(); await g.service.create(user, { localPart: 'sunny' });
  g.smtp.send = async () => { g.calls.send.push({}); throw new Error('socket lost after DATA'); };
  assert.deepEqual(await g.service.send(user, sendInput()), { status: 'uncertain' });
  assert.deepEqual(await g.service.send(user, sendInput()), { status: 'uncertain' }); assert.equal(g.calls.send.length, 1);
});

test('own immutable send receipts remain readable after expiry and provider configuration outage with zero resend', async () => {
  const mutableEnv = { ...env }; const f = fixture({ env: mutableEnv });
  await f.service.create(user, { localPart: 'sunny' }); const input = sendInput(); const sent = await f.service.send(user, input);
  f.setMembership({ active: false, paid: false }); mutableEnv.MAIL_READY = 'false'; mutableEnv.MAIL_CREDENTIAL_SECRET = '';
  assert.deepEqual(await f.service.send(user, input), sent); assert.equal(f.calls.send.length, 1);
  await assert.rejects(f.service.send(user, { ...input, text: 'Changed' }), code('REQUEST_ID_CONFLICT'));
  await assert.rejects(f.service.send({ ...user, uid: 'other_member' }, input), code('MAIL_NOT_CONFIGURED'));
  await assert.rejects(f.service.send(user, sendInput('a_different_request_id')), code('MAIL_NOT_CONFIGURED'));
  await assert.rejects(f.service.send(user, { ...input, mailbox: 'other_member' }), code('MAILBOX_NOT_FOUND'));
  mutableEnv.MAIL_READY = 'true'; mutableEnv.MAIL_CREDENTIAL_SECRET = env.MAIL_CREDENTIAL_SECRET;
  await assert.rejects(f.service.send(user, sendInput('a_different_request_id')), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  const g = fixture(); await g.service.create(user, { localPart: 'sunny' });
  g.smtp.send = async () => { g.calls.send.push({}); throw new Error('uncertain'); };
  await g.service.send(user, input); g.setMembership({ active: false, paid: false });
  assert.deepEqual(await g.service.send(user, input), { status: 'uncertain' }); assert.equal(g.calls.send.length, 1);
});

test('daily send limits are transactional and Sent-copy failure does not duplicate delivered email', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'sunny' });
  f.imap.appendSent = async () => { throw new Error('Sent folder unavailable'); };
  for (let i = 0; i < MAIL_LIMITS.dailyMessages; i++) {
    const result = await f.service.send(user, sendInput(`request_number_${String(i).padStart(4, '0')}`));
    assert.equal(result.status, 'sent'); assert.equal(result.sentCopySaved, false);
  }
  await assert.rejects(f.service.send(user, sendInput('request_number_over_limit')), code('MAIL_DAILY_LIMIT'));
  assert.equal(f.calls.send.length, MAIL_LIMITS.dailyMessages);
});

test('Migadu adapter uses fixed HTTPS Basic-auth API, correct provisioning flags and redacts provider errors', async () => {
  const calls = []; const provider = createMigaduProvider({ env, fetchImpl: async (url, options) => {
    calls.push({ url, options }); return new Response(JSON.stringify({ name: 'box' }), { status: 200 });
  } });
  await provider.createMailbox({ localPart: 'sunny', password: 'secret-generated', marker: 'marker' });
  assert.equal(calls[0].url, 'https://api.migadu.com/v1/domains/taithai.app/mailboxes');
  const body = JSON.parse(calls[0].options.body); assert.equal(body.may_receive, true); assert.equal(body.wildcard_sender, false); assert.equal(body.remove_upon_expiry, false);
  assert.equal(calls[0].options.redirect, 'error'); assert.match(calls[0].options.headers.Authorization, /^Basic /);
  const broken = createMigaduProvider({ env, fetchImpl: async () => new Response('{"error":"my-secret-password"}', { status: 401 }) });
  await assert.rejects(broken.findMailbox('sunny'), error => error.code === 'MAIL_PROVIDER_UNAVAILABLE' && !String(error).includes('my-secret-password'));
  const missing = createMigaduProvider({ env, fetchImpl: async () => new Response('{"error":"mailbox_not_found"}', { status: 400 }) });
  assert.equal(await missing.findMailbox('sunny'), null);
});

test('provider readiness requires authenticated exact-domain GET and all documented Boolean capabilities', async () => {
  const calls = [];
  const provider = createMigaduProvider({ env, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ name: 'taithai.app', can_send: true, can_receive: true, can_access: true }));
  } });
  assert.equal(await provider.assertReady(), true);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.migadu.com/v1/domains/taithai.app');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error');
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  for (const domain of [{}, { name: 'elsewhere.app', can_send: true, can_receive: true, can_access: true },
    { name: 'taithai.app', can_send: 'true', can_receive: true, can_access: true },
    { name: 'taithai.app', can_send: true, can_receive: false, can_access: true },
    { name: 'taithai.app', can_send: true, can_receive: true },
    { name: 'taithai.app', may_send: true, may_receive: true, may_access_imap: true },
    { name: 'taithai.app', diagnostics: { success: true }, state: 'active' }]) {
    const blocked = createMigaduProvider({ env, fetchImpl: async () => new Response(JSON.stringify(domain)) });
    await assert.rejects(blocked.assertReady(), code('MAIL_PROVIDER_NOT_READY'));
  }
});

test('provider readiness rejects bad credentials, missing domain, invalid JSON and oversized replies without provider detail', async () => {
  for (const response of [new Response('{"secret":"not-for-the-client"}', { status: 401 }),
    new Response('{"error":"domain_not_found"}', { status: 404 }), new Response('<html>not json</html>'),
    new Response('x'.repeat(65537))]) {
    const provider = createMigaduProvider({ env, fetchImpl: async () => response });
    await assert.rejects(provider.assertReady(), error => error instanceof MailError && error.status === 503 && !String(error).includes('not-for-the-client'));
  }
});

test('Purelymail readiness requires exact owned nonshared domain, symbolic addressing off and every DNS summary Boolean', async () => {
  const p = purelyFixture(); assert.equal(await p.provider.assertReady(), true);
  const call = p.requests[0]; assert.equal(call.url, 'https://purelymail.com/api/v0/listDomains'); assert.deepEqual(call.input, { includeShared: false });
  for (const invalid of [{ isShared: true }, { name: 'other.app' }, { symbolicSubaddressing: true }, { symbolicSubaddressing: undefined },
    ...['passesMx','passesSpf','passesDkim','passesDmarc'].map(key => ({ dnsSummary: { ...p.domain.dnsSummary, [key]: false } }))]) {
    const provider = createPurelymailProvider({ env: purelyEnv, fetchImpl: async () => new Response(JSON.stringify({ result: { domains: [{ ...p.domain, ...invalid }] } })) });
    await assert.rejects(provider.assertReady(), code('MAIL_PROVIDER_NOT_READY'));
  }
});

test('Purelymail API errors/unknown schemas are redacted and capped lists cannot establish a missing mailbox', async () => {
  for (const response of [new Response('{"error":{"message":"secret token leaked"}}'),new Response('{"result":null}'),
    new Response('{"domains":[]}'),new Response('x'.repeat(65537)),new Response('denied', { status: 401 })]) {
    const provider = createPurelymailProvider({ env: purelyEnv, fetchImpl: async () => response });
    await assert.rejects(provider.assertReady(), error => error instanceof MailError && error.status === 503 && !String(error).includes('secret token leaked'));
  }
  const capped = createPurelymailProvider({ env: purelyEnv, fetchImpl: async () => new Response(JSON.stringify({ result: { users: Array.from({length:1000},(_,i) => `user${i}@taithai.app`) } })) });
  await assert.rejects(capped.findMailbox('sunny'), code('MAIL_PROVIDER_CAPACITY_REVIEW'));
});

test('Purelymail credential proof opens only the correct TLS host without reading messages; mismatch fails before connect', async () => {
  const connections = [];
  class ProofImap {
    constructor(options) { this.options = options; connections.push(options); }
    on() {} async connect() { if (this.options.auth.pass === 'wrong') throw Object.assign(Error('authentication refused'), { authenticationFailed: true }); }
    async logout() {} close() {}
    async list() { throw new Error('Proof must not list messages'); }
    async fetchOne() { throw new Error('Proof must not read messages'); }
  }
  const transports = [];
  const { imap, smtp } = createMailProtocolAdapters({ env: purelyEnv, ImapFlow: ProofImap, simpleParser() {}, createTransport(options) {
    transports.push(options); return { async sendMail(message) { return options.streamTransport ? { message: Buffer.from('safe fixture') } : { accepted: message.envelope.to }; }, close() {} };
  } });
  const credentials = { provider: 'purelymail', address: 'sunny@taithai.app', password: 'right' };
  assert.equal(await imap.verifyCredentials(credentials), true); assert.equal(await imap.verifyCredentials({ ...credentials, password: 'wrong' }), false);
  assert.equal(connections[0].host, 'imap.purelymail.com'); assert.equal(connections[0].port, 993); assert.equal(connections[0].secure, true);
  await assert.rejects(imap.verifyCredentials({ ...credentials, provider: 'migadu' }), code('MAIL_PROVIDER_MISMATCH'));
  await assert.rejects(imap.verifyCredentials({ ...credentials, provider: 'constructor' }), code('MAIL_PROVIDER_MISMATCH'));
  assert.equal(connections.length, 2);
  await smtp.send(credentials, { from: credentials.address, to: ['friend@example.com'], subject: 'Fixture', text: 'safe text', messageId: '<fixture@taithai.app>' });
  assert.equal(transports[1].host, 'smtp.purelymail.com'); assert.equal(transports[1].port, 465);
  await assert.rejects(smtp.send(credentials, { from: 'other@taithai.app' }), code('INVALID_SENDER'));
});

test('real IMAP adapter enforces TLS, UID validity, bounded retrieval and connection cleanup without network', async () => {
  const options = []; const events = []; const ref = { folder: 'INBOX', uid: 42, uidValidity: '123' };
  class FakeImap {
    constructor(opts) { options.push(opts); this.mailbox = { uidValidity: 123n, exists: 1 }; }
    on() {} async connect() { events.push('connect'); } async logout() { events.push('logout'); } close() {}
    async list() { return [{ path: 'INBOX', name: 'Inbox', flags: new Set() }]; }
    async getMailboxLock() { return { release() { events.push('release'); } }; }
    async fetchOne(id, query, opts) { assert.equal(opts.uid, true); return { uid: id, envelope: {}, flags: new Set(), bodyStructure: { type: 'text/plain', part: '1', size: 10 } }; }
    async download(id, part, opts) { assert.equal(opts.maxBytes, MAIL_LIMITS.maxBodyBytes); return { content: (async function* () { yield Buffer.from('Safe body'); })() }; }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: FakeImap, createTransport() {}, simpleParser() {} });
  assert.equal((await imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, ref)).text, 'Safe body');
  assert.equal(options[0].host, 'imap.migadu.com'); assert.equal(options[0].secure, true); assert.equal(options[0].tls.rejectUnauthorized, true); assert.equal(options[0].logger, false);
  assert.deepEqual(events, ['connect', 'release', 'logout']);
  await assert.rejects(imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, { ...ref, uidValidity: '999' }), code('MAILBOX_CHANGED'));
  assert.deepEqual(events.slice(-3), ['connect', 'release', 'logout']);
});

test('real SMTP adapter fixes sender/envelope and prevents URL/file access with TLS and no logging', async () => {
  const options = []; const sent = [];
  const { smtp } = createMailProtocolAdapters({ ImapFlow() {}, simpleParser() {}, createTransport(opts) {
    options.push(opts); return { async sendMail(value) { sent.push(value); return opts.streamTransport ? { message: Buffer.from('compiled safely') } : { accepted: ['friend@example.com'] }; }, close() {} };
  } });
  const credentials = { address: 'sunny@taithai.app', password: 'fixture' };
  await smtp.send(credentials, { from: credentials.address, to: ['friend@example.com'], subject: 'Hello', text: 'Safe text', messageId: '<fixture@taithai.app>' });
  assert.equal(options[1].host, 'smtp.migadu.com'); assert.equal(options[1].port, 465); assert.equal(options[1].secure, true);
  assert.equal(options[1].disableUrlAccess, true); assert.equal(options[1].disableFileAccess, true); assert.equal(options[1].debug, false);
  assert.deepEqual(sent[1].envelope, { from: credentials.address, to: ['friend@example.com'] });
  await assert.rejects(smtp.send(credentials, { from: 'victim@example.com' }), code('INVALID_SENDER'));
});

test('HTML-only mail becomes inert text without scripts, image elements or tracking-pixel URLs', async () => {
  const { simpleParser } = await import('mailparser');
  class HtmlImap {
    constructor() { this.mailbox = { uidValidity: 123n }; }
    on() {} async connect() {} async logout() {} close() {}
    async list() { return [{ path: 'INBOX', flags: new Set() }]; }
    async getMailboxLock() { return { release() {} }; }
    async fetchOne() { return { uid: 42, envelope: {}, bodyStructure: { type: 'text/html', part: '1' } }; }
    async download() { return { content: (async function* () { yield Buffer.from('<html><script>attack()</script><p>Hello <b>friend</b></p><img src="https://no-network.invalid/track"></html>'); })() }; }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: HtmlImap, simpleParser, createTransport() {} });
  const result = await imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, decodeMailMessageId(messageId()));
  assert.match(result.text, /Hello friend/); assert.equal(result.text.includes('<script>'), false); assert.equal(result.text.includes('attack()'), false);
  assert.equal('html' in result, false); assert.equal(result.text.includes('<img'), false); assert.equal(result.text.includes('no-network.invalid'), false);
});

test('HTML verification preserves case-sensitive OTPs and exact actionable URLs while dropping tracking/hidden content', () => {
  const url = 'https://accounts.example.org/Verify?token=AbC%2B%2F%3D&mode=verifyEmail#CaseSensitive';
  const text = readableMailHtml(`<html><head><style>.x{background:url(https://tracker.invalid/css)}</style><script>evil()</script></head><body>
    <h2>AbC729</h2><p>รหัสยืนยันบัญชี</p><a style="padding:12px;background:#000" href="${url.replaceAll('&','&amp;')}"><span style="color:white">Verify email</span></a>.
    <img style="display:block" src="https://tracker.invalid/pixel?secret=abc" alt="tracking image">
    <div hidden>Hidden bait</div><p style="DISPLAY : none !important">Hidden preview</p><span aria-hidden="TRUE">Hidden duplicate</span>
    <iframe src="https://tracker.invalid/frame">Hidden frame</iframe></body></html>`);
  assert.match(text, /AbC729/); assert.equal(text.includes('ABC729'), false); assert.match(text, /รหัสยืนยันบัญชี/);
  assert.match(text, /Verify email/); assert.ok(text.split('\n').includes(url));
  for (const removed of ['tracker.invalid','Hidden bait','Hidden preview','Hidden duplicate','Hidden frame','evil()','tracking image']) assert.equal(text.includes(removed), false, removed);
});

test('HTML links allow HTTP(S) only, reject credential/unsafe/relative destinations and never guess an email origin', () => {
  const text = readableMailHtml(`<p><a href="jav&#x61;script:alert(1)">Script</a><a href="data:text/html,bad">Data</a>
    <a href="file:///private/secret">File</a><a href="https://user:password@example.org/verify">Credential</a>
    <a href="/relative-verification">Relative</a><a href="//accounts.example.org/verify?t=a%2Bb">Protocol relative</a>
    <a href="https://accounts.example.org/verify?t=One%26Two&amp;x=Case">Good</a></p>`);
  for (const removed of ['javascript:','data:text','file:','password@','/relative-verification']) assert.equal(text.includes(removed), false, removed);
  assert.ok(text.split('\n').includes('https://accounts.example.org/verify?t=a%2Bb'));
  assert.ok(text.split('\n').includes('https://accounts.example.org/verify?t=One%26Two&x=Case'));
});

test('HTML conversion bounds source size, nesting and node count before parsing', () => {
  assert.throws(() => readableMailHtml('x'.repeat(MAIL_LIMITS.maxBodyBytes + 1)), code('MESSAGE_TOO_LARGE'));
  assert.throws(() => readableMailHtml('<div>'.repeat(65) + 'hidden deep token' + '</div>'.repeat(65)), code('MESSAGE_TOO_LARGE'));
  assert.throws(() => readableMailHtml('<br>'.repeat(10001)), code('MESSAGE_TOO_LARGE'));
});

test('an empty plain alternative falls back to the HTML verification part within one aggregate byte budget', async () => {
  const downloads = [];
  class AlternativeImap {
    constructor() { this.mailbox = { uidValidity: 123n }; }
    on() {} async connect() {} async logout() {} close() {}
    async list() { return [{ path: 'INBOX', flags: new Set() }]; }
    async getMailboxLock() { return { release() {} }; }
    async fetchOne() { return { uid: 42, envelope: {}, bodyStructure: { type: 'multipart/alternative', childNodes: [{ type: 'text/plain', part: '1' },{ type: 'text/html', part: '2' }] } }; }
    async download(id, part, options) {
      downloads.push({ part, options });
      const content = part === '1' ? ' \r\n' : '<p>Code: aBc123</p><a href="https://signup.example.org/verify?code=X%2BY">Confirm</a>';
      return { meta: { charset: 'utf-8' }, content: (async function* () { yield Buffer.from(content); })() };
    }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: AlternativeImap, simpleParser() {}, createTransport() {} });
  const result = await imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, decodeMailMessageId(messageId()));
  assert.match(result.text, /aBc123/); assert.ok(result.text.split('\n').includes('https://signup.example.org/verify?code=X%2BY'));
  assert.deepEqual(downloads.map(item => item.part), ['1','2']); assert.equal(downloads[0].options.decodeText, true);
  assert.equal(downloads[1].options.maxBytes, MAIL_LIMITS.maxBodyBytes - 3);
});

test('reported Western/Thai non-UTF8 parts decode through the real MIME parser and converted UTF8 is not decoded twice', async () => {
  const { simpleParser } = await import('mailparser'); let converted = false; let thai = false;
  class CharsetImap {
    constructor() { this.mailbox = { uidValidity: 123n }; }
    on() {} async connect() {} async logout() {} close() {}
    async list() { return [{ path: 'INBOX', flags: new Set() }]; }
    async getMailboxLock() { return { release() {} }; }
    async fetchOne() { return { uid: 42, envelope: {}, bodyStructure: { type: 'text/html', part: '1', parameters: { charset: 'windows-1252' } } }; }
    async download(id, part, options) {
      assert.equal(options.decodeText, true);
      if (thai) return { meta: { charset: 'windows-874' }, content: (async function* () {
        yield Buffer.concat([Buffer.from('<p>'),Buffer.from([0xc3,0xcb,0xd1,0xca]),Buffer.from(': AbC729</p>')]);
      })() };
      const value = '<p>Café: aBc729</p><a href="https://example.org/verify?token=Exact%2BCase">Confirmer</a>';
      return { meta: { charset: converted ? 'utf-8' : 'windows-1252' }, content: (async function* () { yield Buffer.from(value, converted ? 'utf8' : 'latin1'); })() };
    }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: CharsetImap, simpleParser, createTransport() {} });
  for (const mode of [false,true]) {
    converted = mode;
    const result = await imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, decodeMailMessageId(messageId()));
    assert.match(result.text, /Café: aBc729/); assert.equal(result.text.includes('CafÃ'), false);
    assert.ok(result.text.split('\n').includes('https://example.org/verify?token=Exact%2BCase'));
  }
  thai = true;
  const thaiResult = await imap.message({ address: 'sunny@taithai.app', password: 'fixture' }, decodeMailMessageId(messageId()));
  assert.match(thaiResult.text, /รหัส: AbC729/);
});

test('trash refuses a provider capability fallback that could expunge unrelated messages', async () => {
  let moved = false;
  class UnsafeImap {
    constructor() { this.mailbox = { uidValidity: 123n }; this.capabilities = new Map(); }
    on() {} async connect() {} async logout() {} close() {}
    async list() { return [{ path: 'INBOX', flags: new Set() }, { path: 'Trash', flags: new Set(), specialUse: '\\Trash' }]; }
    async getMailboxLock() { return { release() {} }; }
    async fetchOne() { return { uid: 42 }; }
    async messageMove() { moved = true; return true; }
  }
  const { imap } = createMailProtocolAdapters({ ImapFlow: UnsafeImap, simpleParser() {}, createTransport() {} });
  await assert.rejects(imap.trash({ address: 'sunny@taithai.app', password: 'fixture' }, decodeMailMessageId(messageId())), code('MAIL_ACTION_UNAVAILABLE'));
  assert.equal(moved, false);
});

test('Hostinger configuration/factory bind explicit order, management token and official TLS routing', async () => {
  assert.equal(mailConfiguration(hostingerEnv).ready, true); assert.equal(createMailProvider({ env: hostingerEnv }).id, 'hostinger');
  assert.deepEqual(mailConfiguration(hostingerEnv).expectedMxHosts, ['mx1.hostinger.com','mx2.hostinger.com']);
  for (const invalid of [{ HOSTINGER_API_TOKEN: '' }, { HOSTINGER_API_TOKEN: 'bad\r\nheader' }, { HOSTINGER_MAIL_ORDER_ID: '' }, { HOSTINGER_MAIL_ORDER_ID: '../other' }]) {
    assert.equal(mailConfiguration({ ...hostingerEnv, ...invalid }).ready, false);
  }
  const connections = []; const transports = [];
  class ProofImap { constructor(value) { connections.push(value); } on() {} async connect() {} async logout() {} close() {} }
  const { imap, smtp } = createMailProtocolAdapters({ env: hostingerEnv, ImapFlow: ProofImap, simpleParser() {}, createTransport(options) {
    transports.push(options); return { async sendMail(message) { return options.streamTransport ? { message: Buffer.from('fixture') } : { accepted: message.envelope.to }; }, close() {} };
  } });
  const credentials = { provider: 'hostinger', address: 'sunny@taithai.app', password: 'server-only' };
  assert.equal(await imap.verifyCredentials(credentials), true); assert.equal(connections[0].host, 'imap.hostinger.com'); assert.equal(connections[0].port, 993);
  await smtp.send(credentials, { from: credentials.address, to: ['friend@example.com'], subject: 'Fixture', text: 'plain', messageId: '<fixture@taithai.app>' });
  assert.equal(transports[1].host, 'smtp.hostinger.com'); assert.equal(transports[1].port, 465);
  await assert.rejects(imap.verifyCredentials({ ...credentials, provider: 'purelymail' }), code('MAIL_PROVIDER_MISMATCH')); assert.equal(connections.length, 1);
});

test('Hostinger readiness validates the exact active purchased order, expiry and IMAP/SMTP-compatible plan', async () => {
  const p = hostingerFixture(); assert.equal(await p.provider.assertReady(), true);
  for (const invalid of [{ id: 'OR_other' }, { status: 'suspended' }, { domain: { name: 'other.app' } }, { seats: 0 }, { seats: '5' }, { expires_at: '2020-01-01T00:00:00Z' }, { expires_at: undefined }]) {
    const q = hostingerFixture(); Object.assign(q.order, invalid); await assert.rejects(q.provider.assertReady(), code('MAIL_PROVIDER_NOT_READY'));
  }
  for (const invalid of [{ domain: { mailbox_quota: 5, is_imap_enabled: false } }, { mailbox: { max_outbound_recipient_limit: 1, max_outbound_message_size: 25000000 } }, { mailbox: { max_outbound_recipient_limit: 50, max_outbound_message_size: 100 } }]) {
    const q = hostingerFixture(); Object.assign(q.plan, invalid); await assert.rejects(q.provider.assertReady(), code('MAIL_PROVIDER_NOT_READY'));
  }
  assert.equal(p.requests.every(item => item.options.method === 'GET'), true);
});

test('Hostinger inventory counts purchased seats and all mailboxes, refuses capacity without a purchase operation', async () => {
  const p = hostingerFixture(); p.order.seats = 2; p.plan.domain.mailbox_quota = 10;
  p.boxes.set('existing@taithai.app', { resource: p.resource('existing'), password: 'foreign' });
  assert.deepEqual(await p.provider.inventory(), { provider: 'hostinger', orderId: hostingerEnv.HOSTINGER_MAIL_ORDER_ID, capacity: 2, purchasedSeats: 2, used: 1, available: 1, isTrial: false });
  assert.equal(await p.provider.assertCapacity(1), true); await assert.rejects(p.provider.assertCapacity(2), code('MAIL_PROVIDER_CAPACITY_REACHED'));
  p.plan.domain.mailbox_quota = 1; await assert.rejects(p.provider.assertCapacity(1), code('MAIL_PROVIDER_CAPACITY_REACHED'));
  await assert.rejects(p.provider.createMailbox({ localPart: 'sunny', password: 'secret' }), code('MAIL_PROVIDER_CAPACITY_REACHED'));
  assert.equal(p.requests.every(item => item.options.method === 'GET'), true);
});

test('Hostinger pagination is complete, bounded and fail-closed for drift, duplicates and malformed schemas', async () => {
  const p = hostingerFixture(); p.order.seats = 150; p.plan.domain.mailbox_quota = 150;
  for (let i = 0; i < 101; i++) p.boxes.set(`person${i}@taithai.app`, { resource: p.resource(`person${i}`, i) });
  assert.equal((await p.provider.inventory()).used, 101);
  assert.equal(p.requests.filter(item => new URL(item.url).pathname.endsWith('/mailboxes')).length, 5);
  for (const mutate of [body => ({ ...body, meta: { ...body.meta, total: 1001 } }), body => ({ ...body, meta: { ...body.meta, current_page: 8 } }), body => ({ ...body, meta: undefined })]) {
    const q = hostingerFixture(); q.mutateResponse(body => body.meta ? mutate(body) : body); await assert.rejects(q.provider.inventory(), code('MAIL_PROVIDER_CAPACITY_REVIEW'));
  }
  const q = hostingerFixture(); q.boxes.set('one@taithai.app', { resource: q.resource('one', 1) }); q.boxes.set('two@taithai.app', { resource: q.resource('two', 1) });
  await assert.rejects(q.provider.inventory(), code('MAIL_PROVIDER_CAPACITY_REVIEW'));
  const bad = createHostingerProvider({ env: hostingerEnv, fetchImpl: async () => new Response('private provider secret failure', { status: 401 }) });
  await assert.rejects(bad.assertReady(), error => error.code === 'MAIL_PROVIDER_UNAVAILABLE' && !error.message.includes('private'));
});

test('Hostinger creates the official mailbox schema with a strong encrypted secret and proves ownership before activation', async () => {
  const p = hostingerFixture(); const f = fixture({ env: hostingerEnv, provider: p.provider });
  const result = await f.service.create(user, { localPart: 'sunny', requestId: 'create_hostinger_0001' });
  const posted = p.requests.filter(item => item.options.method === 'POST'); assert.equal(posted.length, 1);
  assert.deepEqual(Object.keys(posted[0].input).sort(), ['local_part','password']);
  const password = posted[0].input.password; assert.equal(password.length, 47); assert.match(password, /[a-z]/); assert.match(password, /[A-Z]/); assert.match(password, /\d/); assert.match(password, /[^a-z0-9]/i);
  assert.equal(result.createdMailbox.address, 'sunny@taithai.app'); assert.equal(result.mailbox.provider, 'hostinger'); assert.equal(result.canSend, true);
  const record = await f.store.get(`siteMailboxes/${user.uid}`); assert.equal(record.provider, 'hostinger'); assert.equal(decryptMailboxCredential(record, { env: hostingerEnv }), password);
  assert.equal(JSON.stringify(result).includes(password), false); assert.equal(JSON.stringify(result).includes('credential'), false); assert.equal(p.probes.length, 1);
  assert.equal(p.requests.some(item => /upgrade|checkout|password|delete/.test(new URL(item.url).pathname)), false);
});

test('Hostinger unknown-create recovery proves only the persisted password and never resets or adopts a foreign mailbox', async () => {
  const p = hostingerFixture(); p.loseCreateResponse(); const f = fixture({ env: hostingerEnv, provider: p.provider });
  await assert.rejects(f.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.ok((await f.store.get(`siteMailboxes/${user.uid}`)).creationAttemptedAt); f.advance(31000);
  assert.equal((await f.service.create(user, { localPart: 'sunny' })).createdMailbox.status, 'active');
  assert.equal(p.requests.filter(item => item.options.method === 'POST').length, 1);
  const q = hostingerFixture(); q.boxes.set('sunny@taithai.app', { resource: q.resource('sunny'), password: 'foreign' });
  const g = fixture({ env: hostingerEnv, provider: q.provider }); await assert.rejects(g.service.create(user, { localPart: 'sunny' }), code('ADDRESS_UNAVAILABLE'));
  assert.equal(q.probes.length, 0); assert.equal(q.requests.some(item => item.options.method === 'POST'), false);
  const r = hostingerFixture(); r.loseCreateResponse(); const h = fixture({ env: hostingerEnv, provider: r.provider });
  await assert.rejects(h.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  r.boxes.get('sunny@taithai.app').password = 'foreign'; h.advance(31000);
  await assert.rejects(h.service.create(user, { localPart: 'sunny' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(r.requests.filter(item => item.options.method === 'POST').length, 1);
});

test('trusted paid quantity allows two isolated mailboxes and rejects client quantity or foreign mailbox selection', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const first = (await f.service.create(user, { localPart: 'sunny', requestId: 'first_box_create_0001' })).createdMailbox;
  const second = (await f.service.create(user, { localPart: 'second', requestId: 'second_box_create_0001' })).createdMailbox;
  assert.equal(first.id, user.uid); assert.match(second.id, /^mbx_/); assert.notEqual(first.id, second.id);
  const status = await f.service.status(user); assert.equal(status.mailboxCapacity, 2); assert.equal(status.mailboxUsed, 2); assert.equal(status.canCreate, false); assert.equal(status.mailboxes.length, 2);
  await assert.rejects(f.service.create(user, { localPart: 'third', quantity: 20, mailboxes: 20 }), code('MAILBOX_CAPACITY_REACHED'));
  await assert.rejects(f.service.list(user), code('MAILBOX_SELECTION_REQUIRED'));
  await f.service.list(user, { mailbox: second.id }); assert.equal(f.calls.list[0].credentials.address, 'second@taithai.app');
  await assert.rejects(f.service.list({ ...user, uid: 'another_member' }, { mailbox: second.id }), code('MAILBOX_NOT_FOUND'));
  await assert.rejects(f.service.list(user, { mailbox: second.id, mailboxId: first.id }), code('MAILBOX_NOT_FOUND'));
  await f.service.send(user, { ...sendInput(), mailbox: second.id }); assert.equal(f.calls.send[0].message.from, 'second@taithai.app');
  const extra = await f.store.get(`siteMailAccounts/${second.id}`); assert.equal(extra.uid, user.uid); assert.equal(extra.id, second.id); assert.equal(JSON.stringify(status).includes('ciphertext'), false);
});

test('concurrent mailbox creates cannot exceed purchased quantity or reuse one creation request for another name', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const results = await Promise.allSettled(['first','second','third'].map((localPart, i) => f.service.create(user, { localPart, requestId: `concurrent_create_${i}` })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 2); assert.equal(f.calls.create.length, 2); assert.equal((await f.service.status(user)).mailboxUsed, 2);
  const g = fixture(); g.setMembership({ active: true, paid: true, mailboxes: 2 });
  await g.service.create(user, { localPart: 'first', requestId: 'immutable_create_001' });
  await assert.rejects(g.service.create(user, { localPart: 'second', requestId: 'immutable_create_001' }), code('REQUEST_ID_CONFLICT'));
  assert.equal(g.calls.create.length, 1);
});

test('downgraded excess mailboxes remain readable and manageable, with stable oldest paid allocation and no deletion', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const first = (await f.service.create(user, { localPart: 'first' })).createdMailbox;
  const second = (await f.service.create(user, { localPart: 'second' })).createdMailbox;
  f.setMembership({ active: true, paid: true, mailboxes: 1 });
  const status = await f.service.status(user); assert.equal(status.mailboxUsed, 2); assert.equal(status.mailboxCapacity, 1);
  assert.equal(status.mailboxes[0].canSend, true); assert.equal(status.mailboxes[1].canSend, false); assert.equal(status.mailboxes[1].archived, true); assert.equal(status.mailboxes[1].canManageMessages, true);
  const page = await f.service.list(user, { mailbox: second.id }); const id = page.messages[0].id;
  await f.service.message(user, { mailbox: second.id, id }); await f.service.read(user, { mailbox: second.id, id, read: true }); await f.service.trash(user, { mailbox: second.id, id });
  await assert.rejects(f.service.send(user, { ...sendInput(), mailbox: second.id }), code('MAILBOX_NOT_ENTITLED'));
  await f.service.send(user, { ...sendInput('paid_first_mailbox_send'), mailbox: first.id });
  assert.equal(f.calls.send.length, 1); assert.equal((await f.store.get(`siteMailAccounts/${second.id}`)).status, 'active'); assert.deepEqual(f.calls.sending, []);
  f.setMembership({ active: true, paid: true, mailboxes: 2 }); assert.equal((await f.service.status(user)).mailboxes[1].canSend, true);
});

test('message IDs and cursors bind the selected mailbox, rejecting cross-box actions before IMAP', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const first = (await f.service.create(user, { localPart: 'first' })).createdMailbox; const second = (await f.service.create(user, { localPart: 'second' })).createdMailbox;
  f.imap.list = async () => ({ uidValidity: '123', messages: [f.raw], nextCursor: 'provider-cursor' });
  const page = await f.service.list(user, { mailbox: first.id }); const id = page.messages[0].id; assert.equal(decodeMailMessageId(id).mailboxId, first.id);
  await assert.rejects(f.service.message(user, { mailbox: second.id, id }), code('INVALID_MESSAGE'));
  await assert.rejects(f.service.read(user, { mailbox: second.id, id, read: true }), code('INVALID_MESSAGE'));
  await assert.rejects(f.service.trash(user, { mailbox: second.id, id }), code('INVALID_MESSAGE'));
  await assert.rejects(f.service.send(user, { ...sendInput(), mailbox: second.id, inReplyTo: id }), code('INVALID_MESSAGE'));
  await assert.rejects(f.service.message(user, { mailbox: first.id, id: messageId() }), code('INVALID_MESSAGE'));
  await assert.rejects(f.service.list(user, { mailbox: second.id, cursor: page.nextCursor }), code('INVALID_CURSOR'));
  assert.equal(f.calls.messages.length, 0); assert.equal(f.calls.read.length, 0); assert.equal(f.calls.trash.length, 0); assert.equal(f.calls.send.length, 0);
});

test('send receipt cannot be reused under another mailbox, remains readable after downgrade and quotas are per mailbox', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const first = (await f.service.create(user, { localPart: 'first' })).createdMailbox; const second = (await f.service.create(user, { localPart: 'second' })).createdMailbox;
  const input = { ...sendInput(), mailbox: second.id }; const sent = await f.service.send(user, input);
  await assert.rejects(f.service.send(user, { ...input, mailbox: first.id }), code('MAILBOX_NOT_FOUND'));
  f.setMembership({ active: true, paid: true, mailboxes: 1 }); assert.deepEqual(await f.service.send(user, input), sent); assert.equal(f.calls.send.length, 1);
  f.setMembership({ active: true, paid: true, mailboxes: 2 });
  for (let i = 1; i < 20; i++) await f.service.send(user, { ...sendInput(`second_box_send_${i.toString().padStart(4, '0')}`), mailbox: second.id });
  await assert.rejects(f.service.send(user, { ...sendInput('second_box_over_daily'), mailbox: second.id }), code('MAIL_DAILY_LIMIT'));
  await f.service.send(user, { ...sendInput('first_box_still_has_quota'), mailbox: first.id }); assert.equal(f.calls.send.length, 21);
});

test('legacy mailbox gains an index without copying or replacing ciphertext when adding a paid second mailbox', async () => {
  const f = fixture(); await f.service.create(user, { localPart: 'first' }); const legacy = await f.store.get(`siteMailboxes/${user.uid}`);
  f.store.docs.delete(`siteMailUserAccounts/${user.uid}`); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  const second = (await f.service.create(user, { localPart: 'second' })).createdMailbox;
  assert.deepEqual((await f.store.get(`siteMailUserAccounts/${user.uid}`)).mailboxIds, [user.uid, second.id]);
  assert.deepEqual((await f.store.get(`siteMailboxes/${user.uid}`)).credential, legacy.credential);
  assert.equal(await f.store.get(`siteMailAccounts/${user.uid}`), undefined);
});

test('Hostinger trusted owner trial can exercise two purchased seats without becoming paid or accepting client capacity', async () => {
  const p = hostingerFixture(); const owner = { ...user, email: 'taithai5002@gmail.com' }; let quantity = 2;
  const reservations = [];
  const f = fixture({ env: hostingerEnv, provider: p.provider, reserveTrialCapacity: async input => { reservations.push(input); return true; }, getMembership: async (id, context) =>
    context.user?.uid === id && context.user.email === owner.email && context.user.email_verified === true
      ? { active: true, paid: false, ownerTrial: true, expiresAt: '2026-11-22T10:00:00Z', mailboxes: quantity } : { active: false, paid: false } });
  const first = (await f.service.create(owner, { localPart: 'first' })).createdMailbox; await f.service.create(owner, { localPart: 'second' });
  const status = await f.service.status(owner); assert.equal(status.ownerTrial, true); assert.equal(status.membership.paid, false); assert.equal(status.mailboxCapacity, 2);
  assert.equal(reservations.length, 2); assert.ok(reservations.every(input => input.user === owner && input.quantity === 2));
  await assert.rejects(f.service.create(owner, { localPart: 'third', mailboxes: 20 }), code('MAILBOX_CAPACITY_REACHED'));
  quantity = 20; await assert.rejects(f.service.send(owner, { ...sendInput(), mailbox: first.id }), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  quantity = 2; f.advance(2 * 86400000); await assert.rejects(f.service.send(owner, { ...sendInput(), mailbox: first.id }), code('ACTIVE_MEMBERSHIP_REQUIRED'));
  await f.service.list(owner, { mailbox: first.id }); assert.equal(f.calls.send.length, 0);
});

test('a paid twenty-mailbox plan can provision its full quantity within the account creation rate limit', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 20 });
  for (let i = 0; i < 20; i++) await f.service.create(user, { localPart: `mailbox${i}` });
  const status = await f.service.status(user); assert.equal(status.mailboxCapacity, 20); assert.equal(status.mailboxUsed, 20); assert.equal(status.canCreate, false); assert.equal(f.calls.create.length, 20);
  await assert.rejects(f.service.create(user, { localPart: 'mailboxlast' }), code('MAILBOX_CAPACITY_REACHED'));
  const p = hostingerFixture(); p.order.seats = 30; p.plan.domain.mailbox_quota = 30;
  assert.equal(await p.provider.assertCapacity(25), true); await assert.rejects(p.provider.assertCapacity(31), code('MAIL_PROVIDER_CAPACITY_REACHED'));
});

test('creation binds fresh idempotency IDs even when returning an existing active mailbox, and false capacity never provisions', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 2 });
  await f.service.create(user, { localPart: 'first' });
  await f.service.create(user, { localPart: 'first', requestId: 'fresh_active_receipt_id' });
  await assert.rejects(f.service.create(user, { localPart: 'second', requestId: 'fresh_active_receipt_id' }), code('REQUEST_ID_CONFLICT')); assert.equal(f.calls.create.length, 1);
  const g = fixture(); g.provider.assertCapacity = async () => false;
  await assert.rejects(g.service.create(user, { localPart: 'first' }), code('MAIL_PROVIDER_CAPACITY_REACHED')); assert.equal(g.calls.create.length, 0);
  const p = hostingerFixture(); p.provider.assertReady = async () => false; const h = fixture({ env: hostingerEnv, provider: p.provider });
  await assert.rejects(h.service.create(user, { localPart: 'first' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(p.requests.length, 0); assert.equal(p.probes.length, 0);
});

test('Hostinger owner trial must reserve globally held customer inventory before any provider call, including retries', async () => {
  const owner = { ...user, email: 'taithai5002@gmail.com' };
  const getMembership = async () => ({ active: true, paid: false, ownerTrial: true, expiresAt: '2026-11-22T10:00:00Z', mailboxes: 1 });
  const p = hostingerFixture(); const missing = fixture({ env: hostingerEnv, provider: p.provider, getMembership });
  await assert.rejects(missing.service.create(owner, { localPart: 'ownertrial' }), code('MAIL_CAPACITY_NOT_CONFIGURED'));
  assert.equal(p.requests.length, 0); assert.equal(p.probes.length, 0);
  const q = hostingerFixture(); let attempts = 0; let allowed = false;
  const blocked = fixture({ env: hostingerEnv, provider: q.provider, getMembership, reserveTrialCapacity: async input => {
    attempts++; assert.equal(input.user, owner); assert.equal(input.quantity, 1); return allowed;
  } });
  await assert.rejects(blocked.service.create(owner, { localPart: 'ownertrial', mailboxes: 20 }), code('MAIL_PROVIDER_CAPACITY_REACHED'));
  assert.equal(q.requests.length, 0); assert.equal(q.probes.length, 0); assert.equal(attempts, 1);
  blocked.advance(31000);
  await assert.rejects(blocked.service.create(owner, { localPart: 'ownertrial' }), code('MAIL_PROVIDER_CAPACITY_REACHED'));
  assert.equal(q.requests.length, 0); assert.equal(attempts, 2);
  allowed = true; blocked.advance(31000);
  assert.equal((await blocked.service.create(owner, { localPart: 'ownertrial' })).createdMailbox.status, 'active');
  assert.equal(attempts, 3); assert.equal(q.requests.filter(item => item.options.method === 'POST').length, 1);
});

test('new Hostinger names use the help/OpenAPI common subset before any reservation or provider request', async () => {
  for (const name of ['sunny-name','sunny_name','sunny+name']) {
    const p = hostingerFixture(); const f = fixture({ env: hostingerEnv, provider: p.provider });
    await assert.rejects(f.service.create(user, { localPart: name }), code('INVALID_LOCAL_PART'));
    assert.equal(f.store.docs.size, 0); assert.equal(p.requests.length, 0); assert.equal(p.probes.length, 0);
    await assert.rejects(p.provider.createMailbox({ localPart: name, password: 'server-secret' }), code('INVALID_LOCAL_PART'));
    assert.equal(p.requests.length, 0);
  }
  const p = hostingerFixture(); const f = fixture({ env: hostingerEnv, provider: p.provider });
  const created = await f.service.create(user, { localPart: 'sunny.name' }); assert.equal(created.createdMailbox.address, 'sunny.name@taithai.app');
  assert.equal(created.provider, 'hostinger'); assert.equal((await f.service.status(user)).provider, 'hostinger');
});

test('Hostinger new-name compatibility restriction does not invalidate saved credentials or other providers names', async () => {
  const f = fixture({ env: hostingerEnv });
  const mailboxAddress = 'legacy_name@taithai.app';
  await f.store.set(`siteMailboxes/${user.uid}`, { uid: user.uid, localPart: 'legacy_name', address: mailboxAddress, provider: 'hostinger', status: 'active',
    credential: encryptMailboxCredential('persisted-secret', { env: hostingerEnv, userId: user.uid, mailboxAddress }) });
  await f.service.list(user); assert.equal(f.calls.list[0].credentials.address, mailboxAddress); assert.equal(f.calls.list[0].credentials.password, 'persisted-secret');
  const g = fixture(); assert.equal((await g.service.create(user, { localPart: 'sunny-name' })).createdMailbox.address, 'sunny-name@taithai.app');
  const p = purelyFixture(); const h = fixture({ env: purelyEnv, provider: p.provider });
  assert.equal((await h.service.create(user, { localPart: 'sunny_name' })).createdMailbox.address, 'sunny_name@taithai.app');
});

test('paid account quantity above twenty is accepted and large indexes use bounded storage read batches', async () => {
  const f = fixture(); f.setMembership({ active: true, paid: true, mailboxes: 60 });
  for (let i = 0; i < 26; i++) await f.service.create(user, { localPart: `manybox${i}` });
  const index = await f.store.get(`siteMailUserAccounts/${user.uid}`); assert.equal(index.mailboxIds.length, 26);
  let concurrent = 0; let maximum = 0; const original = f.store.get;
  f.store.get = async path => {
    if (path.startsWith('siteMailboxes/') || path.startsWith('siteMailAccounts/')) {
      concurrent++; maximum = Math.max(maximum, concurrent);
      try { await new Promise(resolve => setTimeout(resolve, 0)); return await original(path); } finally { concurrent--; }
    }
    return original(path);
  };
  const state = await f.service.status(user); assert.equal(state.mailboxCapacity, 60); assert.equal(state.mailboxUsed, 26); assert.equal(state.canCreate, true); assert.equal(state.mailboxes.length, 26);
  assert.ok(maximum <= 25); assert.ok(maximum > 1);
  await f.service.send(user, { ...sendInput(), mailbox: state.mailboxes[25].id }); assert.equal(f.calls.send[0].message.from, 'manybox25@taithai.app');
  for (const invalid of [0,-1,1.5,Number.MAX_SAFE_INTEGER + 1,Infinity]) {
    f.setMembership({ active: true, paid: true, mailboxes: invalid }); assert.equal((await f.service.status(user)).mailboxCapacity, 0);
  }
});

function waitForProviderAbort(signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    const abort = () => { clearTimeout(timer); reject(Object.assign(Error('Aborted'), { name: 'AbortError' })); };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
}

test('shared provisioning deadline includes initial trusted trial reservation time and retains the durable name', async () => {
  const p = hostingerFixture(); const owner = { ...user, email: 'taithai5002@gmail.com' }; let held = false;
  const f = fixture({ env: hostingerEnv, provider: p.provider, provisioningTimeoutMs: 20,
    getMembership: async () => ({ active: true, paid: false, ownerTrial: true, expiresAt: '2026-11-22T10:00:00Z' }),
    reserveTrialCapacity: async () => { held = true; await new Promise(resolve => setTimeout(resolve, 40)); return true; } });
  await assert.rejects(f.service.create(owner, { localPart: 'slowtrial' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(held, true); assert.equal(p.requests.length, 0); assert.equal(p.probes.length, 0);
  const record = await f.store.get(`siteMailboxes/${user.uid}`); assert.equal(record.status, 'provisioning'); assert.ok(record.credential); assert.equal(record.creationAttemptedAt, undefined);
  assert.equal((await f.store.get('siteMailNames/slowtrial')).uid, owner.uid);
});

test('shared Hostinger deadline aborts capacity work before POST without releasing an attempted-creation reservation', async () => {
  const p = hostingerFixture(); const f = fixture({ env: hostingerEnv, provider: p.provider, provisioningTimeoutMs: 100 });
  p.beforeRequest(async ({ options }) => {
    const record = await f.store.get(`siteMailboxes/${user.uid}`);
    if (record?.creationAttemptedAt && options.method === 'GET') await waitForProviderAbort(options.signal);
  });
  await assert.rejects(f.service.create(user, { localPart: 'slowcreate' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(p.requests.some(item => item.options.method === 'POST'), false);
  const record = await f.store.get(`siteMailboxes/${user.uid}`); assert.equal(record.status, 'provisioning'); assert.ok(record.creationAttemptedAt); assert.ok(record.credential);
  assert.equal((await f.store.get('siteMailNames/slowcreate')).uid, user.uid);
  p.beforeRequest(() => {}); f.advance(31000);
  const result = await f.service.create(user, { localPart: 'slowcreate' }); assert.equal(result.createdMailbox.status, 'active');
  assert.equal(p.requests.filter(item => item.options.method === 'POST').length, 1);
});

test('shared Hostinger deadline closes an IMAP proof connection and retry proves the same created mailbox without another POST', async () => {
  let closes = 0; let connections = 0; let connectTimer;
  class SlowProofImap {
    constructor() { connections++; } on() {}
    async connect() { await new Promise(resolve => { connectTimer = setTimeout(resolve, 2000); }); }
    async logout() { throw Error('Aborted proof must close instead of waiting for logout'); }
    close() { closes++; clearTimeout(connectTimer); }
  }
  const protocols = createMailProtocolAdapters({ env: hostingerEnv, ImapFlow: SlowProofImap, createTransport() {}, simpleParser() {} });
  const p = hostingerFixture(); const originalProof = p.provider.verifyMailboxOwnership;
  p.provider.verifyMailboxOwnership = input => protocols.imap.verifyCredentials({ provider: 'hostinger', address: `${input.localPart}@taithai.app`, password: input.password, signal: input.signal });
  const f = fixture({ env: hostingerEnv, provider: p.provider, provisioningTimeoutMs: 100 });
  await assert.rejects(f.service.create(user, { localPart: 'slowproof' }), code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(connections, 1); assert.ok(closes >= 1); assert.equal(p.requests.filter(item => item.options.method === 'POST').length, 1);
  assert.equal((await f.store.get(`siteMailboxes/${user.uid}`)).status, 'provisioning');
  p.provider.verifyMailboxOwnership = originalProof; f.advance(31000);
  assert.equal((await f.service.create(user, { localPart: 'slowproof' })).createdMailbox.status, 'active');
  assert.equal(p.requests.filter(item => item.options.method === 'POST').length, 1);
});

test('API operation budget aborts Hostinger work earlier than its independent provisioning deadline', async () => {
  const p = hostingerFixture(); const f = fixture({ env: hostingerEnv, provider: p.provider });
  p.beforeRequest(({ options }) => waitForProviderAbort(options.signal));
  let work;
  await assert.rejects(withMembershipOperationBudget(() => { work = f.service.create(user, { localPart: 'apibudget' }); return work; }, { timeoutMs: 25 }), error => error.code === 'OPERATION_TIMEOUT');
  await assert.rejects(work, code('MAILBOX_PROVISIONING_UNCERTAIN'));
  assert.equal(p.requests.some(item => item.options.method === 'POST'), false);
  assert.equal((await f.store.get(`siteMailboxes/${user.uid}`)).status, 'provisioning');
  assert.equal((await f.store.get('siteMailNames/apibudget')).uid, user.uid);
});

test('API operation budget closes in-flight SMTP and retains an uncertain immutable send receipt without resending', async () => {
  let sends = 0; let closes = 0; let sendTimer;
  const { smtp } = createMailProtocolAdapters({ ImapFlow() {}, simpleParser() {}, createTransport(options) {
    return options.streamTransport ? { async sendMail() { return { message: Buffer.from('plain fixture') }; }, close() {} } : {
      async sendMail() { sends++; return new Promise(resolve => { sendTimer = setTimeout(() => resolve({ accepted: ['friend@example.com'] }), 2000); }); },
      close() { closes++; clearTimeout(sendTimer); }
    };
  } });
  const f = fixture({ smtp }); await f.service.create(user, { localPart: 'budgetsend' }); let work;
  await assert.rejects(withMembershipOperationBudget(() => { work = f.service.send(user, sendInput()); return work; }, { timeoutMs: 25 }), error => error.code === 'OPERATION_TIMEOUT');
  assert.deepEqual(await work, { status: 'uncertain' }); assert.equal(sends, 1); assert.ok(closes >= 1);
  assert.deepEqual(await f.service.send(user, sendInput()), { status: 'uncertain' }); assert.equal(sends, 1);
  assert.equal((await f.store.get(`siteMailSendJobs/${user.uid}_${sendInput().requestId}`)).status, 'uncertain');
});
