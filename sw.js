const CACHE_NAME = 'sentrax-25be053';
const CORE_ASSETS = [
  './',
  'index.html',
  'caregiver.html',
  'privacy.html',
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

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    const isAppShell = url.pathname === '/' || url.pathname.endsWith('/index.html');
    const isCaregiverPage = url.pathname.endsWith('/caregiver.html');
    const isPrivacyPage = url.pathname.endsWith('/privacy.html');
    const cacheKey = isAppShell ? 'index.html' : url.pathname.replace(/^\//, '');

    if (isAppShell) {
      // Stale-while-revalidate: show the cached shell instantly so the app
      // opens fast every time, then quietly refresh the cache in the
      // background for the next open. Trade-off: a fresh push may take one
      // extra app-open to actually appear on screen.
      event.respondWith(
        caches.match(cacheKey, { ignoreSearch: true }).then(function (cached) {
          const networkFetch = fetch(request).then(function (response) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(cacheKey, copy); });
            return response;
          }).catch(function () { return null; });

          // Keep the service worker alive until the background refresh
          // actually finishes, so the cache reliably gets updated even
          // after we've already responded from cache.
          event.waitUntil(networkFetch);

          return cached || networkFetch.then(function (r) { return r || Response.error(); });
        })
      );
      return;
    }

    event.respondWith(
      fetch(request).then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(cacheKey, copy); });
        return response;
      }).catch(function () {
        return caches.match(cacheKey, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          // The app shell and the caregiver page get an offline fallback —
          // both are static shells that pull live data separately via
          // Firebase, so serving the cached HTML is safe even when the
          // network request itself fails. Other pages (download.html,
          // privacy.html) have no meaningful offline substitute, so let
          // the browser show its own "no connection" message.
          if (isCaregiverPage) {
            return caches.match('caregiver.html', { ignoreSearch: true }).then(function (shell) {
              return shell || Response.error();
            });
          }
          if (isPrivacyPage) {
            return caches.match('privacy.html', { ignoreSearch: true }).then(function (shell) {
              return shell || Response.error();
            });
          }
          return Response.error();
        });
      })
    );
    return;
  }

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
