/* Private app pages require a fresh server authorization check, including when installed. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('taithai-private-drive-')).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!/^\/Private(?:%20| )Drive(?:\/|$)/i.test(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => new Response('Reconnect to check app access / เชื่อมต่ออินเทอร์เน็ตเพื่อตรวจสอบการเข้าถึงแอป', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
