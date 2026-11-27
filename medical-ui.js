/*
 * medical-ui.js: the clinical UI layer's small behaviours.
 *
 * 1. Quick actions on Home (log a reading, medicines, ask a doctor, emergency).
 * 2. Staff entries for registered doctors and admins. They stay hidden for every other account. The check reads the same
 *    role records the rest of the app already uses: doctors/{uid} and admins/{uid}, which only the account's own owner can read
 *    and nobody can write from the app (see firestore.rules). Hiding the entries is a convenience. The real protection is that
 *    doctor.html re-checks the role on load and Firestore enforces it on every read and write.
 *
 * This file only ADDS things. It changes no existing function, saved data or calculation, and if it fails to run the app works as before.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function svg(body) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'; }
  var ICON = {
    steth: svg('<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-1.5"/><circle cx="20" cy="11.5" r="2"/>'),
    pulse: svg('<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>'),
    pill: svg('<path d="M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>'),
    alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.1"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>')
  };

  /* ---------- 1. quick actions ---------- */
  function buildQuick() {
    var vs = $('vitals-screen');
    if (!vs || $('sx-quick')) return !!$('sx-quick');
    var wrap = document.createElement('div');
    wrap.id = 'sx-quick';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Quick actions');
    function tile(icon, label, cls, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sx-qa' + (cls ? ' ' + cls : '');
      b.innerHTML = '<span class="sx-qa-i">' + icon + '</span><span>' + label + '</span>';
      b.addEventListener('click', onClick);
      wrap.appendChild(b);
    }
    tile(ICON.pulse, 'Log reading', '', function () {
      var el = $('home-log') || $('systolic');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (typeof window.focusBpFields === 'function') { try { window.focusBpFields(); } catch (_e) { /* ignore */ } }
    });
    tile(ICON.pill, 'Medicines', '', function () { if (typeof window.showScreen === 'function') window.showScreen('meds'); });
    tile(ICON.steth, 'Ask a doctor', '', function () { if (typeof window.showScreen === 'function') window.showScreen('care'); });
    tile(ICON.alert, 'Emergency', 'sx-qa-sos', function () {
      var el = $('home-emergency');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });   // scrolls only: SOS itself still asks for confirmation
    });
    vs.insertBefore(wrap, vs.firstChild);
    return true;
  }

  /* ---------- 2. staff entries (doctor / admin accounts only) ---------- */
  var role = { uid: null, doctor: false, admin: false };

  function applyStaff() {
    var d = !!role.doctor, a = !!role.admin, any = d || a;
    function vis(id, on) { var e = $(id); if (e) e.hidden = !on; }
    vis('more-staff-label', any);
    vis('staff-doctor-link', d);
    vis('staff-admin-link', a);
    var card = $('sx-staff-card');
    if (!any) { if (card) card.hidden = true; return; }
    var vs = $('vitals-screen');
    if (!card && vs) {
      card = document.createElement('section');
      card.id = 'sx-staff-card';
      card.setAttribute('aria-label', 'Staff tools');
      vs.insertBefore(card, vs.firstChild);
    }
    if (!card) return;
    var who = d && a ? 'doctor and admin' : (d ? 'doctor' : 'admin');
    card.innerHTML = '<div class="sx-staff-t">' + ICON.shield + '<span>Staff access</span></div>' +
      '<p>You are signed in as a Sentra-X ' + who + '. Your tools open in the staff dashboard.</p>' +
      '<div class="sx-staff-btns">' +
      (d ? '<button type="button" data-staff="inbox">' + 'Open doctor inbox</button>' : '') +
      (a ? '<button type="button" data-staff="pay" class="' + (d ? 'ghost' : '') + '">Open payments &amp; creators</button>' : '') +
      '</div>';
    card.hidden = false;
    var btns = card.querySelectorAll('[data-staff]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', (function (b) { return function () { window.sxOpenStaff(b.getAttribute('data-staff')); }; })(btns[i]));
    }
  }

  function clearRole() { role = { uid: null, doctor: false, admin: false }; applyStaff(); }

  function checkRole(u) {
    if (!u) { clearRole(); return; }
    var uid = u.uid;
    role.uid = uid;
    var db;
    try { db = firebase.firestore(); } catch (_e) { clearRole(); return; }
    function has(col) {
      return db.collection(col).doc(uid).get().then(function (s) { return !!(s && s.exists); }).catch(function () { return false; });
    }
    Promise.all([has('doctors'), has('admins')]).then(function (r) {
      if (!firebase.auth().currentUser || firebase.auth().currentUser.uid !== uid) return;   // signed out or switched while we waited
      role.doctor = r[0]; role.admin = r[1];
      applyStaff();
    });
  }

  window.sxOpenStaff = function (tab) {
    try { if (typeof window.closeMoreMenu === 'function') window.closeMoreMenu(); } catch (_e) { /* ignore */ }
    if (!role.doctor && !role.admin) return;   // belt and braces: nothing opens for a non-staff account
    var t = tab === 'pay' && role.admin ? 'pay' : (role.doctor ? 'inbox' : 'pay');
    window.location.href = 'doctor.html#' + t;
  };

  function start() {
    buildQuick();
    applyStaff();
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (u) { clearRole(); if (u) checkRole(u); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
