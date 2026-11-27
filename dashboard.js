/*
 * dashboard.js: a human-centred home screen.
 *
 * Every number and name on these cards comes from the app's own real data: the readings, medicines and care team stored on the
 * device (the same data the rest of the app uses), and the family connections and pending invitations in the person's account.
 * Nothing is invented. Where the app has no data for something, the card says so or invites the person to add it.
 * This file only ADDS sections to the home screen; it changes no existing feature, calculation or saved data.
 */
(function () {
  'use strict';

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_e) { return d; } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { try { return typeof todayStr === 'function' ? todayStr() : dayKey(); } catch (_e) { return dayKey(); } }
  function minutesOf(t) { var p = String(t || '').split(':'); var h = parseInt(p[0], 10), m = parseInt(p[1], 10); return isFinite(h) && isFinite(m) ? h * 60 + m : null; }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function active(m) { try { return typeof isMedActive === 'function' ? isMedActive(m) : true; } catch (_e) { return true; } }
  function ts(v) { var t = new Date(v.dateISO || v.date).getTime(); return isFinite(t) ? t : null; }
  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 90) return 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + ' minutes ago';
    var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function when(ms) { return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  function maskEmail(e) { e = String(e || ''); var i = e.indexOf('@'); return i > 1 ? e.slice(0, 2) + '\u2026' + e.slice(i) : e; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- explanations of a reading, in plain words ---------- */
  var EXPLAIN = {
    0: 'In the healthy range for most adults.',
    1: 'A little above the ideal range. Worth keeping an eye on.',
    2: 'Above the healthy range. Consider speaking with a healthcare professional.',
    3: 'High. Please get advice from a healthcare professional soon.',
    4: 'Very high. If you feel unwell, get medical help now.'
  };
  function shortLevel(l) { return String(l || '').split(' \u2014 ')[0]; }   // "Grade 1 Hypertension (Mild)" without the long advice tail
  function chipColor(sev) { return ['#34d399', '#fbbf24', '#fb923c', '#f87171', '#f87171'][sev] || '#94a3b8'; }

  /* ---------- data snapshots ---------- */
  function snapshot() {
    var vitals = read('vitals', []), meds = read('meds', []).filter(active), logs = read('medLogs', {}), t = today(), todayLog = logs[t] || {}, now = nowMin();
    var doses = meds.map(function (m) {
      var mins = minutesOf(m.time), taken = !!todayLog[m.id], state = taken ? 'taken' : (mins == null ? 'upcoming' : (mins <= now ? (now - mins > 120 ? 'overdue' : 'due') : 'upcoming'));
      return { name: m.name, time: m.time, mins: mins == null ? 9999 : mins, state: state };
    }).sort(function (a, b) { return a.mins - b.mins; });
    return { vitals: vitals, doses: doses, meds: read('meds', []), logs: logs, circle: read('caregivers', []) };
  }

  /* ---------- family connection data from the person's account (real, read-only) ---------- */
  var linked = null, pending = null, lastFetch = 0, fetching = false;
  function fetchCircle(force) {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth || !firebase.auth().currentUser || fetching) return;
      if (!force && Date.now() - lastFetch < 90000) return;
      fetching = true; lastFetch = Date.now();
      var u = firebase.auth().currentUser, db = firebase.firestore();
      Promise.all([
        db.collection('users').doc(u.uid).get().catch(function () { return null; }),
        db.collection('invites').where('patientUid', '==', u.uid).get().catch(function () { return null; })
      ]).then(function (r) {
        var d = r[0] && r[0].exists ? r[0].data() : null;
        linked = d ? (d.caregiverUids || []).map(function (id) { return (d.caregiverInfo || {})[id] || {}; }) : null;
        pending = null;
        if (r[1]) { var list = []; r[1].forEach(function (x) { var v = x.data(); if (v && v.usedBy == null && v.expiresAt > Date.now()) list.push(v); }); pending = list; }
        fetching = false; render();
      }).catch(function () { fetching = false; });
    } catch (_e) { fetching = false; }
  }

  /* ---------- the sections ---------- */
  function todayCard(s) {
    var v = s.vitals[0], h = '<div class="sx-head"><h2 id="sx-today-title">Today at a glance</h2><span class="sx-date">' + esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })) + '</span></div>';

    // Blood pressure
    if (v && v.sys && v.dia) {
      var t = ts(v), sev = v.severity || 0, fresh = t != null ? ago(t) : '';
      var stale = t != null && Date.now() - t > 3 * 86400000;
      h += '<button type="button" class="sx-row" data-go="history"><span class="sx-ico" style="--c:' + chipColor(sev) + '">\u2764</span><span class="sx-main"><span class="sx-k">Latest blood pressure</span>' +
        '<span class="sx-v">' + esc(v.sys) + '/' + esc(v.dia) + ' <small>mmHg</small>' + (v.hr ? ' \u00B7 ' + esc(v.hr) + ' <small>bpm</small>' : '') + '</span>' +
        '<span class="sx-chip" style="--c:' + chipColor(sev) + '">' + esc(shortLevel(v.level)) + '</span>' +
        '<span class="sx-s">' + esc(EXPLAIN[sev] || '') + '</span>' +
        (t != null ? '<span class="sx-s sx-time">Logged ' + esc(fresh) + ' \u00B7 ' + esc(when(t)) + (stale ? ' \u00B7 time for a new reading?' : '') + '</span>' : '') + '</span><span class="sx-go" aria-hidden="true">\u203A</span></button>';
    } else {
      h += '<button type="button" class="sx-row" data-act="log"><span class="sx-ico" style="--c:#60a5fa">\u2764</span><span class="sx-main"><span class="sx-k">Blood pressure</span><span class="sx-v sx-soft">No readings yet</span><span class="sx-s">Log your first reading below. Over time, Sentra-X helps you see how your health is changing.</span></span><span class="sx-go" aria-hidden="true">\u203A</span></button>';
    }

    // Medicines
    var n = s.doses.length;
    if (n) {
      var taken = s.doses.filter(function (d) { return d.state === 'taken'; }).length, overdue = s.doses.filter(function (d) { return d.state === 'overdue'; }), due = s.doses.filter(function (d) { return d.state === 'due'; }), next = s.doses.filter(function (d) { return d.state === 'upcoming'; })[0];
      var line = taken === n ? 'All taken for today. Well done.' : (overdue.length ? plural(overdue.length, 'medicine is', 'medicines are') + ' overdue' : (due.length ? plural(due.length, 'medicine is', 'medicines are') + ' due now' : (next ? 'Next: ' + next.name + ' at ' + next.time : '')));
      h += '<button type="button" class="sx-row" data-go="meds"><span class="sx-ico" style="--c:' + (overdue.length ? '#f87171' : '#60a5fa') + '">\uD83D\uDC8A</span><span class="sx-main"><span class="sx-k">Medicines today</span><span class="sx-v">' + taken + ' of ' + n + ' taken</span>' +
        '<span class="sx-s' + (overdue.length ? ' sx-warn' : '') + '">' + esc(line) + '</span></span><span class="sx-go" aria-hidden="true">\u203A</span></button>';
    } else {
      h += '<button type="button" class="sx-row" data-go="meds"><span class="sx-ico" style="--c:#60a5fa">\uD83D\uDC8A</span><span class="sx-main"><span class="sx-k">Medicines</span><span class="sx-v sx-soft">None added</span><span class="sx-s">Add your medicines and Sentra-X will remind you, so doses are not forgotten.</span></span><span class="sx-go" aria-hidden="true">\u203A</span></button>';
    }

    // Care circle
    var team = s.circle.length, conn = linked ? linked.length : 0;
    var cl = team || conn ? (conn ? plural(conn, 'family account', 'family accounts') + ' connected' : plural(team, 'person', 'people') + ' alerted if you need help') : 'Nobody connected yet';
    h += '<button type="button" class="sx-row" data-go="family"><span class="sx-ico" style="--c:#fbbf24">\uD83D\uDC6A</span><span class="sx-main"><span class="sx-k">Your care circle</span><span class="sx-v' + (team || conn ? '' : ' sx-soft') + '">' + esc(cl) + '</span>' +
      '<span class="sx-s">' + (team || conn ? 'They can support you, with your permission.' : 'Add someone who cares about you. You are not managing your health alone.') + '</span></span><span class="sx-go" aria-hidden="true">\u203A</span></button>';
    return h;
  }

  function medicinesCard(s) {
    if (!s.doses.length) return '';
    var rows = s.doses.map(function (d) {
      var lab = { taken: 'Taken', due: 'Due now', overdue: 'Overdue', upcoming: 'Later today' }[d.state];
      return '<li class="sx-dose sx-' + d.state + '"><span class="sx-dose-time">' + esc(d.time || '') + '</span><span class="sx-dose-name">' + esc(d.name) + '</span><span class="sx-dose-chip">' + lab + '</span></li>';
    }).join('');
    var pct = typeof getWeeklyAdherencePct === 'function' ? getWeeklyAdherencePct(s.meds, s.logs) : null;
    return '<div class="sx-head"><h2>Your medicines today</h2></div><ul class="sx-doses">' + rows + '</ul>' +
      '<div class="sx-foot">' + (pct != null ? '<span>Taken <b>' + pct + '%</b> of doses in the last 7 days</span>' : '<span></span>') + '<button type="button" class="sx-link" data-go="meds">Medication history \u203A</button></div>';
  }

  function trendsCard(s) {
    var v = s.vitals.filter(function (x) { return x.sys && x.dia && ts(x) != null; });
    var h = '<div class="sx-head"><h2>Your health over time</h2></div>';
    if (v.length < 2) return h + '<p class="sx-p">Log a few readings over the coming days. Sentra-X will show how your blood pressure is changing, so small shifts do not go unnoticed.</p><div class="sx-foot"><span></span><button type="button" class="sx-link" data-go="history">Reading history \u203A</button></div>';
    var now = Date.now(), wk = 7 * 86400000;
    var a = v.filter(function (x) { return now - ts(x) <= wk; }), b = v.filter(function (x) { var g = now - ts(x); return g > wk && g <= 2 * wk; }), m30 = v.filter(function (x) { return now - ts(x) <= 30 * 86400000; });
    var sa = avg(a.map(function (x) { return Number(x.sys); })), sb = avg(b.map(function (x) { return Number(x.sys); }));
    var msg = '';
    if (sa != null && sb != null) { var d = sa - sb; msg = d >= 3 ? 'Your blood pressure is running higher than last week (' + sa + ' compared with ' + sb + ').' : (d <= -3 ? 'Your blood pressure is lower than last week (' + sa + ' compared with ' + sb + ').' : 'Your blood pressure is about the same as last week.'); }
    else if (sa != null) msg = 'You have ' + plural(a.length, 'reading', 'readings') + ' this week. Keep logging to see how it compares.';
    else msg = 'No readings this week yet.';
    // 7-day line, real readings only
    var days = []; for (var i = 6; i >= 0; i--) { var dt = new Date(now - i * 86400000), key = dayKey(dt); var day = v.filter(function (x) { return dayKey(new Date(ts(x))) === key; }); days.push({ l: dt.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0), s: day.length ? avg(day.map(function (x) { return Number(x.sys); })) : null }); }
    var vals = days.filter(function (x) { return x.s != null; }).map(function (x) { return x.s; });
    var svg = '';
    if (vals.length >= 2) {
      var W = 300, H = 78, P = 16, lo = Math.min.apply(null, vals) - 6, hi = Math.max.apply(null, vals) + 6, step = (W - P * 2) / 6, path = '', dots = '', st = false;
      days.forEach(function (x, i) { var X = P + i * step; if (x.s == null) { st = false; return; } var Y = H - P - ((x.s - lo) / (hi - lo)) * (H - P * 2); path += (st ? ' L ' : ' M ') + X.toFixed(1) + ' ' + Y.toFixed(1); st = true; dots += '<circle cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="3.5" fill="#60a5fa"/><text x="' + X.toFixed(1) + '" y="' + (Y - 7).toFixed(1) + '" font-size="9.5" font-weight="700" fill="#e2e8f0" text-anchor="middle">' + x.s + '</text>'; });
      svg = '<svg class="sx-spark" viewBox="0 0 ' + W + ' ' + (H + 14) + '" role="img" aria-label="Top blood pressure number for each of the last 7 days"><path d="' + path + '" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' + dots +
        days.map(function (x, i) { return '<text x="' + (P + i * step).toFixed(1) + '" y="' + (H + 10) + '" font-size="9" fill="#94a3b8" text-anchor="middle">' + esc(x.l) + '</text>'; }).join('') + '</svg>';
    }
    var facts = [];
    if (m30.length >= 3) facts.push('30-day average: <b>' + avg(m30.map(function (x) { return Number(x.sys); })) + '/' + avg(m30.map(function (x) { return Number(x.dia); })) + '</b> from ' + plural(m30.length, 'reading', 'readings'));
    var pulses = a.filter(function (x) { return Number(x.hr) > 0; }).map(function (x) { return Number(x.hr); });
    if (pulses.length) facts.push('Pulse this week: <b>' + avg(pulses) + ' bpm</b> on average');
    var w = v.filter(function (x) { return Number(x.weight) > 0; });
    if (w.length >= 2) { var dw = Math.round((Number(w[0].weight) - Number(w[w.length - 1].weight)) * 10) / 10; facts.push('Weight: <b>' + esc(w[0].weight) + ' kg</b>' + (dw ? ' (' + (dw > 0 ? 'up ' : 'down ') + Math.abs(dw) + ' kg since your first logged weight)' : ' (unchanged)')); }
    return h + '<p class="sx-p sx-lead">' + esc(msg) + '</p>' + svg + (facts.length ? '<ul class="sx-facts">' + facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="sx-foot"><span>Averages and trends are a guide, not a diagnosis.</span><button type="button" class="sx-link" data-go="history">All readings \u203A</button></div>';
  }

  function circleCard(s) {
    var team = s.circle, h = '<div class="sx-head"><h2>Your care circle</h2></div>';
    var rows = '';
    team.forEach(function (c) {
      rows += '<li class="sx-person"><span class="sx-av">' + esc(String(c.name || '?').charAt(0).toUpperCase()) + '</span><span class="sx-pn">' + esc(c.name || 'Caregiver') + (c.isPrimary ? ' <span class="sx-pri">Primary</span>' : '') + '</span><span class="sx-ps">Alerted by ' + (c.phone && c.email ? 'SMS and email' : (c.phone ? 'SMS' : 'email')) + '</span></li>';
    });
    if (rows) h += '<p class="sx-p">These people are told if your blood pressure is high or you miss a medicine.</p><ul class="sx-people">' + rows + '</ul>';
    if (linked && linked.length) {
      h += '<div class="sx-sub">Family accounts that can view your readings</div><ul class="sx-people">' + linked.map(function (x) { return '<li class="sx-person"><span class="sx-av sx-av2">\u2713</span><span class="sx-pn">' + esc(maskEmail(x.email) || 'Family member') + '</span><span class="sx-ps">Connected</span></li>'; }).join('') + '</ul>';
    }
    if (pending && pending.length) {
      var soon = Math.min.apply(null, pending.map(function (x) { return x.expiresAt; })), hrs = Math.max(1, Math.round((soon - Date.now()) / 3600000));
      h += '<div class="sx-note sx-pend">' + plural(pending.length, 'invitation is', 'invitations are') + ' waiting to be accepted (expires in about ' + hrs + (hrs === 1 ? ' hour' : ' hours') + ').</div>';
    }
    if (!rows && !(linked && linked.length)) h += '<p class="sx-p">Your family can support you, with your permission. Add someone who should be told if you need help, or invite a family member to view your readings.</p>';
    h += '<p class="sx-consent">Only the people you add or invite can see your information. You can remove anyone at any time in Family.</p>' +
      '<div class="sx-foot"><span></span><button type="button" class="sx-link sx-strong" data-go="family">' + (rows || (linked && linked.length) ? 'Manage care circle' : 'Add someone') + ' \u203A</button></div>';
    return h;
  }

  function scoreExplainer() {
    var v = read('vitals', [])[0], meds = read('meds', []), logs = read('medLogs', {});
    if (!v) return '<p>Your score appears after your first reading. It brings together your latest blood pressure and, if you have medicines saved, how many doses you took this week.</p>';
    var base = [95, 80, 60, 35, 15][v.severity || 0], pct = typeof getWeeklyAdherencePct === 'function' ? getWeeklyAdherencePct(meds, logs) : null;
    return '<p><b>How it is worked out.</b> Your score blends two things: your latest blood pressure reading (65%) and how many of your medicine doses you took in the last 7 days (35%). If you have no medicines saved, it uses your reading alone.</p>' +
      '<ul><li>Latest reading: ' + esc(shortLevel(v.level)) + ' \u2192 ' + base + ' out of 100</li>' + (pct != null ? '<li>Medicines taken this week: ' + pct + '%</li>' : '<li>No medicines saved, so adherence is not counted</li>') + '</ul>' +
      '<p class="sx-limit"><b>What it cannot tell you.</b> The score is a simple guide to help you notice changes. It does not diagnose anything and does not replace advice from a doctor or nurse. A good score does not mean you are free of health problems.</p>';
  }

  /* ---------- placing the sections ---------- */
  var els = {};
  function ensure() {
    var vs = $('vitals-screen'); if (!vs) return false;
    if (!els.today) {
      var hero = vs.querySelector('.home-hero'), log = $('systolic') ? $('systolic').closest('.card') : null;
      function mk(id, cls) { var e = document.createElement('section'); e.id = id; e.className = 'card sx-card ' + (cls || ''); return e; }
      els.today = mk('sx-today', 'sx-today'); els.today.setAttribute('aria-labelledby', 'sx-today-title');
      els.meds = mk('sx-meds'); els.trends = mk('sx-trends'); els.circle = mk('sx-circle', 'sx-circle');
      if (hero) hero.parentNode.insertBefore(els.today, hero); else vs.insertBefore(els.today, vs.firstChild);
      var anchor = log || hero;
      if (anchor) { anchor.insertAdjacentElement('afterend', els.circle); anchor.insertAdjacentElement('afterend', els.trends); anchor.insertAdjacentElement('afterend', els.meds); }
      else { vs.appendChild(els.meds); vs.appendChild(els.trends); vs.appendChild(els.circle); }
      // "How is this calculated?" under the health score
      var st = $('score-sub');
      if (st && !$('sx-score-why')) {
        var b = document.createElement('button'); b.type = 'button'; b.id = 'sx-score-why'; b.className = 'sx-link sx-why'; b.textContent = 'How it is worked out'; b.setAttribute('aria-expanded', 'false');
        st.insertAdjacentElement('afterend', b);
        var panel = document.createElement('div'); panel.id = 'sx-score-panel'; panel.className = 'sx-panel'; panel.style.display = 'none';
        hero.appendChild(panel);
        b.addEventListener('click', function () { var open = panel.style.display === 'none'; panel.innerHTML = scoreExplainer(); panel.style.display = open ? 'block' : 'none'; b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
      }
      vs.addEventListener('click', function (e) {
        var g = e.target.closest && e.target.closest('[data-go]'); if (g) { if (typeof showScreen === 'function') showScreen(g.getAttribute('data-go')); return; }
        var a = e.target.closest && e.target.closest('[data-act="log"]');
        if (a && $('systolic')) { $('systolic').scrollIntoView({ block: 'center', behavior: 'smooth' }); try { $('systolic').focus({ preventScroll: true }); } catch (_e) { /* ignore */ } }
      });
    }
    return true;
  }

  function greetingText() {
    var name = ''; try { name = (localStorage.getItem('userName') || '').trim().split(/\s+/)[0]; } catch (_e) { name = ''; }
    var h = new Date().getHours(), part = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    return name ? part + ', ' + name : part;
  }
  function renderGreetingHuman() {
    var g = $('greeting'); if (!g) return;
    g.textContent = greetingText();
    var sub = $('greeting-sub');
    if (!sub) { sub = document.createElement('div'); sub.id = 'greeting-sub'; sub.className = 'sx-greet-sub'; g.insertAdjacentElement('afterend', sub); }
    sub.textContent = 'Your readings, medicines and family support, together in one place.';
  }

  function render() {
    try {
      if (!ensure()) return;
      var s = snapshot();
      els.today.innerHTML = todayCard(s);
      els.meds.innerHTML = medicinesCard(s); els.meds.style.display = s.doses.length ? '' : 'none';
      els.trends.innerHTML = trendsCard(s);
      els.circle.innerHTML = circleCard(s);
      renderGreetingHuman();
    } catch (_e) { /* the home screen keeps working even if this section fails */ }
  }

  /* ---------- keep it fresh without touching existing code ---------- */
  function wrap(name, after) {
    var fn = window[name]; if (typeof fn !== 'function' || fn.__sx) return;
    var w = function () { var r = fn.apply(this, arguments); try { after(); } catch (_e) { /* ignore */ } return r; }; w.__sx = true; window[name] = w;
  }
  function start() {
    wrap('renderHealthScore', function () { render(); });
    wrap('renderMeds', function () { render(); });
    wrap('renderGreeting', function () { renderGreetingHuman(); });
    var sw = window.showScreen;
    if (typeof sw === 'function' && !sw.__sxd) {
      var w2 = function (name) { var r = sw.apply(this, arguments); try { document.body.setAttribute('data-screen', name); if (name === 'vitals' || name === 'family') { render(); fetchCircle(name === 'family'); } } catch (_e) { /* ignore */ } return r; }; w2.__sxd = true; window.showScreen = w2;
    }
    document.body.setAttribute('data-screen', 'vitals');
    render(); fetchCircle(true);
    setInterval(function () { if (!document.hidden) render(); }, 60000);   // "due now" changes with the clock
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { render(); fetchCircle(false); } });
    if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().onAuthStateChanged(function (u) { linked = null; pending = null; lastFetch = 0; if (u) setTimeout(function () { render(); fetchCircle(true); }, 1200); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.SXDash = { render: render };
})();
