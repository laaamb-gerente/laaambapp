// ── sw.js · Service Worker de LAAAMBAPP ─────────────────────
// Cache-first para assets estáticos. NUNCA intercepta peticiones
// a Supabase ni a /api/ (auth y datos deben ir siempre a la red).

const CACHE_NAME = 'laaambapp-v9';

// Paths relativos: resuelven contra la ubicación del SW en cada host
// (raíz en Vercel, /laaambapp/ en GitHub Pages).
const STATIC_ASSETS = [
  './index.html',
  './hoy.html',
  './sala-cuna.html',
  './leche.html',
  './queseria.html',
  './animales.html',
  './reproduccion.html',
  './nutricion.html',
  './lotes.html',
  './salud.html',
  './medicamentos.html',
  './finanzas.html',
  './bajas.html',
  './beneficio.html',
  './nomina.html',
  './ica.html',
  './reportes.html',
  './okr.html',
  './ajustes.html',
  './login.html',
  './js/supabase-client.js',
  './js/auth.js',
  './js/db.js',
  './js/app-state.js',
  './js/offline-db.js',
  './js/clear-demo-data.js',
  './AppData.js',
  './farm-selector.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-laaamb.jpg',
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
     .then(() =>
       // Notificar a las pestañas abiertas que hay nueva versión
       self.clients.matchAll().then((clients) => {
         clients.forEach((client) => {
           client.postMessage({ type: 'SW_UPDATED' });
         });
       })
     )
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
    caches.match(req, { ignoreSearch: false }).then((cached) => {
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
          return caches.match('./index.html');
        }
      });
    })
  );
});
