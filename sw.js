const CACHE_NAME = 'handem-v7';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/repo.js',
  './js/calc.js',
  './js/util.js',
  './js/ui.js',
  './js/sync.js',
  './js/photo.js',
  './js/icons.js',
  './js/aggregate.js',
  './js/components.js',
  './js/screens.js',
  './js/screens-finance.js',
  './js/screens-forms.js',
  './js/mutabakat.js',
  './js/firebase-config.js',
  './js/cloud/firebase-sdk.js',
  './js/cloud/auth.js',
  './js/cloud/db-cloud.js',
  './js/cloud/db-router.js',
  './js/cloud/migrate.js',
  './js/cloud/bootstrap.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo.png',
  './icons/logo-square.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigation (so updates arrive when online), cache-first for static assets,
// always falling back to cache when offline so the app keeps working with no connection.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // 'basic' = same-origin app files; 'cors' = the Firebase SDK loaded
        // from Google's CDN when cloud mode is set up — cache both so a
        // returning user gets a fast/offline-capable load either way.
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// Best-effort: periodic background sync for cheque due-date checks, where supported.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'handem-due-check') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'CHECK_DUE_CHEQUES' }));
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
