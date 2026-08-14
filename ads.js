/*
 * ads.js — Sentra-X AdSense integration
 * ========================================
 * Renders Google AdSense units ONLY inside Articles and Marketplace —
 * nowhere else in the app. Vitals, medications, history, caregiver
 * dashboard, onboarding, etc. stay completely ad-free.
 *
 * Isolated file, same pattern as articles.js/store.js/voice.js — no edits
 * to script.js's core logic. Articles/store just drop SentraXAds.slotHtml()
 * into the HTML strings they already build, then call SentraXAds.init()
 * once after that HTML lands in the DOM (required because AdSense doesn't
 * auto-detect <ins> tags added via innerHTML — each new one needs its own
 * adsbygoogle push, exactly once).
 *
 * ===== SETUP REQUIRED (two values, both below) =====
 * 1. AD_SLOT_ID — from your AdSense dashboard: Ads → By ad unit → Display
 *    ads → Create ad unit. Copy the numeric "ad slot" ID it gives you.
 * 2. AD_CLIENT — your publisher ID, looks like "ca-pub-XXXXXXXXXXXXXXXX",
 *    found under Account → Account information. This same value also needs
 *    to go in ONE more place: the loader <script> tag in index.html's
 *    <head> (see the comment there).
 *
 * Until both are filled in, ad slots simply render blank (Google ignores
 * requests with a placeholder client/slot) — nothing breaks, nothing
 * throws, the rest of the app works exactly as before.
 */
(function () {
  'use strict';

  const AD_CLIENT = 'ca-pub-5333717271762861';
  const AD_SLOT_ID = '8220597875';

  function slotHtml(extraClass) {
    return '<div class="sx-ad-card' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<div class="sx-ad-label">Ad</div>' +
      '<ins class="adsbygoogle" style="display:block" ' +
      'data-ad-client="' + AD_CLIENT + '" ' +
      'data-ad-slot="' + AD_SLOT_ID + '" ' +
      'data-ad-format="auto" ' +
      'data-full-width-responsive="true"></ins>' +
      '</div>';
  }

  function init(container) {
    const scope = container || document;
    if (!scope.querySelectorAll) return;
    const slots = scope.querySelectorAll('ins.adsbygoogle:not([data-sx-inited])');
    slots.forEach(function (ins) {
      ins.setAttribute('data-sx-inited', '1');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (e) { /* ad blocker, offline, or script not loaded yet — skip quietly */ }
    });
  }

  if (typeof window !== 'undefined') {
    window.SentraXAds = { slotHtml: slotHtml, init: init };
  }
})();
