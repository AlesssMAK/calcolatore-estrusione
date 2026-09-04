/* Service worker for the Extrusion Calculator PWA.
 * Goal: make the app installable + usable offline, while always preferring
 * fresh content when online (so deploys are picked up on the next load).
 *
 * Strategy:
 *  - navigations: network-first, fall back to the cached app shell offline;
 *  - same-origin static assets (hashed JS/CSS, icons): stale-while-revalidate;
 *  - everything else (e.g. Supabase API, Google Fonts): straight to network.
 */
const CACHE = 'ec-cache-v1';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // App navigations: network-first so the latest build is always used online,
  // cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(request)) ||
          (await caches.match('/index.html')) ||
          (await caches.match('/')) ||
          Response.error(),
      ),
    );
    return;
  }

  // Same-origin assets: serve from cache immediately, refresh in background.
  if (sameOrigin) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
  // Cross-origin (Supabase, fonts): let the browser handle it (no SW cache).
});
