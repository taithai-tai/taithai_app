import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTicketImage, MAX_TICKET_IMAGE_BYTES } from './ticket-analyzer.js';
import shortlinksHandler from './api/shortlinks.js';
import membershipHandler from './api/membership.js';
import membershipWebhook from './api/membership-webhook.js';
import { Readable } from 'node:stream';
import aceHandler from './ace/api/ace.js';
import healthcareHandler from './api/healthcare-learning.js';
import chordlyChartsHandler from './api/chordly/charts.js';
import chordlyMetadataHandler from './api/chordly/metadata.js';
import chordlyLyricsHandler from './api/chordly/lyrics.js';
import { buildACE } from './ace/scripts/build.mjs';
import { checkAppAccess, handleAccessSession, nodeWebRequest, sendWebResponse } from './server-lib/site-app-gate.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const runDirect = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (runDirect) try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(path.join(root, '.env.local'));
  }
} catch (error) {
  if (error?.code !== 'ENOENT') {
    console.warn('Local environment file could not be loaded.');
  }
}
const port = Number(process.env.PORT) || 3000;
const mimeTypes = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.resolve(root, `.${decoded}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function resolveFile(requestPath) {
  const pathname = decodeURIComponent(requestPath.split('?')[0]);
  // Build/server sources are not routes. In particular /public/... must not bypass the app gate.
  const first = pathname.replaceAll('\\', '/').split('/').filter(Boolean)[0] || '';
  if (first.startsWith('.') || ['public', 'node_modules', 'server-lib', 'scripts', 'api', 'server.js', 'proxy.js', 'vercel.json', 'package.json', 'package-lock.json', 'firebase.json', 'firestore.rules', 'storage.rules'].includes(first)) return null;
  if (pathname === '/ACE' || pathname.startsWith('/ACE/')) {
    const aceRoot = path.join(root, 'public', 'ACE');
    let target = path.resolve(aceRoot, `.${pathname.slice(4) || '/'}`);
    if (target !== aceRoot && !target.startsWith(`${aceRoot}${path.sep}`)) return null;
    try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); await stat(target); return target; } catch { return null; }
  }
  if (pathname === '/Chordly' || pathname.startsWith('/Chordly/')) {
    const chordlyRoot = path.join(root, 'chordly', 'out');
    let target = path.resolve(chordlyRoot, `.${pathname.slice(8) || '/'}`);
    if (target !== chordlyRoot && !target.startsWith(`${chordlyRoot}${path.sep}`)) return null;
    try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); await stat(target); return target; } catch { return null; }
  }
  if (pathname.startsWith('/movie-memory-assets/')) {
    if (pathname.startsWith('/movie-memory-assets/feature-icons/')) {
      const iconName = path.basename(pathname);
      if (['brand.jpg', 'game.jpg', 'install.jpg', 'dashboard.jpg', 'tutorial.jpg', 'settings.jpg'].includes(iconName)) {
        return path.join(root, 'Movie Memory', 'assets', 'feature-icons', iconName);
      }
    }
    if (pathname.startsWith('/movie-memory-assets/app-icons/')) {
      const iconName = path.basename(pathname);
      if (['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].includes(iconName)) {
        return path.join(root, 'Movie Memory', 'assets', 'app-icons', iconName);
      }
    }
    const assetName = path.basename(pathname);
    if (assetName === 'manifest.webmanifest') {
      return path.join(root, 'Movie Memory', 'manifest.webmanifest');
    }
    if (['styles.css', 'app.js', 'ticket-movie-resolver.js', 'account.js', 'account-loader.js', 'auth-feedback.js', 'game.css', 'game.js', 'feature-pages.css', 'dashboard.js', 'preferences.css', 'preferences.js', 'settings.css', 'settings.js'].includes(assetName)) {
      return path.join(root, 'Movie Memory', assetName);
    }
  }
  if (/^\/Movie-Memory\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'index.html');
  }
  if (/^\/Movie-Memory\/(?:add|movie|account|posters|rewatch|review)\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'index.html');
  }
  if (/^\/Movie-Memory\/profile\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'profile.html');
  }
  if (/^\/Movie-Memory\/game\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'game.html');
  }
  if (/^\/Movie-Memory\/dashboard\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'dashboard.html');
  }
  if (/^\/Movie-Memory\/install\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'install.html');
  }
  if (/^\/Movie-Memory\/settings\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'settings.html');
  }
  if (/^\/Movie-Memory\/tutorial\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'tutorial.html');
  }
  if (/^\/Movie-Memory\/@[^/]+\/?$/.test(pathname)) {
    return path.join(root, 'Movie Memory', 'profile.html');
  }
  let target = safePath(requestPath);
  if (!target) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    if (!path.extname(target)) target += '.html';
  }

  try {
    return (await stat(target)).isFile() ? target : null;
  } catch {
    return null;
  }
}

async function serveMoviePoster(requestUrl, res) {
  try {
    const request = new URL(requestUrl, `http://127.0.0.1:${port}`);
    const posterUrl = new URL(request.searchParams.get('url') || '');
    if (posterUrl.protocol !== 'https:' || posterUrl.hostname !== 'image.tmdb.org' || !posterUrl.pathname.startsWith('/t/p/')) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"error":"Invalid poster URL"}');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(posterUrl, {
      headers: { Accept: 'image/*' },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !contentType.startsWith('image/')) throw new Error('POSTER_UNAVAILABLE');
    const image = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': image.length,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(image);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"error":"Poster is unavailable"}');
  }
}

function ticketErrorStatus(code) {
  if (code === 'INVALID_REQUEST' || code === 'INVALID_TICKET_IMAGE') return 400;
  if (code === 'TICKET_IMAGE_TOO_LARGE' || code === 'REQUEST_TOO_LARGE') return 413;
  if (code === 'TICKET_ANALYZER_NOT_CONFIGURED' || code === 'TICKET_ANALYZER_AUTH_FAILED') return 503;
  if (code === 'TICKET_ANALYZER_BUSY') return 429;
  if (code === 'TICKET_ANALYSIS_TIMEOUT') return 504;
  return 502;
}

async function readJsonBody(req, maximumBytes = MAX_TICKET_IMAGE_BYTES * 2) {
  const declaredLength = Number(req.headers['content-length']) || 0;
  if (declaredLength > maximumBytes) throw new Error('REQUEST_TOO_LARGE');

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > maximumBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('INVALID_REQUEST');
  }
}

async function serveTicketAnalysis(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.writeHead(405);
    res.end('{"error":"METHOD_NOT_ALLOWED"}');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await analyzeTicketImage({
      image: body?.image,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || undefined
    });
    res.writeHead(200);
    res.end(JSON.stringify({ result }));
  } catch (error) {
    const code = String(error?.message || 'TICKET_ANALYSIS_UNAVAILABLE');
    res.writeHead(ticketErrorStatus(code));
    res.end(JSON.stringify({ error: code }));
  }
}

export function createDevServer({ checkAccess = checkAppAccess } = {}) {
  return http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const webRequest = nodeWebRequest(req, { local: true });
    if (/^\/api\/membership(?:-webhook)?\/?$/.test(requestUrl.pathname)) {
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value));
      const request=new Request(new URL(req.url,`http://${req.headers.host || 'localhost'}`),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const endpoint=requestUrl.pathname.includes('-webhook')?membershipWebhook:membershipHandler;
      await sendWebResponse(await endpoint.fetch(request),req,res);return;
    }
    if (/^\/api\/app-access\/?$/.test(requestUrl.pathname)) {
      await sendWebResponse(await handleAccessSession(webRequest), req, res);
      return;
    }
    const appAccess = await checkAccess(webRequest);
    if (appAccess.response) {
      await sendWebResponse(appAccess.response, req, res);
      return;
    }
    // Enforce the same response policy even when individual app handlers set caching.
    if (Object.keys(appAccess.headers).length) {
      const writeHead = res.writeHead.bind(res);
      res.writeHead = function (code, message, headers) {
        if (typeof message !== 'string') return writeHead(code, { ...(message || {}), ...appAccess.headers });
        return writeHead(code, message, { ...(headers || {}), ...appAccess.headers });
      };
    }
    const shortCode = requestUrl.pathname.match(/^\/S\/([^/]+)\/?$/);
    if (requestUrl.pathname.replace(/\/$/, '') === '/api/shortlinks' || shortCode) {
      req.query = Object.fromEntries(requestUrl.searchParams);
      if (shortCode) req.query.code = decodeURIComponent(shortCode[1]);
      await shortlinksHandler(req, res);
      return;
    }
    if (/^\/api\/ace\/?(?:\?|$)/.test(req.url || '')) {
      await aceHandler(req, res);
      return;
    }
    const chordlyRoute = requestUrl.pathname.match(/^\/api\/chordly\/(charts|metadata|lyrics)\/?$/);
    if (chordlyRoute || /^\/api\/healthcare-learning\/?$/.test(requestUrl.pathname)) {
      // These production handlers use Vercel's small response convenience API.
      // Preserve the native response and the visibility gate's writeHead policy.
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); return res; };
      req.query = Object.fromEntries(requestUrl.searchParams);
      if (chordlyRoute) {
        const handlers = {charts:chordlyChartsHandler, metadata:chordlyMetadataHandler, lyrics:chordlyLyricsHandler};
        await handlers[chordlyRoute[1]](req, res);
      } else {
        if (req.method === 'POST') {
          try { req.body = await readJsonBody(req, 3 * 1024 * 1024); }
          catch (error) { res.status(error.message === 'REQUEST_TOO_LARGE' ? 413 : 400).json({error:error.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST'}); return; }
        }
        await healthcareHandler(req, res);
      }
      return;
    }
    if ((req.url || '').startsWith('/api/movie-poster?')) {
      await serveMoviePoster(req.url, res);
      return;
    }
    if ((req.url || '').split('?')[0] === '/api/analyze-movie-ticket') {
      await serveTicketAnalysis(req, res);
      return;
    }
    const file = await resolveFile(req.url || '/');
    const target = file || path.join(root, '404.html');
    const body = await readFile(target);
    res.writeHead(file ? 200 : 404, {
      'Content-Type': mimeTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
  });
}

if (runDirect) {
  await buildACE({ output: path.join(root, 'public', 'ACE'), basePath: '/ACE' });
  createDevServer().listen(port, '127.0.0.1', () => {
    console.log(`Taithai Apps is running at http://localhost:${port}`);
  });
}
