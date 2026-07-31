import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTicketImage, MAX_TICKET_IMAGE_BYTES } from './ticket-analyzer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const mimeTypes = {
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
    if (['styles.css', 'app.js', 'account.js', 'account-loader.js', 'auth-feedback.js', 'game.css', 'game.js', 'feature-pages.css', 'dashboard.js', 'preferences.css', 'preferences.js', 'settings.css', 'settings.js'].includes(assetName)) {
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

async function readJsonBody(req) {
  const maximumBytes = MAX_TICKET_IMAGE_BYTES * 2;
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
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || undefined
    });
    res.writeHead(200);
    res.end(JSON.stringify({ result }));
  } catch (error) {
    const code = String(error?.message || 'TICKET_ANALYSIS_UNAVAILABLE');
    res.writeHead(ticketErrorStatus(code));
    res.end(JSON.stringify({ error: code }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
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

server.listen(port, '127.0.0.1', () => {
  console.log(`Taithai Apps is running at http://localhost:${port}`);
});
