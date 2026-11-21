/* Cache the public owner-gated shell only; private SDK responses are never cached. */
const CACHE = 'taithai-private-drive-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('taithai-private-drive-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/Private%20Drive/') && !url.pathname.startsWith('/Private Drive/')) return;
  if (url.search || !['/', '/index.html', '/manifest.webmanifest'].some(suffix => url.pathname.endsWith(suffix))) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
