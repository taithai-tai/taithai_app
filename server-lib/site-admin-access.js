import { createHash } from 'node:crypto';

export const SITE_ADMIN_OWNER = 'taithai5002@gmail.com';
export const ADMIN_PERMISSIONS = Object.freeze(['dashboard', 'mail', 'reports_manage', 'apps_manage']);
export const DEFAULT_ADMIN_PERMISSIONS = Object.freeze(['dashboard', 'mail']);
export class SiteAdminError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validUid = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const verified = user => validUid(user?.uid) && user?.email_verified === true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOf(user.email)) && emailOf(user.email).length <= 254;
const isOwner = user => verified(user) && emailOf(user.email) === SITE_ADMIN_OWNER;
const deniedAccess = () => ({ ownerAccess:false, adminAccess:false, mailAccess:false, dashboardAccess:false, canManageAdmins:false, canManageReports:false, canManageApps:false, role:'none', permissions:[] });
function accessFor(permissions, owner = false) {
  return { ownerAccess:owner, adminAccess:true, mailAccess:permissions.includes('mail'), dashboardAccess:permissions.includes('dashboard'),
    canManageAdmins:owner, canManageReports:permissions.includes('reports_manage'), canManageApps:permissions.includes('apps_manage'),
    role:owner ? 'owner' : 'admin', permissions:[...permissions] };
}
export function normalizeAdminPermissions(input = DEFAULT_ADMIN_PERMISSIONS) {
  if (!Array.isArray(input) || !input.length || input.some(item => !ADMIN_PERMISSIONS.includes(item)) || new Set(input).size !== input.length
    || input.some(item => ['reports_manage','apps_manage'].includes(item)) && !input.includes('dashboard')) throw new SiteAdminError('INVALID_ADMIN_PERMISSIONS');
  return ADMIN_PERMISSIONS.filter(item => input.includes(item));
}
export function adminRequestId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new SiteAdminError('INVALID_REQUEST_ID');
  return value.toLowerCase();
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function iso(value) {
  if (value === null || value === undefined) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function publicGrant(record) {
  return { uid:record.uid, email:record.email, displayName:record.displayName || '', active:record.active === true,
    permissions:normalizeAdminPermissions(record.permissions), createdAt:iso(record.createdAt), updatedAt:iso(record.updatedAt), revokedAt:iso(record.revokedAt) };
}

/** Grants are server-only. The authenticated token and the live UID/email-bound grant are both required. */
export function createAdminAccess({ store, auth, now = () => new Date() } = {}) {
  if (!store?.get || !store?.transaction || !store?.list || typeof auth?.getUserByEmail !== 'function') throw new TypeError('store and auth are required');
  async function resolveAccess(user, { reader = store } = {}) {
    if (!verified(user)) return deniedAccess();
    if (isOwner(user)) return accessFor(ADMIN_PERMISSIONS, true);
    const record = await reader.get(`siteAdminGrants/${user.uid}`);
    if (!record || record.active !== true || record.uid !== user.uid || emailOf(record.email) !== emailOf(user.email)) return deniedAccess();
    try { return accessFor(normalizeAdminPermissions(record.permissions)); }
    catch { return deniedAccess(); }
  }
  function requireOwner(user) { if (!isOwner(user)) throw new SiteAdminError('OWNER_REQUIRED', 403); }
  async function previousRequest(user, requestId, fingerprint, reader = store) {
    const receipt = await reader.get(`siteAdminGrantRequests/${requestId}`);
    if (!receipt) return null;
    if (receipt.actorUid !== user.uid || receipt.fingerprint !== fingerprint) throw new SiteAdminError('REQUEST_ID_REUSED', 409);
    return { ...receipt.result, replayed:true };
  }
  async function listAdmins(user, { limit = 50, cursor } = {}) {
    requireOwner(user);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || cursor !== undefined && !validUid(cursor)) throw new SiteAdminError('INVALID_QUERY');
    const rows = await store.list('siteAdminGrants', { limit, orderBy:['__name__', 'asc'], ...(cursor ? { startAfter:[cursor] } : {}) });
    const items = rows.filter(record => record.uid === record.id && emailOf(record.email) !== SITE_ADMIN_OWNER).map(publicGrant);
    return { items, nextCursor:rows.length === limit ? rows.at(-1).id : null, owner:{ email:SITE_ADMIN_OWNER, role:'owner', immutable:true } };
  }
  async function setAdmin(user, input) {
    requireOwner(user);
    if (!input || Object.keys(input).some(key => !['email','permissions','requestId'].includes(key))) throw new SiteAdminError('INVALID_REQUEST');
    const email = emailOf(input.email), permissions = normalizeAdminPermissions(input.permissions), requestId = adminRequestId(input.requestId);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new SiteAdminError('INVALID_ADMIN_EMAIL');
    if (email === SITE_ADMIN_OWNER) throw new SiteAdminError('OWNER_IMMUTABLE', 403);
    const fingerprint = digest({ action:'admin_set', actorUid:user.uid, email, permissions });
    const replay = await previousRequest(user, requestId, fingerprint); if (replay) return replay;
    let target;
    try { target = await auth.getUserByEmail(email); }
    catch (error) { if (error?.code === 'auth/user-not-found') throw new SiteAdminError('ACCOUNT_MUST_SIGN_IN_FIRST', 404); throw new SiteAdminError('ACCOUNT_LOOKUP_UNAVAILABLE', 503); }
    if (!validUid(target?.uid) || target.emailVerified !== true || target.disabled === true || emailOf(target.email) !== email) throw new SiteAdminError('VERIFIED_ACTIVE_ACCOUNT_REQUIRED', 403);
    if (target.uid === user.uid) throw new SiteAdminError('OWNER_IMMUTABLE', 403);
    const timestamp = new Date(now());
    return store.transaction(async tx => {
      const repeated = await previousRequest(user, requestId, fingerprint, tx); if (repeated) return repeated;
      const path = `siteAdminGrants/${target.uid}`, previous = await tx.get(path);
      const record = { uid:target.uid, email, displayName:String(target.displayName || '').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160),
        active:true, permissions, createdAt:previous?.createdAt || timestamp, updatedAt:timestamp, updatedBy:user.uid, revokedAt:null };
      const result = { admin:publicGrant(record), replayed:false };
      tx.set(path, record);
      tx.create(`siteAdminGrantAudit/${requestId}`, { action:previous?.active === true ? 'admin_update' : 'admin_grant', actorUid:user.uid, actorEmail:SITE_ADMIN_OWNER,
        targetUid:target.uid, targetEmail:email, previousActive:previous?.active === true, previousPermissions:previous?.permissions || [], permissions, createdAt:timestamp });
      tx.create(`siteAdminGrantRequests/${requestId}`, { actorUid:user.uid, fingerprint, result, createdAt:timestamp });
      return result;
    });
  }
  async function revokeAdmin(user, input) {
    requireOwner(user);
    if (!input || Object.keys(input).some(key => !['uid','requestId'].includes(key)) || !validUid(input.uid)) throw new SiteAdminError('INVALID_REQUEST');
    const requestId = adminRequestId(input.requestId), uid = input.uid;
    if (uid === user.uid) throw new SiteAdminError('OWNER_IMMUTABLE', 403);
    const fingerprint = digest({ action:'admin_revoke', actorUid:user.uid, uid });
    return store.transaction(async tx => {
      const repeated = await previousRequest(user, requestId, fingerprint, tx); if (repeated) return repeated;
      const path = `siteAdminGrants/${uid}`, previous = await tx.get(path);
      if (!previous) throw new SiteAdminError('ADMIN_NOT_FOUND', 404);
      if (emailOf(previous.email) === SITE_ADMIN_OWNER) throw new SiteAdminError('OWNER_IMMUTABLE', 403);
      const timestamp = new Date(now()), record = { ...previous, active:false, revokedAt:timestamp, updatedAt:timestamp, updatedBy:user.uid };
      const result = { admin:publicGrant(record), replayed:false };
      tx.set(path, record);
      tx.create(`siteAdminGrantAudit/${requestId}`, { action:'admin_revoke', actorUid:user.uid, actorEmail:SITE_ADMIN_OWNER,
        targetUid:uid, targetEmail:previous.email, previousActive:previous.active === true, previousPermissions:previous.permissions || [], permissions:[], createdAt:timestamp });
      tx.create(`siteAdminGrantRequests/${requestId}`, { actorUid:user.uid, fingerprint, result, createdAt:timestamp });
      return result;
    });
  }
  return Object.freeze({ resolveAccess, listAdmins, setAdmin, revokeAdmin });
}
