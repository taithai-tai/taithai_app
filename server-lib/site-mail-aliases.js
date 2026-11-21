import { createHash } from 'node:crypto';

// Server-only. Aliases share an existing mailbox and never grant inbox access.
// https://docs.hostinger.com/api-reference/endpoints/mail/aliases
const DOMAIN = 'taithai.app';
const RESOURCE_ID = /^[A-Za-z0-9_-]{3,100}$/;
const APP_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{16,100}$/;
const LOCAL = /^[a-z0-9](?:[a-z0-9._-]{1,48}[a-z0-9])$/;
const EXISTING_LOCAL = /^[a-z0-9](?:[a-z0-9._-]{0,48}[a-z0-9])?$/;
const RESERVED = new Set(('admin administrator root postmaster abuse security support help billing payment payments noreply mailerdaemon webmaster hostmaster domainmaster dns mail email smtp imap pop api assets system taithai taithai5002 owner official staff moderator contact info sales stripe accounts account www null undefined').split(' '));
const MAX_HISTORY = 500;
const resourceId = value => typeof value === 'string' && RESOURCE_ID.test(value);
const appId = value => typeof value === 'string' && APP_ID.test(value);
const requestId = value => typeof value === 'string' && REQUEST_ID.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
function defaultFail(code, status = 400) { throw Object.assign(new Error(code), { code, status }); }
function localName(value, fail) {
  if (typeof value !== 'string') fail('INVALID_LOCAL_PART', 400);
  const local = value.trim().toLowerCase();
  if (!LOCAL.test(local) || /[._-]{2}/.test(local)) fail('INVALID_LOCAL_PART', 400);
  return local;
}
function email(value) {
  if (typeof value !== 'string' || !value.endsWith('@' + DOMAIN)) return false;
  const local = value.slice(0, -(DOMAIN.length + 1));
  return EXISTING_LOCAL.test(local) && !/[._-]{2}/.test(local);
}
function safeDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null; }

/** Reuses the provider's fixed-origin HTTP budget and strict paginated reader.
 * The app mailbox ID is not a Hostinger ID: resolve the exact owned address
 * inside the configured order, and validate the parent of every alias. */
export function createHostingerAliasAdapter({ operation, collection, orderPlan, env = process.env, fail = defaultFail } = {}) {
  if (![operation, collection, orderPlan].every(value => typeof value === 'function')) throw new TypeError('Alias provider requires trusted Hostinger readers');
  function resource(value) {
    if (!value || !resourceId(value.id) || !email(value.address) || !resourceId(value.mailbox?.id) || !email(value.mailbox?.address)
      || typeof value.is_active !== 'boolean') fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    return { id: value.id, address: value.address, mailbox: { id: value.mailbox.id, address: value.mailbox.address },
      active: value.is_active, createdAt: safeDate(value.created_at) };
  }
  async function snapshot(request, record) {
    if (record?.provider !== 'hostinger' || record.status !== 'active' || !email(record.address)) fail('MAILBOX_NOT_FOUND', 404);
    const { order, plan } = await orderPlan(request);
    if (order?.id !== env.HOSTINGER_MAIL_ORDER_ID) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    const domainLimit = plan.domain?.alias_quota, mailboxLimit = plan.mailbox?.alias_quota;
    if (![domainLimit, mailboxLimit].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000)) fail('MAIL_ALIAS_STATE_UNAVAILABLE', 503);
    const boxes = await collection(request, `orders/${env.HOSTINGER_MAIL_ORDER_ID}/mailboxes`);
    if (boxes.some(value => !resourceId(value?.id) || !email(value.address) || !['active', 'suspended'].includes(value.status))
      || new Set(boxes.map(value => value.id)).size !== boxes.length || new Set(boxes.map(value => value.address)).size !== boxes.length) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    const matches = boxes.filter(value => value.address === record.address);
    if (matches.length !== 1 || matches[0].status !== 'active') fail('MAILBOX_NOT_FOUND', 404);
    const mailbox = { id: matches[0].id, address: matches[0].address };
    const all = (await collection(request, `orders/${env.HOSTINGER_MAIL_ORDER_ID}/aliases`)).map(resource);
    if (new Set(all.map(value => value.id)).size !== all.length || new Set(all.map(value => value.address)).size !== all.length
      || all.some(value => !boxes.some(box => box.id === value.mailbox.id && box.address === value.mailbox.address))) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    const aliases = all.filter(value => value.mailbox.id === mailbox.id && value.mailbox.address === mailbox.address);
    return { mailbox, aliases, all, boxes, domainLimit, mailboxLimit, domainUsed: all.length, mailboxUsed: aliases.length,
      limit: Math.min(domainLimit, mailboxLimit), available: Math.max(0, Math.min(domainLimit - all.length, mailboxLimit - aliases.length)) };
  }
  const publicInventory = value => { const { all, boxes, ...safe } = value; return safe; };
  return {
    aliasInventory: (record, options) => operation(async request => publicInventory(await snapshot(request, record)), options),
    createAlias: (record, local, options) => operation(async request => {
      local = localName(local, fail);
      const stock = await snapshot(request, record), target = `${local}@${DOMAIN}`;
      if (stock.all.some(value => value.address === target) || stock.boxes.some(value => value.address === target)) fail('ADDRESS_UNAVAILABLE', 409);
      if (stock.available < 1) fail('MAIL_ALIAS_LIMIT_REACHED', 409);
      const alias = resource(await request(`mailboxes/${stock.mailbox.id}/aliases`, 'POST', { local_part: local }));
      if (alias.address !== target || alias.mailbox.id !== stock.mailbox.id || alias.mailbox.address !== stock.mailbox.address || !alias.active) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      return alias;
    }, options),
    deleteAlias: (record, aliasId, options) => operation(async request => {
      if (!resourceId(aliasId)) fail('MAIL_ALIAS_NOT_FOUND', 404);
      const stock = await snapshot(request, record);
      if (!stock.aliases.some(value => value.id === aliasId)) fail('MAIL_ALIAS_NOT_FOUND', 404);
      await request(`aliases/${aliasId}`, 'DELETE');
      return { deleted: true };
    }, options)
  };
}

/** owned(user,{mailbox}) must freshly resolve the server grant, selected active
 * record and credentials. No caller-supplied provider ID or UID is trusted.
 * withLock is a renewing server lease; request receipts and name claims survive
 * uncertain external responses. Deleted names remain reserved to their owner. */
export function createMailboxAliasService({ store, provider, owned, fail = defaultFail, now = Date.now, allowReserved = () => false } = {}) {
  const runTransaction = store?.runTransaction || store?.transaction;
  if (!store?.get || !store?.withLock || typeof runTransaction !== 'function' || typeof owned !== 'function'
    || !['aliasInventory', 'createAlias', 'deleteAlias'].every(key => typeof provider?.[key] === 'function')) throw new TypeError('Aliases require trusted ownership, provider and transactional storage');
  const tx = callback => runTransaction.call(store, callback);
  const paths = (user, record) => ({ state: `siteMailAliasState/${hash(`${user.uid}\n${record.id}`)}` });
  function identity(user) { if (!appId(user?.uid) || user.email_verified !== true) fail('MAIL_ACCESS_REQUIRED', 403); return user.uid; }
  async function own(user, input = {}) {
    identity(user);
    const result = await owned(user, input), record = result?.record;
    if (!record || record.uid !== user.uid || !appId(record.id) || record.provider !== 'hostinger' || record.status !== 'active' || !email(record.address)) fail('MAILBOX_NOT_FOUND', 404);
    return record;
  }
  async function refresh(user, record) {
    const current = await own(user, { mailbox: record.id });
    if (current.address !== record.address) fail('MAILBOX_CHANGED', 409);
    return current;
  }
  function stateValue(value, user, record) {
    if (!value) return { uid: user.uid, mailboxId: record.id, mailboxAddress: record.address, entries: [] };
    if (value.uid !== user.uid || value.mailboxId !== record.id || value.mailboxAddress !== record.address || !Array.isArray(value.entries) || value.entries.length > MAX_HISTORY
      || value.entries.some(entry => !email(entry?.address) || !['active', 'provisioning', 'deleting', 'deleted'].includes(entry.status)
        || entry.id !== undefined && !resourceId(entry.id) || !requestId(entry.requestId))
      || new Set(value.entries.map(entry => entry.address)).size !== value.entries.length) fail('MAIL_ALIAS_STATE_UNAVAILABLE', 503);
    return value;
  }
  const readState = async (reader, user, record) => stateValue(await reader.get(paths(user, record).state), user, record);
  function request(user, record, action, input, address, aliasId) {
    if (!requestId(input.requestId)) fail('INVALID_REQUEST_ID', 400);
    const digest = hash(JSON.stringify([action, record.id, address, aliasId || null]));
    return { uid: user.uid, mailboxId: record.id, action, address, ...(aliasId ? { aliasId } : {}), digest,
      path: `siteMailAliasJobs/${hash(`${user.uid}\n${input.requestId}`)}`, requestId: input.requestId };
  }
  function checkJob(value, operation) {
    if (value && (value.uid !== operation.uid || value.mailboxId !== operation.mailboxId || value.digest !== operation.digest || value.action !== operation.action
      || !['pending', 'completed'].includes(value.status))) fail('REQUEST_ID_CONFLICT', 409);
    return value;
  }
  function jobValue(operation, previous) {
    const { path, ...value } = operation;
    return { ...value, status: 'pending', createdAt: previous?.createdAt || iso(now()), attemptedAt: previous?.attemptedAt || iso(now()) };
  }
  function checkName(value, user, record, address, { aliasId, allowDeleted = false } = {}) {
    if (value && (value.uid !== user.uid || value.mailboxId !== record.id || value.address !== address || value.provider !== 'hostinger' || value.kind !== 'alias'
      || aliasId && value.aliasId && value.aliasId !== aliasId || !allowDeleted && value.status === 'deleted')) fail('ADDRESS_UNAVAILABLE', 409);
  }
  function append(state, entry) {
    const old = state.entries.find(value => value.address === entry.address);
    if (!old && state.entries.length >= MAX_HISTORY) fail('MAIL_ALIAS_STATE_UNAVAILABLE', 503);
    return { ...state, updatedAt: iso(now()), entries: [...state.entries.filter(value => value.address !== entry.address), { ...old, ...entry, updatedAt: iso(now()) }] };
  }
  function stockValue(stock, record) {
    if (!stock || !resourceId(stock.mailbox?.id) || stock.mailbox.address !== record.address || !Array.isArray(stock.aliases)
      || ![stock.limit, stock.available, stock.mailboxUsed, stock.domainUsed].every(value => Number.isSafeInteger(value) && value >= 0)
      || stock.available > stock.limit || stock.aliases.length !== stock.mailboxUsed || stock.aliases.some(value => !resourceId(value?.id) || !email(value.address)
        || value.mailbox?.id !== stock.mailbox.id || value.mailbox?.address !== record.address || typeof value.active !== 'boolean')
      || new Set(stock.aliases.map(value => value.id)).size !== stock.aliases.length || new Set(stock.aliases.map(value => value.address)).size !== stock.aliases.length) fail('MAIL_ALIAS_STATE_UNAVAILABLE', 503);
    return stock;
  }
  const inventory = async record => stockValue(await provider.aliasInventory(record), record);
  function dto(record, stock) {
    return { mailboxId: record.id, mailboxAddress: record.address, aliases: stock.aliases.map(value => ({ id: value.id, address: value.address, createdAt: safeDate(value.createdAt) })),
      limit: stock.limit, used: stock.mailboxUsed, available: stock.available, canCreate: stock.available > 0, canDelete: stock.aliases.length > 0,
      sendingFromAlias: false, webmailUrl: 'https://mail.hostinger.com' };
  }
  async function result(user, record) { await refresh(user, record); return dto(record, await inventory(record)); }
  async function complete(user, record, operation, alias, deleted) {
    await tx(async writer => {
      const previous = checkJob(await writer.get(operation.path), operation);
      const state = await readState(writer, user, record), local = operation.address.split('@')[0], namePath = `siteMailNames/${local}`;
      const name = await writer.get(namePath);
      if (!previous || !previous.attemptedAt) fail('MAIL_ALIAS_STATE_UNAVAILABLE', 503);
      checkName(name, user, record, operation.address, { aliasId: deleted ? operation.aliasId : undefined, allowDeleted: true });
      const id = deleted ? operation.aliasId : alias.id;
      writer.set(paths(user, record).state, append(state, { address: operation.address, id, requestId: operation.requestId, status: deleted ? 'deleted' : 'active',
        createdAt: safeDate(alias?.createdAt) || state.entries.find(value => value.address === operation.address)?.createdAt || iso(now()) }));
      writer.set(namePath, { ...name, uid: user.uid, mailboxId: record.id, address: operation.address, provider: 'hostinger', kind: 'alias', aliasId: id,
        status: deleted ? 'deleted' : 'active', updatedAt: iso(now()) });
      writer.set(operation.path, { ...previous, status: 'completed', aliasId: id, completedAt: iso(now()) });
    });
  }
  return {
    async list(user, input = {}) { const record = await own(user, input); return dto(record, await inventory(record)); },
    async create(user, input = {}) {
      const record = await own(user, input), local = localName(input.localPart, fail), address = `${local}@${DOMAIN}`;
      if (RESERVED.has(local.replace(/[._-]/g, '')) || /^(?:admin|administrator|postmaster|abuse|security|support|billing|noreply|mailerdaemon|taithai|owner|official)[._-]/.test(local)) {
        if (await allowReserved(user, local) !== true) fail('RESERVED_LOCAL_PART', 409);
      }
      if (address === record.address) fail('ADDRESS_UNAVAILABLE', 409);
      const operation = request(user, record, 'create', input, address);
      return store.withLock('hostinger-mail-alias-management', async () => {
        await refresh(user, record);
        let job = checkJob(await store.get(operation.path), operation);
        if (job?.status === 'completed') return result(user, record);
        const stock = await inventory(record), found = stock.aliases.find(value => value.address === address);
        if (found && !job?.attemptedAt) fail('ADDRESS_UNAVAILABLE', 409);
        if (found && !found.active) fail('MAIL_ALIAS_PROVISIONING_UNCERTAIN', 503);
        if (!found && stock.available < 1) fail('MAIL_ALIAS_LIMIT_REACHED', 409);
        await tx(async writer => {
          job = checkJob(await writer.get(operation.path), operation);
          const state = await readState(writer, user, record), namePath = `siteMailNames/${local}`, name = await writer.get(namePath);
          checkName(name, user, record, address, { allowDeleted: true });
          if (name && name.status !== 'deleted' && (!job || name.requestId !== operation.requestId)) fail('ADDRESS_UNAVAILABLE', 409);
          const stamp = iso(now());
          writer.set(operation.path, jobValue(operation, job));
          writer.set(paths(user, record).state, append(state, { address, ...(found ? { id: found.id } : {}), requestId: operation.requestId, status: 'provisioning', createdAt: stamp }));
          writer.set(namePath, { uid: user.uid, mailboxId: record.id, address, provider: 'hostinger', kind: 'alias', status: 'provisioning', requestId: operation.requestId, updatedAt: stamp });
        });
        try {
          await refresh(user, record);
          const alias = found || await provider.createAlias(record, local);
          if (!alias?.active || alias.address !== address || alias.mailbox?.id !== stock.mailbox.id || alias.mailbox?.address !== record.address || !resourceId(alias.id)) fail('MAIL_ALIAS_PROVISIONING_UNCERTAIN', 503);
          await complete(user, record, operation, alias, false);
        } catch (error) {
          if (['MAIL_ACCESS_REQUIRED', 'MAILBOX_NOT_FOUND', 'MAILBOX_CHANGED', 'MAIL_ALIAS_LIMIT_REACHED', 'ADDRESS_UNAVAILABLE'].includes(error?.code)) throw error;
          fail('MAIL_ALIAS_PROVISIONING_UNCERTAIN', 503);
        }
        return result(user, record);
      });
    },
    async remove(user, input = {}) {
      const record = await own(user, input);
      if (!resourceId(input.aliasId)) fail('MAIL_ALIAS_NOT_FOUND', 404);
      if (!email(input.confirmAddress) || input.confirmAddress === record.address) fail('ALIAS_CONFIRMATION_REQUIRED', 400);
      const operation = request(user, record, 'delete', input, input.confirmAddress, input.aliasId);
      return store.withLock('hostinger-mail-alias-management', async () => {
        await refresh(user, record);
        let job = checkJob(await store.get(operation.path), operation);
        if (job?.status === 'completed') return result(user, record);
        const stock = await inventory(record), found = stock.aliases.find(value => value.id === input.aliasId);
        if (!found && !job?.attemptedAt) fail('MAIL_ALIAS_NOT_FOUND', 404);
        if (!found && stock.aliases.some(value => value.address === input.confirmAddress)) fail('MAIL_ALIAS_DELETE_UNCERTAIN', 503);
        if (found && found.address !== input.confirmAddress) fail('ALIAS_CONFIRMATION_REQUIRED', 400);
        await tx(async writer => {
          job = checkJob(await writer.get(operation.path), operation);
          const state = await readState(writer, user, record), namePath = `siteMailNames/${input.confirmAddress.split('@')[0]}`, name = await writer.get(namePath);
          checkName(name, user, record, input.confirmAddress, { aliasId: input.aliasId, allowDeleted: true });
          const stamp = iso(now());
          writer.set(operation.path, jobValue(operation, job));
          writer.set(paths(user, record).state, append(state, { address: input.confirmAddress, id: input.aliasId, requestId: operation.requestId, status: 'deleting', createdAt: found?.createdAt || stamp }));
          writer.set(namePath, { ...name, uid: user.uid, mailboxId: record.id, address: input.confirmAddress, provider: 'hostinger', kind: 'alias', aliasId: input.aliasId, status: 'deleting', updatedAt: stamp });
        });
        try {
          await refresh(user, record);
          if (found) {
            try { await provider.deleteAlias(record, input.aliasId); }
            catch (error) { if (error?.code !== 'MAIL_ALIAS_NOT_FOUND') throw error; }
          }
          await complete(user, record, operation, found, true);
        } catch (error) {
          if (['MAIL_ACCESS_REQUIRED', 'MAILBOX_NOT_FOUND', 'MAILBOX_CHANGED'].includes(error?.code)) throw error;
          fail('MAIL_ALIAS_DELETE_UNCERTAIN', 503);
        }
        return result(user, record);
      });
    },
    async recipientAddresses(user, suppliedRecord) {
      const record = await own(user, { mailbox: suppliedRecord?.id });
      if (record.id !== suppliedRecord?.id || record.address !== suppliedRecord?.address) fail('MAILBOX_NOT_FOUND', 404);
      const state = await readState(store, user, record);
      return [{ address: record.address, kind: 'primary' }, ...state.entries.filter(value => ['active', 'deleted', 'deleting'].includes(value.status))
        .map(value => ({ address: value.address, kind: value.status === 'active' ? 'alias' : 'previous' }))];
    }
  };
}
