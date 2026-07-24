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

function showScreen(name) {
  expireOldMeds();
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('nav button').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(name + '-screen').classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'meds') renderMeds();
  if (name === 'history') { renderHistory(); renderWeeklySummary(); renderBadges(); renderQuickStats(); renderHealthRadar(); renderMedHistory(); }
  if (name === 'family') renderCaregiverNote();
  if (name === 'passport') renderPassport();
  }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function timeToMinutes(t) { const parts = t.split(':'); return parseInt(parts[0]) * 60 + parseInt(parts[1]); }
function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000); }

function completeOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  const condition = document.getElementById('ob-condition').value;
  if (!name) { alert('Please enter your first name.'); return; }
  localStorage.setItem('userName', name);
  localStorage.setItem('userCondition', condition);
  document.getElementById('onboarding-overlay').style.display = 'none';
  renderGreeting();
  syncToFirestore({ userName: name, userCondition: condition });
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
  if (!name || !time) { alert('Please enter the medication name and time.'); return; }
  let durationDays = null;
  if (durationText) {
    durationDays = parseDurationToDays(durationText);
    if (durationDays === null) { alert('Please enter a valid duration like "5 days", "2 weeks", or "1 month" — or leave it blank.'); return; }
  }
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
        '<div class="med-history-name">💊 ' + h.name + '</div>' +
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
  const logs = JSON.parse(localStorage.getItem('medLogs') || '{}');
  if (!logs[today]) logs[today] = {};
  logs[today][id] = !logs[today][id];
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
    return '<div class="med-row"><span>' + m.name + ' — ' + m.time + leftText + '</span><button class="' + (taken ? 'taken' : 'secondary') + '" onclick="toggleTaken(\'' + m.id + '\')">' + (taken ? '✓ Taken' : 'Mark Taken') + '</button></div>';
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
    if (Notification.permission === 'granted' && !sessionStorage.getItem('notified-' + today)) {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function(reg) {
          if (reg) reg.showNotification('Sentra-X reminder', { body: 'Time for: ' + names });
        });
      }
      sessionStorage.setItem('notified-' + today, '1');
    }
  } else {
    banner.innerHTML = '';
  }
}

function enableReminders() {
  if (!('Notification' in window)) { alert('Notifications are not supported on this browser.'); return; }
  Notification.requestPermission().then(function(perm) {
    document.getElementById('enable-btn').textContent = perm === 'granted' ? '🔔 Reminders Enabled' : '🔔 Enable Reminder Alerts';
  });
}

function renderHistory() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const list = document.getElementById('history-list');
  if (vitals.length === 0) { list.innerHTML = '<div class="empty">No readings logged yet</div>'; return; }
  list.innerHTML = vitals.map(function(v) {
    return '<div class="history-row" style="background:' + v.color + '"><b>' + v.sys + '/' + v.dia + '</b> — ' + v.level + '<br><small>' + v.date + (v.hr ? ' · HR ' + v.hr : '') + (v.weight ? ' · ' + v.weight + 'kg' : '') + '</small></div>';
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

function saveCaregiver() {
  const name = document.getElementById('cg-name').value.trim();
  const phone = document.getElementById('cg-phone').value.trim();
  const email = document.getElementById('cg-email').value.trim();
  if (!name || !phone) { alert("Please enter both the caregiver's name and number."); return; }
  localStorage.setItem('cgName', name);
  localStorage.setItem('cgPhone', phone);
  localStorage.setItem('cgEmail', email);
  renderCaregiverNote();
  syncToFirestore({ cgName: name, cgPhone: phone, cgEmail: email });
}

function renderCaregiverNote() {
  const name = localStorage.getItem('cgName');
  const note = document.getElementById('cg-saved-note');
  const nameInput = document.getElementById('cg-name');
  const phoneInput = document.getElementById('cg-phone');
  const emailInput = document.getElementById('cg-email');
  if (name) {
    note.textContent = '✓ Saved — alerts will go to ' + name;
    nameInput.value = name;
    phoneInput.value = localStorage.getItem('cgPhone') || '';
    emailInput.value = localStorage.getItem('cgEmail') || '';
  }
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

function populatePassportSelects() {
  const bgSelect = document.getElementById('pp-bloodgroup');
  const gtSelect = document.getElementById('pp-genotype');
  if (!bgSelect || !gtSelect) return;
  bgSelect.innerHTML = BLOOD_GROUPS.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
  gtSelect.innerHTML = GENOTYPES.map(function(g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
}

function savePassport() {
  const passport = {
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
  navigator.serviceWorker.register('sw.js').catch(function(){});
}

expireOldMeds();
refreshAllUI();
setInterval(checkDueMeds, 60000);
