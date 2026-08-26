// ── sw.js · Service Worker de LAAAMBAPP ─────────────────────
// HTML + JS + CSS: NETWORK-FIRST (actualizaciones automáticas).
// Iconos/CDN: CACHE-FIRST (offline).
// NUNCA intercepta Supabase ni /api/.

// v61: calendario sin trimestre (queda 90 d + año).
const CACHE_NAME = 'laaambapp-v61';
const CACHE_SHELL = 'laaambapp-shell-v61';

const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-laaamb.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const oldKeys = keys.filter((k) => k !== CACHE_NAME && k !== CACHE_SHELL);
      const hadOld = oldKeys.length > 0;
      return Promise.all(oldKeys.map((k) => caches.delete(k))).then(() => hadOld);
    })
      .then((hadOld) =>
        self.clients.claim().then(() => hadOld)
      )
      .then((hadOld) => {
        // Solo avisar a las pestañas si reemplazamos una cache anterior
        // (evita re-mostrar "Nueva versión" tras Actualizar ya / 1ª visita)
        if (!hadOld) return;
        return self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) => {
            clients.forEach((client) => {
              client.postMessage({ type: 'SW_UPDATED', cache: CACHE_NAME });
            });
          });
      })
  );
});

// Mensaje desde la página: forzar skipWaiting / limpiar
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' ||
      url.hostname.includes('supabase.co') ||
      url.pathname.includes('/api/')) {
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname;
  const esHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    path.endsWith('.html') ||
    path === '/' ||
    path.endsWith('/');
  const esAppCode = sameOrigin && (
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.includes('/js/') ||
    path.includes('/css/')
  );

  // HTML + JS + CSS de la app → NETWORK FIRST (siempre código fresco)
  if (esHTML || esAppCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.status === 200 && sameOrigin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) =>
          cached || (esHTML ? caches.match('./index.html') : undefined)
        )
      )
    );
    return;
  }

  // Iconos, manifest, CDN → CACHE FIRST
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((cached) => {
      if (cached) {
        fetch(req).then((res) => {
          if (res && res.status === 200 && sameOrigin) {
            caches.open(CACHE_SHELL).then((cache) => cache.put(req, res)).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.status === 200 && sameOrigin) {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => undefined);
    })
  );
});
