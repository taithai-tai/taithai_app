const CACHE = 'chordly-v4-visibility';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('chordly-')).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const navigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith(fetch(event.request).then(async response => {
    const cache = await caches.open(CACHE);
    const protectedResponse = response.redirected || /no-store|private/i.test(response.headers.get('cache-control') || '');
    if (navigation || protectedResponse || !response.ok) await cache.delete(event.request);
    else if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }).catch(async () => {
    // A saved page cannot prove that its app is still public. Never replay a navigation offline.
    if (navigation) return new Response('Reconnect to check app access / เชื่อมต่ออินเทอร์เน็ตเพื่อตรวจสอบการเข้าถึงแอป', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    return (await caches.match(event.request)) || Response.error();
  }));
});
