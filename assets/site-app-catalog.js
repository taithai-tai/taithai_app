/* Shared app identifiers and visibility policy. Never put credentials or private URLs in this catalog. */
export const APP_VISIBILITIES = Object.freeze(['public', 'unlisted', 'private']);
export const APP_VISIBILITY_DOCUMENT = Object.freeze({ collection: 'siteConfig', id: 'appVisibility' });

const definitions = [
  ['temporary-chat', 'Taithai Temporary Chat', 'Taithai Temporary Chat', '/temporary%20chat/', ['temporary chat', 'temporary-chat']],
  ['qr-generator', 'ตัวสร้างคิวอาร์โค้ด', 'QR Code Generator', '/QR%20Code%20Generator%20/', ['qr code generator', 'qr-code-generator']],
  ['qr-reader', 'ตัวอ่านคิวอาร์โค้ด', 'QR Code Reader', '/QR%20Code%20Reader/', ['qr code reader', 'qr-code-reader']],
  ['shortlinks', 'URL Shortener', 'URL Shortener', '/S/', ['s', 'url shortener', 'url-shortener']],
  ['bu-degree-plan', 'ตัวอ่าน Degree Plan BU', 'BU Degree Plan Explorer', '/Bangkok%20Doctor%20Plan/', ['bangkok doctor plan', 'bangkok-doctor-plan']],
  ['movie-memory', 'Movie Memory', 'Movie Memory', '/Movie-Memory/', ['movie memory', 'movie-memory', 'movie-memory-assets']],
  ['public-drive', 'Taithai Public Drive', 'Taithai Public Drive', '/Public%20Drive/', ['public drive', 'public-drive']],
  ['chordly', 'Chordly', 'Chordly', '/Chordly/', ['chordly']],
  ['ace', 'ACE', 'ACE', '/ACE/', ['ace']],
  ['private-drive', 'Taithai Private Drive', 'Taithai Private Drive', '/Private%20Drive/', ['private drive', 'private-drive']]
];

export const APP_CATALOG = Object.freeze(definitions.map(([id, th, en, href, aliases]) => Object.freeze({
  id, name: Object.freeze({ th, en }), href, aliases: Object.freeze(aliases),
  defaultVisibility: id === 'private-drive' ? 'private' : 'public', locked: id === 'private-drive'
})));
const ids = APP_CATALOG.map(app => app.id);
const apiApps = Object.freeze({
  shortlinks: 'shortlinks', 'movie-poster': 'movie-memory', 'analyze-movie-ticket': 'movie-memory',
  chordly: 'chordly', ace: 'ace'
});
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => isObject(value) && Object.keys(value).every(key => keys.includes(key));

/** Canonical matching only; this does not grant access or redirect to a path. Invalid URIs return null. */
export function normalizeCatalogPath(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  let pathname = value;
  if (/^https?:\/\//i.test(pathname)) {
    try { pathname = new URL(pathname).pathname; } catch { return null; }
  }
  pathname = pathname.split(/[?#]/, 1)[0];
  if (!pathname.startsWith('/')) return null;
  try {
    for (let pass = 0; pass < 3 && pathname.includes('%'); pass++) pathname = decodeURIComponent(pathname);
  } catch { return null; }
  if (pathname.includes('%') || /[\u0000-\u001f\u007f]/u.test(pathname)) return null;
  const segments = [];
  for (const segment of pathname.replaceAll('\\', '/').split('/')) {
    const part = segment.trim().toLowerCase();
    if (!part || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return '/' + segments.join('/');
}

export function resolveApp(pathname) {
  const path = normalizeCatalogPath(pathname);
  if (path === null) return null;
  const [, first, second] = path.split('/');
  if (first === 'api') return APP_CATALOG.find(app => app.id === apiApps[(second || '').replace(/\.js$/, '')]) || null;
  return APP_CATALOG.find(app => app.aliases.includes(first)) || null;
}

function defaultApps(failClosed = false) {
  return Object.fromEntries(APP_CATALOG.map(app => [app.id, { visibility: failClosed ? 'private' : app.defaultVisibility }]));
}
function timestamp(value) {
  if (value === undefined || value === null) return null;
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch { return null; }
}
export function validAppVisibilityMap(apps) {
  return only(apps, ids) && Object.keys(apps).length === ids.length && APP_CATALOG.every(app => {
    const entry = apps[app.id];
    return only(entry, ['visibility']) && Object.keys(entry).length === 1 && APP_VISIBILITIES.includes(entry.visibility)
      && (!app.locked || entry.visibility === app.defaultVisibility);
  });
}

/** Missing document preserves the deployed defaults. Corrupt/partial documents close access to every app. */
export function normalizeAppSettings(raw) {
  const exists = raw !== undefined && raw !== null;
  if (!exists) return { schemaVersion: 1, revision: 0, apps: defaultApps(), updatedAt: null, updatedBy: '', valid: true, exists: false };
  const valid = only(raw, ['schemaVersion', 'revision', 'apps', 'updatedAt', 'updatedBy'])
    && raw.schemaVersion === 1 && Number.isSafeInteger(raw.revision) && raw.revision >= 1
    && validAppVisibilityMap(raw.apps)
    && (raw.updatedAt === undefined || timestamp(raw.updatedAt) !== null)
    && (raw.updatedBy === undefined || raw.updatedBy === 'owner');
  return {
    schemaVersion: 1, revision: valid ? raw.revision : 0, apps: valid ? Object.fromEntries(ids.map(id => [id, { visibility: raw.apps[id].visibility }])) : defaultApps(true),
    updatedAt: valid ? timestamp(raw.updatedAt) : null, updatedBy: valid ? raw.updatedBy || '' : '', valid, exists: true
  };
}

/** Public discovery excludes unlisted and private apps. An authenticated owner can inspect all apps. */
export function getVisibleApps(settings, { isOwner = false } = {}) {
  const normalized = settings?.valid !== undefined ? settings : normalizeAppSettings(settings);
  if (!normalized.valid) return isOwner ? [...APP_CATALOG] : [];
  return APP_CATALOG.filter(app => isOwner || normalized.apps[app.id]?.visibility === 'public');
}
export const getPublicApps = settings => getVisibleApps(settings);
