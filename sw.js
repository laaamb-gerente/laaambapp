// ── sw.js · Service Worker de LAAAMBAPP ─────────────────────
// Cache-first para assets estáticos. NUNCA intercepta peticiones
// a Supabase ni a /api/ (auth y datos deben ir siempre a la red).

const CACHE_NAME = 'laaambapp-v1';

const STATIC_ASSETS = [
  '/laaambapp/index.html',
  '/laaambapp/hoy.html',
  '/laaambapp/animales.html',
  '/laaambapp/reproduccion.html',
  '/laaambapp/lotes.html',
  '/laaambapp/salud.html',
  '/laaambapp/medicamentos.html',
  '/laaambapp/finanzas.html',
  '/laaambapp/bajas.html',
  '/laaambapp/beneficio.html',
  '/laaambapp/nomina.html',
  '/laaambapp/ica.html',
  '/laaambapp/reportes.html',
  '/laaambapp/okr.html',
  '/laaambapp/ajustes.html',
  '/laaambapp/login.html',
  '/laaambapp/js/supabase-client.js',
  '/laaambapp/js/auth.js',
  '/laaambapp/js/db.js',
  '/laaambapp/js/app-state.js',
  '/laaambapp/js/offline-db.js',
  '/laaambapp/js/clear-demo-data.js',
  '/laaambapp/AppData.js',
  '/laaambapp/farm-selector.js',
  '/laaambapp/manifest.json',
  '/laaambapp/icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Instalar: precachear los assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para estáticos; red directa para Supabase y /api/
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar: Supabase, /api/ ni métodos distintos de GET
  if (req.method !== 'GET' ||
      url.hostname.includes('supabase.co') ||
      url.pathname.includes('/api/')) {
    return; // la petición va directo a la red
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cachear copias de respuestas válidas del mismo origen
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Fallback de navegación: servir index.html del cache
        if (req.mode === 'navigate') {
          return caches.match('/laaambapp/index.html');
        }
      });
    })
  );
});
