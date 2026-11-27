/*
 * back-nav.js: makes the phone's Back button and Back gesture behave like a normal app.
 *
 * Before: opening a screen from the More menu added nothing to the browser history, so Back left the app and landed on whatever page
 * came before it (sometimes a page that was not available). Now:
 *   - Opening a screen adds one history entry, so Back returns to the screen you came from.
 *   - Popups (help, messages, scanner, upgrade sheet and so on) close first, then Back moves on to the screen.
 *   - Tapping the Vitals tab goes home and clears the extra entries, so Back never replays a long trail.
 *   - At the Vitals home screen nothing is added, so Back leaves the app exactly as before.
 * Popups that already manage their own history entry (More menu, rating, passport card, marketplace, articles) are left alone.
 *
 * Safety: everything is wrapped so that if anything here fails, the app carries on as it did before.
 */
(function () {
  'use strict';
  try {
    if (typeof window.showScreen !== 'function' || !window.history || !history.pushState || window.__sxBackNav) return;
    window.__sxBackNav = true;

    var MAX_STACK = 25;
    var stack = [];                      // screens we came from; one history entry for each
    var openOverlays = [];               // popups we gave an entry to, in the order they opened
    var lastState = history.state, restoring = false, unwinding = false, ignorePops = 0;
    var OWN = /^(moreSheet|ratingOverlay|sxPassportOverlay|sxMktOverlay|sxArticleOverlay)$/;   // these manage their own entry

    var nativePush = history.pushState.bind(history), nativeReplace = history.replaceState.bind(history);
    history.pushState = function (s, t, u) { lastState = s; return nativePush(s, t, u); };
    history.replaceState = function (s, t, u) { lastState = s; return nativeReplace(s, t, u); };

    function activeScreen() {
      var el = document.querySelector('.screen.active');
      return el && el.id ? el.id.replace(/-screen$/, '') : 'vitals';
    }
    function ownsEntry(state) { return !!state && Object.keys(state).some(function (k) { return OWN.test(k); }); }

    /* ---------- screens ---------- */
    var original = window.showScreen;
    window.showScreen = function (name) {
      var from = activeScreen(), tracked = false;
      try {
        if (!restoring && name && name !== from && name !== 'vitals') {
          if (stack.length >= MAX_STACK) { stack.shift(); nativeReplace({ sxScreen: name }, ''); lastState = { sxScreen: name }; }
          else if (history.state && history.state.moreSheet) history.replaceState({ sxScreen: name }, '');   // the open More menu's entry becomes this screen's entry
          else history.pushState({ sxScreen: name }, '');
          stack.push(from); tracked = true;
        }
      } catch (_e) { /* never block navigation */ }
      var result = original.apply(this, arguments);
      try {
        if (!restoring && !tracked && name === 'vitals' && stack.length) {   // going home: drop the trail
          var n = stack.length; stack = []; unwinding = true; history.go(-n);
        }
      } catch (_e) { unwinding = false; }
      return result;
    };

    /* ---------- popups that have no history entry of their own ---------- */
    function esc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
    function hide(el) { el.style.display = 'none'; }
    var POPUPS = [
      { id: 'sx-modal', close: esc },
      { id: 'sx-help', close: esc },
      { id: 'sos-wa-overlay', close: function (el) { el.remove(); } },
      { id: 'pp-scan-overlay', close: function (el) { if (window.SentraXPassportScan && window.SentraXPassportScan.close) window.SentraXPassportScan.close(); else hide(el); } },
      { id: 'ai-history-overlay', close: hide },
      { id: 'hr-pattern-alert', close: hide },
      { id: 'care-sheet', close: hide }
    ];
    function popup(id) { for (var i = 0; i < POPUPS.length; i++) if (POPUPS[i].id === id) return POPUPS[i]; return null; }
    function shown(el) { return !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }

    function scan() {
      var nowOpen = POPUPS.filter(function (p) { return shown(document.getElementById(p.id)); }).map(function (p) { return p.id; });
      nowOpen.forEach(function (id) {
        if (openOverlays.indexOf(id) === -1) { openOverlays.push(id); try { history.pushState({ sxOverlay: id }, ''); } catch (_e) { /* ignore */ } }
      });
      openOverlays = openOverlays.filter(function (id) {
        if (nowOpen.indexOf(id) !== -1) return true;
        // Closed by its own button: take its history entry away, but only if it is the newest one.
        if (history.state && history.state.sxOverlay === id) { ignorePops++; try { history.back(); } catch (_e) { ignorePops--; } }
        return false;
      });
    }
    var queued = false;
    function queueScan() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; try { scan(); } catch (_e) { /* ignore */ } }); }
    new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    /* ---------- the Back button itself ---------- */
    window.addEventListener('popstate', function (e) {
      var popped = lastState; lastState = e.state;
      try {
        if (unwinding) { unwinding = false; return; }
        if (ignorePops > 0) { ignorePops--; return; }
        if (popped && popped.sxOverlay) {                       // Back closes the popup first
          var id = popped.sxOverlay; openOverlays = openOverlays.filter(function (x) { return x !== id; });
          var p = popup(id), el = document.getElementById(id); if (p && el) p.close(el);
          return;
        }
        if (ownsEntry(popped)) return;                           // the More menu, rating, passport card, marketplace or articles close themselves
        if (popped && popped.sxScreen && stack.length) {         // Back returns to the previous screen
          var back = stack.pop(); restoring = true;
          try { window.showScreen(back); } finally { restoring = false; }
        }
      } catch (_e) { restoring = false; }
    });
  } catch (_e) { /* if anything fails the app simply keeps its old behaviour */ }
})();
