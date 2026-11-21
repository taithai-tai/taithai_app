/* Firebase-backed support and consent-gated telemetry. The calling UI must obtain consent before telemetry writes. */
const APP_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
const FIRESTORE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const DATABASE = 'ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb';
const OWNER_EMAIL = 'taithai5002@gmail.com';
const REPORT_TYPES = ['bug', 'complaint', 'feedback', 'privacy', 'accessibility'];
const REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const EVENT_NAMES = ['page_view', 'app_open', 'preference_change', 'report_submitted', 'help_view', 'signin', 'signout', 'click', 'heartbeat'];
const DEVICES = ['mobile', 'tablet', 'desktop'];

function fail(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw fail('site/invalid-input', `Invalid ${label} fields`);
  }
}
function text(value, label, min, max, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string') throw fail('site/invalid-input', `${label} must be text`);
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(normalized)) {
    throw fail('site/invalid-input', `${label} must contain ${min}–${max} characters`);
  }
  return normalized;
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw fail('site/invalid-input', `Invalid ${label}`);
  return value;
}
function id(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{12,128}$/.test(value)) {
    throw fail('site/invalid-input', `Invalid ${label}`);
  }
  return value;
}
function count(value, maximum, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw fail('site/invalid-input', `Limit must be between 1 and ${maximum}`);
  return value;
}
function iso(value, label) {
  if (!(value instanceof Date) && (typeof value !== 'string' || value.length < 1 || value.length > 40)) throw fail('site/invalid-input', `Invalid ${label}`);
  const input = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(input.getTime())) throw fail('site/invalid-input', `Invalid ${label}`);
  return input.toISOString();
}
function row(snapshot) {
  const result = { ...snapshot.data(), id: snapshot.id };
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof result[key]?.toDate === 'function') result[key] = result[key].toDate().toISOString();
    else if (result[key] instanceof Date) result[key] = result[key].toISOString();
  }
  return result;
}
function paginate(snapshot, requested) {
  const documents = snapshot.docs || [];
  return { items: documents.map(row), nextCursor: documents.length === requested ? documents.at(-1) : null };
}

export function isSiteAdmin(user) {
  return !!user && user.emailVerified === true && typeof user.email === 'string' && user.email.toLowerCase() === OWNER_EMAIL;
}

/** Injectable SDK boundary makes validation, authentication and write semantics testable without production writes. */
export function createSiteDataClient({ loadDependencies, now = () => new Date(), generateId = () => globalThis.crypto.randomUUID(), getSessionStorage = () => globalThis.sessionStorage, getDevice = () => {
  const width = globalThis.innerWidth || 1024;
  return width < 680 ? 'mobile' : width < 1000 ? 'tablet' : 'desktop';
}, timeoutMs = 15000 } = {}) {
  if (typeof loadDependencies !== 'function') throw new TypeError('loadDependencies is required');
  let dependencies;
  let sessionId;
  const pendingReports = new Map();

  function deps() {
    if (!dependencies) dependencies = Promise.resolve().then(loadDependencies).then(async value => {
      // Firebase restores persisted sessions asynchronously. Wait before attributing a write to a guest.
      if (typeof value.auth.authStateReady === 'function') await value.auth.authStateReady();
      return value;
    }).catch(error => { dependencies = null; throw error; });
    return dependencies;
  }
  function operation(work, write = false) {
    let timer;
    return Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(fail(write ? 'site/timeout-uncertain' : 'site/timeout', write
          ? 'The server has not confirmed this request yet. Delivery is unknown; retry with the same report ID.'
          : 'The server did not respond in time. Please try again.', { deliveryUnknown: write })), timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }
  function actor(auth, required = false) {
    const user = auth.currentUser;
    if (!user && required) throw fail('site/auth-required', 'Sign in to continue');
    return {
      uid: user?.uid || '', email: user?.email || '', name: (user?.displayName || '').slice(0, 160)
    };
  }
  function session() {
    if (sessionId) return sessionId;
    try {
      const storage = getSessionStorage();
      const previous = storage?.getItem('taithai.analytics.session.v1');
      if (previous && /^[A-Za-z0-9_-]{12,64}$/.test(previous)) sessionId = previous;
      else {
        sessionId = id(generateId(), 'session ID');
        storage?.setItem('taithai.analytics.session.v1', sessionId);
      }
    } catch (_) { sessionId = id(generateId(), 'session ID'); }
    return sessionId;
  }
  function reportInput(input) {
    fields(input, ['reportId', 'app', 'type', 'subject', 'description', 'steps', 'expected', 'contact'], 'report');
    return {
      app: text(input.app, 'App', 1, 80),
      type: choice(input.type, REPORT_TYPES, 'report type'),
      subject: text(input.subject, 'Subject', 5, 160),
      description: text(input.description, 'Description', 10, 6000),
      steps: text(input.steps, 'Steps', 0, 3000, true),
      expected: text(input.expected, 'Expected result', 0, 3000, true),
      contact: text(input.contact, 'Contact', 0, 254, true)
    };
  }

  return Object.freeze({
    async getPrivateDriveConfig() {
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        if (!isSiteAdmin(auth.currentUser)) throw fail('site/permission-denied', 'This configuration is available only to the verified site owner');
        const snapshot = await sdk.getDoc(sdk.doc(db, 'sitePrivateConfig', 'privateDrive'));
        if (!snapshot.exists()) throw fail('site/not-found', 'Private Drive configuration is not available');
        const data = snapshot.data();
        const result = {};
        for (const [key, protocol] of [['shareUrl', 'https:'], ['smbUrl', 'smb:'], ['smbShareUrl', 'smb:'], ['webdavUrl', 'https:']]) {
          const value = data[key] === undefined && key !== 'shareUrl' ? '' : data[key];
          if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/u.test(value)) {
            throw fail('site/invalid-config', 'Private Drive configuration contains an invalid endpoint');
          }
          if (value === '' && key !== 'shareUrl') { result[key] = ''; continue; }
          let endpoint;
          try { endpoint = new URL(value); } catch (_) { throw fail('site/invalid-config', 'Private Drive configuration contains an invalid endpoint'); }
          if (endpoint.protocol !== protocol || !endpoint.hostname || endpoint.username || endpoint.password) {
            throw fail('site/invalid-config', 'Private Drive configuration contains an unsupported endpoint');
          }
          result[key] = value;
        }
        return result;
      });
    },

    async createReport(input) {
      const normalized = reportInput(input);
      const reportId = input.reportId === undefined ? id(generateId(), 'report ID') : id(input.reportId, 'report ID');
      const fingerprint = JSON.stringify(normalized);
      const existing = pendingReports.get(reportId);
      if (existing && existing.fingerprint !== fingerprint) throw fail('site/report-id-reused', 'This report ID belongs to different report content');
      if (!existing) {
        const pending = deps().then(async ({ sdk, db, auth }) => {
          const owner = actor(auth);
          await sdk.setDoc(sdk.doc(db, 'siteReports', reportId), {
            ...normalized, ownerUid: owner.uid, ownerEmail: owner.email, ownerName: owner.name,
            status: 'open', publicReply: '', createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp()
          });
          return { id: reportId };
        });
        pendingReports.set(reportId, { fingerprint, promise: pending });
        pending.catch(() => { if (pendingReports.get(reportId)?.promise === pending) pendingReports.delete(reportId); });
      }
      const promise = pendingReports.get(reportId).promise;
      return operation(() => promise, true);
    },

    async listMyReports(options = {}) {
      fields(options, ['limit', 'cursor'], 'query');
      const requested = count(options.limit, 50, 50);
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        const owner = actor(auth, true);
        const constraints = [sdk.where('ownerUid', '==', owner.uid), sdk.orderBy('createdAt', 'desc')];
        if (options.cursor) constraints.push(sdk.startAfter(options.cursor));
        constraints.push(sdk.limit(requested));
        return paginate(await sdk.getDocs(sdk.query(sdk.collection(db, 'siteReports'), ...constraints)), requested);
      });
    },

    async getReport(reportId) {
      id(reportId, 'report ID');
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        actor(auth, true);
        const snapshot = await sdk.getDoc(sdk.doc(db, 'siteReports', reportId));
        if (!snapshot.exists()) throw fail('site/not-found', 'Report not found or unavailable to this account');
        return row(snapshot);
      });
    },

    async listReports(options = {}) {
      fields(options, ['status', 'limit', 'cursor'], 'query');
      const requested = count(options.limit, 50, 50);
      if (options.status !== undefined && options.status !== 'all') choice(options.status, REPORT_STATUSES, 'report status');
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        actor(auth, true);
        const constraints = [];
        if (options.status && options.status !== 'all') constraints.push(sdk.where('status', '==', options.status));
        constraints.push(sdk.orderBy('createdAt', 'desc'));
        if (options.cursor) constraints.push(sdk.startAfter(options.cursor));
        constraints.push(sdk.limit(requested));
        return paginate(await sdk.getDocs(sdk.query(sdk.collection(db, 'siteReports'), ...constraints)), requested);
      });
    },

    async updateReport(reportId, changes) {
      id(reportId, 'report ID');
      fields(changes, ['status', 'publicReply'], 'report update');
      if (!Object.keys(changes).length) throw fail('site/invalid-input', 'No report changes provided');
      const status = changes.status === undefined ? undefined : choice(changes.status, REPORT_STATUSES, 'report status');
      const publicReply = changes.publicReply === undefined ? undefined : text(changes.publicReply, 'Reply', 0, 6000);
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        const administrator = actor(auth, true);
        const reportRef = sdk.doc(db, 'siteReports', reportId);
        const auditRef = sdk.doc(db, 'siteAdminAudit', id(generateId(), 'audit ID'));
        return sdk.runTransaction(db, async transaction => {
          const snapshot = await transaction.get(reportRef);
          if (!snapshot.exists()) throw fail('site/not-found', 'Report not found');
          const previous = snapshot.data();
          const nextStatus = status === undefined ? previous.status : status;
          const nextReply = publicReply === undefined ? previous.publicReply : publicReply;
          transaction.update(reportRef, { status: nextStatus, publicReply: nextReply, updatedAt: sdk.serverTimestamp() });
          transaction.set(auditRef, {
            reportId, action: 'report_update', actorUid: administrator.uid, actorEmail: administrator.email,
            fromStatus: previous.status, toStatus: nextStatus, publicReply: nextReply, createdAt: sdk.serverTimestamp()
          });
          return { id: reportId, status: nextStatus, publicReply: nextReply };
        });
      }, true);
    },

    async trackEvents(input) {
      if (!Array.isArray(input) || input.length < 1 || input.length > 20) throw fail('site/invalid-input', 'Telemetry batch must contain 1–20 events');
      const events = input.map(event => {
        fields(event, ['name', 'app', 'path', 'action', 'durationSeconds', 'device'], 'event');
        const rawPath = text(event.path === undefined ? '/' : event.path, 'Path', 1, 2000);
        const path = rawPath.split(/[?#]/, 1)[0];
        if (!path.startsWith('/') || path.startsWith('//') || path.length > 240) throw fail('site/invalid-input', 'Event path must be a bounded site-relative path');
        const durationSeconds = event.durationSeconds === undefined ? 0 : event.durationSeconds;
        if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 60) throw fail('site/invalid-input', 'Duration must be an integer from 0 to 60');
        return {
          eventId: id(generateId(), 'event ID'), name: choice(event.name, EVENT_NAMES, 'event name'),
          app: text(event.app === undefined ? 'site' : event.app, 'App', 1, 80), path,
          action: text(event.action, 'Action', 0, 80, true), durationSeconds,
          device: choice(event.device === undefined ? getDevice() : event.device, DEVICES, 'device'), clientAt: iso(now(), 'client time')
        };
      });
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        const user = actor(auth);
        const batch = sdk.writeBatch(db);
        const currentSession = session();
        for (const event of events) {
          batch.set(sdk.doc(db, 'siteEvents', event.eventId), {
            ...event, sessionId: currentSession, actorUid: user.uid, actorEmail: user.email, actorName: user.name,
            createdAt: sdk.serverTimestamp(), consentVersion: 1
          });
        }
        await batch.commit();
        return { ids: events.map(event => event.eventId) };
      }, true);
    },

    async listEvents(options = {}) {
      fields(options, ['from', 'to', 'limit', 'cursor'], 'query');
      const requested = count(options.limit, 500, 500);
      const from = options.from === undefined ? undefined : iso(options.from, 'start time');
      const to = options.to === undefined ? undefined : iso(options.to, 'end time');
      if (from && to && from > to) throw fail('site/invalid-input', 'Start time must be before end time');
      return operation(async () => {
        const { sdk, db, auth } = await deps();
        actor(auth, true);
        const constraints = [];
        if (from) constraints.push(sdk.where('createdAt', '>=', sdk.Timestamp.fromDate(new Date(from))));
        if (to) constraints.push(sdk.where('createdAt', '<=', sdk.Timestamp.fromDate(new Date(to))));
        constraints.push(sdk.orderBy('createdAt', 'desc'));
        if (options.cursor) constraints.push(sdk.startAfter(options.cursor));
        constraints.push(sdk.limit(requested));
        return paginate(await sdk.getDocs(sdk.query(sdk.collection(db, 'siteEvents'), ...constraints)), requested);
      });
    }
  });
}

let defaultClient;
function client() {
  if (!defaultClient) defaultClient = createSiteDataClient({
    async loadDependencies() {
      const [{ auth }, app, sdk] = await Promise.all([
        import('../firebase-auth.js?v=20260725-2'), import(APP_SDK), import(FIRESTORE_SDK)
      ]);
      return { auth, sdk, db: sdk.getFirestore(app.getApp(), DATABASE) };
    }
  });
  return defaultClient;
}
export const createReport = (...args) => client().createReport(...args);
export const listMyReports = (...args) => client().listMyReports(...args);
export const getReport = (...args) => client().getReport(...args);
export const listReports = (...args) => client().listReports(...args);
export const updateReport = (...args) => client().updateReport(...args);
export const trackEvents = (...args) => client().trackEvents(...args);
export const listEvents = (...args) => client().listEvents(...args);

export const getPrivateDriveConfig = (...args) => client().getPrivateDriveConfig(...args);
