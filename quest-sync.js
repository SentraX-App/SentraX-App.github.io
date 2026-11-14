/* quest-sync.js — opens Sentra Quest inside the signed-in app and saves its progress
   to the user's OWN account record (users/{uid}.quest). Uses only permissions the
   existing Firestore rules already grant the owner. Nothing is written when signed out. */
(function () {
  'use strict';
  var box = null, bar = null;
  function user() { try { return firebase.auth().currentUser; } catch (e) { return null; } }
  function db() { return firebase.firestore(); }
  function ni(n, max) { return Number.isInteger(n) && n >= 0 && n <= max; }
  function valid(d) {
    return d && typeof d === 'object' && ni(d.xp, 1000000) && ni(d.sessions, 100000) && ni(d.blocks, 100000) &&
      Array.isArray(d.days) && d.days.length <= 500 && d.days.every(function (n) { return ni(n, 100000); }) &&
      Array.isArray(d.log) && d.log.length <= 500 && d.log.every(function (e) { return Array.isArray(e) && ni(e[0], 100000) && ni(e[1], 7200); }) &&
      Array.isArray(d.badges) && d.badges.length <= 30 && ni(d.coins, 100000) && ni(d.theme, 3) && Array.isArray(d.owned) && d.owned.length <= 4 &&
      typeof d.name === 'string' && d.name.length <= 20 && ni(d.ts, 9e15);
  }
  function status(t) { if (bar) bar.querySelector('span').textContent = t; }
  function onMsg(e) {
    if (!box || e.origin !== location.origin) return;
    var f = box.querySelector('iframe'); if (!f || e.source !== f.contentWindow) return;
    var m = e.data || {}, u = user();
    if (m.type === 'sq-close') { close(); return; }
    if (m.type === 'sq-ready') {
      if (!u) { status('Not signed in: progress saves on this phone only.'); return; }
      db().collection('users').doc(u.uid).get().then(function (doc) {
        var q = doc.exists ? doc.data().quest : null;
        if (q) f.contentWindow.postMessage({ type: 'sq-load', data: q }, location.origin);
        status('Synced with your account');
      }).catch(function () { status('Could not reach your account. Playing offline.'); });
    } else if (m.type === 'sq-save') {
      if (!u || !valid(m.data)) return;
      db().collection('users').doc(u.uid).set({ quest: m.data }, { merge: true })
        .then(function () { status('Saved to your account'); }).catch(function () { status('Saved on this phone (will sync later)'); });
    }
  }
  function close() { if (!box) return; window.removeEventListener('message', onMsg); box.remove(); box = null; bar = null; }
  window.openQuest = function () {
    if (box) return;
    box = document.createElement('div'); box.id = 'quest-overlay';
    box.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0f172a;display:flex;flex-direction:column;';
    bar = document.createElement('div'); bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.1);';
    bar.innerHTML = '<button type="button" id="quest-close" style="width:auto;margin:0;padding:8px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#93c5fd;font-weight:700;font-size:14px;">← Back to Sentra-X</button><span style="font-size:12px;color:#94a3b8;text-align:right;"></span>';
    var f = document.createElement('iframe'); f.src = 'exergame.html?embed=1'; f.title = 'Sentra Quest';
    f.setAttribute('allow', 'camera; accelerometer; gyroscope; autoplay'); f.style.cssText = 'flex:1;width:100%;border:0;background:#0f172a;';
    box.appendChild(bar); box.appendChild(f); document.body.appendChild(box);
    bar.querySelector('button').addEventListener('click', close);
    window.addEventListener('message', onMsg);
  };
})();
