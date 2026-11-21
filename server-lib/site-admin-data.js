import { createHash } from 'node:crypto';
import { normalizeAppSettings, validAppVisibilityMap } from '../assets/site-app-catalog.js';
import { SiteAdminError, adminRequestId } from './site-admin-access.js';

const STATUSES = ['open','in_progress','resolved','closed'];
const REPORT_FIELDS = ['app','type','subject','description','steps','expected','contact','ownerUid','ownerEmail','ownerName','status','publicReply','createdAt','updatedAt'];
const EVENT_FIELDS = ['eventId','name','app','path','action','durationSeconds','device','clientAt','sessionId','actorUid','actorEmail','actorName','createdAt','consentVersion'];
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new SiteAdminError('INVALID_REQUEST');
}
function text(value, minimum, maximum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum || minimum && !/\S/u.test(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new SiteAdminError('INVALID_REPORT');
  return value;
}
function iso(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new SiteAdminError('INVALID_DATE');
  return date.toISOString();
}
function row(record, allowed) {
  return Object.fromEntries(['id', ...allowed].filter(key => record[key] !== undefined).map(key => [key, ['createdAt','updatedAt'].includes(key) ? iso(record[key]) : record[key]]));
}
function reportShape(record) {
  fields(record, REPORT_FIELDS);
  const bounds = {app:[1,80],subject:[5,160],description:[10,6000],steps:[0,3000],expected:[0,3000],contact:[0,254],ownerUid:[0,128],ownerEmail:[0,254],ownerName:[0,160],publicReply:[0,6000]};
  for (const [key, [min,max]] of Object.entries(bounds)) text(record[key], min, max);
  if (!['bug','complaint','feedback','privacy','accessibility'].includes(record.type) || !STATUSES.includes(record.status)) throw new SiteAdminError('INVALID_REPORT');
  iso(record.createdAt); iso(record.updatedAt);
}
function limitOf(value, maximum) {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new SiteAdminError('INVALID_QUERY');
  return value;
}
function encodeCursor(kind, id, scope) { return Buffer.from(JSON.stringify({kind,id,scope:hash(scope)})).toString('base64url'); }
function decodeCursor(cursor, kind, scope) {
  if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new SiteAdminError('INVALID_CURSOR');
  let parsed; try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new SiteAdminError('INVALID_CURSOR'); }
  if (parsed.kind !== kind || !validId(parsed.id) || parsed.scope !== hash(scope)) throw new SiteAdminError('INVALID_CURSOR');
  return parsed.id;
}

/** This proxy exposes only backoffice data; personal app documents and mailbox stores are never routed here. */
export function createAdminData({ store, access, now = () => new Date() } = {}) {
  if (!store?.transaction || !access?.resolveAccess) throw new TypeError('store and access are required');
  async function requireAccess(user, capability = 'dashboardAccess', reader = store) {
    const role = await access.resolveAccess(user, {reader});
    if (role[capability] !== true) throw new SiteAdminError('ADMIN_PERMISSION_REQUIRED', 403);
    return role;
  }
  async function page(user, kind, input, scope, where, maximum, allowed) {
    await requireAccess(user);
    const limit = limitOf(input.limit, maximum), collection = kind === 'reports' ? 'siteReports' : 'siteEvents';
    let startAfter;
    if (input.cursor !== undefined && input.cursor !== null && input.cursor !== '') {
      const id = decodeCursor(input.cursor, kind, scope), record = await store.get(`${collection}/${id}`);
      if (!record?.createdAt) throw new SiteAdminError('INVALID_CURSOR');
      startAfter = [record.createdAt, id];
    }
    const items = await store.list(collection, {where, limit, orderBy:[['createdAt','desc'],['__name__','desc']], ...(startAfter ? {startAfter} : {})});
    return {items:items.map(item => row(item, allowed)), nextCursor:items.length === limit ? encodeCursor(kind, items.at(-1).id, scope) : null};
  }
  async function listReports(user, input = {}) {
    fields(input, ['status','limit','cursor']);
    const status = input.status || 'all';
    if (status !== 'all' && !STATUSES.includes(status)) throw new SiteAdminError('INVALID_QUERY');
    return page(user, 'reports', input, {status}, status === 'all' ? [] : [['status','==',status]], 50, REPORT_FIELDS);
  }
  async function getReport(user, id) {
    await requireAccess(user);
    if (!validId(id)) throw new SiteAdminError('INVALID_REPORT_ID');
    const record = await store.get(`siteReports/${id}`);
    if (!record) throw new SiteAdminError('REPORT_NOT_FOUND',404);
    return row({...record,id}, REPORT_FIELDS);
  }
  async function listEvents(user, input = {}) {
    fields(input, ['from','to','limit','cursor']);
    const from = input.from === undefined ? null : iso(input.from), to = input.to === undefined ? null : iso(input.to);
    if (from && to && from > to) throw new SiteAdminError('INVALID_QUERY');
    return page(user, 'events', input, {from,to}, [...(from ? [['createdAt','>=',new Date(from)]] : []), ...(to ? [['createdAt','<=',new Date(to)]] : [])], 500, EVENT_FIELDS);
  }
  async function mutate(user, requestId, action, payload, capability, work) {
    await requireAccess(user,capability);
    const id = adminRequestId(requestId), fingerprint = hash({action,uid:user.uid,payload});
    return store.transaction(async tx => {
      await requireAccess(user,capability,tx);
      const receiptPath = `siteAdminDataRequests/${id}`, previous = await tx.get(receiptPath);
      if (previous) {
        if (previous.actorUid !== user.uid || previous.fingerprint !== fingerprint) throw new SiteAdminError('REQUEST_ID_REUSED',409);
        return {...previous.result,replayed:true};
      }
      const result = await work(tx, id);
      tx.create(receiptPath, {actorUid:user.uid, fingerprint, result, createdAt:new Date(now())});
      return result;
    });
  }
  async function updateReport(user, input) {
    fields(input, ['id','changes','requestId','expectedUpdatedAt']);
    if (!validId(input.id)) throw new SiteAdminError('INVALID_REPORT_ID');
    fields(input.changes, ['status','publicReply']);
    if (!Object.keys(input.changes).length || input.changes.status !== undefined && !STATUSES.includes(input.changes.status)) throw new SiteAdminError('INVALID_REPORT');
    if (input.changes.publicReply !== undefined) text(input.changes.publicReply,0,6000);
    const changes = {...input.changes}, expected = input.expectedUpdatedAt === undefined ? null : iso(input.expectedUpdatedAt);
    return mutate(user,input.requestId,'report_update',{id:input.id,changes,expected},'canManageReports', async (tx,id) => {
      const path = `siteReports/${input.id}`, previous = await tx.get(path);
      if (!previous) throw new SiteAdminError('REPORT_NOT_FOUND',404);
      reportShape(previous);
      if (expected && iso(previous.updatedAt) !== expected) throw new SiteAdminError('REPORT_CONFLICT',409);
      const timestamp = new Date(now()), updated = {...previous,...changes,updatedAt:timestamp};
      reportShape(updated);
      const result = row({...updated,id:input.id},REPORT_FIELDS);
      tx.set(path,updated);
      tx.create(`siteAdminAudit/${id}`, {reportId:input.id,action:'report_update',actorUid:user.uid,actorEmail:user.email,
        fromStatus:previous.status,toStatus:updated.status,publicReply:updated.publicReply,createdAt:timestamp});
      return result;
    });
  }
  async function getAppSettings(user) {
    await requireAccess(user);
    const settings = normalizeAppSettings(await store.get('siteConfig/appVisibility'));
    if (!settings.valid) throw new SiteAdminError('INVALID_APP_CONFIG',503);
    return settings;
  }
  async function updateAppSettings(user,input) {
    fields(input,['apps','expectedRevision','requestId']);
    if (!validAppVisibilityMap(input.apps) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER-1) throw new SiteAdminError('INVALID_APP_CONFIG');
    const apps = Object.fromEntries(Object.entries(input.apps).map(([id,entry])=>[id,{visibility:entry.visibility}]));
    return mutate(user,input.requestId,'app_visibility_update',{apps,expectedRevision:input.expectedRevision},'canManageApps',async(tx,id)=>{
      const previous = normalizeAppSettings(await tx.get('siteConfig/appVisibility'));
      if (!previous.valid) throw new SiteAdminError('INVALID_APP_CONFIG',503);
      if (previous.revision !== input.expectedRevision) throw new SiteAdminError('APP_SETTINGS_CONFLICT',409);
      // updatedBy is the historical public schema marker, not an identity claim.
      // The immutable server-only audit below preserves the actual administrator.
      const payload = {schemaVersion:1,revision:previous.revision+1,apps,updatedAt:new Date(now()),updatedBy:'owner'};
      tx.set('siteConfig/appVisibility',payload);
      tx.create(`siteAppVisibilityAudit/${id}`,{action:'app_visibility_update',actorUid:user.uid,actorEmail:user.email,
        previousRevision:previous.revision,revision:payload.revision,previousApps:previous.apps,apps,createdAt:payload.updatedAt});
      return normalizeAppSettings(payload);
    });
  }
  return Object.freeze({listReports,getReport,listEvents,updateReport,getAppSettings,updateAppSettings});
}
