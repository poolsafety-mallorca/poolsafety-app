/* PoolSafety · Service Worker (PWA offline básico) */
const CACHE = 'poolsafety-v40';
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
  '/js/ps-horarios.js',
  '/js/theme-toggle.js',
  '/js/ps-storage.js',
  '/js/ps-pdf.js',
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

// La app envía este mensaje al pulsar "Actualizar" (o al pasar la cuenta atrás)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
  if (url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('esm.sh') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('sheetjs.com')) {
    return; // dejar pasar sin cache
  }

  // Estrategia NETWORK-FIRST para nuestra app (HTML/JS/CSS).
  // Si hay red, siempre servimos lo último → los cambios aparecen al primer refresh.
  // Si no hay red, caemos a cache → la app sigue funcionando offline.
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req).then(cached => cached || Response.error()))
  );
});
