const TIPS = [
  "A short 10-minute walk after meals can help keep blood pressure steady.",
  "Try to cut down on added salt this week — season with herbs and spice instead.",
  "Aim for 7-8 hours of sleep tonight — poor sleep can raise blood pressure.",
  "Drink a glass of water first thing in the morning to support healthy circulation.",
  "Deep breathing for 5 minutes can genuinely lower stress-related blood pressure spikes.",
  "Swap one fried meal this week for a grilled or boiled option.",
  "Check in with how you're feeling today — stress management is part of heart health.",
  "A handful of nuts is a heart-healthy snack alternative to chips or biscuits.",
  "Take the stairs once today if you can — small movement adds up.",
  "Remember: consistency with medication matters more than perfection. Keep going."
];

const BADGES = [
  { id: 'first', emoji: '🩺', name: 'First Reading', test: function(d) { return d.vitals.length >= 1; } },
  { id: 'week', emoji: '🔥', name: '7-Day Streak', test: function(d) { return d.streak >= 7; } },
  { id: 'month', emoji: '🏆', name: '30-Day Streak', test: function(d) { return d.streak >= 30; } },
  { id: 'family', emoji: '👪', name: 'Caregiver Connected', test: function(d) { return !!d.cgPhone; } }
];
// Escapes text before it's inserted via innerHTML, so a medication name or
// other free-text field (which syncs to Firestore and can render in a
// caregiver's browser) can never be interpreted as HTML/script.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function showScreen(name) {
  expireOldMeds();

  // One-time notification prompt for existing users who never got asked.
  // Runs on their first real tap after logging in (not on page load) so it
  // counts as a genuine user action to the browser.
  if ('Notification' in window && Notification.permission === 'default' && !localStorage.getItem('notif-auto-prompted')) {
    localStorage.setItem('notif-auto-prompted', '1');
    enableReminders();
  }

  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('nav button').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('#more-sheet button').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(name + '-screen').classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'firstaid' || name === 'passport' || name === 'ai' || name === 'articles' || name === 'marketplace' || name === 'rewards') {
    document.getElementById('nav-more').classList.add('active');
  }
  closeMoreMenu();
  if (name === 'meds') renderMeds();
  if (name === 'history') { renderHistory(); renderWeeklySummary(); renderBadges(); renderQuickStats(); renderHealthRadar(); renderMedHistory(); }
  if (name === 'family') renderCaregiverNote();
  if (name === 'passport') renderPassport();
  if (name === 'ai') renderAiWelcome();
  if (name === 'articles' && window.SentraXArticles) window.SentraXArticles.render();
  if (name === 'marketplace' && window.SentraXStore) window.SentraXStore.render();
  if (name === 'rewards' && window.SentraXRewards) window.SentraXRewards.render();
}
// Opens/closes the "More" overflow sheet (First Aid, Passport, Assistant),
// which exists because a 7-item bottom nav was too cramped for mobile.
// Opening it pushes a history entry so Android's back button/gesture closes
// the sheet instead of leaving the app or navigating the underlying page.
function toggleMoreMenu() {
  const sheet = document.getElementById('more-sheet');
  const isOpen = sheet.style.display === 'block';
  if (isOpen) {
    closeMoreMenu();
  } else {
    sheet.style.display = 'block';
    document.getElementById('more-sheet-backdrop').style.display = 'block';
    history.pushState({ moreSheet: true }, '');
  }
}

function closeMoreMenu() {
  const sheet = document.getElementById('more-sheet');
  if (sheet.style.display === 'block' && history.state && history.state.moreSheet) {
    history.back();
  } else {
    sheet.style.display = 'none';
    document.getElementById('more-sheet-backdrop').style.display = 'none';
  }
}

window.addEventListener('popstate', function() {
  document.getElementById('more-sheet').style.display = 'none';
  document.getElementById('more-sheet-backdrop').style.display = 'none';
});
function todayStr() { return new Date().toISOString().split('T')[0]; }
function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function timeToMinutes(t) { const parts = t.split(':'); return parseInt(parts[0]) * 60 + parseInt(parts[1]); }
function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000); }
let caregiverUnsub = null;

function renderCaregiverDashboard(data) {
  const bpBox = document.getElementById('cgv-bp');
  const vitals = data.vitals || [];
  if (vitals.length === 0) {
    bpBox.innerHTML = '<div class="empty">No readings yet</div>';
  } else {
    const v = vitals[0];
    bpBox.innerHTML =
      '<div class="cgv-bp-num">' + v.sys + '/' + v.dia + '</div>' +
      '<div class="cgv-bp-level" style="background:' + v.color + '">' + escapeHtml(v.level) + '</div>' +
      '<div class="cgv-bp-meta">' + escapeHtml(v.date) + (v.hr ? ' · HR ' + escapeHtml(v.hr) : '') + '</div>';
  }

  const medsBox = document.getElementById('cgv-meds');
  const meds = data.meds || [];
  const logs = (data.medLogs || {})[todayStr()] || {};
  if (meds.length === 0) {
    medsBox.innerHTML = '<div class="empty">No medications added yet</div>';
  } else {
    medsBox.innerHTML = meds.map(function (m) {
      const taken = !!logs[m.id];
      return '<div class="cgv-row"><span>' + escapeHtml(m.name) + ' — ' + escapeHtml(m.time) + '</span>' +
        '<span class="cgv-badge ' + (taken ? 'cgv-badge-taken' : 'cgv-badge-missed') + '">' + (taken ? '✓ Taken' : 'Not yet') + '</span></div>';
    }).join('');
  }

  document.getElementById('cgv-streak').textContent = data.streak || '0';
  const weekAgo = Date.now() - 7 * 86400000;
  const weekVitals = vitals.filter(function (v) { return new Date(v.dateISO || v.date).getTime() >= weekAgo; });
  document.getElementById('cgv-readings').textContent = weekVitals.length;

  const medLogs = data.medLogs || {};
  let totalPossible = 0, totalTaken = 0;
  if (meds.length > 0) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const dayLog = medLogs[d] || {};
      meds.forEach(function (m) { totalPossible++; if (dayLog[m.id]) totalTaken++; });
    }
  }
  document.getElementById('cgv-adherence').textContent = totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) + '%' : '—';
  document.getElementById('cgv-last-sync').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function showCaregiverMode(patientUid) {
  document.getElementById('caregiver-overlay').style.display = 'block';
  caregiverUnsub = firebase.firestore().collection('users').doc(patientUid)
    .onSnapshot(function (doc) {
      if (doc.exists) renderCaregiverDashboard(doc.data());
    }, function (err) {
      console.error('Sentra-X: caregiver read failed:', err.message);
    });
}
window.showCaregiverMode = showCaregiverMode;

function hideCaregiverMode() {
  if (caregiverUnsub) { caregiverUnsub(); caregiverUnsub = null; }
  const el = document.getElementById('caregiver-overlay');
  if (el) el.style.display = 'none';
}
window.hideCaregiverMode = hideCaregiverMode;
function completeOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  const condition = document.getElementById('ob-condition').value;
  if (!name) { alert('Please enter your first name.'); return; }
  localStorage.setItem('userName', name);
  localStorage.setItem('userCondition', condition);
  document.getElementById('onboarding-overlay').style.display = 'none';
  renderGreeting();
  syncToFirestore({ userName: name, userCondition: condition });

  // Prompt for notification permission right away, while we're still inside
  // the tap that just completed onboarding. Browsers require this to be
  // tied to a real user action, so this is the correct moment to ask.
  if ('Notification' in window && Notification.permission === 'default') {
    enableReminders();
  }
}

function renderGreeting() {
  const name = localStorage.getItem('userName');
  const greeting = document.getElementById('greeting');
  greeting.textContent = name ? ('Hi ' + name + ", here's your health today") : '';
}

function renderTip() {
  const tip = TIPS[dayOfYear(new Date()) % TIPS.length];
  document.getElementById('tip-text').textContent = tip;
}

function updateStreak() {
  let streak = parseInt(localStorage.getItem('streak') || '0');
  let lastActive = localStorage.getItem('lastActive');
  const today = todayStr();
  if (lastActive !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    streak = (lastActive === yesterday) ? streak + 1 : 1;
    localStorage.setItem('lastActive', today);
    localStorage.setItem('streak', streak);
  }
  document.getElementById('streak-count').textContent = localStorage.getItem('streak') || '1';
  renderHealthScore();
}

function getRisk(sys, dia) {
  if (sys >= 180 || dia >= 120) return { level: "Hypertensive Crisis — seek medical care now", color: "#fca5a5", severity: 4 };
  if (sys >= 140 || dia >= 90) return { level: "Stage 2 Hypertension — High Risk", color: "#fecaca", severity: 3 };
  if (sys >= 130 || dia >= 80) return { level: "Stage 1 Hypertension — Caution", color: "#fed7aa", severity: 2 };
  if (sys >= 120) return { level: "Elevated — Watch", color: "#fef08a", severity: 1 };
  return { level: "Normal", color: "#bbf7d0", severity: 0 };
}

function checkBP() {
  const sys = parseInt(document.getElementById('systolic').value);
  const dia = parseInt(document.getElementById('diastolic').value);
  const hr = document.getElementById('heartrate').value;
  const weight = document.getElementById('weight').value;
  const result = document.getElementById('result');
  const cgBtn = document.getElementById('alert-caregiver-btn');
  cgBtn.innerHTML = '';

  if (!sys || !dia) {
    result.style.display = "block"; result.style.background = "#eee";
    result.textContent = "Please enter both blood pressure numbers.";
    return;
  }

  const risk = getRisk(sys, dia);
  result.style.display = "block";
  result.style.background = risk.color;
  result.textContent = risk.level;

  const now = new Date();
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  vitals.unshift({ dateISO: now.toISOString(), date: now.toLocaleString(), sys: sys, dia: dia, hr: hr, weight: weight, level: risk.level, color: risk.color, severity: risk.severity });
  localStorage.setItem('vitals', JSON.stringify(vitals));
  updateStreak();
  syncToFirestore({ vitals: vitals, streak: localStorage.getItem('streak'), lastActive: localStorage.getItem('lastActive') });

  if (risk.severity >= 3) {
    const safeLevel = risk.level.replace(/'/g, "");
    cgBtn.innerHTML = '<button class="danger" onclick="alertCaregiverNow(' + sys + ',' + dia + ',\'' + safeLevel + '\')">🚨 Alert My Caregiver Now</button>';
  }
}

function alertCaregiverNow(sys, dia, level) {
  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  const cgPhone = (localStorage.getItem('cgPhone') || '').replace(/[^0-9]/g, '');
  const msg = '\u26A0\uFE0F Sentra-X Alert: ' + name + "'s blood pressure just read " + sys + '/' + dia + ' (' + level + '). Please check on them.';
  const url = cgPhone ? ('https://wa.me/' + cgPhone + '?text=' + encodeURIComponent(msg)) : ('https://wa.me/?text=' + encodeURIComponent(msg));
  window.open(url, '_blank');
}

// Parses a flexible duration string like "5 days", "2 weeks", "1 month", or a
// bare number (treated as days). Returns a whole number of days, or null if
// the text is empty/unparseable.
function parseDurationToDays(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const match = t.match(/^(\d+(?:\.\d+)?)\s*(days?|weeks?|months?)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = match[2] || 'day';
  if (unit.indexOf('week') === 0) return Math.round(num * 7);
  if (unit.indexOf('month') === 0) return Math.round(num * 30);
  return Math.round(num);
}

// One hour, in ms — how long a medication stays active when no duration is given.
const SHORT_TERM_MED_MS = 60 * 60 * 1000;

// Returns the Date a medication expires on, or null if it can't be determined.
function getMedExpiry(m) {
  if (m.durationDays && m.startDate) {
    const end = new Date(m.startDate);
    end.setDate(end.getDate() + m.durationDays);
    return end;
  }
  if (!m.durationDays) {
    const created = m.createdAt || parseInt(m.id, 10) || null;
    if (!created) return null;
    return new Date(created + SHORT_TERM_MED_MS);
  }
  return null;
}

function addMed() {
  const name = document.getElementById('med-name').value.trim();
  const time = document.getElementById('med-time').value;
  const durationText = document.getElementById('med-duration').value.trim();
  if (!name || !time || !durationText) { alert('Please enter the medication name, time, and duration.'); return; }
  const durationDays = parseDurationToDays(durationText);
  if (durationDays === null) { alert('Please enter a valid duration like "5 days", "2 weeks", or "1 month".'); return; }
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  meds.push({ id: Date.now().toString(), name: name, time: time, startDate: todayStr(), createdAt: Date.now(), durationDays: durationDays });
  localStorage.setItem('meds', JSON.stringify(meds));
  document.getElementById('med-name').value = '';
  document.getElementById('med-time').value = '';
  document.getElementById('med-duration').value = '';
  renderMeds();
  syncToFirestore({ meds: meds });
}

function isMedActive(m) {
  const expiry = getMedExpiry(m);
  if (!expiry) return true;
  return new Date() <= expiry;
}

function daysLeft(m) {
  if (!m.startDate || !m.durationDays) return null;
  const end = new Date(m.startDate);
  end.setDate(end.getDate() + m.durationDays);
  const diff = Math.ceil((end - new Date()) / 86400000);
  return diff > 0 ? diff : 0;
}

// Moves any medication past its expiry (duration-based, or the 1-hour default
// for meds with no duration) out of the active list and into Medication
// History. Called at app open, on screen change, and whenever reminders are
// checked — never on a per-second timer.
function expireOldMeds() {
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const active = [];
  const expired = [];
  meds.forEach(function(m) { (isMedActive(m) ? active : expired).push(m); });
  if (expired.length === 0) return false;

  const history = JSON.parse(localStorage.getItem('medHistory') || '[]');
  expired.forEach(function(m) {
    const expiry = getMedExpiry(m);
    history.unshift({
      id: m.id,
      name: m.name,
      startDate: m.startDate || null,
      expiryDate: expiry ? expiry.toISOString() : null,
      completed: true
    });
  });

  localStorage.setItem('meds', JSON.stringify(active));
  localStorage.setItem('medHistory', JSON.stringify(history));
  syncToFirestore({ meds: active, medHistory: history });
  return true;
}

function renderMedHistory() {
  const list = document.getElementById('med-history-list');
  if (!list) return;
  const history = JSON.parse(localStorage.getItem('medHistory') || '[]');
  if (history.length === 0) { list.innerHTML = '<div class="empty">No completed medications yet</div>'; return; }
  list.innerHTML = '<div class="med-history-scroll">' + history.map(function(h) {
    const startText = h.startDate ? new Date(h.startDate).toLocaleDateString() : '—';
    const expiryText = h.expiryDate ? new Date(h.expiryDate).toLocaleDateString() : '—';
    const statusText = h.completed ? 'Completed' : 'Ended';
    return '<div class="med-history-card">' +
        '<div class="med-history-name">💊 ' + escapeHtml(h.name) + '</div>' +
        '<div class="med-history-details">' +
          '<div class="med-history-row"><span class="med-history-icon">📅</span><span class="med-history-label">Started:</span><span class="med-history-value">' + startText + '</span></div>' +
          '<div class="med-history-row"><span class="med-history-icon">⏳</span><span class="med-history-label">Expired:</span><span class="med-history-value">' + expiryText + '</span></div>' +
          '<div class="med-history-row"><span class="med-history-icon">✅</span><span class="med-history-label">Status:</span><span class="med-history-badge">' + statusText + '</span></div>' +
        '</div>' +
      '</div>';
  }).join('') + '</div>';
}

function toggleMedHistory() {
  const body = document.getElementById('med-history-body');
  const arrow = document.getElementById('med-history-arrow');
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
  if (!isOpen) renderMedHistory();
}
function toggleTaken(id) {
  const today = todayStr();
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const med = meds.find(function(m) { return m.id === id; });
  const logs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  if (!logs[today]) logs[today] = {};
  const currentlyTaken = !!logs[today][id];

  if (!currentlyTaken) {
    if (med && timeToMinutes(med.time) > nowMinutes()) {
      alert('This medication isn\'t due yet — you can mark it taken starting at ' + med.time + '.');
      return;
    }
    logs[today][id] = Date.now();
  } else {
    if (!confirm('Mark this medication as not taken?')) return;
    delete logs[today][id];
  }

  localStorage.setItem('medLogs', JSON.stringify(logs));
  updateStreak();
  renderMeds();
  syncToFirestore({ medLogs: logs, streak: localStorage.getItem('streak'), lastActive: localStorage.getItem('lastActive') });
}
function renderMeds() {
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const logs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  const today = todayStr();
  const list = document.getElementById('med-list');
  const activeMeds = meds.filter(isMedActive);
  if (activeMeds.length === 0) { list.innerHTML = '<div class="empty">No medications added yet</div>'; return; }
  list.innerHTML = activeMeds.map(function(m) {
    const taken = logs[today] && logs[today][m.id];
    const left = daysLeft(m);
    let leftText = '';
    if (left !== null) { leftText = ' <small style="color:#94a3b8;">(' + left + (left === 1 ? ' day left)' : ' days left)') + '</small>'; }
    return '<div class="med-row"><span>' + escapeHtml(m.name) + ' — ' + escapeHtml(m.time) + leftText + '</span><button class="' + (taken ? 'taken' : 'secondary') + '" onclick="toggleTaken(\'' + m.id + '\')">' + (taken ? '✓ Taken' : 'Mark Taken') + '</button></div>';
  }).join('');
  checkDueMeds();
}

function toggleCheckin() {
  const body = document.getElementById('checkin-body');
  const arrow = document.getElementById('checkin-arrow');
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

function checkDueMeds() {
  expireOldMeds();
  const meds = JSON.parse(localStorage.getItem('meds') || '[]').filter(isMedActive);
  const logs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  const today = todayStr();
  const now = nowMinutes();
  const banner = document.getElementById('due-banner');
  const due = meds.filter(function(m) {
    const taken = logs[today] && logs[today][m.id];
    return !taken && timeToMinutes(m.time) <= now;
  });
  if (due.length > 0) {
    const names = due.map(function(m){ return m.name; }).join(', ');
    banner.innerHTML = '<div class="alert-banner">⏰ ' + due.length + ' medication' + (due.length > 1 ? 's' : '') + ' due or overdue today: ' + names + '</div>';
    if (Notification.permission === 'granted' && localStorage.getItem('reminders-muted') !== '1' && !sessionStorage.getItem('notified-' + today)) {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function(reg) {
          if (reg) reg.showNotification('Sentra-X reminder', { body: 'Time for: ' + names, icon: 'icon-192-1.png', badge: 'icon-192-1.png' });
        });
      }
      sessionStorage.setItem('notified-' + today, '1');
    }
  } else {
    banner.innerHTML = '';
  }
}

function syncReminderButtonState() {
  const btn = document.getElementById('enable-btn');
  if (!btn || !('Notification' in window)) return;
  const muted = localStorage.getItem('reminders-muted') === '1';
  if (Notification.permission === 'granted' && !muted) {
    btn.textContent = '🔔 Reminders Enabled';
  } else {
    btn.textContent = '🔔 Enable Reminder Alerts';
  }
}

function enableReminders() {
  if (!('Notification' in window)) { alert('Notifications are not supported on this browser.'); return; }
  const muted = localStorage.getItem('reminders-muted') === '1';

  if (Notification.permission === 'granted' && !muted) {
    // Already on — tapping again means the user wants to turn it off.
    // Browsers don't let any website revoke notification permission by
    // code, so "disabling" here means Sentra-X itself stops firing
    // reminders (checked in checkDueMeds), even though the OS-level
    // permission technically stays granted in the background.
    if (confirm('Turn off medication reminder alerts?')) {
      localStorage.setItem('reminders-muted', '1');
      syncReminderButtonState();
    }
    return;
  }

  if (Notification.permission === 'granted' && muted) {
    // Was muted in-app — permission is already granted, so just
    // re-enable without needing to ask the browser again.
    localStorage.setItem('reminders-muted', '0');
    syncReminderButtonState();
    return;
  }

  if (Notification.permission === 'denied') {
    alert('Notifications are blocked for Sentra-X. To enable them: open your phone Settings → Apps → Sentra-X → Notifications, and turn them on there.');
    return;
  }

  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') localStorage.setItem('reminders-muted', '0');
    syncReminderButtonState();
  });
}

function renderHistory() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const list = document.getElementById('history-list');
  if (vitals.length === 0) { list.innerHTML = '<div class="empty">No readings logged yet</div>'; return; }
  list.innerHTML = vitals.map(function(v) {
    return '<div class="history-row" style="background:' + v.color + '"><b>' + v.sys + '/' + v.dia + '</b> — ' + escapeHtml(v.level) + '<br><small>' + escapeHtml(v.date) + (v.hr ? ' · HR ' + escapeHtml(v.hr) : '') + (v.weight ? ' · ' + escapeHtml(v.weight) + 'kg' : '') + '</small></div>';
  }).join('');
}

function renderWeeklySummary() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medLogs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  const weekAgo = Date.now() - 7 * 86400000;

  const weekVitals = vitals.filter(function(v) { return new Date(v.dateISO || v.date).getTime() >= weekAgo; });
  const grid = document.getElementById('weekly-summary');
  const readingsEl = grid.children[0].querySelector('b');
  const avgEl = grid.children[1].querySelector('b');
  const adherenceEl = grid.children[2].querySelector('b');

  readingsEl.textContent = weekVitals.length;

  if (weekVitals.length > 0) {
    const avgSys = Math.round(weekVitals.reduce(function(s,v){ return s + v.sys; }, 0) / weekVitals.length);
    const avgDia = Math.round(weekVitals.reduce(function(s,v){ return s + v.dia; }, 0) / weekVitals.length);
    avgEl.textContent = avgSys + '/' + avgDia;
  } else {
    avgEl.textContent = '—';
  }

  adherenceEl.textContent = getWeeklyAdherencePct(meds, medLogs) !== null ? getWeeklyAdherencePct(meds, medLogs) + '%' : '—';
}

function getWeeklyAdherencePct(meds, medLogs) {
  if (!meds || meds.length === 0) return null;
  let totalPossible = 0, totalTaken = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const dayLog = medLogs[d] || {};
    meds.forEach(function(m) {
      totalPossible++;
      if (dayLog[m.id]) totalTaken++;
    });
  }
  return totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) : null;
}

function renderHealthScore() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medLogs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  const ring = document.getElementById('score-ring');
  const scoreNum = document.getElementById('score-num');
  const scoreLabel = document.getElementById('score-label');
  const scoreSub = document.getElementById('score-sub');

  if (vitals.length === 0) {
    scoreNum.textContent = '—';
    scoreLabel.textContent = 'Log a reading to see your score';
    scoreSub.textContent = '';
    ring.style.background = 'conic-gradient(rgba(255,255,255,0.12) 0deg, rgba(255,255,255,0.12) 360deg)';
    return;
  }

  const baseMap = [95, 80, 60, 35, 15];
  const base = baseMap[vitals[0].severity];
  const adherence = getWeeklyAdherencePct(meds, medLogs);
  const score = adherence !== null ? Math.round(base * 0.65 + adherence * 0.35) : base;

  scoreNum.textContent = score;
  let label, color;
  if (score >= 85) { label = 'Excellent'; color = '#34d399'; }
  else if (score >= 70) { label = 'Good'; color = '#60a5fa'; }
  else if (score >= 50) { label = 'Fair'; color = '#fbbf24'; }
  else { label = 'Needs Attention'; color = '#f87171'; }
  scoreLabel.textContent = label;
  scoreSub.textContent = 'Based on your latest reading' + (adherence !== null ? ' and medication adherence' : '');
  ring.style.background = 'conic-gradient(' + color + ' 0deg, ' + color + ' ' + (score / 100 * 360) + 'deg, rgba(255,255,255,0.12) ' + (score / 100 * 360) + 'deg)';
}

function renderBadges() {
  const data = {
    vitals: JSON.parse(localStorage.getItem('vitals') || '[]'),
    streak: parseInt(localStorage.getItem('streak') || '0'),
    cgPhone: localStorage.getItem('cgPhone')
  };
  const grid = document.getElementById('badge-grid');
  grid.innerHTML = BADGES.map(function(b) {
    const unlocked = b.test(data);
    return '<div class="badge' + (unlocked ? ' unlocked' : '') + '"><span class="emoji">' + b.emoji + '</span><span class="name">' + b.name + '</span></div>';
  }).join('');
}

function changeWater(delta) {
  const today = todayStr();
  const logs = JSON.parse(localStorage.getItem('waterLogs') || '{}');
  const current = logs[today] || 0;
  logs[today] = Math.max(0, current + delta);
  localStorage.setItem('waterLogs', JSON.stringify(logs));
  renderWater();
  syncToFirestore({ waterLogs: logs });
}

function renderWater() {
  const today = todayStr();
  const logs = JSON.parse(localStorage.getItem('waterLogs') || '{}');
  document.getElementById('water-count').textContent = (logs[today] || 0) + ' cups';
}

function loadCaregivers() {
  let list;
  try { list = JSON.parse(localStorage.getItem('caregivers') || 'null'); } catch (e) { list = null; }
  if (list) return list;

  // One-time migration: anyone with the old single-caregiver fields gets
  // them moved into the new list as their primary contact, instead of it
  // just disappearing when this update ships.
  const oldName = localStorage.getItem('cgName');
  if (oldName) {
    list = [{
      id: 'cg-' + Date.now(),
      name: oldName,
      phone: localStorage.getItem('cgPhone') || '',
      email: localStorage.getItem('cgEmail') || '',
      isPrimary: true
    }];
    localStorage.setItem('caregivers', JSON.stringify(list));
    return list;
  }
  return [];
}

function saveCaregivers(list) {
  localStorage.setItem('caregivers', JSON.stringify(list));
  // Mirror the primary contact into the original single-caregiver keys —
  // every existing alert feature (BP crisis alert, SOS, Share Status, the
  // Caregiver Connected badge) reads from these and needs zero changes.
  const primary = list.find(function (c) { return c.isPrimary; }) || list[0];
  if (primary) {
    localStorage.setItem('cgName', primary.name);
    localStorage.setItem('cgPhone', primary.phone);
    localStorage.setItem('cgEmail', primary.email || '');
  } else {
    localStorage.removeItem('cgName');
    localStorage.removeItem('cgPhone');
    localStorage.removeItem('cgEmail');
  }
  syncToFirestore({
    caregivers: list,
    cgName: primary ? primary.name : null,
    cgPhone: primary ? primary.phone : null,
    cgEmail: primary ? (primary.email || '') : null
  });
}

let editingCaregiverId = null;

function openAddCaregiverForm() {
  editingCaregiverId = null;
  document.getElementById('cg-name').value = '';
  document.getElementById('cg-phone').value = '';
  document.getElementById('cg-email').value = '';
  document.getElementById('cg-form').style.display = 'block';
  document.getElementById('cg-add-btn').style.display = 'none';
  document.getElementById('cg-saved-note').textContent = '';
}

function editCaregiverEntry(id) {
  const entry = loadCaregivers().find(function (c) { return c.id === id; });
  if (!entry) return;
  editingCaregiverId = id;
  document.getElementById('cg-name').value = entry.name;
  document.getElementById('cg-phone').value = entry.phone;
  document.getElementById('cg-email').value = entry.email || '';
  document.getElementById('cg-form').style.display = 'block';
  document.getElementById('cg-add-btn').style.display = 'none';
}

function cancelCaregiverForm() {
  editingCaregiverId = null;
  document.getElementById('cg-form').style.display = 'none';
  document.getElementById('cg-add-btn').style.display = 'block';
}

function saveCaregiverForm() {
  const name = document.getElementById('cg-name').value.trim();
  const phone = document.getElementById('cg-phone').value.trim();
  const email = document.getElementById('cg-email').value.trim();
  if (!name || !phone) { alert("Please enter both the caregiver's name and number."); return; }

  const list = loadCaregivers();
  if (editingCaregiverId) {
    const entry = list.find(function (c) { return c.id === editingCaregiverId; });
    if (entry) { entry.name = name; entry.phone = phone; entry.email = email; }
  } else {
    list.push({
      id: 'cg-' + Date.now(),
      name: name, phone: phone, email: email,
      isPrimary: list.length === 0 // first caregiver saved becomes primary automatically
    });
  }
  saveCaregivers(list);
  cancelCaregiverForm();
  renderCaregiverNote();
  const note = document.getElementById('cg-saved-note');
  note.textContent = '✓ Saved';
  setTimeout(function () { note.textContent = ''; }, 2500);
}

function makePrimaryCaregiver(id) {
  const list = loadCaregivers();
  list.forEach(function (c) { c.isPrimary = (c.id === id); });
  saveCaregivers(list);
  renderCaregiverNote();
}

function removeCaregiverEntry(id) {
  if (!confirm('Remove this caregiver?')) return;
  const list = loadCaregivers().filter(function (c) { return c.id !== id; });
  // If the primary contact was just removed, promote whoever's left so
  // automatic alerts keep working instead of silently going to nobody.
  if (list.length > 0 && !list.some(function (c) { return c.isPrimary; })) {
    list[0].isPrimary = true;
  }
  saveCaregivers(list);
  renderCaregiverNote();
}

function generateInviteCode() {
  const user = firebase.auth().currentUser;
  if (!user) { alert('Please log in first.'); return; }
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  firebase.firestore().collection('invites').doc(code).set({
    patientUid: user.uid,
    patientName: localStorage.getItem('userName') || '',
    createdAt: Date.now(),
    expiresAt: expiresAt,
    usedBy: null
  }).then(function () {
    const link = 'https://sentra-x.app/caregiver.html?code=' + code;
    document.getElementById('invite-code-box').style.display = 'block';
    document.getElementById('invite-code-text').textContent = code;
    const name = localStorage.getItem('userName') || 'I';
    const msg = name + ' would like you to help keep track of their health on Sentra-X. Tap this link to link your account: ' + link;
    document.getElementById('invite-share-link').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
  }).catch(function (err) {
    alert('Could not generate invite code: ' + err.message);
  });
}
function renderCaregiverNote() {
  const list = loadCaregivers();
  const box = document.getElementById('cg-list');
  if (list.length === 0) {
    box.innerHTML = '<div class="empty">No caregivers added yet</div>';
    return;
  }
  box.innerHTML = list.map(function (c) {
    const initial = (c.name || '?').trim().charAt(0).toUpperCase();
    return '<div class="cg-card">' +
        '<div class="cg-avatar">' + initial + '</div>' +
        '<div class="cg-info">' +
          '<div class="cg-name-row">' +
            '<span class="cg-name">' + String(c.name).replace(/</g, '&lt;') + '</span>' +
            (c.isPrimary ? '<span class="cg-primary-badge">Primary</span>' : '') +
          '</div>' +
          '<div class="cg-row"><span>📱</span><span>' + (c.phone || '—') + '</span></div>' +
          '<div class="cg-row"><span>✉️</span><span>' + (c.email || 'No email on file') + '</span></div>' +
          '<div class="cg-actions">' +
            '<button onclick="editCaregiverEntry(\'' + c.id + '\')">Edit</button>' +
            (c.isPrimary ? '' : '<button onclick="makePrimaryCaregiver(\'' + c.id + '\')">Make Primary</button>') +
            '<button class="cg-danger" onclick="removeCaregiverEntry(\'' + c.id + '\')">Remove</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }).join('');
}

function shareToFamily() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const streak = localStorage.getItem('streak') || '0';
  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  const cgPhone = (localStorage.getItem('cgPhone') || '').replace(/[^0-9]/g, '');
  const latest = vitals[0];
  let msg = 'Hi! This is ' + name + "'s Sentra-X health update. Current streak: " + streak + ' days. ';
  msg += latest ? ('Latest reading: ' + latest.sys + '/' + latest.dia + ' (' + latest.level + ').') : 'No readings logged yet.';
  const url = cgPhone ? ('https://wa.me/' + cgPhone + '?text=' + encodeURIComponent(msg)) : ('https://wa.me/?text=' + encodeURIComponent(msg));
  window.open(url, '_blank');
}

function callEmergency() {
  window.location.href = 'tel:112';
}

function toggleFirstAid(id) {
  const body = document.getElementById('fa-body-' + id);
  const arrow = document.getElementById('fa-arrow-' + id);
  if (!body || !arrow) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

function triggerSOS() {
  const confirmed = confirm('This will send your live location and an SOS alert to your saved caregiver on WhatsApp. Continue?');
  if (!confirmed) return;
  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  const cgPhone = (localStorage.getItem('cgPhone') || '').replace(/[^0-9]/g, '');

  function sendAlert(locationText) {
    const msg = '\u{1F198} EMERGENCY: ' + name + ' needs help right now.' + locationText;
    const url = cgPhone ? ('https://wa.me/' + cgPhone + '?text=' + encodeURIComponent(msg)) : ('https://wa.me/?text=' + encodeURIComponent(msg));
    window.open(url, '_blank');
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        const link = 'https://maps.google.com/?q=' + pos.coords.latitude + ',' + pos.coords.longitude;
        sendAlert(' Location: ' + link);
      },
      function() { sendAlert(' (location unavailable — please call them)'); },
      { timeout: 6000 }
    );
  } else {
    sendAlert(' (location not supported on this device)');
  }
}

function setQuickStat(kind, value) {
  const today = todayStr();
  const key = 'quick_' + kind;
  const stats = JSON.parse(localStorage.getItem(key) || '{}');
  stats[today] = value;
  localStorage.setItem(key, JSON.stringify(stats));
  syncToFirestore({ ['quick' + kind.charAt(0).toUpperCase() + kind.slice(1)]: stats });
  renderQuickStats();
  renderHealthRadar();
}

function renderQuickStats() {
  const today = todayStr();
  ['sleep', 'activity', 'mood'].forEach(function(kind) {
    const stats = JSON.parse(localStorage.getItem('quick_' + kind) || '{}');
    const todayVal = stats[today];
    const row = document.getElementById('quick-' + kind);
    if (!row) return;
    Array.prototype.forEach.call(row.children, function(btn) {
      btn.classList.toggle('selected', btn.getAttribute('data-val') === todayVal);
    });
  });
}


function renderHealthRadar() {
  const grid = document.getElementById('radar-grid');
  if (!grid) return;
  const today = todayStr();
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medLogs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  const waterLogs = JSON.parse(localStorage.getItem('waterLogs') || '{}');
  const sleepStats = JSON.parse(localStorage.getItem('quick_sleep') || '{}');
  const activityStats = JSON.parse(localStorage.getItem('quick_activity') || '{}');
  const moodStats = JSON.parse(localStorage.getItem('quick_mood') || '{}');

  const items = [];

  let heartStatus = 'No data yet';
  let heartDot = 'gray';
  if (vitals.length > 0) {
    const sev = vitals[0].severity;
    if (sev <= 1) { heartStatus = 'Normal'; heartDot = 'green'; }
    else if (sev === 2) { heartStatus = 'Caution'; heartDot = 'yellow'; }
    else { heartStatus = 'High Risk'; heartDot = 'red'; }
  }
  items.push({ icon: 'heart', label: 'Heart', dot: heartDot, status: heartStatus });

  const adherence = getWeeklyAdherencePct(meds, medLogs);
  let medStatus = 'No meds yet';
  let medDot = 'gray';
  if (adherence !== null) {
    if (adherence >= 80) { medStatus = 'On track'; medDot = 'green'; }
    else if (adherence >= 50) { medStatus = 'Needs Attention'; medDot = 'yellow'; }
    else { medStatus = 'High Risk'; medDot = 'red'; }
  }
  items.push({ icon: 'pill', label: 'Medication', dot: medDot, status: medStatus });

  const cupsToday = waterLogs[today] || 0;
  let waterStatus, waterDot;
  if (cupsToday >= 6) { waterStatus = 'Great'; waterDot = 'green'; }
  else if (cupsToday >= 3) { waterStatus = 'Needs Attention'; waterDot = 'yellow'; }
  else { waterStatus = 'Low'; waterDot = 'red'; }
  items.push({ icon: 'water', label: 'Hydration', dot: waterDot, status: waterStatus });

  const sleepVal = sleepStats[today];
  let sleepStatus = 'Not logged', sleepDot = 'gray';
  if (sleepVal === 'good') { sleepStatus = 'Good'; sleepDot = 'green'; }
  else if (sleepVal === 'ok') { sleepStatus = 'OK'; sleepDot = 'yellow'; }
  else if (sleepVal === 'poor') { sleepStatus = 'Poor'; sleepDot = 'red'; }
  items.push({ icon: 'sleep', label: 'Sleep', dot: sleepDot, status: sleepStatus });

  const activityVal = activityStats[today];
  let activityStatus = 'Not logged', activityDot = 'gray';
  if (activityVal === 'active') { activityStatus = 'Active'; activityDot = 'green'; }
  else if (activityVal === 'moderate') { activityStatus = 'Moderate'; activityDot = 'yellow'; }
  else if (activityVal === 'low') { activityStatus = 'Low'; activityDot = 'red'; }
  items.push({ icon: 'activity', label: 'Activity', dot: activityDot, status: activityStatus });

  const moodVal = moodStats[today];
  let moodStatus = 'Not logged', moodDot = 'gray';
  if (moodVal === 'good') { moodStatus = 'Good'; moodDot = 'green'; }
  else if (moodVal === 'okay') { moodStatus = 'Okay'; moodDot = 'yellow'; }
  else if (moodVal === 'low') { moodStatus = 'Low'; moodDot = 'red'; }
  items.push({ icon: 'wellness', label: 'Wellness', dot: moodDot, status: moodStatus });

  var ICONS = { heart: '\u2764\ufe0f', pill: '\ud83d\udc8a', water: '\ud83d\udca7', sleep: '\ud83d\ude34', activity: '\ud83c\udfc3', wellness: '\ud83d\ude0a' };
  var DOTS = { green: '\ud83d\udfe2', yellow: '\ud83d\udfe1', red: '\ud83d\udd34', gray: '\u26aa' };

  grid.innerHTML = items.map(function(item) {
    return '<div class="radar-item"><span class="dot">' + DOTS[item.dot] + '</span><span class="label">' + ICONS[item.icon] + ' ' + item.label + '</span><div class="status">' + item.status + '</div></div>';
  }).join('');
}

const BLOOD_GROUPS = ["Don't know", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["Don't know", "AA", "AS", "SS", "AC", "SC"];
const SEXES = ["Prefer not to say", "Female", "Male", "Intersex"];

function populatePassportSelects() {
  const bgSelect = document.getElementById('pp-bloodgroup');
  const gtSelect = document.getElementById('pp-genotype');
  const sexSelect = document.getElementById('pp-sex');
  if (!bgSelect || !gtSelect) return;
  bgSelect.innerHTML = BLOOD_GROUPS.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
  gtSelect.innerHTML = GENOTYPES.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
  if (sexSelect) sexSelect.innerHTML = SEXES.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}

function savePassport() {
  const passport = {
    sex: document.getElementById('pp-sex').value,
    age: document.getElementById('pp-age').value,
    bloodGroup: document.getElementById('pp-bloodgroup').value,
    genotype: document.getElementById('pp-genotype').value,
    allergies: document.getElementById('pp-allergies').value.trim(),
    conditions: document.getElementById('pp-conditions').value.trim(),
    history: document.getElementById('pp-history').value.trim(),
    vaccinations: document.getElementById('pp-vaccinations').value.trim(),
    height: document.getElementById('pp-height').value,
    weight: document.getElementById('pp-weight').value,
    physician: document.getElementById('pp-physician').value.trim(),
    insurance: document.getElementById('pp-insurance').value.trim(),
    emergencyContact: document.getElementById('pp-emergency').value.trim()
  };
  localStorage.setItem('passport', JSON.stringify(passport));
  document.getElementById('pp-saved-note').textContent = 'Saved';
  syncToFirestore({ passport: passport });
  setTimeout(function() { document.getElementById('pp-saved-note').textContent = ''; }, 2000);
}

function renderPassport() {
  const saved = JSON.parse(localStorage.getItem('passport') || '{}');
  populatePassportSelects();
  if (saved.sex) document.getElementById('pp-sex').value = saved.sex;
  document.getElementById('pp-age').value = saved.age || '';
  if (saved.bloodGroup) document.getElementById('pp-bloodgroup').value = saved.bloodGroup;
  if (saved.genotype) document.getElementById('pp-genotype').value = saved.genotype;
  document.getElementById('pp-allergies').value = saved.allergies || '';
  document.getElementById('pp-conditions').value = saved.conditions || '';
  document.getElementById('pp-history').value = saved.history || '';
  document.getElementById('pp-vaccinations').value = saved.vaccinations || '';
  document.getElementById('pp-height').value = saved.height || '';
  document.getElementById('pp-weight').value = saved.weight || '';
  document.getElementById('pp-physician').value = saved.physician || '';
  document.getElementById('pp-insurance').value = saved.insurance || '';
  document.getElementById('pp-emergency').value = saved.emergencyContact || '';
}

function buildPassportSummary() {
  const p = JSON.parse(localStorage.getItem('passport') || '{}');
  const name = localStorage.getItem('userName') || 'Sentra-X User';
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medNames = meds.map(function(m) { return m.name; }).join(', ') || 'None listed';
  const lines = [
    'SENTRA-X MEDICAL PASSPORT',
    'Name: ' + name,
    'Sex: ' + (p.sex || 'Not listed'),
    'Age: ' + (p.age || 'Not listed'),
    'Blood Group: ' + (p.bloodGroup || 'Unknown'),
    'Genotype: ' + (p.genotype || 'Unknown'),
    'Allergies: ' + (p.allergies || 'None listed'),
    'Chronic Conditions: ' + (p.conditions || 'None listed'),
    'Current Medications: ' + medNames,
    'Height/Weight: ' + (p.height || '-') + 'cm / ' + (p.weight || '-') + 'kg',
    'Primary Physician: ' + (p.physician || 'Not listed'),
    'Emergency Contact: ' + (p.emergencyContact || 'Not listed'),
    'Vaccination History: ' + (p.vaccinations || 'Not listed')
  ];
  return lines.join('\n');
}

function generatePassportQR() {
  const box = document.getElementById('qr-box');
  box.innerHTML = '';
  const summary = buildPassportSummary();
  new QRCode(box, { text: summary, width: 200, height: 200, colorDark: '#0f172a', colorLight: '#ffffff' });
  document.getElementById('qr-hint').style.display = 'block';
}
// Reuses buildPassportSummary() (already includes Age/Sex) and escapeHtml()
// so this can never introduce a new injection point. Renders into a
// print-only area (hidden on screen, shown only inside @media print) so it
// works the same in a plain browser tab and inside the wrapped Android app,
// where window.open()-based printing is unreliable.
function printPassport() {
  const summary = buildPassportSummary();
  const area = document.getElementById('passport-print-area');
  if (!area) return;
  area.innerHTML = escapeHtml(summary).replace(/\n/g, '<br>');
  window.print();
}
function refreshAllUI() {
  renderGreeting();
  renderTip();
  renderMeds();
  renderHistory();
  renderWeeklySummary();
  renderCaregiverNote();
  renderHealthScore();
  renderWater();
  renderQuickStats();
  renderHealthRadar();
  document.getElementById('streak-count').textContent = localStorage.getItem('streak') || '0';
}

function syncToFirestore(fields) {
  if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return;
  firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid)
    .set(fields, { merge: true })
    .catch(function(err) { console.error('Sync failed:', err); });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function(){});
}

expireOldMeds();
refreshAllUI();
syncReminderButtonState();
if (window.SentraXRewards) window.SentraXRewards.checkDailyStreak();
setInterval(checkDueMeds, 60000);

const AI_WORKER_URL = 'https://sentrax-ai.alecedoh1994.workers.dev/';
const AI_MAX_THREADS = 20;
const AI_MAX_MESSAGES_PER_THREAD = 40;

let aiThreads = [];
let currentAiThreadId = null;

(function loadAiThreads() {
  try {
    aiThreads = JSON.parse(localStorage.getItem('ai-chat-threads') || '[]');
  } catch (e) { aiThreads = []; }

  // One-time migration: anyone who already had the old single-conversation
  // history gets it moved into their first thread, instead of it just
  // disappearing when this update ships.
  if (aiThreads.length === 0) {
    try {
      const old = JSON.parse(localStorage.getItem('ai-chat-history') || '[]');
      if (old.length > 0) {
        aiThreads = [{ id: 'thread-' + Date.now(), title: aiThreadTitleFrom(old), messages: old, updatedAt: Date.now() }];
      }
    } catch (e) { /* nothing to migrate */ }
  }

  // One-time cleanup: earlier versions saved the on-screen failure notice
  // into history as a real assistant turn, which then got resent as
  // context on every later message — silently corrupting the thread from
  // that point on. Strip any of those out of existing saved threads so
  // conversations that already hit this don't keep failing.
  const FAILURE_NOTICE = "Sorry, I couldn't generate a response just now.";
  let strippedAny = false;
  aiThreads.forEach(function (t) {
    const before = t.messages.length;
    t.messages = t.messages.filter(function (m) {
      return !(m.role === 'assistant' && m.content === FAILURE_NOTICE);
    });
    if (t.messages.length !== before) strippedAny = true;
  });
  if (strippedAny) saveAiThreads();

  if (aiThreads.length > 0) currentAiThreadId = aiThreads[0].id;
})();

function aiThreadTitleFrom(messages) {
  const firstUser = messages.find(function (m) { return m.role === 'user'; });
  if (!firstUser) return 'New conversation';
  return firstUser.content.length > 40 ? firstUser.content.slice(0, 40) + '…' : firstUser.content;
}

function saveAiThreads() {
  if (aiThreads.length > AI_MAX_THREADS) aiThreads = aiThreads.slice(0, AI_MAX_THREADS);
  try { localStorage.setItem('ai-chat-threads', JSON.stringify(aiThreads)); } catch (e) { /* storage full/unavailable — chat still works this session */ }
}

function getCurrentAiThread() {
  let thread = aiThreads.find(function (t) { return t.id === currentAiThreadId; });
  if (!thread) {
    thread = { id: 'thread-' + Date.now(), title: 'New conversation', messages: [], updatedAt: Date.now() };
    aiThreads.unshift(thread);
    currentAiThreadId = thread.id;
    saveAiThreads();
  }
  return thread;
}

function startNewAiChat() {
  // If the current thread is still empty (nothing sent yet), just stay on
  // it instead of creating another blank one — this is what was causing
  // several identical unused "New conversation" entries to pile up.
  const current = aiThreads.find(function (t) { return t.id === currentAiThreadId; });
  if (current && current.messages.length === 0) {
    document.getElementById('ai-chat-log').innerHTML = '';
    renderAiWelcome();
    closeAiHistoryList();
    return;
  }

  const thread = { id: 'thread-' + Date.now(), title: 'New conversation', messages: [], updatedAt: Date.now() };
  aiThreads.unshift(thread);
  currentAiThreadId = thread.id;
  saveAiThreads();
  document.getElementById('ai-chat-log').innerHTML = '';
  renderAiWelcome();
  closeAiHistoryList();
}

function showAiHistoryList() {
  const list = document.getElementById('ai-history-list');
  if (aiThreads.length === 0) {
    list.innerHTML = '<p style="color:#94a3b8;font-size:13px;">No past conversations yet.</p>';
  } else {
    list.innerHTML = aiThreads.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).map(function (t) {
      const date = new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isActive = t.id === currentAiThreadId;
      const rowStyle = 'display:flex;align-items:center;gap:10px;padding:11px 4px;' +
        'border-bottom:1px solid rgba(255,255,255,0.08);' +
        (isActive ? 'background:rgba(56,189,248,0.08);border-radius:8px;padding-left:8px;padding-right:8px;' : '');
      return '<div style="' + rowStyle + '">' +
        '<div onclick="openAiThread(\'' + t.id + '\')" style="flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:18px;flex-shrink:0;">' + (isActive ? '💬' : '🗨️') + '</span>' +
          '<div style="min-width:0;flex:1;">' +
            '<div style="font-size:14px;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + t.title.replace(/</g, '&lt;') + '</div>' +
          '</div>' +
          '<span style="font-size:11px;color:#64748b;flex-shrink:0;">' + date + '</span>' +
        '</div>' +
        '<button onclick="deleteAiThread(\'' + t.id + '\')" title="Delete conversation" ' +
          'style="width:32px;height:32px;padding:0;flex-shrink:0;background:transparent;border:none;color:#64748b;font-size:16px;border-radius:8px;">🗑️</button>' +
        '</div>';
    }).join('') +
    '<button onclick="clearAllAiHistory()" class="ghost" style="margin-top:10px;color:#fca5a5;">Clear All History</button>';
  }
  document.getElementById('ai-history-overlay').style.display = 'block';
}

function deleteAiThread(id) {
  if (!confirm('Delete this conversation? This can\'t be undone.')) return;
  aiThreads = aiThreads.filter(function (t) { return t.id !== id; });
  saveAiThreads();
  if (currentAiThreadId === id) {
    currentAiThreadId = null;
    document.getElementById('ai-chat-log').innerHTML = '';
    renderAiWelcome();
  }
  showAiHistoryList();
}

function clearAllAiHistory() {
  if (!confirm('Delete ALL saved conversations? This can\'t be undone.')) return;
  aiThreads = [];
  currentAiThreadId = null;
  try { localStorage.removeItem('ai-chat-threads'); localStorage.removeItem('ai-chat-history'); } catch (e) { /* best effort */ }
  document.getElementById('ai-chat-log').innerHTML = '';
  renderAiWelcome();
  closeAiHistoryList();
}

function closeAiHistoryList() {
  document.getElementById('ai-history-overlay').style.display = 'none';
}

function openAiThread(id) {
  currentAiThreadId = id;
  const thread = getCurrentAiThread();
  const log = document.getElementById('ai-chat-log');
  log.innerHTML = '';
  thread.messages.forEach(function (m) { appendAiMessage(m.role === 'user' ? 'user' : 'bot', m.content); });
  closeAiHistoryList();
}

function renderAiWelcome() {
  const log = document.getElementById('ai-chat-log');
  if (log.children.length > 0) return;
  const thread = getCurrentAiThread();
  if (thread.messages.length > 0) {
    thread.messages.forEach(function (m) { appendAiMessage(m.role === 'user' ? 'user' : 'bot', m.content); });
  } else {
    appendAiMessage('bot', "Hi, I'm your Sentra-X health assistant. Ask me anything about symptoms, medications, or general wellness — and remember, for emergencies always call 112.");
  }
}

function appendAiMessage(role, text) {
  const log = document.getElementById('ai-chat-log');
  const div = document.createElement('div');
  div.className = 'ai-msg ' + (role === 'user' ? 'user' : 'bot');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function sendAiMessage() {
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const thread = getCurrentAiThread();
  appendAiMessage('user', text);
  thread.messages.push({ role: 'user', content: text });
  if (thread.messages.length > AI_MAX_MESSAGES_PER_THREAD) thread.messages = thread.messages.slice(-AI_MAX_MESSAGES_PER_THREAD);
  if (thread.title === 'New conversation') thread.title = aiThreadTitleFrom(thread.messages);
  thread.updatedAt = Date.now();
  saveAiThreads();

  const typingEl = appendAiMessage('bot', 'Thinking...');
  typingEl.classList.add('typing');

  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, 30000);

  fetch(AI_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: thread.messages.slice(-12) }),
    signal: controller.signal
  })
    .then(function(res) {
      const isStream = (res.headers.get('Content-Type') || '').indexOf('text/event-stream') !== -1;

      if (!isStream) {
        // Worker returned a JSON error (bad request, or both model attempts
        // failed) instead of a stream — same error handling as before.
        return res.json().catch(function() { return {}; }).then(function(data) {
          throw new Error((data && data.error) || ('Server error (' + res.status + ')'));
        });
      }

      typingEl.classList.remove('typing');
      typingEl.textContent = '';
      let fullText = '';
      let sawAnyChunk = false;
      let sawAnyDataLine = false;
      let rawSample = ''; // first ~300 chars of whatever the stream actually sent, for diagnosis if parsing comes up empty
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function readChunk() {
        return reader.read().then(function(result) {
          if (result.done) {
            clearTimeout(timeoutId);
            const cleaned = cleanAiMarkdown(fullText).trim();
            if (cleaned) {
              // Only a genuine reply gets saved into history. A failure
              // notice is UI-only — saving it as a fake "assistant" turn
              // would get resent as context on the next message, so one
              // failed reply would otherwise poison every message after it
              // in the same thread.
              typingEl.textContent = cleaned;
              thread.messages.push({ role: 'assistant', content: cleaned });
              thread.updatedAt = Date.now();
              saveAiThreads();
            } else {
              typingEl.textContent = "Sorry, I couldn't generate a response just now.";
            }
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep any incomplete trailing line for next chunk
          lines.forEach(function(line) {
            line = line.trim();
            if (!line.startsWith('data:')) return;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') return;
            sawAnyDataLine = true;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.response || (parsed.result && parsed.result.response) || '';
              if (delta) {
                fullText += delta;
                sawAnyChunk = true;
                typingEl.textContent = fullText;
                document.getElementById('ai-chat-log').scrollTop = document.getElementById('ai-chat-log').scrollHeight;
              } else if (rawSample.length < 300) {
                // Parsed fine but no usable text field — capture the actual
                // shape so we can see what the worker is really sending
                // instead of guessing blind.
                rawSample += payload.slice(0, 300 - rawSample.length);
              }
            } catch (e) {
              if (rawSample.length < 300) rawSample += payload.slice(0, 300 - rawSample.length);
            }
          });
          return readChunk();
        });
      }

      return readChunk().then(function() {
        if (!sawAnyChunk) {
          typingEl.textContent = "Sorry, I couldn't generate a response just now.";
          // The fetch/stream itself worked (we got a 200 + event-stream),
          // but nothing usable came through it — that's a worker/model-side
          // issue, not a network error, so it wouldn't otherwise show up
          // anywhere. Surface it so it's actually diagnosable.
          console.error('Sentra-X AI: stream ended with no usable content.', { sawAnyDataLine: sawAnyDataLine, rawSample: rawSample });
          if (typeof Sentry !== 'undefined' && Sentry.captureMessage) {
            try {
              Sentry.captureMessage('AI stream produced zero usable chunks', {
                level: 'error',
                extra: { sawAnyDataLine: sawAnyDataLine, rawSample: rawSample }
              });
            } catch (_ignored) { /* best effort */ }
          }
        }
      });
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      typingEl.classList.remove('typing');
      console.error('Sentra-X AI error:', err.message);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        try { Sentry.captureException(err); } catch (_ignored) { /* best effort */ }
      }
      const friendly = err.name === 'AbortError'
        ? "That's taking a while — the assistant might be busy right now. Please try again."
        : (err.message && err.message.length < 140 ? err.message : "Sorry, the assistant isn't available right now. Please try again in a moment.");
      typingEl.textContent = friendly;
    });
}

// Safety net: strip any markdown that slips through despite the system
// prompt instructing against it, since open models don't always follow
// formatting instructions perfectly. Runs client-side once the full
// message is assembled (streaming a half-formed "**bold" mid-word would
// look broken if this ran on partial chunks instead).
function cleanAiMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\-\*]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');
}
// ---- Camera Heart Rate Check (estimates heart rate only — NOT blood pressure) ----
let hrStream = null;
let hrRafId = null;
let hrSamples = [];
let hrStartTime = 0;
const HR_DURATION_MS = 20000;

function measureHeartRate() {
  const box = document.getElementById('hr-measure-box');
  const status = document.getElementById('hr-status');
  box.style.display = 'block';
  status.textContent = 'Starting camera…';
  hrSamples = [];
  const alertBox = document.getElementById('hr-pattern-alert');
  if (alertBox) alertBox.style.display = 'none';

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
    .then(function (stream) {
      hrStream = stream;
      const video = document.getElementById('hr-video');
      video.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      if (track && track.applyConstraints) {
        track.applyConstraints({ advanced: [{ torch: true }] }).catch(function () {});
      }

      video.onloadedmetadata = function () {
        video.play();
        status.textContent = 'Measuring… hold still for 20 seconds';
        hrStartTime = Date.now();
        hrTick();
      };
    })
    .catch(function () {
      status.textContent = 'Could not access camera. Check permissions and try again.';
    });
}

function hrTick() {
  
  const video = document.getElementById('hr-video');
  const canvas = document.getElementById('hr-canvas');
  if (!hrStream || !video || video.readyState < 2) {
    hrRafId = requestAnimationFrame(hrTick);
    return;
  }

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let sum = 0;
  for (let i = 0; i < frame.length; i += 4) { sum += frame[i]; }
  const avgRed = sum / (frame.length / 4);
  hrSamples.push({ t: Date.now(), v: avgRed });

  const elapsed = Date.now() - hrStartTime;
  if (elapsed < HR_DURATION_MS) {
    hrRafId = requestAnimationFrame(hrTick);
  } else {
    finishHeartRateMeasure();
  }
}

function finishHeartRateMeasure() {
  const status = document.getElementById('hr-status');
  const alertBox = document.getElementById('hr-pattern-alert');
  const reading = calculateBpmFromSamples(hrSamples);
  stopHeartRateCamera();

  if (alertBox) alertBox.style.display = 'none';

  let patternAbnormal = false;
  if (reading) {
    document.getElementById('heartrate').value = reading.bpm;
    status.textContent = 'Estimated heart rate: ' + reading.bpm + ' bpm (added below)';

    const pattern = analyzeHeartRatePattern(reading.bpm, reading.peakTimes);
    patternAbnormal = pattern.abnormal;
    if (patternAbnormal && alertBox) {
      document.getElementById('hr-pattern-text').textContent =
        'Your pulse looked ' + pattern.reasons.join(' and ') + ' during this reading. It could be nothing — activity, caffeine, or just holding the phone can cause this — but it\'s worth checking your blood pressure manually to be safe.';
      alertBox.style.display = 'block';
    }
  } else {
    status.textContent = 'Could not get a clear reading. Try again, holding still.';
  }

  if (!patternAbnormal) {
    setTimeout(function () {
      document.getElementById('hr-measure-box').style.display = 'none';
    }, 2500);
  }
}

// A normal pulse waveform has a small secondary bump after the main peak
// (the "dicrotic notch") — a basic threshold-crossing detector can mistake
// that for a second beat. Unlike a one-off noise glitch, this can happen on
// most beats in a reading, producing a systematic alternating short/long
// pattern that looks like an irregular rhythm even when the real heartbeat
// is perfectly steady. Fix it structurally: after detecting candidate
// peaks, merge any peak that lands much closer to the previous one than
// this reading's own typical spacing — that's almost certainly the same
// beat counted twice, not a genuinely extra one.
function mergeDoubleCountedPeaks(peakTimes) {
  if (peakTimes.length < 3) return peakTimes;
  const rawIntervals = [];
  for (let i = 1; i < peakTimes.length; i++) rawIntervals.push(peakTimes[i] - peakTimes[i - 1]);
  const sorted = rawIntervals.slice().sort(function (a, b) { return a - b; });
  const median = sorted[Math.floor(sorted.length / 2)];

  const cleaned = [peakTimes[0]];
  for (let i = 1; i < peakTimes.length; i++) {
    const gap = peakTimes[i] - cleaned[cleaned.length - 1];
    if (gap < median * 0.6) continue; // too close to be a separate beat — drop it
    cleaned.push(peakTimes[i]);
  }
  return cleaned;
}

function calculateBpmFromSamples(samples) {
  if (samples.length < 20) return null;

  // Discard the first second: camera auto-exposure/white-balance is still
  // stabilizing right after the flash turns on, and that swing isn't part
  // of the pulse signal.
  const settleMs = 1000;
  const startT = samples[0].t;
  const usable = samples.filter(function (s) { return s.t - startT > settleMs; });
  if (usable.length < 20) return null;

  const values = usable.map(function (s) { return s.v; });

  // Rolling baseline instead of one flat average for the whole window — a
  // single global average lets slow lighting drift dominate the threshold
  // and throws off peak counting. A rolling local amplitude (stdev) rides
  // alongside it so peak detection can require a real bump, not just a
  // sliver above a noisy average — without this, small ripples from sensor
  // noise or an imperfect fingertip seal get miscounted as extra beats,
  // which then shows up as fake rhythm irregularity even on a normal pulse.
  const windowSize = 15;
  const baseline = [];
  const localAmp = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce(function (a, b) { return a + b; }, 0) / slice.length;
    baseline.push(avg);
    const variance = slice.reduce(function (s, v) { return s + Math.pow(v - avg, 2); }, 0) / slice.length;
    localAmp.push(Math.sqrt(variance));
  }

  // Peak detection with a refractory period: a real pulse can't repeat
  // faster than ~300ms (200bpm — the same ceiling already enforced below),
  // so a crossing sooner than that is noise, not a beat. PROMINENCE_K
  // requires each candidate peak to clear the baseline by a real margin
  // (relative to the local signal's own noise level), not just barely
  // cross it.
  const REFRACTORY_MS = 300;
  const PROMINENCE_K = 0.5;
  let rising = false;
  let lastPeakT = -Infinity;
  const rawPeakTimes = [];
  for (let i = 1; i < values.length; i++) {
    const threshold = baseline[i] + PROMINENCE_K * localAmp[i];
    const above = values[i] > threshold;
    if (above && values[i] > values[i - 1] && !rising) {
      rising = true;
      const t = usable[i].t;
      if (t - lastPeakT >= REFRACTORY_MS) {
        rawPeakTimes.push(t);
        lastPeakT = t;
      }
    } else if (!above) {
      rising = false;
    }
  }

  const peakTimes = mergeDoubleCountedPeaks(rawPeakTimes);

  const durationMinutes = (usable[usable.length - 1].t - usable[0].t) / 60000;
  if (durationMinutes <= 0) return null;

  const bpm = Math.round(peakTimes.length / durationMinutes);
  if (bpm < 40 || bpm > 200) return null;
  return { bpm: bpm, peakTimes: peakTimes };
}

// ---- Heart rate PATTERN analysis (rate + rhythm only) ----
// Flags a fast/slow/uneven pulse and nudges the user toward a real manual
// BP reading. This never estimates blood pressure itself.
const HR_TACHY_BPM = 100;
const HR_BRADY_BPM = 50;
// A trimmed coefficient of variation (drops the single longest and shortest
// interval before computing stdev/mean) above this is flagged as irregular.
// Trimming matters because even with prominence filtering, camera PPG will
// still occasionally miss or double-count one beat in an otherwise regular
// reading — a single bad interval shouldn't be enough to call the whole
// rhythm irregular. This is set high and un-tuned against real patient
// data, so treat it as a rough nudge, never as a clinical threshold.
const HR_RHYTHM_COV_THRESHOLD = 0.30;
const HR_MIN_PEAKS_FOR_RHYTHM = 11;

function analyzeHeartRatePattern(bpm, peakTimes) {
  const reasons = [];
  if (bpm >= HR_TACHY_BPM) reasons.push('unusually fast (' + bpm + ' bpm)');
  if (bpm > 0 && bpm < HR_BRADY_BPM) reasons.push('unusually slow (' + bpm + ' bpm)');

  // Rhythm-irregularity detection (beat-to-beat timing variance) is
  // intentionally not used here. It needs real device debug data to tune
  // correctly, and shipping another untested threshold risks the same
  // false-alarm problem again. bpm itself (tachycardia/bradycardia above)
  // is a plain number comparison, immune to camera/timing noise, so it's
  // safe to rely on as-is. peakTimes is still passed in and available for
  // when the rhythm check is properly tuned later.

  return { abnormal: reasons.length > 0, reasons: reasons };
}

function focusBpFields() {
  const sysField = document.getElementById('systolic');
  if (sysField) {
    sysField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sysField.focus();
  }
}

function stopHeartRateCamera() {
  if (hrRafId) { cancelAnimationFrame(hrRafId); hrRafId = null; }
  if (hrStream) {
    hrStream.getTracks().forEach(function (t) { t.stop(); });
    hrStream = null;
  }
}

function cancelHeartRateMeasure() {
  stopHeartRateCamera();
  document.getElementById('hr-status').textContent = 'Cancelled.';
  document.getElementById('hr-measure-box').style.display = 'none';
  const alertBox = document.getElementById('hr-pattern-alert');
  if (alertBox) alertBox.style.display = 'none';
}
