import addressParser from 'nodemailer/lib/addressparser';

// These fields describe message content, not authenticated SMTP routing.
// Do not expose raw headers or infer Bcc recipients from their absence.
export const MAIL_RECIPIENT_HEADERS = Object.freeze(['To', 'Cc', 'Delivered-To', 'X-Original-To', 'Envelope-To']);
const HEADER_SOURCES = new Set(MAIL_RECIPIENT_HEADERS.map(value => value.toLowerCase()));
const MAX_HEADER_BYTES = 16 * 1024;
const MAX_FIELD_BYTES = 4096;
const MAX_ADDRESSES = 128;
const MAX_KNOWN_ADDRESSES = 1500;
const SOURCE_ORDER = ['to', 'cc', 'delivered-to', 'x-original-to', 'envelope-to'];
const KIND_ORDER = { primary: 0, alias: 1, previous: 2 };

function ownAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || /[^\x21-\x7e]/.test(value)) return null;
  const result = value.toLowerCase();
  const [local, domain, extra] = result.split('@');
  if (extra !== undefined || domain !== 'taithai.app' || !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local) || local.includes('..')) return null;
  return result;
}

function values(items, maximum = MAX_ADDRESSES) { return Array.isArray(items) ? items.slice(0, maximum) : []; }

/** Only call with the authenticated mailbox record and server-resolved aliases.
 * Historical addresses annotate old mail; they do not grant routing or send-as. */
export function knownMailboxRecipientAddresses(record, extra = []) {
  const known = new Map();
  function add(item, fallbackKind) {
    const value = typeof item === 'string' ? { address: item } : item;
    if (!value || typeof value !== 'object' || value.active === false || value.revoked === true ||
        (value.status !== undefined && !['active', 'previous'].includes(value.status))) return;
    const address = ownAddress(value.address);
    const kind = Object.hasOwn(KIND_ORDER, value.kind) ? value.kind : fallbackKind;
    if (!address || !Object.hasOwn(KIND_ORDER, kind)) return;
    const previous = known.get(address);
    if (!previous || KIND_ORDER[kind] < KIND_ORDER[previous.kind]) known.set(address, { address, kind });
  }
  add({ address: record?.address, kind: 'primary' });
  for (const item of values(record?.aliases, MAX_KNOWN_ADDRESSES)) add(item, 'alias');
  for (const item of values(record?.previousAddresses, MAX_KNOWN_ADDRESSES)) add(item, 'previous');
  // Extra aliases are trusted server data. A second primary cannot replace
  // the record's canonical address or make a historical address current.
  for (const item of values(extra, MAX_KNOWN_ADDRESSES)) {
    const value = typeof item === 'string' ? { address: item, kind: 'alias' } : item;
    if (value?.kind === 'primary' && ownAddress(value.address) !== ownAddress(record?.address)) continue;
    add(value, 'alias');
  }
  return [...known.values()].slice(0, MAX_KNOWN_ADDRESSES);
}

function selectedHeaders(raw) {
  const fields = new Map();
  const data = raw?.headers;
  if (!(typeof data === 'string' || Buffer.isBuffer(data) || data instanceof Uint8Array)) return fields;
  if ((typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength) > MAX_HEADER_BYTES) return fields;
  const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  // Reject malformed line endings and controls instead of joining injected
  // lines into a recipient. RFC folding is allowed only after a valid field.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || /\r(?!\n)/.test(text)) return fields;
  let current;
  for (const line of text.split(/\r?\n/).slice(0, 256)) {
    if (!line) break;
    if (/^[ \t]/.test(line)) {
      if (current && current.size + line.length <= MAX_FIELD_BYTES) { current.value += ' ' + line.trim(); current.size += line.length; }
      else if (current) current.invalid = true;
      continue;
    }
    current = null;
    const match = /^([A-Za-z0-9-]{1,64}):[ \t]*(.*)$/.exec(line);
    if (!match || !HEADER_SOURCES.has(match[1].toLowerCase())) continue;
    const source = match[1].toLowerCase();
    const list = fields.get(source) || [];
    if (list.length >= 20) continue;
    current = { value: match[2], size: line.length, invalid: line.length > MAX_FIELD_BYTES };
    list.push(current); fields.set(source, list);
  }
  return fields;
}

function parsedFieldAddresses(field) {
  if (field.invalid) return [];
  try { return addressParser(field.value, { flatten: true }).slice(0, MAX_ADDRESSES); }
  catch { return []; }
}

/** Bounded header evidence for names seen in an authenticated inbox. These
 * candidates never establish ownership, reserve names, or change routing. */
export function mailRecipientCandidates(raw) {
  const matches = new Map();
  function match(items, source) {
    for (const item of values(items)) {
      const address = ownAddress(item?.address);
      if (!address || matches.size >= MAX_ADDRESSES && !matches.has(address)) continue;
      let result = matches.get(address);
      if (!result) { result = { address, sources: [] }; matches.set(address, result); }
      if (!result.sources.includes(source)) result.sources.push(source);
    }
  }
  const envelope = raw?.envelope || raw || {};
  const fields = selectedHeaders(raw);
  for (const source of SOURCE_ORDER) {
    if (source === 'to' || source === 'cc') {
      const value = envelope[source];
      const parsed = Array.isArray(value) ? value : value?.value;
      if (Array.isArray(parsed)) { match(parsed, source); continue; }
    }
    for (const field of fields.get(source) || []) match(parsedFieldAddresses(field), source);
  }
  return [...matches.values()];
}

/** Safe additive DTO. All matches remain untrusted message-header evidence. */
export function mailRecipientMetadata(raw, knownAddresses) {
  const known = new Map(values(knownAddresses, MAX_KNOWN_ADDRESSES).map(item => [ownAddress(item?.address), item]).filter(([address]) => address));
  const recipientMatches = mailRecipientCandidates(raw).flatMap(item => {
    const owner = known.get(item.address);
    return owner && Object.hasOwn(KIND_ORDER, owner.kind) ? [{ ...item, kind: owner.kind }] : [];
  });
  return { recipientMatches, recipientMatchStatus: recipientMatches.length ? 'matched' : 'unavailable' };
}
