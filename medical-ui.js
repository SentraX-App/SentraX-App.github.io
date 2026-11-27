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

/*
 * Polish pass: swaps plain emoji for matching vector icons on buttons, achievement badges, care-team contact lines
 * and the health snapshot. Display only: it never changes ids, handlers, data or calculations. Anything it does not
 * recognise is left exactly as it is, and if it fails the emoji simply stay.
 */
(function () {
  'use strict';
  function s(body) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  var I = {
    camera: s('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    bell: s('<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>'),
    phone: s('<path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    share: s('<path d="M4 12v7h16v-7"/><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/>'),
    printer: s('<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
    trash: s('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
    chat: s('<path d="M4 5h16v11H9l-5 4z"/>'),
    clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    doc: s('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    news: s('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    heart: s('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
    pill: s('<path d="M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>'),
    drop: s('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    moon: s('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    bolt: s('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
    smile: s('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>'),
    flame: s('<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),
    trophy: s('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M10 17h4"/>'),
    users: s('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14a5 5 0 0 1 4.5 5"/>'),
    mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    mobile: s('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
    steth: s('<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-1.5"/><circle cx="20" cy="11.5" r="2"/>'),
    alert: s('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.1"/>')
  };
  /* emoji (without the variation selector) -> icon */
  var MAP = {
    '\u{1F4F7}': 'camera', '\u{1F514}': 'bell', '\u{1F4DE}': 'phone', '\u{1F4E4}': 'share', '\u{1F4F2}': 'share',
    '\u{1F5A8}': 'printer', '\u{1F5D1}': 'trash', '\u{1F4AC}': 'chat', '\u{1F551}': 'clock', '\u{1F4C4}': 'doc',
    '\u{1F4F0}': 'news', '\u{1F9BA}': null, '\u{1FA7A}': 'steth', '\u{1F525}': 'flame', '\u{1F3C6}': 'trophy',
    '\u{1F46A}': 'users', '\u{1F4F1}': 'mobile', '\u2709': 'mail', '\u2764': 'heart', '\u{1F48A}': 'pill',
    '\u{1F4A7}': 'drop', '\u{1F634}': 'moon', '\u{1F3C3}': 'bolt', '\u{1F60A}': 'smile', '\u{1F198}': 'alert'
  };
  var LEAD = /^\s*([\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2764\u2709])\uFE0F?\u200D?[\u{1F466}\u{1F467}\u{1F468}\u{1F469}]*\uFE0F?\s*/u;

  function swap(el) {
    if (!el || el.__sxei) return;
    var n = el.firstChild;
    while (n && n.nodeType === 3 && !n.nodeValue.trim()) n = n.nextSibling;   // skip blank text
    if (!n || n.nodeType !== 3) return;
    var m = LEAD.exec(n.nodeValue);
    if (!m) return;
    var key = MAP[m[1]];
    if (!key || !I[key]) return;
    var span = document.createElement('span');
    span.className = 'sx-ei';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = I[key];
    n.nodeValue = n.nodeValue.slice(m[0].length);
    el.insertBefore(span, n);
  }

  function run() {
    try {
      var q = document.querySelectorAll(
        'button:not(.quick-btn):not(.sx-qa):not(.sx-row), .badge .emoji, .cg-row > span:first-child, .radar-item .label');
      for (var i = 0; i < q.length; i++) swap(q[i]);
    } catch (_e) { /* the emoji simply stay */ }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; run(); });
  }
  function start() {
    run();
    try {
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (_e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
