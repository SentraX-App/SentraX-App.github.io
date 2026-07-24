const CACHE_NAME = 'sentrax-b8cbfe1';
const CORE_ASSETS = ['index.html', 'style.css', 'script.js', 'auth.js', 'manifest.json', 'logo-header.png', 'icon-192-1.png', 'icon-512.png'];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        CORE_ASSETS.map(function(url) {
          return fetch(url, { cache: 'reload' }).then(function(response) {
            return cache.put(url, response);
          }).catch(function() {});
        })
      );
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).then(function(response) {
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
