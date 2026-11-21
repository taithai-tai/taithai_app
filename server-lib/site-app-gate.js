// Server-side visibility checks. Browser settings alone never authorize a private app.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { normalizeAppSettings, normalizeCatalogPath, resolveApp } from '../assets/site-app-catalog.js';

const PROJECT = 'gen-lang-client-0141234491';
const DATABASE = 'ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb';
// Firebase web API keys identify the project; authorization is checked by Firebase.
const API_KEY = 'AIzaSyBnHpQONClba7a9G0uM36cI1jcfz5jTVEA';
const OWNER = 'taithai5002@gmail.com';
export const OWNER_COOKIE = '__Host-taithai_owner';
const LOCAL_COOKIE = 'taithai_owner_dev';
export const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});
const PRIVATE_HEADERS = { ...NO_STORE_HEADERS, 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
const ownerCache = new Map();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function error(code, status) { return json({ error: code }, status); }
function localHttp(url) { return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
function readCookie(request) {
  const key = localHttp(new URL(request.url)) ? LOCAL_COOKIE : OWNER_COOKIE;
  const matches = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${key}=`));
  return matches.length === 1 ? matches[0].slice(key.length + 1) : '';
}
function tokenClaims(token) {
  if (typeof token !== 'string' || token.length > 8000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
}
function validClaims(claims, now) {
  return claims && claims.aud === PROJECT && claims.iss === `https://securetoken.google.com/${PROJECT}`
    && typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 128
    && claims.email === OWNER && claims.email_verified === true
    && Number.isInteger(claims.exp) && claims.exp * 1000 > now
    && Number.isInteger(claims.iat) && claims.iat * 1000 <= now + 30000;
}

export async function verifyOwnerToken(token, { fetchImpl = fetch, now = Date.now(), cache = ownerCache } = {}) {
  const claims = tokenClaims(token);
  if (!validClaims(claims, now)) return null;
  const key = createHash('sha256').update(token).digest('hex');
  const previous = cache.get(key);
  if (previous && previous.cacheUntil > now && previous.expiresAt > now) return previous;
  let response;
  try {
    response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
  } catch { throw new Error('AUTH_UNAVAILABLE'); }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new Error('AUTH_UNAVAILABLE');
    return null;
  }
  const result = await response.json();
  const user = result?.users?.length === 1 ? result.users[0] : null;
  if (!user || user.localId !== claims.sub || user.email !== OWNER || user.emailVerified !== true || user.disabled === true) return null;
  const expiresAt = Math.min(claims.exp * 1000, now + 3600000);
  const verified = { uid: user.localId, expiresAt, cacheUntil: Math.min(expiresAt, now + 30000) };
  // Only the owner's tokens are cached; retain hashes, never token strings.
  for (const [cachedKey, entry] of cache) if (entry.cacheUntil <= now) cache.delete(cachedKey);
  if (cache.size >= 16) cache.delete(cache.keys().next().value);
  cache.set(key, verified);
  return verified;
}

function firestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, firestoreValue(item)]));
  return undefined;
}
export async function loadAppVisibility({ fetchImpl = fetch } = {}) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/siteConfig/appVisibility?key=${API_KEY}`;
  const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (response.status === 404) return normalizeAppSettings(null);
  if (!response.ok) throw new Error('SETTINGS_UNAVAILABLE');
  const doc = await response.json();
  const raw = Object.fromEntries(Object.entries(doc.fields || {}).map(([key, item]) => [key, firestoreValue(item)]));
  const settings = normalizeAppSettings(raw);
  if (!settings.valid) throw new Error('SETTINGS_INVALID');
  return settings;
}
function isDocumentRequest(request, pathname) {
  if (!['GET', 'HEAD'].includes(request.method) || pathname.startsWith('/api/')) return false;
  if (request.headers.get('sec-fetch-mode') === 'navigate' || request.headers.get('sec-fetch-dest') === 'document') return true;
  return /\/$/.test(pathname) || !/\.[a-z0-9]{1,12}$/i.test(pathname) || /\.html?$/i.test(pathname);
}
function unambiguousPath(pathname) {
  let path = pathname;
  try {
    for (let pass = 0; pass < 4; pass++) {
      // Reject encoded routing delimiters and nested traversal rather than relying on
      // the CDN, filesystem and catalog to decode them in exactly the same order.
      if (path.includes('\\') || /%2f|%5c/i.test(path) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path)) return false;
      if (!path.includes('%')) return true;
      path = decodeURIComponent(path);
    }
  } catch { return false; }
  return !path.includes('%');
}

export function createAppGate({ loadSettings = loadAppVisibility, verifyOwner = verifyOwnerToken } = {}) {
  return async function checkAppAccess(request) {
    const url = new URL(request.url);
    const pathname = normalizeCatalogPath(url.pathname);
    if (pathname === null || !unambiguousPath(url.pathname)) return { response: error('INVALID_PATH', 400), headers: {}, app: null };
    const app = resolveApp(url.pathname);
    if (!app) return { response: null, headers: {}, app: null };
    let settings;
    try { settings = await loadSettings(); } catch { return { response: error('APP_SETTINGS_UNAVAILABLE', 503), headers: {}, app }; }
    if (!settings?.valid || !settings.apps?.[app.id]) return { response: error('APP_SETTINGS_UNAVAILABLE', 503), headers: {}, app };
    const visibility = app.locked ? 'private' : settings.apps[app.id].visibility;
    const headers = { ...(isDocumentRequest(request, pathname) ? NO_STORE_HEADERS : {}), ...(visibility !== 'public' ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } : {}) };
    if (visibility === 'public' || visibility === 'unlisted') return { response: null, headers, app, visibility };
    if (visibility !== 'private') return { response: error('APP_SETTINGS_UNAVAILABLE', 503), headers: {}, app };
    let owner;
    try { owner = await verifyOwner(readCookie(request)); } catch { return { response: error('APP_AUTH_UNAVAILABLE', 503), headers: {}, app }; }
    if (owner) return { response: null, headers: PRIVATE_HEADERS, app, visibility };
    if (!isDocumentRequest(request, pathname)) return { response: error('APP_PRIVATE', 403), headers: {}, app };
    const next = url.pathname + url.search;
    const destination = new URL('/app-access/', url.origin);
    destination.searchParams.set('app', app.id);
    destination.searchParams.set('next', next);
    return { response: new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: destination.pathname + destination.search } }), headers: {}, app };
  };
}
export const checkAppAccess = createAppGate();

export function createAccessSessionHandler({ verifyOwner = verifyOwnerToken, now = () => Date.now() } = {}) {
  return async function accessSession(request) {
    const url = new URL(request.url);
    if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST, DELETE' });
    if (request.headers.get('origin') !== url.origin) return error('ORIGIN_NOT_ALLOWED', 403);
    if (url.protocol !== 'https:' && !localHttp(url)) return error('HTTPS_REQUIRED', 400);
    const name = localHttp(url) ? LOCAL_COOKIE : OWNER_COOKIE;
    const attributes = `Path=/; HttpOnly; SameSite=Strict${url.protocol === 'https:' ? '; Secure' : ''}`;
    if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': `${name}=; ${attributes}; Max-Age=0` });
    const authorization = request.headers.get('authorization') || '';
    const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization)?.[1] || '';
    let owner;
    try { owner = await verifyOwner(token); } catch { return error('AUTH_UNAVAILABLE', 503); }
    if (!owner) return error('OWNER_REQUIRED', 403);
    const maxAge = Math.min(3600, Math.floor((owner.expiresAt - now()) / 1000));
    if (maxAge < 1) return error('TOKEN_EXPIRED', 401);
    return json({ ok: true, expiresAt: new Date(owner.expiresAt).toISOString() }, 200, { 'Set-Cookie': `${name}=${token}; ${attributes}; Max-Age=${maxAge}` });
  };
}
export const handleAccessSession = createAccessSessionHandler();

export async function sendWebResponse(response, req, res) {
  const headers = Object.fromEntries(response.headers);
  res.writeHead(response.status, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(Buffer.from(await response.arrayBuffer()));
}
export function nodeWebRequest(req, { local = false } = {}) {
  const host = req.headers.host || 'localhost';
  const protocol = local ? 'http' : 'https';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  return new Request(new URL(req.url || '/', `${protocol}://${host}`), { method: req.method || 'GET', headers });
}
