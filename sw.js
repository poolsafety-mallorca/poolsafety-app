/* PoolSafety · Service Worker (PWA offline básico) */
const CACHE = 'poolsafety-v6';
// Añadir titulaciones.js al cache
const CORE = [
  '/',
  '/index.html',
  '/socorrista.html',
  '/coordinador.html',
  '/reset.html',
  '/css/styles.css',
  '/js/icons.js',
  '/js/data.js',
  '/js/supabase-client.js',
  '/js/auth-guard.js',
  '/js/socorrista.js',
  '/js/coordinador.js',
  '/js/pwa-install.js',
  '/js/titulaciones.js',
  '/js/theme-toggle.js',
  '/assets/logo-blanco.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Peticiones a la API de Supabase o CDNs: siempre red directa (datos frescos)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('esm.sh')) {
    return; // dejar pasar sin cache
  }

  // Estrategia stale-while-revalidate para el resto (nuestra app)
  event.respondWith(
    caches.match(req).then(cached => {
      const fetching = fetch(req).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetching;
    })
  );
});
