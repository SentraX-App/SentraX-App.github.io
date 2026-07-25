const CACHE_NAME = 'sentrax-c35fe88';
const CORE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'auth.js',
  'manifest.json',
  'logo-header.png',
  'icon-192-1.png',
  'icon-512.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        CORE_ASSETS.map(function (url) {
          return fetch(url, { cache: 'reload' }).then(function (response) {
            return cache.put(url, response);
          }).catch(function () {});
        })
      );
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Only handle same-origin GET requests. Everything else (Firebase auth/
  // Firestore calls, the CDN qrcode script, POSTs, etc.) is left completely
  // untouched so a flaky third-party connection never gets turned into a
  // broken page by this service worker.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Page navigations (loading "/" or the app itself): try the network, but
  // ALWAYS fall back to the cached app shell — never to an exact-URL cache
  // lookup, since a navigation request for "/" never matches the
  // "index.html" cache entry. That mismatch is what was producing the
  // intermittent "there was a problem loading this page" error.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put('index.html', copy); });
        return response;
      }).catch(function () {
        return caches.match('index.html', { ignoreSearch: true }).then(function (cached) {
          return cached || Response.error();
        });
      })
    );
    return;
  }

  // Other same-origin static assets: network first, cache fallback.
  // Resolve with Response.error() instead of undefined on a total miss —
  // resolving a fetch handler with undefined is what was crashing loads.
  event.respondWith(
    fetch(request).then(function (response) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      return response;
    }).catch(function () {
      return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        return cached || Response.error();
      });
    })
  );
});
