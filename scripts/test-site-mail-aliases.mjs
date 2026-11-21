import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostingerAliasAdapter, createMailboxAliasService } from '../server-lib/site-mail-aliases.js';

const user = { uid: 'owner', email_verified: true, email: 'owner@example.com' };
const other = { uid: 'other', email_verified: true, email: 'other@example.com' };
const record = { id: 'owner', uid: user.uid, provider: 'hostinger', status: 'active', address: 'sunny@taithai.app' };
const otherRecord = { id: 'mbx_other', uid: other.uid, provider: 'hostinger', status: 'active', address: 'cloud@taithai.app' };
const request = (localPart = 'personal', requestId = 'request_create_0001') => ({ mailbox: record.id, localPart, requestId });
const code = expected => error => error?.code === expected;
const fail = (value, status = 400) => { throw Object.assign(new Error(value), { code: value, status }); };
const clone = value => value == null ? value : structuredClone(value);

function fixture({ domainLimit = 5, mailboxLimit = 5, allowReserved } = {}) {
  const docs = new Map(), calls = [], boxes = [
    { id: 'AC_owner', address: record.address, status: 'active' }, { id: 'AC_other', address: otherRecord.address, status: 'active' }
  ];
  const aliases = new Map(), controls = { loseCreate: false, loseDelete: false, failCompleted: false, corruptCreate: false, accessCalls: 0, revokeAt: Infinity };
  const access = new Set([user.uid, other.uid]);
  const rawAlias = (local, mailboxId = 'AC_owner', id = `AA_${local.replace(/[._-]/g, '')}`) => ({ id, address: `${local}@taithai.app`, mailbox: clone(boxes.find(box => box.id === mailboxId)),
    is_active: true, created_at: '2026-11-22T00:00:00Z', updated_at: '2026-11-22T00:00:00Z' });
  async function providerRequest(path, method = 'GET', input) {
    calls.push({ path, method, input: clone(input) });
    if (method === 'GET' && path === 'orders/OR_configured/mailboxes') return { data: clone(boxes) };
    if (method === 'GET' && path === 'orders/OR_configured/aliases') return { data: clone([...aliases.values()]) };
    const create = /^mailboxes\/(AC_owner|AC_other)\/aliases$/.exec(path);
    if (method === 'POST' && create) {
      assert.deepEqual(Object.keys(input), ['local_part']);
      const value = rawAlias(input.local_part, create[1]);
      if ([...aliases.values()].some(item => item.address === value.address)) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      aliases.set(value.id, value);
      if (controls.loseCreate) { controls.loseCreate = false; fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
      return controls.corruptCreate ? { ...value, mailbox: boxes[1] } : clone(value);
    }
    if (method === 'DELETE' && path.startsWith('aliases/')) {
      const id = path.slice(8); assert.ok(aliases.has(id)); aliases.delete(id);
      if (controls.loseDelete) { controls.loseDelete = false; fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
      return { success: true };
    }
    throw new Error('Unexpected fixture request ' + method + ' ' + path);
  }
  const provider = createHostingerAliasAdapter({ operation: fn => fn(providerRequest), collection: async (req, path) => (await req(path)).data,
    orderPlan: async () => ({ order: { id: 'OR_configured' }, plan: { domain: { alias_quota: domainLimit }, mailbox: { alias_quota: mailboxLimit } } }),
    env: { HOSTINGER_MAIL_ORDER_ID: 'OR_configured' }, fail });
  let transactionQueue = Promise.resolve(), lockQueue = Promise.resolve();
  const store = {
    get: async path => clone(docs.get(path) || null),
    async transaction(fn) {
      const current = transactionQueue.then(async () => {
        const working = new Map([...docs].map(([path, value]) => [path, clone(value)]));
        const writes = [];
        const value = await fn({ get: async path => clone(working.get(path) || null), set(path, input) {
          assert.doesNotMatch(JSON.stringify(input, (key, value) => value === undefined ? '__undefined__' : value), /__undefined__/);
          writes.push([path, clone(input)]); working.set(path, clone(input));
        } });
        if (controls.failCompleted && writes.some(([path, input]) => path.startsWith('siteMailAliasJobs/') && input.status === 'completed')) {
          controls.failCompleted = false; throw new Error('Fixture database outcome lost before commit');
        }
        for (const [path, input] of writes) docs.set(path, input);
        return value;
      });
      transactionQueue = current.catch(() => {}); return current;
    },
    withLock(key, fn) {
      assert.equal(key, 'hostinger-mail-alias-management');
      const current = lockQueue.then(fn); lockQueue = current.catch(() => {}); return current;
    }
  };
  async function owned(current, input) {
    controls.accessCalls++;
    if (!current?.email_verified || !access.has(current.uid) || controls.accessCalls >= controls.revokeAt) fail('MAIL_ACCESS_REQUIRED', 403);
    const selected = [record, otherRecord].find(value => value.id === input.mailbox && value.uid === current.uid);
    if (!selected) fail('MAILBOX_NOT_FOUND', 404);
    return { record: clone(selected), credentials: { address: selected.address, password: 'fixture-private-password' } };
  }
  const service = createMailboxAliasService({ store, provider, owned, fail, now: () => Date.parse('2026-11-22T00:00:00Z'), ...(allowReserved ? { allowReserved } : {}) });
  return { docs, boxes, aliases, calls, controls, access, rawAlias, provider, service };
}

test('alias adapter returns only the exact owned mailbox aliases while counting the entire order quota', async () => {
  const f = fixture({ domainLimit: 3 });
  f.aliases.set('AA_mine', f.rawAlias('personal', 'AC_owner', 'AA_mine'));
  f.aliases.set('AA_foreign', f.rawAlias('private', 'AC_other', 'AA_foreign'));
  const stock = await f.provider.aliasInventory(record);
  assert.deepEqual(stock.aliases.map(value => value.address), ['personal@taithai.app']);
  assert.equal(stock.domainUsed, 2); assert.equal(stock.mailboxUsed, 1); assert.equal(stock.available, 1);
  assert.ok(f.calls.every(value => !/undefined|\.\./.test(value.path)));
});

test('provider inventory accepts existing short addresses without relaxing public creation names', async () => {
  const f = fixture(); f.boxes[1].address = 'hr@taithai.app';
  f.aliases.set('AA_short', f.rawAlias('a', 'AC_other', 'AA_short'));
  assert.equal((await f.provider.aliasInventory(record)).domainUsed, 1);
  await assert.rejects(f.service.create(user, request('hr')), code('INVALID_LOCAL_PART'));
});

test('alias list DTO exposes no foreign address, credentials, provider mailbox ID or account email', async () => {
  const f = fixture(); f.aliases.set('AA_foreign', f.rawAlias('private', 'AC_other', 'AA_foreign'));
  const result = await f.service.list(user, { mailbox: record.id, uid: other.uid, providerMailboxId: 'AC_other' });
  assert.deepEqual(result, { mailboxId: record.id, mailboxAddress: record.address, aliases: [], limit: 5, used: 0, available: 4,
    canCreate: true, canDelete: false, sendingFromAlias: false, webmailUrl: 'https://mail.hostinger.com' });
  const json = JSON.stringify(result);
  for (const privateValue of ['private@taithai.app', 'AC_other', 'AC_owner', user.email, 'fixture-private-password']) assert.equal(json.includes(privateValue), false);
});

test('forged mailbox UID or provider ID cannot list, create or delete another account aliases', async () => {
  const f = fixture(); f.aliases.set('AA_foreign', f.rawAlias('private', 'AC_other', 'AA_foreign'));
  await assert.rejects(f.service.list(user, { mailbox: otherRecord.id }), code('MAILBOX_NOT_FOUND'));
  await assert.rejects(f.service.create(user, { ...request(), mailbox: otherRecord.id, uid: other.uid }), code('MAILBOX_NOT_FOUND'));
  await assert.rejects(f.service.remove(user, { mailbox: record.id, aliasId: 'AA_foreign', confirmAddress: 'private@taithai.app', requestId: 'request_delete_0001' }), code('MAIL_ALIAS_NOT_FOUND'));
  assert.equal(f.calls.filter(value => value.method !== 'GET').length, 0);
});

test('creation is an alias POST, preserves the mailbox and paid seats, and claims the shared address namespace', async () => {
  const f = fixture(); const result = await f.service.create(user, request('  Personal.Name  '));
  assert.deepEqual(result.aliases.map(value => value.address), ['personal.name@taithai.app']);
  assert.deepEqual(f.calls.filter(value => value.method === 'POST'), [{ path: 'mailboxes/AC_owner/aliases', method: 'POST', input: { local_part: 'personal.name' } }]);
  assert.equal(f.boxes.length, 2); assert.equal(result.sendingFromAlias, false);
  const name = f.docs.get('siteMailNames/personal.name'); assert.equal(name.uid, user.uid); assert.equal(name.mailboxId, record.id); assert.equal(name.kind, 'alias');
  assert.equal(JSON.stringify([...f.docs.values()]).includes('fixture-private-password'), false);
});

test('same immutable create request returns current inventory without another provider write', async () => {
  const f = fixture(); await f.service.create(user, request()); await f.service.create(user, request());
  assert.equal(f.calls.filter(value => value.method === 'POST').length, 1);
  await assert.rejects(f.service.create(user, request('different')), code('REQUEST_ID_CONFLICT'));
});

test('request IDs cannot be reused for a different mailbox or action', async () => {
  const f = fixture(); await f.service.create(user, request());
  await assert.rejects(f.service.remove(user, { mailbox: record.id, aliasId: 'AA_personal', confirmAddress: 'personal@taithai.app', requestId: 'request_create_0001' }), code('REQUEST_ID_CONFLICT'));
});

test('lost provider-create acknowledgement reconciles the existing own alias rather than duplicating it', async () => {
  const f = fixture(); f.controls.loseCreate = true;
  await assert.rejects(f.service.create(user, request()), code('MAIL_ALIAS_PROVISIONING_UNCERTAIN'));
  assert.equal(f.docs.get('siteMailNames/personal').status, 'provisioning');
  assert.equal(f.aliases.size, 1);
  const result = await f.service.create(user, request()); assert.equal(result.aliases.length, 1);
  assert.equal(f.calls.filter(value => value.method === 'POST').length, 1);
  assert.equal(f.docs.get('siteMailNames/personal').status, 'active');
});

test('database completion failure leaves a durable retry receipt after provider commit', async () => {
  const f = fixture(); f.controls.failCompleted = true;
  await assert.rejects(f.service.create(user, request()), code('MAIL_ALIAS_PROVISIONING_UNCERTAIN'));
  await f.service.create(user, request());
  assert.equal(f.calls.filter(value => value.method === 'POST').length, 1);
  assert.equal(f.docs.get('siteMailNames/personal').status, 'active');
});

test('preexisting provider alias cannot be adopted without an attempted creation receipt', async () => {
  const f = fixture(); f.aliases.set('AA_personal', f.rawAlias('personal'));
  await assert.rejects(f.service.create(user, request()), code('ADDRESS_UNAVAILABLE'));
  assert.equal(f.docs.has('siteMailNames/personal'), false);
});

test('real mailbox and another account name claims prevent alias collision before POST', async () => {
  const f = fixture();
  await assert.rejects(f.provider.createAlias(record, 'cloud'), code('ADDRESS_UNAVAILABLE'));
  f.docs.set('siteMailNames/personal', { uid: other.uid, mailboxId: otherRecord.id, address: 'personal@taithai.app', provider: 'hostinger', kind: 'alias' });
  await assert.rejects(f.service.create(user, request()), code('ADDRESS_UNAVAILABLE'));
  assert.equal(f.calls.filter(value => value.method === 'POST').length, 0);
});

test('both domain and per-mailbox alias quotas are enforced independently of mailbox seats', async () => {
  const domain = fixture({ domainLimit: 1 }); domain.aliases.set('AA_foreign', domain.rawAlias('private', 'AC_other', 'AA_foreign'));
  await assert.rejects(domain.service.create(user, request()), code('MAIL_ALIAS_LIMIT_REACHED'));
  const mailbox = fixture({ mailboxLimit: 1 }); await mailbox.service.create(user, request());
  await assert.rejects(mailbox.service.create(user, request('second', 'request_create_0002')), code('MAIL_ALIAS_LIMIT_REACHED'));
  assert.equal(mailbox.calls.filter(value => value.method === 'POST').length, 1);
});

test('global operation lease prevents simultaneous users from overallocating the domain quota', async () => {
  const f = fixture({ domainLimit: 1 });
  const result = await Promise.allSettled([f.service.create(user, request()), f.service.create(other, { ...request('second', 'request_create_0002'), mailbox: otherRecord.id })]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(result.find(value => value.status === 'rejected').reason.code, 'MAIL_ALIAS_LIMIT_REACHED');
  assert.equal(f.aliases.size, 1);
});

test('fresh role revocation before provider POST stops mutation and preserves a pending name', async () => {
  const f = fixture(); f.controls.revokeAt = 3;
  await assert.rejects(f.service.create(user, request()), code('MAIL_ACCESS_REQUIRED'));
  assert.equal(f.calls.filter(value => value.method === 'POST').length, 0);
  assert.equal(f.docs.get('siteMailNames/personal').status, 'provisioning');
});

test('reserved names need an explicit trusted owner policy; ordinary users cannot forge override flags', async () => {
  const f = fixture();
  await assert.rejects(f.service.create(user, { ...request('official'), owner: true, allowReserved: true }), code('RESERVED_LOCAL_PART'));
  const owner = fixture({ allowReserved: current => current.uid === user.uid });
  assert.equal((await owner.service.create(user, request('support'))).aliases[0].address, 'support@taithai.app');
  await assert.rejects(owner.service.create(other, { ...request('official'), mailbox: otherRecord.id }), code('RESERVED_LOCAL_PART'));
});

test('alias grammar rejects injection and consecutive separators while supporting official separators and length', async () => {
  const f = fixture();
  for (const value of ['a', 'ab', '-hello', 'hello-', 'hello..world', 'hello_-world', 'hello\r\nBcc:private', '../escape', 'hello@other.app', 'กกก', 'a'.repeat(51)]) {
    await assert.rejects(f.service.create(user, request(value)), code('INVALID_LOCAL_PART'));
  }
  await f.service.create(user, request('personal_name-test'));
  await assert.rejects(f.service.create(user, { ...request('othername'), requestId: '../bad' }), code('INVALID_REQUEST_ID'));
  await assert.rejects(f.service.create(user, { ...request('othername'), requestId: 1234567890123456 }), code('INVALID_REQUEST_ID'));
});

test('delete requires exact confirmation and never exposes a mailbox-delete endpoint', async () => {
  const f = fixture(); await f.service.create(user, request());
  const deletion = { mailbox: record.id, aliasId: 'AA_personal', confirmAddress: 'wrong@taithai.app', requestId: 'request_delete_0001' };
  await assert.rejects(f.service.remove(user, deletion), code('ALIAS_CONFIRMATION_REQUIRED'));
  await assert.rejects(f.service.remove(user, { ...deletion, confirmAddress: record.address }), code('ALIAS_CONFIRMATION_REQUIRED'));
  await f.service.remove(user, { ...deletion, confirmAddress: 'personal@taithai.app' });
  assert.deepEqual(f.calls.filter(value => value.method === 'DELETE').map(value => value.path), ['aliases/AA_personal']);
  assert.equal(f.boxes.length, 2); assert.equal(f.aliases.size, 0);
  assert.equal(f.docs.get('siteMailNames/personal').status, 'deleted');
});

test('lost delete response reconciles absence and replay never deletes a newer address', async () => {
  const f = fixture(); await f.service.create(user, request());
  const deletion = { mailbox: record.id, aliasId: 'AA_personal', confirmAddress: 'personal@taithai.app', requestId: 'request_delete_0001' };
  f.controls.loseDelete = true;
  await assert.rejects(f.service.remove(user, deletion), code('MAIL_ALIAS_DELETE_UNCERTAIN'));
  await f.service.remove(user, deletion); await f.service.remove(user, deletion);
  assert.equal(f.calls.filter(value => value.method === 'DELETE').length, 1);
  await f.service.create(user, request('personal', 'request_create_0002'));
  await f.service.remove(user, deletion);
  assert.equal(f.aliases.size, 1); assert.equal(f.calls.filter(value => value.method === 'DELETE').length, 1);
});

test('deleted names remain reserved to the same owner and recipient history remains scoped', async () => {
  const f = fixture(); await f.service.create(user, request());
  const active = await f.service.recipientAddresses(user, record);
  assert.deepEqual(active, [{ address: record.address, kind: 'primary' }, { address: 'personal@taithai.app', kind: 'alias' }]);
  await f.service.remove(user, { mailbox: record.id, aliasId: 'AA_personal', confirmAddress: 'personal@taithai.app', requestId: 'request_delete_0001' });
  assert.deepEqual(await f.service.recipientAddresses(user, record), [{ address: record.address, kind: 'primary' }, { address: 'personal@taithai.app', kind: 'previous' }]);
  assert.deepEqual(await f.service.recipientAddresses(other, otherRecord), [{ address: otherRecord.address, kind: 'primary' }]);
  await assert.rejects(f.service.recipientAddresses(user, otherRecord), code('MAILBOX_NOT_FOUND'));
  await assert.rejects(f.service.create(other, { ...request('personal', 'request_create_0002'), mailbox: otherRecord.id }), code('ADDRESS_UNAVAILABLE'));
});

test('malformed provider ownership, duplicate aliases or invalid quotas fail closed', async () => {
  const wrong = fixture(); wrong.aliases.set('AA_bad', { ...wrong.rawAlias('personal'), mailbox: { id: 'AC_other', address: record.address } });
  await assert.rejects(wrong.provider.aliasInventory(record), code('MAIL_PROVIDER_UNAVAILABLE'));
  const duplicate = fixture(); duplicate.aliases.set('AA_one', duplicate.rawAlias('personal', 'AC_owner', 'AA_one')); duplicate.aliases.set('AA_two', duplicate.rawAlias('personal', 'AC_owner', 'AA_two'));
  await assert.rejects(duplicate.provider.aliasInventory(record), code('MAIL_PROVIDER_UNAVAILABLE'));
  await assert.rejects(fixture({ domainLimit: -1 }).provider.aliasInventory(record), code('MAIL_ALIAS_STATE_UNAVAILABLE'));
  const numeric = fixture(); numeric.boxes[1].id = 123456;
  await assert.rejects(numeric.provider.aliasInventory(record), code('MAIL_PROVIDER_UNAVAILABLE'));
  const corrupt = fixture(); corrupt.controls.corruptCreate = true;
  await assert.rejects(corrupt.service.create(user, request()), code('MAIL_ALIAS_PROVISIONING_UNCERTAIN'));
});

test('inactive aliases still consume provider slots and cannot be reconciled as active', async () => {
  const f = fixture({ mailboxLimit: 1 }); f.controls.loseCreate = true;
  await assert.rejects(f.service.create(user, request()), code('MAIL_ALIAS_PROVISIONING_UNCERTAIN'));
  f.aliases.get('AA_personal').is_active = false;
  assert.equal((await f.service.list(user, { mailbox: record.id })).available, 0);
  await assert.rejects(f.service.create(user, request()), code('MAIL_ALIAS_PROVISIONING_UNCERTAIN'));
});

test('pending delete cannot attach an old request to an externally replaced alias', async () => {
  const f = fixture(); await f.service.create(user, request()); f.controls.loseDelete = true;
  const deletion = { mailbox: record.id, aliasId: 'AA_personal', confirmAddress: 'personal@taithai.app', requestId: 'request_delete_0001' };
  await assert.rejects(f.service.remove(user, deletion), code('MAIL_ALIAS_DELETE_UNCERTAIN'));
  f.aliases.set('AA_replacement', f.rawAlias('personal', 'AC_owner', 'AA_replacement'));
  await assert.rejects(f.service.remove(user, deletion), code('MAIL_ALIAS_DELETE_UNCERTAIN'));
  assert.equal(f.aliases.has('AA_replacement'), true);
});
