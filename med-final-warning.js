/* med-final-warning.js
   Adds ONE missing step to the existing medication flow: a "final warning" to the PATIENT
   a few minutes BEFORE the caregiver is alerted.

   Existing flow (unchanged):  due time -> reminder to patient -> overdue 10 min -> caregiver alerted.
   New step:                   overdue 5 min -> "Take it now, your caregiver will be alerted in N min".

   This file is deliberately separate: it never edits or replaces script.js. It only READS the
   same medication data the app already keeps, and shows a notification plus an in-app banner.
   If anything here fails, the rest of the app carries on exactly as before. */
(function () {
  'use strict';
  // Keep CAREGIVER_ALERT_AFTER_MIN equal to REMINDER_DELAY_MINUTES in the alert checker (currently 10).
  var CAREGIVER_ALERT_AFTER_MIN = 10, WARN_LEAD_MIN = 5, WARNED_KEY = 'final-warned-v1', TAG = 'sentrax-final-';

  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function toMin(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function today() { try { if (typeof todayStr === 'function') return todayStr(); } catch (e) {} var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function active(m) { try { if (typeof isMedActive === 'function') return isMedActive(m); } catch (e) {} return true; }
  function hasCaregiver() { return !!(localStorage.getItem('cgPhone') || localStorage.getItem('cgEmail')); }

  function banner(items) {
    var el = document.getElementById('final-warning-banner'), anchor = document.getElementById('due-banner');
    if (!items.length) { if (el) el.remove(); return; }
    if (!el) {
      if (!anchor) return;
      el = document.createElement('div'); el.id = 'final-warning-banner'; el.setAttribute('role', 'alert');
      anchor.insertAdjacentElement('afterend', el);
    }
    el.innerHTML = items.map(function (i) {
      return '<div class="alert-banner" style="background:#7f1d1d;border:1px solid #f87171;color:#fff;margin-top:8px;">\u26A0\uFE0F Take <b></b> now. ' + (hasCaregiver() ? 'Your caregiver will be alerted in about ' + i.left + ' min.' : 'It is overdue.') + '</div>';
    }).join('');
    var bs = el.querySelectorAll('b'); items.forEach(function (i, n) { bs[n].textContent = i.name; });
  }

  function closeResolved(stillDueIds) {
    try {
      if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistration) return;
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg || !reg.getNotifications) return;
        reg.getNotifications().then(function (list) {
          list.forEach(function (n) { if (n.tag && n.tag.indexOf(TAG) === 0 && stillDueIds.indexOf(n.tag.slice(TAG.length)) < 0) n.close(); });
        });
      });
    } catch (e) {}
  }

  function notify(m, left) {
    var body = m.name + ' is overdue. ' + (hasCaregiver() ? 'Your caregiver will be alerted in about ' + left + ' min if you have not taken it.' : 'Please take it now.');
    try {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) reg.showNotification('\u26A0\uFE0F Take your medicine now', { body: body, tag: TAG + m.id, renotify: true, requireInteraction: true, icon: 'icon-192-1.png', badge: 'icon-192-1.png', vibrate: [300, 150, 300, 150, 300], data: { url: './' } }).catch(function () {});
      });
    } catch (e) {}
    try { if (document.visibilityState === 'visible' && typeof playMedAlarmSound === 'function') playMedAlarmSound(); } catch (e) {}
  }

  function run() {
    try {
      var d = today(), now = nowMin(), logs = read('medLogs', {}), todayLog = logs[d] || {};
      var meds = read('meds', []).filter(function (m) { return m && m.time && m.id != null && active(m) && !todayLog[m.id]; });
      var warned = read(WARNED_KEY, {}), keep = {}, items = [], changed = false;
      Object.keys(warned).forEach(function (k) { if (k.indexOf(d + ':') === 0) keep[k] = 1; else changed = true; });
      meds.forEach(function (m) {
        var over = now - toMin(m.time);
        if (over >= CAREGIVER_ALERT_AFTER_MIN - WARN_LEAD_MIN && over < CAREGIVER_ALERT_AFTER_MIN) {
          var left = CAREGIVER_ALERT_AFTER_MIN - over; items.push({ name: m.name, left: left });
          var key = d + ':' + m.id;
          if (!keep[key]) { keep[key] = 1; changed = true; if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('reminders-muted') !== '1') notify(m, left); }
        }
      });
      if (changed) localStorage.setItem(WARNED_KEY, JSON.stringify(keep));
      banner(items);
      closeResolved(meds.map(function (m) { return String(m.id); }));
    } catch (e) { /* never interfere with the rest of the app */ }
  }

  setInterval(run, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') run(); });
  window.addEventListener('focus', run);
  setTimeout(run, 3000);
})();
