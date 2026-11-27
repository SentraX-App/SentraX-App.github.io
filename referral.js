/*
 * referral.js: unique creator links, so creators can be paid on performance.
 *
 * A creator's link is   https://sentra-x.app/?ref=CODE
 *
 *   1. Landing: the code is remembered on this device for 30 days (the first creator link wins) and removed from the address bar.
 *   2. New account: when someone creates an account AFTER opening the link, a one-time record /referrals/{uid} is saved. People who
 *      already had an account are never attributed. The record can be created once and never edited or deleted by the person.
 *   3. Installed app: if the app does not share the browser's storage, the sign-up form has an optional "Creator code" box, so the
 *      creator is still credited. The same record then notes when the app was installed.
 *   4. Payments: when an admin approves a payment (doctor.html), a conversion is written for the creator. Creators only ever see totals
 *      on their report page, never names or emails.
 *
 * Nothing here can block sign-up or the app: every step is wrapped and failures are ignored.
 */
(function () {
  'use strict';
  var KEY = 'sx_ref', DAY = 86400000, WINDOW_DAYS = 30;

  function clean(c) { c = String(c || '').trim().toUpperCase(); return /^[A-Z0-9]{4,24}$/.test(c) ? c : ''; }
  function read() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.code && v.at ? v : null; } catch (_e) { return null; } }
  function write(code, typed) { try { localStorage.setItem(KEY, JSON.stringify({ code: code, at: Date.now(), typed: !!typed })); } catch (_e) { /* storage blocked */ } }
  function drop() { try { localStorage.removeItem(KEY); } catch (_e) { /* ignore */ } }
  function flag(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_e) { /* ignore */ } return null; }
  function count(path, title) { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path, title: title, event: true }); } catch (_e) { /* analytics is optional */ } }

  /* ---- 1. landing ---- */
  try {
    var url = new URL(location.href), code = clean(url.searchParams.get('ref'));
    if (code) {
      var cur = read();
      if (!cur || Date.now() - cur.at > WINDOW_DAYS * DAY) write(code, false);   // first link wins for 30 days
      url.searchParams.delete('ref');
      history.replaceState(history.state, '', url.pathname + (url.search || '') + url.hash);
      try { if (!sessionStorage.getItem('sx_ref_seen')) { sessionStorage.setItem('sx_ref_seen', '1'); count('ref-visit/' + code, 'Creator link opened'); } } catch (_e) { /* ignore */ }
    }
  } catch (_e) { /* never block the page */ }

  /* ---- download page: show the code, count APK taps ---- */
  function downloadPage() {
    var r = read();
    var banner = document.getElementById('ref-banner');
    if (banner && r) { banner.style.display = 'block'; var c = banner.querySelector('.ref-code'); if (c) c.textContent = r.code; }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href$=".apk"]'); if (!a) return;
      var rr = read(); count('apk-download' + (rr ? '/' + rr.code : ''), 'APK download tapped');
    });
  }
  if (/download\.html$/.test(location.pathname)) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', downloadPage); else downloadPage(); }

  /* ---- installed app: remember that it was installed ---- */
  function markInstalled() { if (!flag('sx_installed')) flag('sx_installed', String(Date.now())); }
  window.addEventListener('appinstalled', markInstalled);
  try { if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone || /^android-app:/.test(document.referrer || '')) markInstalled(); } catch (_e) { /* ignore */ }

  /* ---- sign-up form: optional creator code ---- */
  function wireSignupBox() {
    var consent = document.getElementById('auth-consent-row'), row = document.getElementById('auth-ref-row'), input = document.getElementById('auth-ref');
    if (!consent || !row || !input) return;
    function sync() { row.style.display = getComputedStyle(consent).display === 'none' ? 'none' : 'block'; }   // only while creating an account
    new MutationObserver(sync).observe(consent, { attributes: true, attributeFilter: ['style', 'class'] }); sync();
    var r = read(); if (r && !input.value) input.value = r.code;
    input.addEventListener('input', function () { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  }

  /* ---- 2 and 3. attribution after sign-in ---- */
  function attribute(user) {
    try {
      if (!user || typeof firebase === 'undefined' || !firebase.firestore) return;
      var uid = user.uid, db = firebase.firestore(), created = new Date(user.metadata && user.metadata.creationTime).getTime();
      var justCreated = isFinite(created) && Date.now() - created < 15 * 60000;
      var box = document.getElementById('auth-ref'), typed = box ? clean(box.value) : '';
      var known = read();
      if (justCreated && typed && (!known || known.code !== typed)) write(typed, true);   // a different code typed at sign-up counts, even if the link never reached this device
      var rec = read();
      if (!flag('sx_ref_done_' + uid) && rec) {
        var fresh = isFinite(created) && created >= rec.at - 5 * 60000 && Date.now() - rec.at <= WINDOW_DAYS * DAY;
        if (!fresh && !rec.typed) { drop(); }                                  // they already had an account: not a new install through this link
        else {
          db.collection('referrals').doc(uid).get().then(function (snap) {
            if (snap.exists) { flag('sx_ref_done_' + uid, '1'); drop(); return; }
            var installed = flag('sx_installed');
            return db.collection('referrals').doc(uid).set({ code: rec.code, uid: uid, at: Date.now(), linkAt: rec.at, source: rec.typed ? 'code' : 'link', installedAt: installed ? Number(installed) || Date.now() : null })
              .then(function () { flag('sx_ref_done_' + uid, '1'); drop(); });
          }).catch(function (err) { if (err && err.code === 'permission-denied') { flag('sx_ref_done_' + uid, '1'); drop(); } });   // unknown or paused code: stop trying
        }
      }
      // Installed later than the sign-up (for example the APK was opened after registering in the browser): record it once.
      if (flag('sx_installed') && !flag('sx_install_sent_' + uid)) {
        db.collection('referrals').doc(uid).get().then(function (snap) {
          if (snap.exists && !snap.data().installedAt) return db.collection('referrals').doc(uid).update({ installedAt: Number(flag('sx_installed')) || Date.now() }).then(function () { flag('sx_install_sent_' + uid, '1'); });
          if (snap.exists) flag('sx_install_sent_' + uid, '1');
        }).catch(function () { /* try again next time */ });
      }
    } catch (_e) { /* never block the app */ }
  }

  function boot() {
    wireSignupBox();
    if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().onAuthStateChanged(function (u) { setTimeout(function () { attribute(u); }, 1500); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.SXRef = { read: read, clean: clean };
})();
