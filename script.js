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
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('nav button').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(name + '-screen').classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'meds') renderMeds();
  if (name === 'history') { renderHistory(); renderWeeklySummary(); renderBadges(); }
  if (name === 'family') renderCaregiverNote();
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

function addMed() {
  const name = document.getElementById('med-name').value.trim();
  const time = document.getElementById('med-time').value;
  if (!name || !time) { alert('Please enter both a medication name and time.'); return; }
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  meds.push({ id: Date.now().toString(), name: name, time: time });
  localStorage.setItem('meds', JSON.stringify(meds));
  document.getElementById('med-name').value = '';
  document.getElementById('med-time').value = '';
  renderMeds();
  syncToFirestore({ meds: meds });
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
  if (meds.length === 0) { list.innerHTML = '<div class="empty">No medications added yet</div>'; return; }
  list.innerHTML = meds.map(function(m) {
    const taken = logs[today] && logs[today][m.id];
    return '<div class="med-row"><span>' + m.name + ' — ' + m.time + '</span><button class="' + (taken ? 'taken' : 'secondary') + '" onclick="toggleTaken(\'' + m.id + '\')">' + (taken ? '✓ Taken' : 'Mark Taken') + '</button></div>';
  }).join('');
  checkDueMeds();
}

function checkDueMeds() {
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
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
  if (!name || !phone) { alert("Please enter both the caregiver's name and number."); return; }
  localStorage.setItem('cgName', name);
  localStorage.setItem('cgPhone', phone);
  renderCaregiverNote();
  syncToFirestore({ cgName: name, cgPhone: phone });
}

function renderCaregiverNote() {
  const name = localStorage.getItem('cgName');
  const note = document.getElementById('cg-saved-note');
  const nameInput = document.getElementById('cg-name');
  const phoneInput = document.getElementById('cg-phone');
  if (name) {
    note.textContent = '✓ Saved — alerts will go to ' + name;
    nameInput.value = name;
    phoneInput.value = localStorage.getItem('cgPhone') || '';
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

function refreshAllUI() {
  renderGreeting();
  renderTip();
  renderMeds();
  renderHistory();
  renderWeeklySummary();
  renderCaregiverNote();
  renderHealthScore();
  renderWater();
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

refreshAllUI();
setInterval(checkDueMeds, 60000);
