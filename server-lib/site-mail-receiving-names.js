import { createHash } from 'node:crypto';

// Receiving names describe one existing catch-all inbox. They never create a
// provider alias, reserve a global name, grant access or choose a sender.
const DOMAIN = 'taithai.app';
const LIMIT = 500;
const MAX_CANDIDATES = 128;
const APP_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const PROVIDER_ID = /^[A-Za-z0-9_-]{3,100}$/;
const SOURCES = ['to', 'cc', 'delivered-to', 'x-original-to', 'envelope-to'];
const RESERVED = new Set(('admin administrator root postmaster abuse security support help billing payment payments noreply mailerdaemon webmaster hostmaster domainmaster dns mail email smtp imap pop api assets system taithai taithai5002 owner official staff moderator contact info sales stripe accounts account www null undefined').split(' '));
const appId = value => typeof value === 'string' && APP_ID.test(value);
const providerId = value => typeof value === 'string' && PROVIDER_ID.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
const safeDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
function defaultFail(code, status = 400) { throw Object.assign(new Error(code), { code, status }); }
function nameAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || /[^\x21-\x7e]/.test(value)) return null;
  const address = value.toLowerCase(), suffix = '@' + DOMAIN;
  if (!address.endsWith(suffix)) return null;
  const local = address.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local) && !/[._-]{2}/.test(local) ? address : null;
}
function localName(value, fail) {
  if (typeof value !== 'string') fail('INVALID_LOCAL_PART', 400);
  const local = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$/.test(local) || /[._-]{2}/.test(local)) fail('INVALID_LOCAL_PART', 400);
  return local;
}
const reserved = local => RESERVED.has(local.replace(/[._-]/g, '')) || /^(?:admin|administrator|postmaster|abuse|security|support|billing|noreply|mailerdaemon|taithai|owner|official)[._-]/.test(local);
const sourceList = input => SOURCES.filter(source => Array.isArray(input) && input.includes(source));
const earlier = (a, b) => !a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b;
const later = (a, b) => !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

/** provider.receivingInventory must verify the configured order and return only
 * this mailbox plus server-only foreign-address exclusions. candidates(raw)
 * parses bounded message metadata; its contents remain untrusted evidence.
 * owned resolves fresh administrator access and the exact owned active record.
 */
export function createMailboxReceivingNameService({ store, provider, owned, candidates, fail = defaultFail, now = Date.now, allowReserved = () => false } = {}) {
  const transaction = store?.runTransaction || store?.transaction;
  if (!store?.get || typeof transaction !== 'function' || typeof owned !== 'function' || typeof candidates !== 'function' || typeof provider?.receivingInventory !== 'function') throw new TypeError('Receiving names require trusted ownership, inventory, metadata and transactional storage');
  const tx = callback => transaction.call(store, callback);
  const statePath = (user, record) => `siteMailReceivingNames/${hash(`${user.uid}\n${record.id}`)}`;
  async function own(user, input = {}) {
    if (!appId(user?.uid) || user.email_verified !== true) fail('MAIL_ACCESS_REQUIRED', 403);
    const { record } = await owned(user, input) || {};
    if (!record || record.uid !== user.uid || !appId(record.id) || record.status !== 'active' || record.provider !== 'hostinger' || nameAddress(record.address) !== record.address) fail('MAILBOX_NOT_FOUND', 404);
    return record;
  }
  async function refresh(user, record) {
    const fresh = await own(user, { mailbox: record.id });
    if (fresh.address !== record.address) fail('MAILBOX_CHANGED', 409);
    return fresh;
  }
  function stateValue(value, user, record) {
    if (!value) return { uid: user.uid, mailboxId: record.id, mailboxAddress: record.address, entries: [], truncated: false, updatedAt: null };
    if (value.uid !== user.uid || value.mailboxId !== record.id || value.mailboxAddress !== record.address || !Array.isArray(value.entries) || value.entries.length > LIMIT
      || value.updatedAt !== null && !safeDate(value.updatedAt) || typeof value.truncated !== 'boolean'
      || value.entries.some(entry => nameAddress(entry?.address) !== entry?.address || entry.address === record.address || !['active', 'hidden'].includes(entry.status)
        || !['saved', 'observed'].includes(entry.origin) || entry.firstSeenAt !== null && !safeDate(entry.firstSeenAt) || entry.lastSeenAt !== null && !safeDate(entry.lastSeenAt)
        || !safeDate(entry.createdAt) || !Array.isArray(entry.sources) || entry.sources.length > SOURCES.length || entry.sources.some(source => !SOURCES.includes(source)))
      || new Set(value.entries.map(entry => entry.address)).size !== value.entries.length) fail('MAIL_RECEIVING_NAMES_UNAVAILABLE', 503);
    return value;
  }
  const readState = async (reader, user, record) => stateValue(await reader.get(statePath(user, record)), user, record);
  async function inventory(record) {
    const stock = await provider.receivingInventory(record);
    if (!stock || !providerId(stock.mailbox?.id) || stock.mailbox.address !== record.address || typeof stock.catchallEnabled !== 'boolean'
      || !Array.isArray(stock.aliases) || stock.aliases.length > 1000 || !Array.isArray(stock.unavailableAddresses) || stock.unavailableAddresses.length > 2000
      || stock.unavailableAddresses.some(address => nameAddress(address) !== address || address === record.address)
      || stock.aliases.some(alias => !providerId(alias?.id) || nameAddress(alias.address) !== alias.address || alias.address === record.address
        || alias.mailbox?.id !== stock.mailbox.id || alias.mailbox?.address !== record.address || typeof alias.active !== 'boolean')
      || new Set(stock.aliases.map(alias => alias.id)).size !== stock.aliases.length || new Set(stock.aliases.map(alias => alias.address)).size !== stock.aliases.length) fail('MAIL_RECEIVING_NAMES_UNAVAILABLE', 503);
    return stock;
  }
  const unavailable = stock => new Set([...stock.unavailableAddresses, ...stock.aliases.filter(alias => !alias.active).map(alias => alias.address)]);
  function dto(record, stock, state) {
    const blocked = unavailable(stock), names = new Map();
    for (const alias of stock.aliases.filter(alias => alias.active)) {
      const entry = state.entries.find(item => item.address === alias.address);
      names.set(alias.address, { address: alias.address, kind: 'provider-alias', firstSeenAt: entry?.firstSeenAt || null, lastSeenAt: entry?.lastSeenAt || null, sources: sourceList(entry?.sources) });
    }
    const orderedEntries = [...state.entries.filter(entry => entry.origin === 'saved'), ...state.entries.filter(entry => entry.origin === 'observed')];
    for (const entry of orderedEntries) if (entry.status === 'active' && !blocked.has(entry.address) && !names.has(entry.address)) names.set(entry.address,
      { address: entry.address, kind: entry.origin, firstSeenAt: entry.firstSeenAt, lastSeenAt: entry.lastSeenAt, sources: sourceList(entry.sources) });
    const all = [...names.values()], receivingNames = all.slice(0, LIMIT);
    return { mailboxId: record.id, mailboxAddress: record.address, receivingNames, receivingNameCount: receivingNames.length, receivingNameLimit: LIMIT,
      receivingNamesTruncated: state.truncated || all.length > LIMIT, receivingNamesUpdatedAt: state.updatedAt,
      catchall: { enabled: stock.catchallEnabled, mailboxAddress: record.address }, canSaveReceivingName: stock.catchallEnabled && state.entries.length < LIMIT && receivingNames.length < LIMIT };
  }
  function foreignClaim(value, user, record, address) {
    return Boolean(value && (value.uid !== user.uid || value.mailboxId !== record.id || value.address !== address || value.provider !== 'hostinger'));
  }
  async function result(user, record, stock) {
    await refresh(user, record);
    return dto(record, stock || await inventory(record), await readState(store, user, record));
  }
  return {
    async list(user, input = {}) {
      const record = await own(user, input), stock = await inventory(record);
      return result(user, record, stock);
    },
    async save(user, input = {}) {
      const record = await own(user, input), local = localName(input.localPart, fail), address = `${local}@${DOMAIN}`;
      if (reserved(local) && await allowReserved(user, local) !== true) fail('RESERVED_LOCAL_PART', 409);
      const stock = await inventory(record);
      if (!stock.catchallEnabled) fail('MAIL_CATCHALL_REQUIRED', 409);
      if (address === record.address || unavailable(stock).has(address)) fail('ADDRESS_UNAVAILABLE', 409);
      await refresh(user, record);
      await tx(async writer => {
        const state = await readState(writer, user, record), claim = await writer.get(`siteMailNames/${local}`);
        if (foreignClaim(claim, user, record, address)) fail('ADDRESS_UNAVAILABLE', 409);
        if (stock.aliases.some(alias => alias.address === address && alias.active)) return;
        const entry = state.entries.find(item => item.address === address);
        if (entry?.status === 'active' && entry.origin === 'saved') return;
        if ((!entry && state.entries.length >= LIMIT) || (!entry || entry.status === 'hidden') && dto(record, stock, state).receivingNameCount >= LIMIT) fail('MAIL_RECEIVING_NAME_LIMIT_REACHED', 409);
        const stamp = iso(now()), next = { ...entry, address, status: 'active', origin: 'saved', firstSeenAt: entry?.firstSeenAt || null, lastSeenAt: entry?.lastSeenAt || null,
          sources: sourceList(entry?.sources), createdAt: entry?.createdAt || stamp };
        writer.set(statePath(user, record), { ...state, entries: [...state.entries.filter(item => item.address !== address), next], updatedAt: stamp });
      });
      return result(user, record, stock);
    },
    async hide(user, input = {}) {
      const record = await own(user, input), address = nameAddress(input.confirmAddress);
      if (!address || address !== input.confirmAddress || address === record.address) fail('ALIAS_CONFIRMATION_REQUIRED', 400);
      const stock = await inventory(record);
      if (stock.aliases.some(alias => alias.address === address && alias.active)) fail('MAIL_RECEIVING_NAME_IS_PROVIDER_ALIAS', 409);
      await refresh(user, record);
      await tx(async writer => {
        const state = await readState(writer, user, record), entry = state.entries.find(item => item.address === address);
        if (!entry || entry.status === 'hidden') return;
        writer.set(statePath(user, record), { ...state, entries: state.entries.map(item => item.address === address ? { ...item, status: 'hidden' } : item), updatedAt: iso(now()) });
      });
      return result(user, record, stock);
    },
    async observe(user, suppliedRecord, rawMessages) {
      const record = await own(user, { mailbox: suppliedRecord?.id });
      if (record.address !== suppliedRecord?.address) fail('MAILBOX_CHANGED', 409);
      const stock = await inventory(record);
      if (!stock.catchallEnabled) return { ...await result(user, record, stock), changed: false };
      const blocked = unavailable(stock), found = new Map(), stamp = iso(now());
      const activeAliases = new Set(stock.aliases.filter(alias => alias.active).map(alias => alias.address));
      let overflow = false;
      for (const raw of (Array.isArray(rawMessages) ? rawMessages : []).slice(0, 50)) {
        let parsed; try { parsed = candidates(raw); } catch { continue; }
        let observed = raw?.internalDate;
        observed = observed instanceof Date ? Number.isFinite(observed.getTime()) ? observed.toISOString() : null : safeDate(observed);
        if (!observed || Date.parse(observed) > now() + 300000 || Date.parse(observed) < 0) observed = stamp;
        for (const candidate of (Array.isArray(parsed) ? parsed : []).slice(0, MAX_CANDIDATES)) {
          const address = nameAddress(candidate?.address), sources = sourceList(candidate?.sources);
          if (!address || !sources.length || address === record.address || blocked.has(address) || activeAliases.has(address)) continue;
          const previous = found.get(address);
          if (!previous && found.size >= MAX_CANDIDATES) { overflow = true; continue; }
          found.set(address, { address, firstSeenAt: earlier(previous?.firstSeenAt, observed), lastSeenAt: later(previous?.lastSeenAt, observed), sources: sourceList([...(previous?.sources || []), ...sources]) });
        }
      }
      if (!found.size && !overflow) return { ...await result(user, record, stock), changed: false };
      await refresh(user, record);
      let changed = false;
      await tx(async writer => {
        const state = await readState(writer, user, record);
        const claims = new Map(await Promise.all([...found.values()].map(async value => [value.address, await writer.get(`siteMailNames/${value.address.split('@')[0]}`)])));
        const entries = [...state.entries]; let truncated = state.truncated || overflow;
        for (const candidate of found.values()) {
          if (foreignClaim(claims.get(candidate.address), user, record, candidate.address)) continue;
          const index = entries.findIndex(entry => entry.address === candidate.address), entry = entries[index];
          if (entry?.status === 'hidden') continue;
          if (!entry && (entries.length >= LIMIT || dto(record, stock, { ...state, entries }).receivingNameCount >= LIMIT)) { truncated = true; continue; }
          const next = { address: candidate.address, status: 'active', origin: entry?.origin || 'observed', createdAt: entry?.createdAt || stamp,
            firstSeenAt: earlier(entry?.firstSeenAt, candidate.firstSeenAt), lastSeenAt: later(entry?.lastSeenAt, candidate.lastSeenAt), sources: sourceList([...(entry?.sources || []), ...candidate.sources]) };
          if (entry && JSON.stringify(entry) === JSON.stringify(next)) continue;
          if (index < 0) entries.push(next); else entries[index] = next;
          changed = true;
        }
        if (truncated !== state.truncated) changed = true;
        if (changed) writer.set(statePath(user, record), { ...state, entries, truncated, updatedAt: stamp });
      });
      return { ...await result(user, record, stock), changed };
    },
    async recipientAddresses(user, suppliedRecord) {
      const record = await own(user, { mailbox: suppliedRecord?.id });
      if (record.address !== suppliedRecord?.address) fail('MAILBOX_CHANGED', 409);
      const state = await readState(store, user, record);
      return [{ address: record.address, kind: 'primary' }, ...state.entries.map(entry => ({ address: entry.address, kind: entry.status === 'hidden' ? 'previous' : 'alias' }))];
    }
  };
}
