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

  // Captured BEFORE the active class is reassigned below — this is what
  // lets the 'ai' branch further down tell "genuinely navigating in from
  // another screen" apart from "already here, showScreen('ai') fired again"
  // (e.g. a second tap on the Assistant nav icon while already mid-chat).
  const aiScreenEl = document.getElementById('ai-screen');
  const aiWasAlreadyActive = !!(aiScreenEl && aiScreenEl.classList.contains('active'));

  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('nav button').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('#more-sheet button').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(name + '-screen').classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'firstaid' || name === 'maternal' || name === 'passport' || name === 'ai' || name === 'articles' || name === 'marketplace' || name === 'rewards') {
    document.getElementById('nav-more').classList.add('active');
  }
  closeMoreMenu();
  if (name === 'meds') renderMeds();
  if (name === 'history') { renderHistory(); renderWeeklySummary(); renderBadges(); renderQuickStats(); renderHealthRadar(); renderMedHistory(); }
  if (name === 'family') { renderCaregiverNote(); renderLinkedCaregivers(); }
  if (name === 'passport') renderPassport();
  if (name === 'maternal') renderMaternalScreen();
  // Only re-render (and, for an existing thread, inject a fresh spoken
  // "welcome back" line) on a genuine arrival into the AI screen. Without
  // this guard, showScreen('ai') firing again while already there — e.g. a
  // second tap on the Assistant icon mid-conversation — wiped the log and
  // dropped an unrelated "welcome back" bubble on top of the real reply
  // that was already showing, which is what made the conversation look
  // like it was replying out of order / ignoring what was just said.
  if (name === 'ai' && !aiWasAlreadyActive) renderAiWelcome();
  if (name === 'articles' && window.SentraXArticles) window.SentraXArticles.render();
  if (name === 'marketplace' && window.SentraXStore) window.SentraXStore.enter();
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
  document.getElementById('rating-overlay').style.display = 'none';
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
  const obSexEl = document.getElementById('ob-sex');
  const sexVal = obSexEl ? obSexEl.value : '';
  if (!name) { alert('Please enter your first name.'); return; }
  localStorage.setItem('userName', name);
  localStorage.setItem('userCondition', condition);

  // Saved onto the existing passport record (not a new field) so it's the
  // same "sex" the Passport screen already shows/edits — just captured
  // earlier, at signup, instead of only if/when the user visits Passport.
  // Merges onto whatever passport data may already exist rather than
  // overwriting it; never runs at all if left on the default option.
  if (sexVal && typeof SEXES !== 'undefined' && sexVal !== SEXES[0]) {
    const existingPassport = JSON.parse(localStorage.getItem('passport') || '{}');
    existingPassport.sex = sexVal;
    localStorage.setItem('passport', JSON.stringify(existingPassport));
    syncToFirestore({ passport: existingPassport });
  }

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
  // WhatsApp-only button — a wa.me link can only target one chat, so this
  // goes to the primary caregiver. For an alert that reaches every saved
  // caregiver automatically by SMS + email too, use the SOS button instead.
  const caregivers = loadCaregivers();
  const primary = caregivers.find(function (c) { return c.isPrimary; }) || caregivers[0];
  const cgPhone = primary ? normalizeNigerianPhone(primary.phone) : '';
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

// A distinctive, self-contained alarm tone for medication reminders — built
// with the Web Audio API instead of an audio file, so it needs no asset,
// works offline, and adds nothing to cache/download size. Three rising
// two-note chimes, deliberately different from a generic notification
// "ping" so it's recognizable specifically as Sentra-X's medication alarm.
// Only usable while the app is actually open (foreground) — no browser lets
// a background system notification play a custom sound file, only the
// phone's own default notification tone, which is a platform limit, not
// something fixable from here.
let medAlarmAudioCtx = null;
function playMedAlarmSound() {
  try {
    if (!medAlarmAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      medAlarmAudioCtx = new AudioCtx();
    }
    const ctx = medAlarmAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const beep = function(startTime, freq, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    };
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.55;
      beep(t, 880, 0.16);
      beep(t + 0.18, 1175, 0.22);
    }
  } catch (e) { /* best effort — a failed tone shouldn't block the notification/vibration below */ }
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

    // Re-fires whenever the SET of currently-due meds changes, not just
    // once for the entire day — previously a single daily flag meant a
    // second medication becoming due later that same day never alerted at
    // all, since the first one had already "used up" the day's one notice.
    const dueKey = today + ':' + due.map(function(m){ return m.id; }).sort().join(',');
    if (Notification.permission === 'granted' && localStorage.getItem('reminders-muted') !== '1' && sessionStorage.getItem('notified-set') !== dueKey) {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function(reg) {
          if (reg) reg.showNotification('Sentra-X reminder', { body: 'Time for: ' + names, icon: 'icon-192-1.png', badge: 'icon-192-1.png', vibrate: [200, 100, 200, 100, 200], requireInteraction: true });
        });
      }
      if (document.visibilityState === 'visible') playMedAlarmSound();
      sessionStorage.setItem('notified-set', dueKey);
    }
  } else {
    banner.innerHTML = '';
  }
}

// Public half of the VAPID key pair used to sign push messages — safe to
// expose client-side by design (this is what proves a push claiming to be
// from Sentra-X actually is; the private half never leaves the server).
const VAPID_PUBLIC_KEY = 'BOVKb7yg86nVhkWDVLaOe0iuljVUDs7axNMG21lpQHBuaXBBS5kzZ5sLDAJU50rXQ8EpwOPg4cLJHZmloHExf_g';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Subscribes this device to push and saves the subscription to the user's
// own Firestore doc, so a server-side check can reach this exact device
// even when the app is fully closed. Safe to call repeatedly: subscribing
// again with the same key returns the existing subscription rather than
// creating a duplicate, and this never touches anything unrelated to push.
function ensurePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  navigator.serviceWorker.ready.then(function (reg) {
    return reg.pushManager.getSubscription().then(function (existing) {
      // The VAPID key pair was regenerated once already (the previous
      // private key was lost, so the old public key became permanently
      // unusable). A subscription created under that old key would look
      // completely valid here — getSubscription() has no way to know its
      // key is now orphaned — and would silently never receive anything.
      // Tracking which key the current subscription was made with, and
      // forcing a fresh one whenever that doesn't match the key actually
      // in use, is what catches that instead of failing silently forever.
      if (existing && localStorage.getItem('push-vapid-key-used') === VAPID_PUBLIC_KEY) {
        return existing;
      }
      const resubscribe = existing ? existing.unsubscribe() : Promise.resolve();
      return resubscribe.then(function () {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      });
    });
  }).then(function (sub) {
    if (sub) {
      localStorage.setItem('push-vapid-key-used', VAPID_PUBLIC_KEY);
      syncToFirestore({ pushSubscription: sub.toJSON() });
    }
  }).catch(function (err) {
    console.error('Sentra-X: push subscription failed', err && err.message);
  });
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
    if (perm === 'granted') { localStorage.setItem('reminders-muted', '0'); ensurePushSubscription(); }
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
const MAX_CAREGIVERS = 8; // matches the linked/invite caregiver cap (see generateInviteCode) — kept in sync intentionally

function openAddCaregiverForm() {
  if (loadCaregivers().length >= MAX_CAREGIVERS) {
    alert('You can add up to ' + MAX_CAREGIVERS + ' caregivers. Remove one before adding another.');
    return;
  }
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

// Termii (and most SMS APIs) require E.164-style international format —
// country code, no leading 0. Nigerian numbers are naturally typed/saved in
// local format (0815...), which Termii rejects outright ("not a valid,
// dialable number"). Normalizing once here means every caller — SOS, saving
// a caregiver, WhatsApp links — gets a consistently correct number instead
// of each needing its own fix.
function normalizeNigerianPhone(raw) {
  let digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = '234' + digits.slice(1);
  else if (!digits.startsWith('234')) digits = '234' + digits;
  return digits;
}

function saveCaregiverForm() {
  const name = document.getElementById('cg-name').value.trim();
  const phone = normalizeNigerianPhone(document.getElementById('cg-phone').value.trim());
  const email = document.getElementById('cg-email').value.trim();
  if (!name || !phone) { alert("Please enter both the caregiver's name and number."); return; }

  const list = loadCaregivers();
  if (!editingCaregiverId && list.length >= MAX_CAREGIVERS) {
    alert('You can add up to ' + MAX_CAREGIVERS + ' caregivers. Remove one before adding another.');
    return;
  }
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
  // The linked-caregiver list is displayed as "(x/8)" but that cap was
  // never actually enforced anywhere — someone could link more than 8
  // despite the UI promising a limit. Checking it here for real, using
  // the same MAX_CAREGIVERS number as the local caregiver list so both
  // caps stay in sync.
  firebase.firestore().collection('users').doc(user.uid).get().then(function (doc) {
    const uids = (doc.exists && doc.data().caregiverUids) || [];
    if (uids.length >= MAX_CAREGIVERS) {
      alert('You can link up to ' + MAX_CAREGIVERS + ' caregivers. Remove one before inviting another.');
      return;
    }
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
  }).catch(function (err) {
    alert('Could not check your linked caregivers: ' + err.message);
  });
}
function renderCaregiverNote() {
  const list = loadCaregivers();
  const addBtn = document.getElementById('cg-add-btn');
  if (addBtn) {
    const atLimit = list.length >= MAX_CAREGIVERS;
    addBtn.textContent = atLimit ? 'Caregiver limit reached (' + MAX_CAREGIVERS + ')' : '+ Add Caregiver';
    addBtn.disabled = atLimit;
  }
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
            (c.isPrimary ? '<span class="cg-primary-badge">Primary Caregiver</span>' : '') +
          '</div>' +
          '<div class="cg-row"><span>📱</span><span>' + (c.phone || '—') + '</span></div>' +
          '<div class="cg-row"><span>✉️</span><span>' + (c.email || 'No email on file') + '</span></div>' +
          '<div class="cg-actions">' +
            '<button onclick="editCaregiverEntry(\'' + c.id + '\')">Edit</button>' +
            (c.isPrimary ? '' : '<button onclick="makePrimaryCaregiver(\'' + c.id + '\')">Make Primary Caregiver</button>') +
            '<button class="cg-danger" onclick="removeCaregiverEntry(\'' + c.id + '\')">Remove</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }).join('');
}

function renderLinkedCaregivers() {
  const box = document.getElementById('linked-cg-list');
  if (!box) return;
  const user = firebase.auth().currentUser;
  if (!user) return;
  firebase.firestore().collection('users').doc(user.uid)
    .onSnapshot(function (doc) {
      if (!doc.exists) { box.innerHTML = ''; return; }
      const data = doc.data();
      const uids = data.caregiverUids || [];
      const info = data.caregiverInfo || {};
      if (uids.length === 0) {
        box.innerHTML = '<div class="empty" style="margin-top:10px;">No caregivers linked yet</div>';
        return;
      }
      box.innerHTML = '<h4 style="margin:14px 0 8px;font-size:14px;color:#94a3b8;">Linked Caregivers (' + uids.length + '/' + MAX_CAREGIVERS + ')</h4>' +
        uids.map(function (uid) {
          const meta = info[uid] || {};
          const label = meta.email || 'Caregiver';
          return '<div class="cg-card">' +
              '<div class="cg-info">' +
                '<div class="cg-name-row"><span class="cg-name">' + String(label).replace(/</g, '&lt;') + '</span></div>' +
                '<div class="cg-row"><span>🔗</span><span>Has read access to your health data</span></div>' +
              '</div>' +
              '<button class="cg-danger" onclick="revokeCaregiver(\'' + uid + '\')">Revoke</button>' +
            '</div>';
        }).join('');
    }, function (err) {
      console.error('Sentra-X: linked caregivers read failed:', err.message);
    });
}

function revokeCaregiver(uid) {
  if (!confirm('Remove this caregiver\'s access to your health data?')) return;
  const user = firebase.auth().currentUser;
  if (!user) return;
  const update = { caregiverUids: firebase.firestore.FieldValue.arrayRemove(uid) };
  update['caregiverInfo.' + uid] = firebase.firestore.FieldValue.delete();
  firebase.firestore().collection('users').doc(user.uid).update(update)
    .catch(function (err) { alert('Could not remove caregiver: ' + err.message); });
}
const COMMUNITY_WHATSAPP_URL = 'https://chat.whatsapp.com/K1QIZXLxBycG2WnAfCpuba';
function openWhatsAppCommunity() {
  window.open(COMMUNITY_WHATSAPP_URL, '_blank');
}

// Reuses the exact same EmailJS project/service/template/company inbox
// already proven working for marketplace order notifications in store.js —
// same public (browser-safe) key, no private key needed for a client-side
// send, no new EmailJS setup required.
const FEEDBACK_SELLER_EMAIL = 'sentraxforteltd@gmail.com';
const FEEDBACK_EMAILJS_SERVICE_ID = 'service_sq7cgqb';
const FEEDBACK_EMAILJS_TEMPLATE_ID = 'template_9clzjfk';
const FEEDBACK_EMAILJS_PUBLIC_KEY = 'nAbELba6szw8IyjO-';

let selectedRatingValue = 0;

function openRatingOverlay() {
  selectedRatingValue = 0;
  document.querySelectorAll('#star-row .star-btn').forEach(function (s) {
    s.textContent = '☆';
    s.classList.remove('filled');
  });
  document.getElementById('rating-feedback').value = '';
  document.getElementById('rating-error').textContent = '';
  const box = document.querySelector('#rating-overlay .box');
  box.innerHTML = '<h2>Rate Sentra-X</h2>' +
    '<p>Your feedback helps us keep improving the app.</p>' +
    '<div class="star-row" id="star-row">' +
      '<span class="star-btn" data-value="1" onclick="selectStar(1)">☆</span>' +
      '<span class="star-btn" data-value="2" onclick="selectStar(2)">☆</span>' +
      '<span class="star-btn" data-value="3" onclick="selectStar(3)">☆</span>' +
      '<span class="star-btn" data-value="4" onclick="selectStar(4)">☆</span>' +
      '<span class="star-btn" data-value="5" onclick="selectStar(5)">☆</span>' +
    '</div>' +
    '<textarea id="rating-feedback" placeholder="What\'s working well, or what could be better? (optional)" rows="4"></textarea>' +
    '<div class="error" id="rating-error"></div>' +
    '<button id="rating-submit-btn" onclick="submitRating()">Submit Feedback</button>' +
    '<button class="switch" onclick="closeRatingOverlay()">Not now</button>';
  document.getElementById('rating-overlay').style.display = 'flex';
  history.pushState({ ratingOverlay: true }, '');
}

function closeRatingOverlay() {
  const overlay = document.getElementById('rating-overlay');
  if (overlay.style.display === 'flex' && history.state && history.state.ratingOverlay) {
    history.back();
  } else {
    overlay.style.display = 'none';
  }
}

function selectStar(n) {
  selectedRatingValue = n;
  document.querySelectorAll('#star-row .star-btn').forEach(function (s) {
    const v = parseInt(s.getAttribute('data-value'), 10);
    if (v <= n) { s.textContent = '★'; s.classList.add('filled'); }
    else { s.textContent = '☆'; s.classList.remove('filled'); }
  });
}

function submitRating() {
  const err = document.getElementById('rating-error');
  err.textContent = '';
  if (selectedRatingValue < 1) { err.textContent = 'Please select a star rating first.'; return; }

  const feedbackText = document.getElementById('rating-feedback').value.trim();
  const btn = document.getElementById('rating-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  const stars = '★'.repeat(selectedRatingValue) + '☆'.repeat(5 - selectedRatingValue);
  const message = 'NEW SENTRA-X APP RATING\n' +
    'Rating: ' + stars + ' (' + selectedRatingValue + '/5)\n' +
    'From: ' + name + '\n' +
    'Feedback: ' + (feedbackText || '(no written feedback provided)');

  fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: FEEDBACK_EMAILJS_SERVICE_ID,
      template_id: FEEDBACK_EMAILJS_TEMPLATE_ID,
      user_id: FEEDBACK_EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: FEEDBACK_SELLER_EMAIL,
        patient_name: 'Sentra-X App Rating',
        caregiver_name: selectedRatingValue + '/5 stars',
        alert_message: message
      }
    })
  })
    .then(function (res) {
      if (!res.ok) throw new Error('send failed');
      const box = document.querySelector('#rating-overlay .box');
      box.innerHTML = '<div class="rating-thanks">Thank you for your feedback! 🙏</div>' +
        '<button onclick="closeRatingOverlay()">Done</button>';
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Submit Feedback';
      err.textContent = 'Could not send right now — please check your connection and try again.';
    });
    }
function shareToFamily() {
  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  const streak = localStorage.getItem('streak') || '0';
  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  // WhatsApp-only — goes to the primary caregiver, same reason as
  // alertCaregiverNow (a wa.me link can only target one chat).
  const caregivers = loadCaregivers();
  const primary = caregivers.find(function (c) { return c.isPrimary; }) || caregivers[0];
  const cgPhone = primary ? normalizeNigerianPhone(primary.phone) : '';
  const latest = vitals[0];
  let msg = 'Hi! This is ' + name + "'s Sentra-X health update. Current streak: " + streak + ' days. ';
  msg += latest ? ('Latest reading: ' + latest.sys + '/' + latest.dia + ' (' + latest.level + ').') : 'No readings logged yet.';
  const url = cgPhone ? ('https://wa.me/' + cgPhone + '?text=' + encodeURIComponent(msg)) : ('https://wa.me/?text=' + encodeURIComponent(msg));
  window.open(url, '_blank');
}

function callEmergency() {
  window.location.href = 'tel:' + BAYELSA_EMERGENCY_PHONE;
}
function callNationalEmergency() {
  window.location.href = 'tel:112';
}

// --- Bayelsa State Emergency Line (Ministry of Health partnership) -----
// Confirmed number: 0800 220 0223 — this is now the primary number used
// throughout the app (Emergency card, first-aid instructions, AI assistant).
// 112 (Nigeria's nationwide line) is kept only as a small secondary link on
// the main Emergency card — not removed, since it works regardless of
// network/state and costs nothing to keep as a backup.
const BAYELSA_EMERGENCY_PHONE = '08002200223';
const BAYELSA_EMERGENCY_EMAIL = ''; // fill in once Ministry confirms a monitored inbox
// Whether this line can actually RECEIVE SMS/email (many hotlines are
// voice-only) has not been formally confirmed by the Ministry/BEMSAS — but
// the call button (0800 220 0223) remains available regardless as a
// reliable fallback, so the risk of an SMS going unseen is low. Enabled.
const SOS_SEND_TO_STATE_LINE = true;

function toggleFirstAid(id) {
  const body = document.getElementById('fa-body-' + id);
  const arrow = document.getElementById('fa-arrow-' + id);
  if (!body || !arrow) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

// Paste your deployed Cloudflare Worker URL here once you've followed the
// deploy steps in cloudflare-sos-worker.js. That worker now sends BOTH SMS
// (Termii) and email (EmailJS) server-side — independently, so Termii
// approval still being pending never blocks the email half. Leave this
// blank and the worker call is skipped automatically (WhatsApp still works
// either way).
const SOS_SMS_WORKER_URL = 'https://sentrax-sos-sms.alecedoh1994.workers.dev/';

// A genuine GPS fix is typically accurate to within tens of meters outdoors.
// Anything much looser than that is usually the browser falling back to
// WiFi/cell-tower positioning — which can be off by hundreds of meters to a
// few kilometers, and tends to return the same stale estimate repeatedly
// (especially indoors) rather than tracking real movement. Treating that as
// "exact" is actively misleading in an emergency, so it's gated out here.
const MAX_EXACT_ACCURACY_M = 100;

// ---------------------------------------------------------------------
// Passive location warm-up. Runs quietly on app load — NOT tied to the
// SOS button. Purpose: by the time someone is actually in an emergency
// and taps SOS, location permission has already been granted (so no
// permission dialog interrupts the emergency) and a recent GPS fix is
// already cached, so SOS can use it near-instantly instead of waiting on
// a fresh fix that may time out under poor signal conditions.
//
// Exact GPS only — no IP-based fallback. An IP lookup is only accurate to
// city/neighborhood level, which isn't precise enough to be useful for
// finding someone in an emergency, and could even mislead a caregiver
// into checking the wrong area. If a real GPS fix can't be obtained, SOS
// should say so plainly rather than send an approximate guess.
// ---------------------------------------------------------------------
function warmUpLocation() {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      // A low-accuracy fix isn't worth caching at all — better to have SOS
      // try a fresh live fix later than reuse a stale, imprecise one.
      if (pos.coords.accuracy > MAX_EXACT_ACCURACY_M) return;
      localStorage.setItem('lastKnownLat', pos.coords.latitude);
      localStorage.setItem('lastKnownLng', pos.coords.longitude);
      localStorage.setItem('lastKnownAccuracy', pos.coords.accuracy);
      localStorage.setItem('lastKnownLocationAt', Date.now());
    },
    function () { /* denied/unavailable — nothing cached, SOS will fall through to "please call them" */ },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}
warmUpLocation();
// Push subscription sync now happens from auth.js's loadPatientFlow(),
// after auth state is actually confirmed — see the comment there for why
// this used to live here and never worked.

function triggerSOS() {
  const confirmMsg = 'This will automatically send an SOS alert with your location to all your saved caregivers by SMS and email, and also open WhatsApp for your primary caregiver' +
    (SOS_SEND_TO_STATE_LINE ? ', and notify the Bayelsa State emergency line' : '') +
    '. Continue?';
  const confirmed = confirm(confirmMsg);
  if (!confirmed) return;
  const name = localStorage.getItem('userName') || 'A Sentra-X user';
  const caregivers = loadCaregivers().filter(function (c) { return c.phone || c.email; });
  const primary = caregivers.find(function (c) { return c.isPrimary; }) || caregivers[0];
  const primaryPhone = primary ? normalizeNigerianPhone(primary.phone) : '';

  function sendAlert(locationText) {
    // Caregiver message explicitly asks them to also call emergency services
    // themselves — the SMS/email/WhatsApp alert is not a substitute for a
    // real emergency call, just the fastest way to reach them.
    const caregiverMsg = '\u{1F198} EMERGENCY: ' + name + ' needs help right now.' + locationText +
      ' Please also call the emergency line (0800 220 0223) right away.';

    // Separate message for the Ministry/state emergency line — this
    // recipient IS the emergency service, so telling them to "call
    // emergency services" makes no sense; theirs is a dispatch-style alert
    // instead. Includes the primary caregiver's phone number as a callback
    // reference (there's no field capturing the patient's own phone number
    // yet — add one to the patient's profile if a direct patient callback
    // number is needed instead of the caregiver's).
    const stateMsg = '\u{1F198} SENTRA-X EMERGENCY ALERT: ' + name + ' has triggered an SOS.' + locationText +
      (primaryPhone ? (' Caregiver contact: ' + primaryPhone + '.') : '');

    const msg = caregiverMsg; // kept for the WhatsApp step below, unchanged

    // 1. SMS + email — sent to EVERY saved caregiver, not just the primary.
    // Each caregiver gets their own fetch to the worker (the worker's
    // contract is one phone/email pair per call), fired in parallel so one
    // caregiver's request never delays another's. Both sent by the
    // Cloudflare Worker, not the browser. Two reasons this lives
    // server-side instead of split across fetch calls here: the Termii key
    // never touches the browser, and — more important for a genuine
    // emergency — a mobile browser tab can get backgrounded or the screen
    // locked the instant someone taps SOS and puts the phone down; once
    // the worker has the request, the send completes independently of
    // whatever happens to the tab afterward.
    if (SOS_SMS_WORKER_URL) {
      caregivers.forEach(function (cg) {
        const phone = normalizeNigerianPhone(cg.phone);
        const email = cg.email || '';
        if (!phone && !email) return;
        fetch(SOS_SMS_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone, email: email, name: name, message: caregiverMsg })
        }).then(function (res) {
          // A response coming back at all doesn't mean the alert actually went
          // out — the worker can return 200 while one or both channels failed
          // server-side (bad API key, provider rejected the address, etc.).
          // Inspect the body so a silent per-channel failure is at least
          // visible in Sentry, instead of looking identical to full success.
          return res.text().then(function (bodyText) {
            let body = null;
            try { body = JSON.parse(bodyText); } catch (_e) { /* non-JSON response body */ }
            const emailFailed = email && body && body.email && body.email.ok === false;
            const smsFailed = phone && body && body.sms && body.sms.ok === false;
            if (!res.ok || emailFailed || smsFailed) {
              console.error('Sentra-X SOS: worker reported a failure for caregiver', cg.id, res.status, bodyText);
              if (typeof Sentry !== 'undefined' && Sentry.captureMessage) {
                try {
                  Sentry.captureMessage('SOS worker reported a send failure', {
                    level: 'error',
                    extra: { status: res.status, body: bodyText, caregiverId: cg.id, hadPhone: !!phone, hadEmail: !!email }
                  });
                } catch (_ignored) { /* best effort */ }
              }
            }
          });
        }).catch(function (err) {
          // Worker unreachable entirely (offline, DNS, CORS) — WhatsApp below
          // is still independent, but this should be visible too, not silent.
          console.error('Sentra-X SOS: worker request failed for caregiver', cg.id, err && err.message);
          if (typeof Sentry !== 'undefined' && Sentry.captureException) {
            try { Sentry.captureException(err); } catch (_ignored) { /* best effort */ }
          }
        });
      });

      // 1b. State emergency line (Bayelsa Ministry of Health partnership) —
      // sent the exact same way as a caregiver, as one extra fixed recipient,
      // gated behind SOS_SEND_TO_STATE_LINE until the Ministry confirms this
      // line can actually receive SMS/email alerts (see comment near
      // BAYELSA_EMERGENCY_PHONE above). Kept as a separate block from the
      // caregiver loop above so it can never affect caregiver delivery even
      // if this call fails.
      if (SOS_SEND_TO_STATE_LINE && (BAYELSA_EMERGENCY_PHONE || BAYELSA_EMERGENCY_EMAIL)) {
        fetch(SOS_SMS_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: BAYELSA_EMERGENCY_PHONE, email: BAYELSA_EMERGENCY_EMAIL, name: name, message: stateMsg })
        }).catch(function (err) {
          console.error('Sentra-X SOS: state emergency line notify failed', err && err.message);
          if (typeof Sentry !== 'undefined' && Sentry.captureException) {
            try { Sentry.captureException(err); } catch (_ignored) { /* best effort */ }
          }
        });
      }
    }

    // 2. WhatsApp — primary caregiver only. A wa.me link can only target one
    // chat, and opening several via window.open() in a loop gets blocked by
    // mobile popup blockers after the first — so this deliberately isn't
    // looped over every caregiver; it would look like it worked and quietly
    // fail. SMS + email above are what actually reach everyone.
    const url = primaryPhone ? ('https://wa.me/' + primaryPhone + '?text=' + encodeURIComponent(msg)) : ('https://wa.me/?text=' + encodeURIComponent(msg));
    window.open(url, '_blank');
  }

  function useCachedLocationOrGiveUp() {
    const lat = localStorage.getItem('lastKnownLat');
    const lng = localStorage.getItem('lastKnownLng');
    const accuracy = parseFloat(localStorage.getItem('lastKnownAccuracy') || 'Infinity');
    const at = parseInt(localStorage.getItem('lastKnownLocationAt') || '0', 10);
    const ageMinutes = (Date.now() - at) / 60000;
    // A cached fix up to 30 minutes old is still far more useful in an
    // emergency than nothing — worth using rather than discarding. Only
    // trusted if it actually met the same accuracy bar as a live fix would
    // (warmUpLocation only caches fixes that already pass this, but the
    // check is repeated here in case an older cached value predates that
    // gate, or lastKnownAccuracy is missing for any other reason).
    if (lat && lng && ageMinutes < 30 && accuracy <= MAX_EXACT_ACCURACY_M) {
      const link = 'https://maps.google.com/?q=' + lat + ',' + lng;
      sendAlert(' Exact location, last known ' + Math.round(ageMinutes) + ' min ago: ' + link);
      return;
    }
    // No usable exact fix — say so plainly rather than guess.
    sendAlert(' Location unavailable — please call to make sure they\'re okay.');
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        // A fresh but low-accuracy fix (WiFi/cell-tower based) is no more
        // trustworthy than one that failed outright — fall back the same way.
        if (pos.coords.accuracy > MAX_EXACT_ACCURACY_M) { useCachedLocationOrGiveUp(); return; }
        const link = 'https://maps.google.com/?q=' + pos.coords.latitude + ',' + pos.coords.longitude;
        sendAlert(' Exact location (±' + Math.round(pos.coords.accuracy) + 'm): ' + link);
      },
      useCachedLocationOrGiveUp,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } // maximumAge:0 forces a brand-new GPS fix instead of accepting a stale cached one — an emergency should always use the freshest, most exact position available
    );
  } else {
    useCachedLocationOrGiveUp();
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

// Populates the onboarding sex dropdown once, at load — separate from
// populatePassportSelects() (which only runs once the Passport screen is
// actually opened) since onboarding can show before that ever happens.
function populateOnboardingSex() {
  const el = document.getElementById('ob-sex');
  if (el) el.innerHTML = SEXES.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}
populateOnboardingSex();

// True when the form was opened via editPassportCard() (pre-filled with
// everything already saved) rather than left in its normal blank state.
let passportEditMode = false;

function savePassport() {
  const existing = JSON.parse(localStorage.getItem('passport') || '{}');
  const sexVal = document.getElementById('pp-sex').value;
  const bgVal = document.getElementById('pp-bloodgroup').value;
  const gtVal = document.getElementById('pp-genotype').value;
  const ageVal = document.getElementById('pp-age').value;
  const heightVal = document.getElementById('pp-height').value;
  const weightVal = document.getElementById('pp-weight').value;
  const allergiesVal = document.getElementById('pp-allergies').value.trim();
  const conditionsVal = document.getElementById('pp-conditions').value.trim();
  const historyVal = document.getElementById('pp-history').value.trim();
  const vaccinationsVal = document.getElementById('pp-vaccinations').value.trim();
  const physicianVal = document.getElementById('pp-physician').value.trim();
  const insuranceVal = document.getElementById('pp-insurance').value.trim();
  const emergencyVal = document.getElementById('pp-emergency').value.trim();

  let passport;
  if (passportEditMode) {
    // Editing the full card: the form was pre-filled with everything saved,
    // so what's in it now IS the intended full record — save it exactly as
    // shown, including any field the user deliberately cleared.
    passport = {
      sex: sexVal, age: ageVal, bloodGroup: bgVal, genotype: gtVal,
      allergies: allergiesVal, conditions: conditionsVal, history: historyVal,
      vaccinations: vaccinationsVal, height: heightVal, weight: weightVal,
      physician: physicianVal, insurance: insuranceVal, emergencyContact: emergencyVal
    };
  } else {
    // Quick add from the normal blank form: a blank field here means "I
    // didn't touch this one", so merge onto the existing record and only
    // overwrite fields the user actually filled in — never wipe the rest.
    passport = {
      sex: (sexVal && sexVal !== SEXES[0]) ? sexVal : existing.sex,
      age: ageVal || existing.age,
      bloodGroup: (bgVal && bgVal !== BLOOD_GROUPS[0]) ? bgVal : existing.bloodGroup,
      genotype: (gtVal && gtVal !== GENOTYPES[0]) ? gtVal : existing.genotype,
      allergies: allergiesVal || existing.allergies,
      conditions: conditionsVal || existing.conditions,
      history: historyVal || existing.history,
      vaccinations: vaccinationsVal || existing.vaccinations,
      height: heightVal || existing.height,
      weight: weightVal || existing.weight,
      physician: physicianVal || existing.physician,
      insurance: insuranceVal || existing.insurance,
      emergencyContact: emergencyVal || existing.emergencyContact
    };
  }

  localStorage.setItem('passport', JSON.stringify(passport));
  syncToFirestore({ passport: passport });
  // Clear the form back to blank once saved, whether this was a quick add
  // or a full edit — the saved details live on the passport card above,
  // not sitting exposed in the input fields.
  resetPassportForm();
  renderPassportCard();
  document.getElementById('pp-saved-note').textContent = '✓ Saved to your passport card above';
  setTimeout(function() { document.getElementById('pp-saved-note').textContent = ''; }, 2500);
}

// Wipes the entire passport record — all fields, the profile photo, and
// any kept document scans — both locally and in Firestore. Destructive
// and confirm-gated; there's no undo once this runs.
function deletePassport() {
  if (!confirm('Delete your entire Medical Passport? This removes all saved details, your passport photo, and any kept document scans. This cannot be undone.')) return;
  localStorage.removeItem('passport');
  localStorage.removeItem('passportPhoto');
  syncToFirestore({ passport: null });
  resetPassportForm();
  renderPassportCard();
  renderPassportPhotoPicker();
  if (window.SentraXPassportScan) window.SentraXPassportScan.renderGallery();
  const note = document.getElementById('pp-saved-note');
  if (note) {
    note.textContent = 'Passport deleted.';
    setTimeout(function () { note.textContent = ''; }, 2500);
  }
}

// Rebuilds the Sex/Blood Group/Genotype dropdowns (which also resets them
// to their first/default option) and blanks every text field, without
// touching what's already saved in localStorage.
function resetPassportForm() {
  passportEditMode = false;
  populatePassportSelects();
  ['pp-age', 'pp-allergies', 'pp-conditions', 'pp-history', 'pp-vaccinations',
   'pp-height', 'pp-weight', 'pp-physician', 'pp-insurance', 'pp-emergency'
  ].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const label = document.getElementById('pp-form-label');
  if (label) label.textContent = 'Add or update a detail';
  renderPassportPhotoPicker();
}

// Loads everything already saved into the form so the whole card can be
// reviewed and edited at once, instead of adding one detail at a time.
function editPassportCard() {
  const p = JSON.parse(localStorage.getItem('passport') || '{}');
  populatePassportSelects();
  passportEditMode = true;
  if (p.sex) document.getElementById('pp-sex').value = p.sex;
  document.getElementById('pp-age').value = p.age || '';
  if (p.bloodGroup) document.getElementById('pp-bloodgroup').value = p.bloodGroup;
  if (p.genotype) document.getElementById('pp-genotype').value = p.genotype;
  document.getElementById('pp-allergies').value = p.allergies || '';
  document.getElementById('pp-conditions').value = p.conditions || '';
  document.getElementById('pp-history').value = p.history || '';
  document.getElementById('pp-vaccinations').value = p.vaccinations || '';
  document.getElementById('pp-height').value = p.height || '';
  document.getElementById('pp-weight').value = p.weight || '';
  document.getElementById('pp-physician').value = p.physician || '';
  document.getElementById('pp-insurance').value = p.insurance || '';
  document.getElementById('pp-emergency').value = p.emergencyContact || '';
  document.getElementById('pp-saved-note').textContent = '';
  const label = document.getElementById('pp-form-label');
  if (label) label.textContent = 'Editing your passport — update or clear anything below';
  const sexField = document.getElementById('pp-sex');
  if (sexField) sexField.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderPassportPhotoPicker() {
  const box = document.getElementById('pp-photo-picker');
  if (!box) return;
  const photo = localStorage.getItem('passportPhoto');
  box.innerHTML =
    '<div class="pp-photo-upload">' +
      '<label class="pp-photo-preview" for="pp-photo-input">' +
        (photo ? '<img src="' + photo + '" alt="Passport photo">' : '🪪') +
      '</label>' +
      '<input type="file" id="pp-photo-input" accept="image/*" style="display:none;" onchange="handlePassportPhotoUpload(this)">' +
      '<div class="pp-photo-actions">' +
        '<label class="pp-photo-btn" for="pp-photo-input">' + (photo ? '📷 Change Photo' : '📷 Add Photo') + '</label>' +
      '</div>' +
    '</div>';
}

// Resizes/crops to a small square JPEG before storing, so the photo stays
// well under Firestore's per-document size limit and doesn't bloat localStorage.
function handlePassportPhotoUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      localStorage.setItem('passportPhoto', dataUrl);
      syncToFirestore({ passportPhoto: dataUrl });
      renderPassportCard();
      renderPassportPhotoPicker();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function renderPassport() {
  resetPassportForm();
  const note = document.getElementById('pp-saved-note');
  if (note) note.textContent = '';
  renderPassportCard();
  if (window.SentraXPassportScan) SentraXPassportScan.renderGallery();
}

// Compact summary card shown above the entry form. Tapping the name/blood
// group opens the full read-only overlay; the pencil opens the form
// pre-filled for editing.
function renderPassportCard() {
  const box = document.getElementById('passport-card-box');
  if (!box) return;
  const p = JSON.parse(localStorage.getItem('passport') || '{}');
  const hasData = p.sex || p.age || p.bloodGroup || p.genotype || p.allergies ||
    p.conditions || p.history || p.vaccinations || p.height || p.weight ||
    p.physician || p.insurance || p.emergencyContact;
  if (!hasData) {
    box.innerHTML = '<div class="empty" style="font-size:13px;">No medical passport saved yet — fill in a detail below and tap Save.</div>';
    return;
  }
  const name = localStorage.getItem('userName') || 'Sentra-X User';
  const subtitle = (p.bloodGroup && p.bloodGroup !== "Don't know" ? p.bloodGroup : 'Blood group not set') +
    (p.genotype && p.genotype !== "Don't know" ? ' • ' + p.genotype : '');
  const photo = localStorage.getItem('passportPhoto');
  box.innerHTML =
    '<div class="pp-card">' +
    '<div class="pp-card-icon" onclick="openPassportCardOverlay()">' + (photo ? '<img src="' + photo + '" alt="">' : '🪪') + '</div>' +
    '<div class="pp-card-info" onclick="openPassportCardOverlay()"><b>' + escapeHtml(name) + '</b><span>' + escapeHtml(subtitle) + '</span></div>' +
    '<button class="pp-card-edit" onclick="editPassportCard()" aria-label="Edit passport">✏️</button>' +
    '<div class="pp-card-arrow" onclick="openPassportCardOverlay()">→</div>' +
    '</div>';
}

let passportOverlayHistoryPushed = false;

// Full-detail read-only view — reuses the article/product reader overlay
// styling for a consistent look, with its own gradient cover + detail rows.
function openPassportCardOverlay() {
  const p = JSON.parse(localStorage.getItem('passport') || '{}');
  const name = localStorage.getItem('userName') || 'Sentra-X User';
  const meds = JSON.parse(localStorage.getItem('meds') || '[]');
  const medNames = meds.map(function (m) { return m.name; }).join(', ') || 'None listed';
  const photo = localStorage.getItem('passportPhoto');
  let overlay = document.getElementById('passport-card-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passport-card-overlay';
    document.body.appendChild(overlay);
  }
  function row(label, value) {
    return '<div class="pp-detail-row"><span class="pp-detail-label">' + label + '</span><span class="pp-detail-value">' + escapeHtml(value || 'Not listed') + '</span></div>';
  }
  overlay.innerHTML =
    '<button class="art-reader-back" onclick="closePassportCardOverlay()">←</button>' +
    '<div class="pp-card-cover"><div class="pp-card-cover-icon">' + (photo ? '<img src="' + photo + '" alt="">' : '🪪') + '</div><h2>' + escapeHtml(name) + '</h2><span class="art-reader-tag">Medical Passport</span></div>' +
    '<div class="art-reader-body">' +
    row('Sex', p.sex) +
    row('Age', p.age) +
    row('Blood Group', p.bloodGroup) +
    row('Genotype', p.genotype) +
    row('Allergies', p.allergies) +
    row('Chronic Conditions', p.conditions) +
    row('Medical History', p.history) +
    row('Vaccination History', p.vaccinations) +
    row('Height', p.height ? p.height + ' cm' : '') +
    row('Weight', p.weight ? p.weight + ' kg' : '') +
    row('Current Medications', medNames) +
    row('Primary Physician', p.physician) +
    row('Insurance', p.insurance) +
    row('Emergency Contact', p.emergencyContact) +
    '<div class="art-reader-footnote">Kept only in your account — never shared automatically. Use Print / Save as PDF or Generate QR Code below to share it yourself.</div>' +
    '</div>';
  history.pushState({ sxPassportOverlay: true }, '');
  passportOverlayHistoryPushed = true;
  overlay.style.display = 'block';
  overlay.scrollTop = 0;
}

function closePassportCardOverlay() {
  const overlay = document.getElementById('passport-card-overlay');
  if (overlay) overlay.style.display = 'none';
  if (passportOverlayHistoryPushed) {
    passportOverlayHistoryPushed = false;
    history.back();
  }
}

window.addEventListener('popstate', function () {
  const overlay = document.getElementById('passport-card-overlay');
  if (overlay && overlay.style.display === 'block') {
    overlay.style.display = 'none';
    passportOverlayHistoryPushed = false;
  }
});

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

// ---------------------------------------------------------------------
// Maternal & Child Health — new, separate module. Reads passport.sex to
// decide whether to show anything at all (nothing shown until sex is
// known and equals "Female"), and is opt-in even then. Uses its own
// localStorage key/Firestore field so it can never collide with or
// overwrite vitals, meds, caregiver, or passport data.
// ---------------------------------------------------------------------
function loadMaternalData() {
  return JSON.parse(localStorage.getItem('maternalData') || '{}');
}
function saveMaternalData(data) {
  localStorage.setItem('maternalData', JSON.stringify(data));
  syncToFirestore({ maternalData: data });
}

const ANTENATAL_DANGER_SIGNS = [
  'Heavy vaginal bleeding',
  'Severe headache with blurred vision',
  'Severe abdominal pain',
  'High fever',
  'Baby\u2019s movements stopped or slowed noticeably',
  'Fluid leaking or waters broken before due date',
  'Convulsions or fits'
];
const POSTNATAL_DANGER_SIGNS = [
  'Heavy vaginal bleeding (soaking more than one pad an hour)',
  'High fever or foul-smelling discharge',
  'Severe headache with blurred vision, or convulsions',
  'Baby is not feeding, unusually cold, or very lethargic',
  'Baby has a fever, fast/difficult breathing, or yellowing skin/eyes',
  'Severe abdominal pain or a swollen, painful leg'
];

// Decides whether the "Maternal & Child Health" item appears in the More
// menu at all — only when passport.sex is "Female". No dashboard card: it
// lives in More alongside First Aid/Passport/etc. so the homepage stays
// identical for everyone, and it never presumes an eligible user is
// currently pregnant or postnatal — it's just an available feature, opened
// only if she chooses to.
function renderMaternalCard() {
  const passport = JSON.parse(localStorage.getItem('passport') || '{}');
  const eligible = passport.sex === 'Female';
  const navBtn = document.getElementById('nav-maternal');
  if (navBtn) navBtn.style.display = eligible ? 'flex' : 'none';
}

function renderMaternalScreen() {
  const data = loadMaternalData();
  const optinBox = document.getElementById('maternal-optin-box');
  const trackBox = document.getElementById('maternal-tracking-box');
  if (!optinBox || !trackBox) return;

  if (!data.enabled) {
    optinBox.innerHTML =
      '<p style="color:#94a3b8;font-size:13px;">If you\u2019re currently pregnant or recently gave birth, turn this on for reminders and danger-sign guidance. Skip it if it doesn\u2019t apply to you right now — nothing else in the app changes either way.</p>' +
      '<label style="font-size:12px;color:#93c5fd;">Stage</label>' +
      '<select id="mat-stage">' +
        '<option value="antenatal">Currently pregnant (antenatal)</option>' +
        '<option value="postnatal">Recently gave birth (postnatal)</option>' +
      '</select>' +
      '<label style="font-size:12px;color:#93c5fd;" id="mat-date-label">Due date</label>' +
      '<input type="date" id="mat-date">' +
      '<button onclick="saveMaternalSetup()">Turn On Tracking</button>';
  } else {
    optinBox.innerHTML =
      '<label style="font-size:12px;color:#93c5fd;">Stage</label>' +
      '<select id="mat-stage">' +
        '<option value="antenatal"' + (data.stage !== 'postnatal' ? ' selected' : '') + '>Currently pregnant (antenatal)</option>' +
        '<option value="postnatal"' + (data.stage === 'postnatal' ? ' selected' : '') + '>Recently gave birth (postnatal)</option>' +
      '</select>' +
      '<label style="font-size:12px;color:#93c5fd;" id="mat-date-label">' + (data.stage === 'postnatal' ? 'Delivery date' : 'Due date') + '</label>' +
      '<input type="date" id="mat-date" value="' + (data.dueDate || '') + '">' +
      '<button onclick="saveMaternalSetup()">Update</button>' +
      '<button class="secondary" onclick="disableMaternalTracking()" style="margin-top:8px;color:#fca5a5;">Turn Off Tracking</button>';
  }

  const stageSelect = document.getElementById('mat-stage');
  if (stageSelect) {
    stageSelect.onchange = function () {
      document.getElementById('mat-date-label').textContent = stageSelect.value === 'postnatal' ? 'Delivery date' : 'Due date';
    };
  }

  if (!data.enabled) { trackBox.innerHTML = ''; return; }

  const signs = data.stage === 'postnatal' ? POSTNATAL_DANGER_SIGNS : ANTENATAL_DANGER_SIGNS;
  trackBox.innerHTML =
    '<div class="card">' +
      '<h3>\u26a0\ufe0f Danger Signs \u2014 Seek Care Immediately</h3>' +
      '<p style="color:#94a3b8;font-size:12px;margin-top:0;">General guidance only \u2014 not a substitute for a doctor or midwife.</p>' +
      '<div class="alert-banner">' +
        signs.map(function (s) { return '\u2022 ' + escapeHtml(s); }).join('<br>') +
      '</div>' +
      '<button class="sos" onclick="triggerSOS()">\ud83c\udd98 Emergency SOS Alert</button>' +
    '</div>';
}

function saveMaternalSetup() {
  const stage = document.getElementById('mat-stage').value;
  const dateVal = document.getElementById('mat-date').value;
  const data = { enabled: true, stage: stage, dueDate: dateVal };
  saveMaternalData(data);
  renderMaternalScreen();
  renderMaternalCard();
}

function disableMaternalTracking() {
  const data = loadMaternalData();
  data.enabled = false;
  saveMaternalData(data);
  renderMaternalScreen();
  renderMaternalCard();
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
  renderMaternalCard();
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
// Browsers won't let audio start playing without a user gesture having
// happened first in this session — without this, the alarm tone would
// silently fail to play when checkDueMeds() fires from the 60-second
// background timer rather than from a direct tap.
document.addEventListener('click', function unlockMedAlarmAudio() {
  playMedAlarmSound && (function () {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !medAlarmAudioCtx) medAlarmAudioCtx = new AudioCtx();
      if (medAlarmAudioCtx && medAlarmAudioCtx.state === 'suspended') medAlarmAudioCtx.resume();
    } catch (e) { /* best effort */ }
  })();
  document.removeEventListener('click', unlockMedAlarmAudio);
}, { once: true });

setInterval(checkDueMeds, 60000);

const AI_WORKER_URL = 'https://sentrax-ai.alecedoh1994.workers.dev/';
const AI_MAX_THREADS = 20;
const AI_MAX_MESSAGES_PER_THREAD = 40;

let aiThreads = [];
let currentAiThreadId = null;
let aiSendInFlight = false; // guards against overlapping sends (double-tap Send, repeated Enter, or voice+typing racing) causing multiple concurrent replies

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

const AI_WELCOME_FULL = "Hi, I'm your Sentra-X health assistant. Ask me anything about symptoms, medications, or general wellness — and remember, for emergencies always call 0800 220 0223.";
const AI_WELCOME_BACK_VARIANTS = [
  "Welcome back — what's up?",
  "Good to see you again. What's on your mind?",
  "I'm here — go ahead.",
  "Back again? What can I help with today?",
  "Hey, picking back up — what do you need?"
];

function renderAiWelcome() {
  const log = document.getElementById('ai-chat-log');
  log.innerHTML = '';
  const thread = getCurrentAiThread();
  if (thread.messages.length === 0) {
    appendAiMessage('bot', AI_WELCOME_FULL);
  } else {
    thread.messages.forEach(function (m) { appendAiMessage(m.role === 'user' ? 'user' : 'bot', m.content); });
    const variant = AI_WELCOME_BACK_VARIANTS[Math.floor(Math.random() * AI_WELCOME_BACK_VARIANTS.length)];
    appendAiMessage('bot', variant);
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

// Summarizes the user's actual in-app health data so the AI coach can give
// answers grounded in their real situation instead of purely generic advice.
// Kept short and label:value style (not prose) to stay cheap on tokens.
function buildAiHealthContext() {
  const parts = [];
  const condition = localStorage.getItem('userCondition');
  if (condition) parts.push('Known condition: ' + condition);

  const vitals = JSON.parse(localStorage.getItem('vitals') || '[]');
  if (vitals.length > 0) {
    const v = vitals[0];
    parts.push('Latest BP reading: ' + v.sys + '/' + v.dia + ' (' + v.level + ')' + (v.hr ? ', HR ' + v.hr : ''));
  }

  const meds = JSON.parse(localStorage.getItem('meds') || '[]').filter(isMedActive);
  if (meds.length > 0) {
    parts.push('Current medications: ' + meds.map(function (m) { return m.name + ' at ' + m.time; }).join(', '));
    const medLogs = JSON.parse(localStorage.getItem('medLogs') || '{}');
    const adherence = getWeeklyAdherencePct(meds, medLogs);
    if (adherence !== null) parts.push('7-day medication adherence: ' + adherence + '%');
  }

  const streak = localStorage.getItem('streak');
  if (streak) parts.push('Current daily check-in streak: ' + streak + ' day(s)');

  if (parts.length === 0) return '';
  return 'Here is this user\'s current in-app health data — use it to personalize your answer when relevant, but do not recite it back verbatim unless asked: ' + parts.join('. ') + '.';
}

function sendAiMessage() {
  if (aiSendInFlight) return; // a reply is already being generated — ignore extra taps/enters/voice-sends until it lands
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  aiSendInFlight = true;
  document.dispatchEvent(new CustomEvent('sentrax-ai-send-started'));
  const sendBtn = document.getElementById('ai-send-btn');
  if (sendBtn) sendBtn.disabled = true;

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

  const SENTRAX_IDENTITY = 'You are the Sentra-X Health Assistant, built and provided by Sentra-X (SentraX Forte Limited). If asked who made you, what AI or model you are, or who owns/built you, always answer that you are Sentra-X\'s in-app health assistant — never name any other company, AI lab, or underlying model/technology.';
  const healthContext = buildAiHealthContext();
  const systemMessages = [{ role: 'system', content: SENTRAX_IDENTITY }];
  if (healthContext) systemMessages.push({ role: 'system', content: healthContext });
  fetch(AI_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: systemMessages.concat(thread.messages.slice(-24)) }),
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
          // True only while the reply we're streaming is still the thread
          // actually on screen. If the person switched to a different
          // conversation (or started a new one) mid-stream, openAiThread /
          // startNewAiChat already cleared #ai-chat-log — this typingEl node
          // is detached at that point, so writing to it would be invisible
          // anyway. The reply itself is never lost either way: it's still
          // saved into the correct thread's history below regardless.
          const stillVisible = currentAiThreadId === thread.id && document.body.contains(typingEl);

          if (result.done) {
            clearTimeout(timeoutId);
            const cleaned = cleanAiMarkdown(fullText).trim();
            if (cleaned) {
              // Only a genuine reply gets saved into history. A failure
              // notice is UI-only — saving it as a fake "assistant" turn
              // would get resent as context on the next message, so one
              // failed reply would otherwise poison every message after it
              // in the same thread.
              if (stillVisible) typingEl.textContent = cleaned;
              thread.messages.push({ role: 'assistant', content: cleaned });
              thread.updatedAt = Date.now();
              saveAiThreads();
              if (stillVisible) document.dispatchEvent(new CustomEvent('sentrax-ai-reply-done', { detail: { text: cleaned } }));
            } else if (stillVisible) {
              const failText = "Sorry, I couldn't generate a response just now.";
              typingEl.textContent = failText;
              document.dispatchEvent(new CustomEvent('sentrax-ai-reply-done', { detail: { text: failText } }));
            }
            aiSendInFlight = false;
            if (sendBtn) sendBtn.disabled = false;
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
              // Different Workers AI models (and OpenAI-compatible wrappers) stream
              // chunks in different shapes. Rather than betting on one field name,
              // check every plausible location a text delta could be sitting in —
              // whichever one actually has content wins. This is additive only:
              // it can't misfire on a genuine chunk, since at most one of these
              // paths will ever hold a non-empty string for a given payload.
              const choice = parsed.choices && parsed.choices[0];
              const rawDelta = choice && choice.delta;
              const rawToken = parsed.token;
              const delta =
                (typeof parsed.response === 'string' && parsed.response) ||
                (parsed.result && typeof parsed.result.response === 'string' && parsed.result.response) ||
                (rawDelta && typeof rawDelta.content === 'string' && rawDelta.content) ||
                (choice && typeof choice.text === 'string' && choice.text) ||
                (choice && choice.message && typeof choice.message.content === 'string' && choice.message.content) ||
                (typeof parsed.delta === 'string' && parsed.delta) ||
                (parsed.delta && typeof parsed.delta.content === 'string' && parsed.delta.content) ||
                (typeof parsed.content === 'string' && parsed.content) ||
                (typeof parsed.text === 'string' && parsed.text) ||
                (typeof rawToken === 'string' && rawToken) ||
                (rawToken && typeof rawToken.text === 'string' && rawToken.text) ||
                '';
              if (delta) {
                fullText += delta;
                sawAnyChunk = true;
                if (stillVisible) {
                  typingEl.textContent = fullText;
                  document.getElementById('ai-chat-log').scrollTop = document.getElementById('ai-chat-log').scrollHeight;
                }
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
      // A TypeError here means the request never even reached a server —
      // no network, DNS failure, or the worker's CORS headers rejecting the
      // request outright. That's always a raw, technical browser string
      // ("Failed to fetch", "NetworkError when attempting to fetch
      // resource.") — never something to show the person as if the
      // assistant "said" it. Only err.message from our OWN thrown Errors
      // above (the worker's JSON error body, or "Server error (status)")
      // is ever safe to surface directly.
      const friendly = err.name === 'AbortError'
        ? "That's taking a while — the assistant might be busy right now. Please try again."
        : (err instanceof TypeError)
          ? "Sorry, the assistant isn't available right now. Please try again in a moment."
          : (err.message && err.message.length < 140 ? err.message : "Sorry, the assistant isn't available right now. Please try again in a moment.");
      typingEl.textContent = friendly;
      document.dispatchEvent(new CustomEvent('sentrax-ai-reply-done', { detail: { text: friendly } }));
      aiSendInFlight = false;
      if (document.getElementById('ai-send-btn')) document.getElementById('ai-send-btn').disabled = false;
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
const HR_BRADY_BPM = 60; // standard clinical bradycardia threshold — was 50, which meant a resting rate of 50-59 bpm (a real bradycardia range) never triggered the prompt
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
