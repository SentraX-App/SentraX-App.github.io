/*
 * sw-update.js — Forces timely update detection for already-open sessions
 * ==========================================================================
 * THE PROBLEM THIS FIXES: your deploy pipeline already stamps a fresh
 * CACHE_NAME into sw.js on every push (correct, already working). But
 * browsers only passively re-check a registered service worker for
 * changes roughly once every 24 hours by default, and only reliably on a
 * fresh navigation. A TWA/APK is very rarely "fully closed" the way a
 * browser tab is — Android keeps it alive in the background — so a
 * session can sit open far longer than 24h without ever re-checking or
 * reloading, even though a newer version has been live on the server the
 * whole time. That matches "hasn't updated in 24 hours" exactly.
 *
 * THE FIX: (1) explicitly ask the browser to re-check for a new sw.js
 * every 20 minutes while the app is open, instead of waiting on its own
 * ~24h default, and (2) also re-check the moment the app comes back to
 * the foreground after being backgrounded — the most common way a TWA
 * session "reopens" without a true close. When an update is found and
 * takes over, reload automatically — but ONLY while the app is in the
 * background/hidden, never while someone's actively using it (e.g.
 * mid-way through entering a reading), to avoid an disruptive surprise
 * reload during active use.
 *
 * Fully isolated: does not touch the existing
 * navigator.serviceWorker.register(...) call in script.js, just observes
 * the same registration independently.
 */

(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
  let updateWaiting = false;

  function reloadIfSafe() {
    if (updateWaiting && document.visibilityState === 'hidden') {
      window.location.reload();
    }
  }

  navigator.serviceWorker.getRegistration().then(function (registration) {
    if (!registration) return;

    // Force an immediate check right now, in case this session has
    // already been open a long time with no update check yet.
    registration.update().catch(function () {});

    // Keep re-checking periodically instead of waiting on the browser's
    // own much longer default interval.
    setInterval(function () {
      registration.update().catch(function () {});
    }, CHECK_INTERVAL_MS);

    // Also re-check the moment the app comes back to the foreground —
    // the most common way a TWA "reopens" without a true close/restart.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        registration.update().catch(function () {});
      } else {
        // Just went to background — if an update was already waiting,
        // this is a safe moment to reload since nobody's looking at the
        // screen right now.
        reloadIfSafe();
      }
    });
  });

  // Fires once the new service worker has actually taken control.
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    updateWaiting = true;
    reloadIfSafe(); // reloads now if already hidden, otherwise waits
                     // for the next backgrounding via visibilitychange above
  });
})();
