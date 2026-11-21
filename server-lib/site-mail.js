import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { convert as convertHtmlToText } from 'html-to-text';
import { assertMembershipOperationActive, combineMembershipOperationSignal } from './site-operation-budget.js';

// Server-only. No provider calls happen at import time. Never expose these
// collections to a client SDK; credentials are encrypted before every write.
// Provider reference: https://www.migadu.com/api/ and /guides/ (TLS IMAP/SMTP).
export const MAIL_LIMITS = Object.freeze({ maxRecipients: 5, maxSubject: 200, maxText: 20000,
  dailyMessages: 20, pageSize: 25, maxFolders: 50, maxReadText: 100000, maxBodyBytes: 256 * 1024 });
const DOMAIN = 'taithai.app';
export const MAIL_PROVIDER_SETTINGS = Object.freeze({
  migadu: Object.freeze({ id: 'migadu', imapHost: 'imap.migadu.com', smtpHost: 'smtp.migadu.com', expectedMxHosts: Object.freeze(['aspmx1.migadu.com','aspmx2.migadu.com']) }),
  purelymail: Object.freeze({ id: 'purelymail', imapHost: 'imap.purelymail.com', smtpHost: 'smtp.purelymail.com', expectedMxHosts: Object.freeze(['mailserver.purelymail.com']) }),
  hostinger: Object.freeze({ id: 'hostinger', imapHost: 'imap.hostinger.com', smtpHost: 'smtp.hostinger.com', expectedMxHosts: Object.freeze(['mx1.hostinger.com','mx2.hostinger.com']) })
});
const routingFor = name => typeof name === 'string' && Object.hasOwn(MAIL_PROVIDER_SETTINGS, name) ? MAIL_PROVIDER_SETTINGS[name] : null;
export function providerRouting(env = process.env) {
  const value = routingFor(env.MAIL_PROVIDER);
  if (!value) fail('MAIL_NOT_CONFIGURED', 503);
  return value;
}
const RESERVED = new Set(('admin administrator root postmaster abuse security support help billing payment payments ' +
  'noreply mailerdaemon webmaster hostmaster domainmaster dns mail email smtp imap pop api assets system ' +
  'taithai taithai5002 owner official staff moderator contact info sales stripe accounts account www null undefined').split(' '));
const uidPattern = /^[A-Za-z0-9_.:-]{1,128}$/;
const addressPattern = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const iso = value => new Date(value).toISOString();

export class MailError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'MailError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new MailError(code, status); };
const bounded = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
// Metadata is inert plain text; U+2039/203A preserve recognizable punctuation
// without ever returning markup. Body text is rendered with textContent only.
const metadata = (value, max = 200) => bounded(value, max).replace(/[\r\n]+/g, ' ').replaceAll('<', '‹').replaceAll('>', '›');
function uid(value) { if (typeof value !== 'string' || !uidPattern.test(value)) fail('AUTH_REQUIRED', 401); return value; }
function identity(user) {
  if (typeof user?.uid!=='string' || !uidPattern.test(user.uid) || user?.email_verified!==true || typeof user?.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) fail('MAIL_ACCESS_REQUIRED',403);
  return user.uid;
}
function address(value) {
  if (typeof value !== 'string' || value.length > 254 || value.split('@')[0].length > 64 || /[^\x21-\x7e]/.test(value) || !addressPattern.test(value)) fail('INVALID_RECIPIENT');
  return value;
}
function localPart(value) {
  if (typeof value !== 'string') fail('INVALID_LOCAL_PART');
  const local = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(local) || local.includes('..')) fail('INVALID_LOCAL_PART');
  if (RESERVED.has(local.replace(/[._-]/g, '')) || /^(?:admin|administrator|postmaster|abuse|security|support|billing|noreply|mailerdaemon|taithai|owner|official)[._-]/.test(local)) fail('RESERVED_LOCAL_PART', 409);
  return local;
}
function newMailboxLocalPart(value, providerName) {
  const local = localPart(value);
  // Hostinger's public help and OpenAPI disagree about _ and -. New addresses
  // use their common subset until real provider behavior is verified. Keep
  // credential decoding and legacy providers independent of this restriction.
  if (providerName === 'hostinger' && /[_-]/.test(local)) fail('INVALID_LOCAL_PART');
  return local;
}
function secretKey(env) {
  const raw = env.MAIL_CREDENTIAL_SECRET || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) fail('MAIL_NOT_CONFIGURED', 503);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64') !== raw) fail('MAIL_NOT_CONFIGURED', 503);
  return key;
}
export function mailConfiguration(env = process.env) {
  let ready = false;
  const routing = routingFor(env.MAIL_PROVIDER);
  try {
    secretKey(env);
    const credentialsReady = routing?.id === 'migadu'
      ? Boolean(address(env.MIGADU_API_USER)) && typeof env.MIGADU_API_KEY === 'string' && env.MIGADU_API_KEY.length >= 10
      : routing?.id === 'purelymail' ? typeof env.PURELYMAIL_API_TOKEN === 'string' && env.PURELYMAIL_API_TOKEN.length >= 10 && !/[\x00-\x20\x7f]/.test(env.PURELYMAIL_API_TOKEN)
        : routing?.id === 'hostinger' && typeof env.HOSTINGER_API_TOKEN === 'string' && env.HOSTINGER_API_TOKEN.length >= 10 && !/[\x00-\x20\x7f]/.test(env.HOSTINGER_API_TOKEN) && /^[A-Za-z0-9_-]{3,100}$/.test(env.HOSTINGER_MAIL_ORDER_ID || '');
    ready = env.MAIL_READY === 'true' && env.MAIL_DOMAIN === DOMAIN && Boolean(routing && credentialsReady);
  } catch { /* Configuration is deliberately reported without secret details. */ }
  return { ready, domain: DOMAIN, provider: routing?.id || null, expectedMxHosts: routing?.expectedMxHosts || [] };
}
function recordProvider(record) {
  const value = record.provider || (record.credential?.version === 1 ? 'migadu' : null);
  if (!routingFor(value) || (record.credential?.version === 1 && value !== 'migadu')) fail('MAIL_PROVIDER_MISMATCH', 503);
  return value;
}
export function encryptMailboxCredential(password, { env = process.env, userId, mailboxAddress, provider: providerName = env.MAIL_PROVIDER } = {}) {
  if (!routingFor(providerName)) fail('MAIL_NOT_CONFIGURED', 503);
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secretKey(env), iv);
  cipher.setAAD(Buffer.from(`${uid(userId)}\n${mailboxAddress}\n${providerName}`));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { version: 2, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function decryptMailboxCredential(record, { env = process.env } = {}) {
  try {
    if (![1,2].includes(record.credential?.version) || record.address !== `${localPart(record.localPart)}@${DOMAIN}`) fail('MAIL_CREDENTIAL_UNAVAILABLE', 503);
    const providerName = recordProvider(record);
    const iv = Buffer.from(record.credential.iv, 'base64'); const tag = Buffer.from(record.credential.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) fail('MAIL_CREDENTIAL_UNAVAILABLE', 503);
    const decipher = createDecipheriv('aes-256-gcm', secretKey(env), iv);
    decipher.setAAD(Buffer.from(`${uid(record.uid)}\n${record.address}${record.credential.version === 2 ? '\n' + providerName : ''}`)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(record.credential.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch { fail('MAIL_CREDENTIAL_UNAVAILABLE', 503); }
}

function folderPath(value = 'INBOX') {
  if (typeof value !== 'string' || !value || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_FOLDER');
  return value;
}
function validity(value) { const s = String(value ?? ''); if (!/^[1-9]\d{0,19}$/.test(s)) fail('MAILBOX_CHANGED', 409); return s; }
function messageUid(value) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 4294967295) fail('INVALID_MESSAGE'); return n; }
export function encodeMailMessageId({ folder, uid: id, uidValidity, mailboxId }) {
  const parts = [folderPath(folder), validity(uidValidity), messageUid(id)];
  if (mailboxId !== undefined) parts.unshift(uid(mailboxId));
  return (mailboxId === undefined ? 'm1.' : 'm2.') + Buffer.from(JSON.stringify(parts)).toString('base64url');
}
export function decodeMailMessageId(value) {
  try {
    if (typeof value !== 'string' || !/^m[12]\.[A-Za-z0-9_-]{1,768}$/.test(value)) fail('INVALID_MESSAGE');
    const parts = JSON.parse(Buffer.from(value.slice(3), 'base64url').toString());
    if (!Array.isArray(parts) || parts.length !== (value.startsWith('m2.') ? 4 : 3)) fail('INVALID_MESSAGE');
    const mailboxId = parts.length === 4 ? uid(parts.shift()) : undefined;
    return { ...(mailboxId ? { mailboxId } : {}), folder: folderPath(parts[0]), uidValidity: validity(parts[1]), uid: messageUid(parts[2]) };
  } catch { fail('INVALID_MESSAGE'); }
}

// Convert email content to inert text, not sanitized HTML. Verification URLs
// keep their query/fragment tokens and appear on separate lines so surrounding
// punctuation cannot accidentally become part of the clickable destination.
export function readableMailHtml(html, { convert = convertHtmlToText } = {}) {
  if (typeof html !== 'string' || html.length > MAIL_LIMITS.maxBodyBytes) fail('MESSAGE_TOO_LARGE', 413);
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let depth = 0; let tags = 0;
  // A conservative linear guard precedes the HTML parser. The converter's
  // traversal limits alone do not bound pathological parser nesting work.
  for (const match of html.matchAll(/<\s*(\/?)([a-z][a-z0-9:-]*)\b/gi)) {
    if (++tags > 10000) fail('MESSAGE_TOO_LARGE', 413);
    if (voidTags.has(match[2].toLowerCase())) continue;
    depth = match[1] ? Math.max(0, depth - 1) : depth + 1;
    if (depth > 64) fail('MESSAGE_TOO_LARGE', 413);
  }
  const skipped = new Set(['img','picture','source','script','style','head','title','meta','link','base','iframe','embed','object','svg','math','canvas','video','audio','input','select','textarea','noscript']);
  const blocks = new Set(['article','aside','blockquote','div','footer','form','h1','h2','h3','h4','h5','h6','header','li','main','nav','ol','p','pre','section','table','tr','ul']);
  const hidden = element => skipped.has(element.name) || element.attribs?.hidden !== undefined ||
    String(element.attribs?.['aria-hidden'] || '').toLowerCase() === 'true' ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|mso-hide\s*:\s*all|opacity\s*:\s*0(?:\.0+)?(?:\s*!important)?\s*(?:;|$))/i.test(element.attribs?.style || '');
  let links = 0;
  const safeHref = value => {
    if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)) return '';
    try {
      const url = new URL(value.startsWith('//') ? 'https:' + value : value);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return '';
      return url.href.replaceAll("'", '%27');
    } catch { return ''; }
  };
  function anchor(element, walk, builder) {
    if (hidden(element)) return;
    walk(element.children, builder);
    const href = safeHref(element.attribs?.href);
    if (href && links++ < 50) {
      builder.openBlock({ leadingLineBreaks: 1 }); builder.addInline(href); builder.closeBlock({ trailingLineBreaks: 1 });
    }
  }
  function styled(element, walk, builder) {
    if (hidden(element)) return;
    if (element.name === 'a') return anchor(element, walk, builder);
    if (blocks.has(element.name)) builder.openBlock({ leadingLineBreaks: 1 });
    walk(element.children, builder);
    if (blocks.has(element.name)) builder.closeBlock({ trailingLineBreaks: 1 });
  }
  return convert(html, { wordwrap: false, decodeEntities: true,
    limits: { maxInputLength: MAIL_LIMITS.maxBodyBytes, maxDepth: 64, maxChildNodes: 10000, ellipsis: '…' },
    formatters: { mailAnchor: anchor, mailStyled: styled }, selectors: [
      ...[...skipped].map(selector => ({ selector, format: 'skip' })),
      ...['h1','h2','h3','h4','h5','h6'].map(selector => ({ selector, options: { uppercase: false } })),
      { selector: 'a', format: 'mailAnchor' }, { selector: '[style]', format: 'mailStyled' },
      { selector: '[hidden]', format: 'skip' }, { selector: '[aria-hidden="true"i]', format: 'skip' }
    ] });
}
function messageInput(input) { return input.id ? decodeMailMessageId(input.id) : { folder: folderPath(input.folder), uid: messageUid(input.uid), uidValidity: validity(input.uidValidity) }; }
function publicMailbox(record) {
  return record ? { id: record.id || record.uid, address: record.address, localPart: record.localPart, provider: record.provider || 'migadu', status: record.status, createdAt: record.createdAt,
    ...(record.status === 'provisioning' && Number.isFinite(record.leaseUntil) ? { retryAt: iso(record.leaseUntil) } : {}) } : null;
}
function memberState(value) {
  const mailAccess=value?.active===true && value?.mailAccess===true && value?.adminAccess===true;
  return {active:mailAccess,mailAccess,adminAccess:value?.adminAccess===true,ownerAccess:value?.ownerAccess===true && mailAccess,
    adminOnly:true,role:mailAccess && value.role==='owner'?'owner':mailAccess?'admin':'none',permissions:mailAccess && Array.isArray(value.permissions)?value.permissions:[],paid:false,ownerTrial:false};
}
function recipientList(value) {
  const values = typeof value === 'string' ? value.trim().split(/[\s,;]+/).filter(Boolean) : value;
  if (!Array.isArray(values) || values.length < 1 || values.length > MAIL_LIMITS.maxRecipients) fail('INVALID_RECIPIENTS');
  return [...new Set(values.map(address))];
}
function safeMessage(raw, folder, uidValidity, body = false, mailboxId) {
  const envelope = raw.envelope || raw;
  const asAddresses = value => (Array.isArray(value) ? value : value?.value || []).slice(0, 20).map(item => ({
    name: metadata(item.name, 160), address: metadata(item.address, 254)
  }));
  const renderAddresses = value => asAddresses(value).map(item => item.name ? `${item.name} ‹${item.address}›` : item.address).join(', ');
  const date = envelope.date || raw.internalDate;
  const result = { id: encodeMailMessageId({ folder, uid: raw.uid, uidValidity, mailboxId }), uid: messageUid(raw.uid), uidValidity: validity(uidValidity),
    subject: metadata(envelope.subject), from: renderAddresses(envelope.from), to: renderAddresses(envelope.to), cc: renderAddresses(envelope.cc),
    date: date && Number.isFinite(new Date(date).getTime()) ? iso(date) : null,
    unread: !(raw.flags instanceof Set ? raw.flags.has('\\Seen') : raw.read === true), size: Math.max(0, Number(raw.size) || 0), preview: '' };
  if (body) {
    result.replyToAddress = '';
    // Never reconstruct a reply destination by parsing display names, which
    // may themselves contain address-like angle brackets.
    const values = value => Array.isArray(value) ? value : value?.value || [];
    for (const candidate of [...values(envelope.replyTo), ...values(envelope.from)].slice(0, 40)) {
      try { result.replyToAddress = address(candidate.address); break; } catch { /* Skip malformed address fields, not display names. */ }
    }
    result.text = bounded(raw.text, MAIL_LIMITS.maxReadText);
    result.truncated = raw.truncated === true || String(raw.text || '').length > MAIL_LIMITS.maxReadText;
    result.attachments = (raw.attachments || []).slice(0, 50).map(item => ({ name: metadata(item.name || item.filename, 200),
      type: metadata(item.type || item.contentType, 100), size: Math.max(0, Number(item.size) || 0) }));
  }
  return result;
}

/** store: get(path), set(path,value), runTransaction(tx => ...), where tx has
 * get/set. getMembership(uid,{user}) must resolve the live server-only admin grant,
 * never client flags, paid records or an expiring trial.
 * Client input never chooses a storage owner or supplies mailbox credentials. */
export function createSiteMail({ store, getMembership, capacityStatus, withProvisioningLock, provider, imap, smtp, env = process.env, now = Date.now, provisioningTimeoutMs = 45000 } = {}) {
  if (!store?.get || !store?.set || !(store.runTransaction || store.transaction) || typeof getMembership !== 'function') throw new TypeError('Mail requires a transactional store and trusted membership resolver');
  if (!Number.isSafeInteger(provisioningTimeoutMs) || provisioningTimeoutMs < 1 || provisioningTimeoutMs > 45000) throw new TypeError('Invalid mail provisioning deadline');
  const transaction = callback => (store.runTransaction || store.transaction).call(store, callback);
  const configured = () => {
    if (env.OWNER_MAIL_ENABLED!=='true') fail('OWNER_MAIL_NOT_ENABLED',503);
    if (!mailConfiguration(env).ready || !provider || !imap || !smtp) fail('MAIL_NOT_CONFIGURED', 503);
    if (provider.id && provider.id !== env.MAIL_PROVIDER) fail('MAIL_PROVIDER_MISMATCH', 503);
  };
  const membership = async (userId, user) => {
    return memberState(await getMembership(userId,{user}));
  };
  const entitled = state => state.active && state.mailAccess;
  async function requireMailAccess(userId,user) {const state=await membership(userId,user);if(!entitled(state))fail('MAIL_ACCESS_REQUIRED',403);return state;}
  function credentialsFor(record) {
    const providerName = recordProvider(record);
    if (providerName !== env.MAIL_PROVIDER) fail('MAIL_PROVIDER_MISMATCH', 503);
    return { address: record.address, provider: providerName, password: decryptMailboxCredential(record, { env }) };
  }
  // The first/legacy mailbox keeps its UID and storage path. Additional IDs are
  // opaque. An owner-only index avoids client-controlled queries and copying
  // legacy ciphertext into a second, potentially stale canonical document.
  const accountPath = (userId, id) => id === userId ? `siteMailboxes/${userId}` : `siteMailAccounts/${id}`;
  async function accounts(userId, reader = store) {
    const index = await reader.get(`siteMailUserAccounts/${userId}`);
    let ids;
    if (index) {
      if (index.uid !== userId || !Array.isArray(index.mailboxIds) || new Set(index.mailboxIds).size !== index.mailboxIds.length || index.mailboxIds.some(id => typeof id !== 'string' || !uidPattern.test(id))) fail('MAILBOX_STATE_UNAVAILABLE', 503);
      ids = index.mailboxIds;
    } else {
      const legacy = await reader.get(`siteMailboxes/${userId}`);
      if (legacy && legacy.uid !== userId) fail('MAILBOX_STATE_UNAVAILABLE', 503);
      return { ids: legacy ? [userId] : [], records: legacy ? [{ ...legacy, id: userId }] : [] };
    }
    const records = [];
    // Account quantity has no product-tier ceiling. Keep storage concurrency
    // bounded as the ordered owner index grows; Firestore document/response
    // limits remain technical constraints, not an advertised unlimited service.
    for (let start = 0; start < ids.length; start += 25) {
      const batch = await Promise.all(ids.slice(start, start + 25).map(async id => {
        const record = await reader.get(accountPath(userId, id));
        if (!record || record.uid !== userId || (record.id && record.id !== id)) fail('MAILBOX_STATE_UNAVAILABLE', 503);
        return { ...record, id };
      }));
      records.push(...batch);
    }
    return { ids, records };
  }
  function selection(input = {}) {
    if (input.mailbox !== undefined && input.mailboxId !== undefined && input.mailbox !== input.mailboxId) fail('MAILBOX_NOT_FOUND', 404);
    const id = input.mailbox ?? input.mailboxId;
    if (id !== undefined && (typeof id !== 'string' || !uidPattern.test(id))) fail('MAILBOX_NOT_FOUND', 404);
    return id;
  }
  function selected(records, input = {}) {
    const id = selection(input);
    if (id === undefined && records.length > 1) fail('MAILBOX_SELECTION_REQUIRED', 400);
    const record = id === undefined ? records[0] : records.find(item => item.id === id);
    if (!record || record.status !== 'active') fail('MAILBOX_NOT_FOUND', 404);
    return record;
  }
  const allocated = (records, record, member) => entitled(member) && records.some(item=>item.status!=='unavailable' && item.id===record.id);
  async function paidMailbox(userId, user, id) {
    const member = await requireMailAccess(userId,user); const { records } = await accounts(userId);
    const record = records.find(item => item.id === id && item.status === 'active');
    if (!record) fail('MAILBOX_NOT_FOUND', 404);
    if (!allocated(records, record, member)) fail('MAILBOX_NOT_ENTITLED', 403);
    return record;
  }
  async function rate(userId, kind, maximum, window = 60000) {
    const key = `siteMailQuotas/${userId}_${kind}`; const windowStart = Math.floor(now() / window) * window;
    await transaction(async tx => { const value = await tx.get(key); const count = value?.windowStart === windowStart ? Number(value.count || 0) : 0;
      if (count >= maximum) fail('MAIL_RATE_LIMITED', 429);
      tx.set(key, { uid: userId, count: count + 1, windowStart, expiresAt: iso(now() + window * 2) }); });
  }
  async function owned(user, input = {}) {
    const userId = identity(user);
    await requireMailAccess(userId,user); configured(); selection(input);
    const { records } = await accounts(userId); const record = selected(records, input);
    await rate(userId, 'access', 90);
    return { record, records, credentials: credentialsFor(record) };
  }
  function reference(input, record, records) {
    const ref = messageInput(input);
    if (ref.mailboxId ? ref.mailboxId !== record.id : records.length > 1) fail('INVALID_MESSAGE');
    return ref;
  }
  async function external(operation) {
    try { return await operation(); } catch (error) { if (error instanceof MailError) throw error; fail('MAIL_UNAVAILABLE', 503); }
  }
  async function status(user) {
    const userId = identity(user);
    const empty={ready:false,adminOnly:true,ownerAccess:false,adminAccess:false,mailAccess:false,paid:false,ownerTrial:false,domain:DOMAIN,provider:mailConfiguration(env).provider,
      membership:null,mailbox:null,mailboxes:[],pendingMailboxes:[],mailboxCapacity:0,mailboxUsed:0,mailboxAvailable:0,capacityAvailable:false,
      canCreate:false,canSend:false,canRetryProvisioning:false,canManageMessages:false,limits:MAIL_LIMITS};
    const member=await membership(userId,user);if(!entitled(member))return empty;
    const access={ownerAccess:member.ownerAccess,adminAccess:member.adminAccess,mailAccess:member.mailAccess,role:member.role,permissions:member.permissions};
    if(env.OWNER_MAIL_ENABLED!=='true' || !mailConfiguration(env).ready)return {...empty,...access};
    const {records}=await accounts(userId);
    const ready = Boolean(provider && imap && smtp) && (!provider.id || provider.id === env.MAIL_PROVIDER) && records.every(record => {
      try { return record.status === 'unavailable' || recordProvider(record) === env.MAIL_PROVIDER; } catch { return false; }
    });
    const writable = ready && entitled(member);
    const visible = records.map(record => {
      let matches = false; try { matches = recordProvider(record) === env.MAIL_PROVIDER; } catch { /* Fail closed for this saved provider. */ }
      const inAllocation = allocated(records, record, member);
      return { ...publicMailbox(record), archived: record.status === 'active' && !inAllocation,
        canSend: writable && matches && inAllocation && record.status === 'active',
        canManageMessages: ready && matches && record.status === 'active',
        canRetryProvisioning: writable && matches && inAllocation && record.status === 'provisioning' && record.leaseUntil <= now() };
    });
    const mailboxes = visible.filter(item => item.status === 'active');
    const pendingMailboxes = visible.filter(item => item.status === 'provisioning');
    const mailboxUsed = visible.filter(item => item.status !== 'unavailable').length;
    let stock=null;
    try {
      stock=await (capacityStatus ? capacityStatus(user) : provider.inventory?.());
      if(!Number.isSafeInteger(stock?.capacity) || stock.capacity<1 || !Number.isSafeInteger(stock.used) || stock.used<0
        || !Number.isSafeInteger(stock.available) || stock.available<0 || stock.available>stock.capacity)stock=null;
    }catch{/* A management API outage blocks creation, not the owner's existing inbox. */}
    const mailboxCapacity=stock?.capacity || 0,mailboxAvailable=stock?Math.max(0,stock.available-(capacityStatus?0:pendingMailboxes.length)):0;
    const mailbox = pendingMailboxes[0] || mailboxes[0] || visible[0] || null;
    return { ready, domain: DOMAIN, provider: mailConfiguration(env).provider, mailbox, mailboxes, pendingMailboxes, mailboxCapacity, mailboxUsed,
      membership:null,adminOnly:true,...access,paid:false,ownerTrial:false,mailboxAvailable,capacityAvailable:Boolean(stock),
      canCreate:writable && mailboxAvailable>0,
      canSend: mailboxes.some(item => item.canSend), canRetryProvisioning: pendingMailboxes.some(item => item.canRetryProvisioning),
      canManageMessages: mailboxes.some(item => item.canManageMessages), limits: MAIL_LIMITS };
  }
  async function create(user, input = {}) {
    const userId = identity(user); const member = await requireMailAccess(userId,user); configured(); selection(input);
    const local = newMailboxLocalPart(input.localPart, env.MAIL_PROVIDER); await rate(userId, 'create', 40, 86400000);
    const requestId = input.requestId ?? createHash('sha256').update(`${userId}\n${local}`).digest('hex');
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) fail('INVALID_REQUEST_ID');
    const createJobPath = `siteMailCreateJobs/${userId}_${requestId}`;
    const mailboxAddress = `${local}@${DOMAIN}`; const operationId = randomUUID();
    // Hostinger requires all four character classes and a maximum of 50 chars.
    // The fixed suffix adds no entropy claim; the random 256 bits do.
    const password = randomBytes(32).toString('base64url') + (env.MAIL_PROVIDER === 'hostinger' ? 'aA1!' : '');
    const candidate = { uid: userId, localPart: local, address: mailboxAddress, provider: env.MAIL_PROVIDER, status: 'provisioning', operationId,
      marker: `Taithai member ${operationId}`, credential: encryptMailboxCredential(password, { env, userId, mailboxAddress }),
      createdAt: iso(now()), updatedAt: iso(now()), leaseUntil: now() + 30000 };
    const record = await transaction(async tx => {
      const { records } = await accounts(userId, tx);
      if (records.some(item => item.status !== 'unavailable' && recordProvider(item) !== env.MAIL_PROVIDER)) fail('MAIL_PROVIDER_MISMATCH', 503);
      const name = await tx.get(`siteMailNames/${local}`); const job = await tx.get(createJobPath);
      if (job && (job.uid !== userId || job.localPart !== local)) fail('REQUEST_ID_CONFLICT', 409);
      const existing = records.find(item => item.localPart === local);
      if (job && (!existing || existing.id !== job.mailboxId)) fail('REQUEST_ID_CONFLICT', 409);
      if (existing && existing.status !== 'unavailable') {
        if (recordProvider(existing) !== env.MAIL_PROVIDER) fail('MAIL_PROVIDER_MISMATCH', 503);
        if (selection(input) !== undefined && selection(input) !== existing.id) fail('MAILBOX_NOT_FOUND', 404);
        if (!allocated(records, existing, member)) fail('MAILBOX_NOT_ENTITLED', 403);
        if (existing.status === 'active') {
          if (!job) tx.set(createJobPath, { uid: userId, mailboxId: existing.id, localPart: local, createdAt: iso(now()) });
          return existing;
        }
        if (existing.leaseUntil > now()) fail('MAILBOX_PROVISIONING', 409);
        const renewed = { ...existing, leaseUntil: now() + 30000, updatedAt: iso(now()) };
        tx.set(accountPath(userId, existing.id), renewed);
        if (!job) tx.set(createJobPath, { uid: userId, mailboxId: existing.id, localPart: local, createdAt: iso(now()) });
        return renewed;
      }
      const retained = records.filter(item => item.status !== 'unavailable');
      if (name) fail('ADDRESS_UNAVAILABLE', 409);
      if (selection(input) !== undefined) fail('MAILBOX_NOT_FOUND', 404);
      const id = records.length === 0 ? userId : `mbx_${randomUUID()}`;
      if (id !== userId && await tx.get(accountPath(userId, id))) fail('MAILBOX_CONFLICT', 409);
      const next = { ...candidate, id };
      tx.set(accountPath(userId, id), next);
      tx.set(`siteMailUserAccounts/${userId}`, { uid: userId, mailboxIds: [...retained.map(item => item.id), id], updatedAt: iso(now()) });
      tx.set(`siteMailNames/${local}`, { uid: userId, mailboxId: id, address: mailboxAddress, provider: env.MAIL_PROVIDER, operationId, createdAt: iso(now()) });
      tx.set(createJobPath, { uid: userId, mailboxId: id, localPart: local, createdAt: iso(now()) });
      return next;
    });
    const providerOptions = record.provider === 'hostinger' ? { signal: combineMembershipOperationSignal(AbortSignal.timeout(provisioningTimeoutMs)) } : {};
    const withinDeadline = () => { if (providerOptions.signal?.aborted) fail('MAILBOX_PROVISIONING_UNCERTAIN', 503); };
    withinDeadline();
    const result = async () => ({ ...await status(user), createdMailbox: publicMailbox({ ...record, status: 'active' }) });
    if (record.status === 'active') return result();
    const path = accountPath(userId, record.id);
    const provision=async(capacity)=>{
      const latestMember = await requireMailAccess(userId,user); const latestAccounts = await accounts(userId);
      if (!allocated(latestAccounts.records, record, latestMember)) fail('MAILBOX_NOT_ENTITLED', 403);
      const usesPasswordProof = ['purelymail','hostinger'].includes(record.provider);
      if (usesPasswordProof && (!provider.assertReady || await provider.assertReady(providerOptions) !== true)) fail('MAIL_PROVIDER_NOT_READY', 503);
      withinDeadline();
      const found = await provider.findMailbox(local, providerOptions);
      const password = decryptMailboxCredential(record, { env });
      if (found && usesPasswordProof && record.creationAttemptedAt) {
        if (!provider.verifyMailboxOwnership || await provider.verifyMailboxOwnership({ localPart: local, password, ...providerOptions }) !== true) fail('MAILBOX_PROVISIONING_UNCERTAIN', 503);
      } else if (found && (usesPasswordProof || found.name !== record.marker)) {
        await store.set(path, { ...record, status: 'unavailable', leaseUntil: 0, updatedAt: iso(now()) });
        fail('ADDRESS_UNAVAILABLE', 409);
      }
      if (!found) {
        if(capacity?.reserve)await capacity.reserve(record);
        else if (!provider.assertCapacity || await provider.assertCapacity(1,providerOptions)!==true) fail('MAIL_PROVIDER_CAPACITY_REACHED',503);
        withinDeadline();
        await transaction(async tx => {
          const latest = await tx.get(path);
          if (!latest || latest.operationId !== record.operationId || latest.status !== 'provisioning') fail('MAILBOX_CONFLICT', 409);
          tx.set(path, { ...latest, creationAttemptedAt: iso(now()) });
        });
        withinDeadline();
        await provider.createMailbox({ localPart: local, password, marker: record.marker }, providerOptions);
        if (usesPasswordProof && (!provider.verifyMailboxOwnership || await provider.verifyMailboxOwnership({ localPart: local, password, ...providerOptions }) !== true)) fail('MAILBOX_PROVISIONING_UNCERTAIN', 503);
      }
      withinDeadline();
      await transaction(async tx => {
        const latest = await tx.get(path);
        if (!latest || latest.operationId !== record.operationId) fail('MAILBOX_CONFLICT', 409);
        tx.set(path, { ...latest, status: 'active', leaseUntil: 0, updatedAt: iso(now()) });
      });
      if(capacity?.complete)await capacity.complete(record);
      return result();
    };
    try {
      return await (withProvisioningLock ? withProvisioningLock(user,provision) : provision());
    } catch (error) {
      if (['ADDRESS_UNAVAILABLE','MAIL_ACCESS_REQUIRED','MAILBOX_NOT_ENTITLED','MAIL_PROVIDER_CAPACITY_REACHED','MAIL_CAPACITY_REVIEW_REQUIRED'].includes(error?.code)) throw new MailError(error.code,error.status || 503);
      fail('MAILBOX_PROVISIONING_UNCERTAIN', 503);
    }
  }
  async function folders(user, input = {}) {
    const { credentials } = await owned(user, input);
    const values = await external(() => imap.folders(credentials));
    return { folders: values.slice(0, MAIL_LIMITS.maxFolders).map(item => ({ id: folderPath(item.id || item.path),
      name: metadata(item.name || item.path, 128), unread: Number.isSafeInteger(item.unread) ? item.unread : null,
      total: Number.isSafeInteger(item.total) ? item.total : null, specialUse: metadata(item.specialUse, 32) })) };
  }
  async function list(user, input = {}) {
    const { record, credentials } = await owned(user, input); const folder = folderPath(input.folder);
    const limit = input.limit === undefined ? MAIL_LIMITS.pageSize : Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAIL_LIMITS.pageSize) fail('INVALID_PAGE_SIZE');
    if (input.cursor !== undefined && input.cursor !== null && (typeof input.cursor !== 'string' || input.cursor.length > 1024)) fail('INVALID_CURSOR');
    let cursor = input.cursor || null;
    if (cursor) {
      try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()); if (value.mailbox !== record.id || typeof value.cursor !== 'string') fail('INVALID_CURSOR'); cursor = value.cursor; }
      catch { fail('INVALID_CURSOR'); }
    }
    const result = await external(() => imap.list(credentials, { folder, limit, cursor }));
    return { folder, messages: result.messages.slice(0, limit).map(item => safeMessage(item, folder, result.uidValidity, false, record.id)),
      nextCursor: result.nextCursor ? Buffer.from(JSON.stringify({ mailbox: record.id, cursor: result.nextCursor })).toString('base64url') : null };
  }
  async function message(user, input = {}) {
    const { record, records, credentials } = await owned(user, input); const ref = reference(input, record, records);
    const raw = await external(() => imap.message(credentials, ref));
    if (!raw) fail('MESSAGE_NOT_FOUND', 404);
    return { message: safeMessage(raw, ref.folder, ref.uidValidity, true, record.id) };
  }
  async function read(user, input = {}) {
    const { record, records, credentials } = await owned(user, input); const ref = reference(input, record, records);
    if (typeof input.read !== 'boolean') fail('INVALID_READ_STATE');
    await external(() => imap.read(credentials, { ...ref, read: input.read })); return { updated: true };
  }
  async function trash(user, input = {}) {
    const { record, records, credentials } = await owned(user, input); const ref = reference(input, record, records);
    await external(() => imap.trash(credentials, ref)); return { moved: true };
  }
  async function send(user, input = {}) {
    const userId = identity(user);
    await requireMailAccess(userId,user); configured(); const requestedId = selection(input);
    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) fail('INVALID_REQUEST_ID');
    if (typeof input.subject !== 'string' || input.subject.length > MAIL_LIMITS.maxSubject || /[\r\n\x00]/.test(input.subject)) fail('INVALID_SUBJECT');
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAIL_LIMITS.maxText || /\x00/.test(input.text)) fail('INVALID_TEXT');
    const recipients = recipientList(input.to);
    const digest = createHash('sha256').update(JSON.stringify([recipients, input.subject, input.text, input.inReplyTo || null])).digest('hex');
    const jobPath = `siteMailSendJobs/${userId}_${requestId}`;
    const previous = await store.get(jobPath);
    const previousResult = existing => {
      if (existing.uid !== userId) fail('MAILBOX_NOT_FOUND', 404);
      if (requestedId !== undefined && requestedId !== (existing.mailboxId || userId)) fail('MAILBOX_NOT_FOUND', 404);
      if (existing.digest !== digest) fail('REQUEST_ID_CONFLICT', 409);
      return { status: existing.status === 'pending' && now() - Date.parse(existing.createdAt) > 60000 ? 'uncertain' : existing.status,
        ...(existing.status === 'sent' ? { messageId: existing.messageId, sentCopySaved: existing.sentCopySaved === true,
          ...(existing.rejected?.length ? { partial: true, rejected: existing.rejected } : {}) } : {}) };
    };
    // Receipt lookup is ownership/fingerprint-bound and performs no provider
    // operation, even after a box switch or provider-management outage.
    if (previous) return previousResult(previous);
    const { records } = await accounts(userId); const record = selected(records, input);
    await paidMailbox(userId, user, record.id); const credentials = credentialsFor(record);
    const replyRef = input.inReplyTo ? reference({ id: input.inReplyTo }, record, records) : null;
    await rate(userId, 'send_attempt', 30);
    let reply = null;
    if (replyRef) reply = await external(() => imap.message(credentials, replyRef));
    if (replyRef && !reply) fail('MESSAGE_NOT_FOUND', 404);
    const quotaPath = `siteMailQuotas/${record.id}_send_${Math.floor(now() / 86400000)}`;
    const job = await transaction(async tx => {
      const existing = await tx.get(jobPath); const quota = await tx.get(quotaPath);
      if (existing) { previousResult(existing); return { ...existing, alreadyExists: true }; }
      if ((quota?.count || 0) >= MAIL_LIMITS.dailyMessages) fail('MAIL_DAILY_LIMIT', 429);
      const next = { uid: userId, mailboxId: record.id, digest, status: 'pending', messageId: `<${randomUUID()}@${DOMAIN}>`, createdAt: iso(now()), expiresAt: iso(now() + 90 * 86400000) };
      tx.set(quotaPath, { uid: userId, mailboxId: record.id, count: (quota?.count || 0) + 1, expiresAt: iso(now() + 3 * 86400000) });
      tx.set(jobPath, next); return next;
    });
    if (job.alreadyExists) return previousResult(job);
    try { await paidMailbox(userId, user, record.id); } catch (error) {
      await store.set(jobPath, { ...job, status: 'blocked', updatedAt: iso(now()) }); throw error;
    }
    const headerId = value => typeof value === 'string' && /^<[^<>\s\x00-\x1f]{1,250}>$/.test(value) ? value : undefined;
    const envelope = reply?.envelope || reply; const inReplyTo = headerId(envelope?.messageId);
    let result;
    try {
      result = await smtp.send(credentials, { from: record.address, to: recipients, subject: input.subject, text: input.text,
        messageId: job.messageId, ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}) });
      if (!result || !Array.isArray(result.accepted) || result.accepted.length === 0) throw new Error('No accepted recipient');
    } catch {
      await store.set(jobPath, { ...job, status: 'uncertain', updatedAt: iso(now()) }).catch(() => {}); return { status: 'uncertain' };
    }
    let sentCopySaved = false;
    if (result.raw && imap.appendSent) {
      try { await imap.appendSent(credentials, result.raw); sentCopySaved = true; } catch { /* Never resend accepted mail to repair a Sent copy. */ }
    }
    const accepted = new Set(result.accepted.map(value => String(value).toLowerCase()));
    const rejected = recipients.filter(value => !accepted.has(value.toLowerCase()));
    await store.set(jobPath, { ...job, status: 'sent', sentCopySaved, rejected, updatedAt: iso(now()) }).catch(() => {});
    return { status: 'sent', messageId: job.messageId, sentCopySaved, ...(rejected.length ? { partial: true, rejected } : {}) };
  }
  async function syncMembership(user) {
    const userId=identity(user);const member=await requireMailAccess(userId,user);configured();const {records}=await accounts(userId);
    return {preserved:true,ownerAccess:member.ownerAccess,adminAccess:member.adminAccess,mailAccess:member.mailAccess,adminOnly:true,paid:false,sendingEnabled:records.some(record=>record.status==='active' && allocated(records,record,member))};
  }
  return { status, create, folders, list, message, read, trash, send, syncMembership };
}
async function providerJson(response) {
  if (Number(response.headers?.get?.('content-length') || 0) > 65536) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65536) { await reader.cancel(); fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
        chunks.push(Buffer.from(chunk.value));
      }
      text = Buffer.concat(chunks).toString('utf8');
    } finally { reader.releaseLock(); }
  } else { text = await response.text(); if (Buffer.byteLength(text) > 65536) fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
  return text ? JSON.parse(text) : {};
}

export function createMailProvider(options = {}) {
  const env = options.env || process.env;
  if (env.MAIL_PROVIDER === 'hostinger') return createHostingerProvider(options);
  if (env.MAIL_PROVIDER === 'purelymail') return createPurelymailProvider(options);
  if (env.MAIL_PROVIDER === 'migadu') return createMigaduProvider(options);
  fail('MAIL_NOT_CONFIGURED', 503);
}

// Hostinger management API (not Reach and not the content Mail API):
// https://developers.hostinger.com/openapi/openapi.json, Mail v1 Orders/Mailboxes.
// This adapter can list purchased inventory and create a mailbox in ONE fixed
// order. It has no checkout, upgrade, password-reset or delete operation.
export function createHostingerProvider({ env = process.env, fetchImpl = globalThis.fetch, verifyMailboxCredentials, now = Date.now } = {}) {
  const idPattern = /^[A-Za-z0-9_-]{3,100}$/;
  async function operation(callback, options = {}) {
    const signal = combineMembershipOperationSignal(options.signal);
    if (!mailConfiguration(env).ready || env.MAIL_PROVIDER !== 'hostinger') fail('MAIL_NOT_CONFIGURED', 503);
    const deadline = Date.now() + 12000;
    const request = async (path, method = 'GET', input) => {
      const remaining = deadline - Date.now(); if (remaining <= 0 || signal?.aborted) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      try {
        const response = await fetchImpl('https://developers.hostinger.com/api/mail/v1/' + path, {
          method, headers: { Authorization: 'Bearer ' + env.HOSTINGER_API_TOKEN, Accept: 'application/json',
            ...(input ? { 'Content-Type': 'application/json' } : {}) },
          ...(input ? { body: JSON.stringify(input) } : {}), redirect: 'error', cache: 'no-store', signal: combineMembershipOperationSignal(signal, AbortSignal.timeout(Math.min(8000, remaining)))
        });
        const body = await providerJson(response);
        if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body) || body.error) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
        return body;
      } catch { fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
    };
    return callback(request);
  }
  // The documented pagination uses current_page/per_page/total (not guessed
  // last_page flags). Incomplete, drifting or oversized listings fail closed.
  async function collection(request, path) {
    const values = []; let total;
    // Mailbox resources include usage/protocol metadata. Smaller pages retain
    // the 64KiB response cap without rejecting ordinary rich resources at 100.
    for (let page = 1; page <= 40; page++) {
      const body = await request(path + (path.includes('?') ? '&' : '?') + `page=${page}&per_page=25`);
      const meta = body.meta;
      if (!Array.isArray(body.data) || body.data.length > 25 || !meta || meta.current_page !== page || meta.per_page !== 25 || !Number.isInteger(meta.total) || meta.total < 0 || meta.total > 1000 || (total !== undefined && total !== meta.total)) fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
      total = meta.total; values.push(...body.data);
      if (values.length === total) return values;
      if (values.length > total || body.data.length < 25) fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
    }
    fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
  }
  async function orderPlan(request) {
    const orders = await collection(request, 'orders?domain=taithai.app');
    const matching = orders.filter(item => item?.id === env.HOSTINGER_MAIL_ORDER_ID);
    const order = matching.length === 1 ? matching[0] : null;
    if (!order || order.status !== 'active' || order.domain?.name !== DOMAIN || !Number.isInteger(order.seats) || order.seats < 1 || order.seats > 1000 || typeof order.is_trial !== 'boolean' ||
      (order.expires_at !== null && (!Number.isFinite(Date.parse(order.expires_at)) || Date.parse(order.expires_at) <= now()))) fail('MAIL_PROVIDER_NOT_READY', 503);
    const plan = await request(`orders/${env.HOSTINGER_MAIL_ORDER_ID}/plan`);
    const outboundSize = plan.mailbox?.max_outbound_message_size;
    // OpenAPI describes bytes, but the live Starter plan returns the exact
    // value 35 for Hostinger's documented 35 MB outbound limit. Normalize only
    // that observed representation; do not guess units for other small values.
    // https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/
    const outboundBytes = outboundSize === 35 ? 35000000 : outboundSize;
    if (plan.domain?.is_imap_enabled !== true || !Number.isInteger(plan.domain.mailbox_quota) || plan.domain.mailbox_quota < 1 ||
      !Number.isInteger(plan.mailbox?.max_outbound_recipient_limit) || plan.mailbox.max_outbound_recipient_limit < MAIL_LIMITS.maxRecipients ||
      !Number.isSafeInteger(outboundBytes) || outboundBytes < MAIL_LIMITS.maxBodyBytes) fail('MAIL_PROVIDER_NOT_READY', 503);
    return { order, plan };
  }
  function mailboxResource(value) {
    if (!value || !idPattern.test(value.id || '') || typeof value.address !== 'string' || value.address.length > 254 || !value.address.endsWith('@' + DOMAIN) ||
      !['active','suspended'].includes(value.status) || typeof value.is_catchall !== 'boolean' ||
      !['is_imap_enabled','is_pop3_enabled','is_smtp_in_enabled','is_smtp_out_enabled'].every(key => typeof value.protocols?.[key] === 'boolean')) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    return value;
  }
  async function inventory(options) {
    return operation(async request => {
      const { order, plan } = await orderPlan(request);
      const boxes = (await collection(request, `orders/${env.HOSTINGER_MAIL_ORDER_ID}/mailboxes`)).map(mailboxResource);
      if (new Set(boxes.map(item => item.id)).size !== boxes.length || new Set(boxes.map(item => item.address.toLowerCase())).size !== boxes.length) fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
      const capacity = Math.min(order.seats, plan.domain.mailbox_quota);
      return { provider: 'hostinger', orderId: order.id, capacity, purchasedSeats: order.seats, used: boxes.length, available: Math.max(0, capacity - boxes.length), isTrial: order.is_trial };
    }, options);
  }
  const adapter = {
    id: 'hostinger', expectedMxHosts: MAIL_PROVIDER_SETTINGS.hostinger.expectedMxHosts, inventory,
    // Orders expose no documented DNS-readiness flags. Operator DNS preflight
    // and real receive/send verification remain separate from this API check.
    assertReady: options => operation(async request => { await orderPlan(request); return true; }, options),
    async assertCapacity(additionalCount = 1, options) {
      if (!Number.isSafeInteger(additionalCount) || additionalCount < 0) fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
      if ((await inventory(options)).available < additionalCount) fail('MAIL_PROVIDER_CAPACITY_REACHED', 503);
      return true;
    },
    findMailbox: (local, options) => operation(async request => {
      const target = `${localPart(local)}@${DOMAIN}`;
      const values = (await collection(request, `orders/${env.HOSTINGER_MAIL_ORDER_ID}/mailboxes?search=${encodeURIComponent(target)}`)).map(mailboxResource);
      const found = values.filter(item => item.address.toLowerCase() === target);
      if (found.length > 1) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      return found.length ? { id: found[0].id, address: target, provider: 'hostinger' } : null;
    }, options),
    async createMailbox({ localPart: local, password }, options) {
      local = newMailboxLocalPart(local, 'hostinger');
      await adapter.assertCapacity(1, options);
      return operation(async request => {
        const target = `${localPart(local)}@${DOMAIN}`;
        const value = mailboxResource(await request(`orders/${env.HOSTINGER_MAIL_ORDER_ID}/mailboxes`, 'POST', { local_part: localPart(local), password }));
        if (value.address.toLowerCase() !== target || value.status !== 'active' || value.is_catchall || !['is_imap_enabled','is_smtp_in_enabled','is_smtp_out_enabled'].every(key => value.protocols[key] === true)) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
        return { id: value.id, address: target, provider: 'hostinger' };
      }, options);
    },
    async verifyMailboxOwnership({ localPart: local, password, signal }) {
      if (typeof verifyMailboxCredentials !== 'function') fail('MAIL_PROVISIONING_PROOF_UNAVAILABLE', 503);
      if (signal?.aborted) fail('MAIL_PROVISIONING_PROOF_UNAVAILABLE', 503);
      try { return await verifyMailboxCredentials({ provider: 'hostinger', address: `${localPart(local)}@${DOMAIN}`, password, ...(signal ? { signal } : {}) }) === true; }
      catch { fail('MAIL_PROVISIONING_PROOF_UNAVAILABLE', 503); }
    }
  };
  return adapter;
}

// Published OpenAPI: https://news.purelymail.com/api/swagger-spec.js.
// All methods are fixed-path API POSTs; no account/DNS mutation occurs here.
export function createPurelymailProvider({ env = process.env, fetchImpl = globalThis.fetch, verifyMailboxCredentials } = {}) {
  async function request(operation, input) {
    if (!mailConfiguration(env).ready || env.MAIL_PROVIDER !== 'purelymail') fail('MAIL_NOT_CONFIGURED', 503);
    try {
      const response = await fetchImpl(`https://purelymail.com/api/v0/${operation}`, { method: 'POST', headers: {
        'Purelymail-Api-Token': env.PURELYMAIL_API_TOKEN, Accept: 'application/json', 'Content-Type': 'application/json'
      }, body: JSON.stringify(input), redirect: 'error', cache: 'no-store', signal: combineMembershipOperationSignal(AbortSignal.timeout(8000)) });
      const body = await providerJson(response);
      if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body) || body.error || !Object.hasOwn(body, 'result') || !body.result || typeof body.result !== 'object' || Array.isArray(body.result)) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      return body.result;
    } catch { fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
  }
  return {
    id: 'purelymail', expectedMxHosts: MAIL_PROVIDER_SETTINGS.purelymail.expectedMxHosts,
    async assertReady() {
      const result = await request('listDomains', { includeShared: false });
      if (!Array.isArray(result.domains)) fail('MAIL_PROVIDER_NOT_READY', 503);
      const domains = result.domains.filter(item => item?.name === DOMAIN);
      const domain = domains.length === 1 ? domains[0] : null;
      if (!domain || domain.isShared !== false || domain.symbolicSubaddressing !== false ||
        !['passesMx','passesSpf','passesDkim','passesDmarc'].every(key => domain.dnsSummary?.[key] === true)) fail('MAIL_PROVIDER_NOT_READY', 503);
      return true;
    },
    async findMailbox(local) {
      const userName = `${localPart(local)}@${DOMAIN}`;
      // The official spec does not enumerate getUser's not-found error codes.
      // listUser is authoritative only below its documented 1000-user cap.
      const result = await request('listUser', {});
      if (!Array.isArray(result.users) || result.users.length > 1000 || result.users.some(item => typeof item !== 'string' || item.length > 254)) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      const found = result.users.filter(item => item.toLowerCase() === userName);
      if (found.length > 1 || (!found.length && result.users.length >= 1000)) fail('MAIL_PROVIDER_CAPACITY_REVIEW', 503);
      if (!found.length) return null;
      const details = await request('getUser', { userName });
      if (!['enableSearchIndexing','recoveryEnabled','requireTwoFactorAuthentication','enableSpamFiltering'].every(key => typeof details[key] === 'boolean') || !Array.isArray(details.resetMethods)) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      return { address: userName, provider: 'purelymail' };
    },
    createMailbox: ({ localPart: local, password }) => request('createUser', { userName: localPart(local), domainName: DOMAIN, password,
      enablePasswordReset: false, enableSearchIndexing: false, sendWelcomeEmail: false }),
    async verifyMailboxOwnership({ localPart: local, password }) {
      if (typeof verifyMailboxCredentials !== 'function') fail('MAIL_PROVISIONING_PROOF_UNAVAILABLE', 503);
      try { return await verifyMailboxCredentials({ provider: 'purelymail', address: `${localPart(local)}@${DOMAIN}`, password }) === true; }
      catch { fail('MAIL_PROVISIONING_PROOF_UNAVAILABLE', 503); }
    }
  };
}

export function createMigaduProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const domainEndpoint = 'https://api.migadu.com/v1/domains/taithai.app';
  const endpoint = domainEndpoint + '/mailboxes';
  async function request(method, local, payload, domainRequest = false) {
    if (!mailConfiguration(env).ready) fail('MAIL_NOT_CONFIGURED', 503);
    let response; let body;
    try {
      const url = domainRequest ? domainEndpoint : endpoint + (local ? '/' + encodeURIComponent(localPart(local)) : '');
      response = await fetchImpl(url, {
        method, headers: { Authorization: 'Basic ' + Buffer.from(`${env.MIGADU_API_USER}:${env.MIGADU_API_KEY}`).toString('base64'),
          Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}), cache: 'no-store', redirect: 'error', signal: combineMembershipOperationSignal(AbortSignal.timeout(12000))
      });
      if (Number(response.headers?.get?.('content-length') || 0) > 65536) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
      let text;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const chunks = []; let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 65536) { await reader.cancel(); fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
            chunks.push(Buffer.from(chunk.value));
          }
          text = Buffer.concat(chunks).toString('utf8');
        } finally { reader.releaseLock(); }
      } else { text = await response.text(); if (Buffer.byteLength(text) > 65536) fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
      body = text ? JSON.parse(text) : {};
    } catch { fail('MAIL_PROVIDER_UNAVAILABLE', 503); }
    if (method === 'GET' && (response.status === 404 || (response.status === 400 && /not[_ ]found|does not exist/i.test(JSON.stringify(body))))) return null;
    if (!response.ok) fail('MAIL_PROVIDER_UNAVAILABLE', 503);
    return body;
  }
  return {
    id: 'migadu', expectedMxHosts: MAIL_PROVIDER_SETTINGS.migadu.expectedMxHosts,
    async assertReady() {
      // Official /api/ "Domains" and "Domains/SHOW" document these exact
      // Boolean capabilities. A successful authenticated GET alone is not
      // readiness. /diagnostics documents no response schema, so its HTTP 200
      // or guessed keys must never be treated as a passing DNS diagnosis.
      // This read-only capability probe complements the caller's DNS checks;
      // it does not activate domains, provision mailboxes, or send test mail.
      const domain = await request('GET', null, undefined, true);
      if (domain?.name !== DOMAIN || domain.can_send !== true || domain.can_receive !== true || domain.can_access !== true) fail('MAIL_PROVIDER_NOT_READY', 503);
      return true;
    },
    findMailbox: local => request('GET', local),
    createMailbox: ({ localPart: local, password, marker }) => request('POST', null, { local_part: localPart(local), name: marker,
      password_method: 'password', password, wildcard_sender: false, may_send: true, may_receive: true, may_access_imap: true,
      may_access_pop3: false, may_access_managesieve: false, remove_upon_expiry: false, daily_outgoing_limit: MAIL_LIMITS.dailyMessages,
      monthly_outgoing_limit: MAIL_LIMITS.dailyMessages * 31 }),
    setSending: (local, enabled) => request('PUT', local, { may_send: enabled === true, remove_upon_expiry: false })
  };
}

/** Construct real TLS adapters by injecting packages, keeping tests network-free.
 * See https://imapflow.com/docs/api/imapflow-client/ and https://nodemailer.com/.
 * Folders/messages are bounded; full messages/attachments are never buffered. */
export function createMailProtocolAdapters({ ImapFlow, createTransport, simpleParser, env = process.env } = {}) {
  if (!ImapFlow || !createTransport || !simpleParser) throw new TypeError('Mail protocol dependencies are required');
  function route(credentials) {
    const providerName = credentials.provider || 'migadu';
    if (!routingFor(providerName) || (env.MAIL_PROVIDER && env.MAIL_PROVIDER !== providerName)) fail('MAIL_PROVIDER_MISMATCH', 503);
    return routingFor(providerName);
  }
  async function withClient(credentials, operation, timeoutMs = 15000) {
    const signal = combineMembershipOperationSignal(credentials.signal);
    if (signal?.aborted) fail('MAIL_UNAVAILABLE', 503);
    const routing = route(credentials);
    const client = new ImapFlow({ host: routing.imapHost, port: 993, secure: true, auth: { user: credentials.address, pass: credentials.password },
      logger: false, logRaw: false, emitLogs: false, disableAutoIdle: true, connectionTimeout: 8000, greetingTimeout: 8000,
      socketTimeout: 15000, maxLineLength: 256 * 1024, maxLiteralSize: 512 * 1024, maxResponseSize: 1024 * 1024,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } });
    client.on('error', () => {}); // Never log protocol data or turn late socket errors into uncaught exceptions.
    let timer; let abort;
    const deadline = new Promise((_, reject) => {
      abort = () => { client.close(); reject(new MailError('MAIL_UNAVAILABLE', 503)); };
      timer = setTimeout(abort, timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    try { return await Promise.race([(async () => { await client.connect(); return operation(client); })(), deadline]); }
    finally { try { if (signal?.aborted) client.close(); else await client.logout(); } catch { client.close(); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); } }
  }
  async function allFolders(client) {
    const items = await client.list({ statusQuery: { messages: true, unseen: true } });
    return items.filter(item => !item.flags?.has('\\Noselect')).slice(0, MAIL_LIMITS.maxFolders);
  }
  async function selected(client, ref, operation) {
    const folders = await allFolders(client);
    if (!folders.some(item => item.path === ref.folder)) fail('FOLDER_NOT_FOUND', 404);
    const lock = await client.getMailboxLock(ref.folder, { acquireTimeout: 5000 });
    try {
      if (ref.uidValidity && validity(client.mailbox.uidValidity) !== validity(ref.uidValidity)) fail('MAILBOX_CHANGED', 409);
      return await operation(client, folders);
    } finally { lock.release(); }
  }
  function bodyParts(node, out = { texts: [], attachments: [], count: 0 }, depth = 0) {
    if (!node || depth > 12 || ++out.count > 100) return out;
    const type = String(node.type || '').toLowerCase();
    if (type.startsWith('text/') && node.disposition !== 'attachment' && node.part) out.texts.push(node);
    else if (node.disposition === 'attachment' || node.dispositionParameters?.filename || node.parameters?.name) {
      out.attachments.push({ name: node.dispositionParameters?.filename || node.parameters?.name || 'attachment', type, size: node.size || 0 });
      return out;
    }
    for (const child of node.childNodes || []) bodyParts(child, out, depth + 1);
    return out;
  }
  const imap = {
    async verifyCredentials(credentials) {
      try { return await withClient(credentials, async () => true, 8000); }
      catch (error) { if (error.authenticationFailed === true) return false; throw error; }
    },
    folders: credentials => withClient(credentials, async client => (await allFolders(client)).map(item => ({ id: item.path, name: item.name,
      specialUse: item.specialUse || '', total: item.status?.messages ?? null, unread: item.status?.unseen ?? null }))),
    list: (credentials, input) => withClient(credentials, client => selected(client, input, async () => {
      const uidValidity = validity(client.mailbox.uidValidity); const total = client.mailbox.exists;
      let end = total;
      if (input.cursor) {
        try {
          const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
          if (cursor.folder !== input.folder || cursor.validity !== uidValidity || !Number.isSafeInteger(cursor.end) || cursor.end < 0) fail('INVALID_CURSOR');
          end = Math.min(total, cursor.end);
        } catch { fail('INVALID_CURSOR'); }
      }
      if (!end) return { uidValidity, messages: [], nextCursor: null };
      const start = Math.max(1, end - input.limit + 1);
      const messages = await client.fetchAll(`${start}:${end}`, { uid: true, envelope: true, flags: true, size: true, internalDate: true });
      return { uidValidity, messages: messages.reverse(), nextCursor: start > 1 ? Buffer.from(JSON.stringify({ folder: input.folder, validity: uidValidity, end: start - 1 })).toString('base64url') : null };
    })),
    message: (credentials, ref) => withClient(credentials, client => selected(client, ref, async () => {
      const raw = await client.fetchOne(ref.uid, { uid: true, envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true }, { uid: true });
      if (!raw) return null;
      const parts = bodyParts(raw.bodyStructure);
      const plain = parts.texts.find(item => String(item.type).toLowerCase() === 'text/plain');
      const html = parts.texts.find(item => String(item.type).toLowerCase() === 'text/html');
      raw.text = ''; raw.attachments = parts.attachments;
      let remaining = MAIL_LIMITS.maxBodyBytes;
      async function textPart(body) {
        const maximum = remaining;
        // ImapFlow documents and implements UTF-8 text conversion by default;
        // request it explicitly. Its meta.charset becomes utf-8 after decoding.
        const downloaded = await client.download(ref.uid, body.part, { uid: true, decodeText: true, maxBytes: maximum });
        if (downloaded.content) {
          const chunks = []; let bytes = 0;
          for await (const chunk of downloaded.content) { bytes += chunk.length; if (bytes > maximum) fail('MESSAGE_TOO_LARGE', 413); chunks.push(chunk); }
          remaining -= bytes; raw.truncated ||= bytes >= maximum;
          const buffer = Buffer.concat(chunks); const type = String(body.type).toLowerCase();
          const charset = String(downloaded.meta?.charset || 'utf-8').toLowerCase().trim();
          let text;
          if (/^(?:utf-?8|(?:us-?)?ascii)$/.test(charset)) text = buffer.toString('utf8');
          else {
            // Compatibility fallback for an adapter/server which still reports
            // a non-UTF-8 charset. Parse only this bounded, transfer-decoded part;
            // never incorrectly label its original bytes as UTF-8.
            if (!/^[a-z0-9._:-]{1,40}$/.test(charset)) fail('MAIL_CHARSET_UNSUPPORTED', 503);
            const parsed = await simpleParser(Buffer.concat([Buffer.from(`MIME-Version: 1.0\r\nContent-Type: ${type}; charset="${charset}"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`), buffer]), {
              skipHtmlToText: true, skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
            text = type === 'text/html' ? parsed.html || '' : parsed.text || '';
          }
          return type === 'text/html' ? readableMailHtml(text) : text;
        }
        return '';
      }
      if (plain || html) raw.text = await textPart(plain || html);
      if (plain && html && !raw.text.trim() && remaining > 0) raw.text = await textPart(html);
      return raw;
    })),
    read: (credentials, ref) => withClient(credentials, client => selected(client, ref, async () => {
      if (!await client.fetchOne(ref.uid, { uid: true }, { uid: true })) fail('MESSAGE_NOT_FOUND', 404);
      return ref.read ? client.messageFlagsAdd(ref.uid, ['\\Seen'], { uid: true }) : client.messageFlagsRemove(ref.uid, ['\\Seen'], { uid: true });
    })),
    trash: (credentials, ref) => withClient(credentials, client => selected(client, ref, async (_, folders) => {
      if (!await client.fetchOne(ref.uid, { uid: true }, { uid: true })) fail('MESSAGE_NOT_FOUND', 404);
      let trash = folders.find(item => item.specialUse === '\\Trash')?.path || folders.find(item => /^(trash|deleted items|deleted messages)$/i.test(item.path))?.path;
      if (!trash) { trash = 'Trash'; await client.mailboxCreate(trash); }
      if (ref.folder === trash) fail('ALREADY_IN_TRASH', 409);
      // A server without UID-scoped expunge must never expunge unrelated mail
      // when MOVE is emulated as COPY + deletion.
      if (!client.capabilities?.has('MOVE') && !client.capabilities?.has('UIDPLUS')) fail('MAIL_ACTION_UNAVAILABLE', 503);
      if (!await client.messageMove(ref.uid, trash, { uid: true })) fail('MESSAGE_NOT_FOUND', 404);
    })),
    appendSent: (credentials, raw) => withClient(credentials, async client => {
      const folders = await allFolders(client); let sent = folders.find(item => item.specialUse === '\\Sent')?.path || folders.find(item => /^sent(?: items| messages)?$/i.test(item.path))?.path;
      if (!sent) { sent = 'Sent'; await client.mailboxCreate(sent); }
      if (!await client.append(sent, raw, ['\\Seen'])) fail('SENT_COPY_UNAVAILABLE', 503);
    }, 10000)
  };
  const smtp = { async send(credentials, message) {
    if (message.from !== credentials.address) fail('INVALID_SENDER', 403);
    const signal = combineMembershipOperationSignal(credentials.signal);
    signal?.throwIfAborted();
    const routing = route(credentials);
    const composer = createTransport({ streamTransport: true, buffer: true, newline: 'windows', disableFileAccess: true, disableUrlAccess: true });
    const transport = createTransport({ host: routing.smtpHost, port: 465, secure: true, auth: { user: credentials.address, pass: credentials.password },
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true, maxRecipients: MAIL_LIMITS.maxRecipients,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } });
    try {
      const composed = await composer.sendMail({ from: credentials.address, to: message.to, subject: message.subject, text: message.text,
        messageId: message.messageId, inReplyTo: message.inReplyTo, references: message.references, disableFileAccess: true, disableUrlAccess: true });
      const raw = composed.message;
      if (!Buffer.isBuffer(raw) || raw.length > 256 * 1024) fail('MESSAGE_TOO_LARGE', 413);
      let timer; let result; let abort;
      const deadline = new Promise((_, reject) => {
        abort = () => { transport.close?.(); reject(new MailError('MAIL_UNAVAILABLE', 503)); };
        timer = setTimeout(abort, 15000); signal?.addEventListener('abort', abort, { once: true });
      });
      try {
        assertMembershipOperationActive(); signal?.throwIfAborted();
        result = await Promise.race([transport.sendMail({ envelope: { from: credentials.address, to: message.to }, raw }), deadline]);
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      return { messageId: message.messageId, accepted: result.accepted, rejected: result.rejected, raw };
    } finally { transport.close?.(); composer.close?.(); }
  } };
  return { imap, smtp };
}
