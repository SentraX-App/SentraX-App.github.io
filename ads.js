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

  // Ads are non-personalised until the person accepts personalised ads.
  function consentValue() { try { return localStorage.getItem('sxAdsConsent'); } catch (_e) { return null; } }
  function showNotice() {
    try {
      let seen = null; try { seen = localStorage.getItem('sxAdsNoticeSeen'); } catch (_e) {}
      if (seen || consentValue() || document.getElementById('sx-ads-notice')) return;
      const d = document.createElement('div');
      d.id = 'sx-ads-notice';
      d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9998;background:#0f172a;border:1px solid rgba(148,163,184,0.35);border-radius:14px;padding:12px 14px;color:#cbd5e1;font-size:13px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.45);';
      const p = document.createElement('div');
      p.textContent = 'These ads are general and do not use your personal interests. They are never shown next to your health data. You can allow personalised ads here, or change this any time in Family, under Your privacy choices.';
      d.appendChild(p);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
      function mk(label, primary, onClick) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:0;font-size:13px;font-weight:600;cursor:pointer;' + (primary ? 'background:#2563eb;color:#fff;' : 'background:rgba(255,255,255,0.1);color:#e2e8f0;');
        b.addEventListener('click', function () { try { localStorage.setItem('sxAdsNoticeSeen', '1'); } catch (_e) {} onClick(); d.remove(); });
        return b;
      }
      row.appendChild(mk('OK', false, function () {}));
      row.appendChild(mk('Allow personalised', true, function () {
        try { localStorage.setItem('sxAdsConsent', 'yes'); (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 0; } catch (_e) {}
      }));
      d.appendChild(row);
      document.body.appendChild(d);
    } catch (_e) { /* notice is optional */ }
  }

  function init(container) {
    const scope = container || document;
    if (!scope.querySelectorAll) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = (consentValue() === 'yes') ? 0 : 1; } catch (_e) { /* ignore */ }
    if (scope.querySelectorAll('ins.adsbygoogle:not([data-sx-inited])').length) showNotice();
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
