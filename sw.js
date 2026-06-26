/* Service worker mínimo para PWA (instalable) + shell offline.
 * Estrategia: network-first (en línea siempre trae lo fresco; offline usa caché).
 * NUNCA cachea api.php ni peticiones que no sean GET, para no romper datos/auth.
 */
const CACHE = 'aseg-cache-v1';
const SHELL = ['./', './index.html', './styles.css', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST/PUT/DELETE -> red directa
  const url = new URL(req.url);
  if (url.pathname.endsWith('api.php')) return;            // API siempre a la red
  if (url.origin !== location.origin) return;             // CDNs externos: red

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      return cached || caches.match('./index.html');
    }
  })());
});
