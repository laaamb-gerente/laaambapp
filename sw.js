// ── sw.js · Service Worker de LAAAMBAPP ─────────────────────
// Cache-first para assets estáticos. NUNCA intercepta peticiones
// a Supabase ni a /api/ (auth y datos deben ir siempre a la red).

// v14: módulo APARCERÍA (js/aparceria.js) + grupo nuevo en js/sidebar.js.
// v15: cargador (js/aportantes-loader.js) + motor sobre estado_salida.
// v16: desambiguación de chapetas repetidas (codigo_original + sufijo).
// v17: columna CODIGO opcional como escape hatch de desambiguación.
// v18: soporte del esquema CARGA MADRES (ESTADO LAAAMB, PESO REAL, hdr fila 4).
// v19: peso sin fecha a columnas del animal + bajas sin fecha visibles.
// v20: 3 fases (contractuales/reposicion/crias), origen reposicion, reetiquetado.
// v21: validacion cria-vs-vientre, lista de re-etiquetado y nota provisional.
// v22: MAPA_HATO explicito (Excel → aportantes.nombre) visible en el pre-flight.
// El bump es OBLIGATORIO aquí: las otras 22 páginas cargan './js/sidebar.js'
// sin ?v y el SW lo sirve cache-first, así que sin cambiar CACHE_NAME no
// verían el grupo nuevo del menú.
const CACHE_NAME = 'laaambapp-v22';

// Paths relativos: resuelven contra la ubicación del SW en cada host
// (raíz en Vercel, /laaambapp/ en GitHub Pages).
const STATIC_ASSETS = [
  './js/supabase-client.js',
  './js/sidebar.js',
  './js/aparceria.js',
  './js/aportantes-loader.js',
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

// Fetch: network-first para HTML/navegación; cache-first para assets.
// Red directa para Supabase y /api/.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar: Supabase, /api/ ni métodos distintos de GET
  if (req.method !== 'GET' ||
      url.hostname.includes('supabase.co') ||
      url.pathname.includes('/api/')) {
    return; // la petición va directo a la red
  }

  // ── Detectar si es una petición de documento HTML / navegación ──
  const esHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (esHTML) {
    // NETWORK-FIRST: siempre intentar la red; caché solo como respaldo offline.
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Sin red: servir la versión cacheada de esta página, o index como fallback
        return caches.match(req, { ignoreSearch: true })
          .then((cached) => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  // ── Resto (JS, CSS, imágenes, CDN): CACHE-FIRST ──
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Sin red y sin caché: nada que servir
        return undefined;
      });
    })
  );
});
