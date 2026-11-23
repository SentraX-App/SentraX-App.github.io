const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID;
const smsAllowance = require('./sms-allowance.cjs');   // monthly SMS allowance by plan; email is never limited

console.log('Diagnostic - EMAILJS_SERVICE_ID present:', !!EMAILJS_SERVICE_ID, 'length:', (EMAILJS_SERVICE_ID || '').length);
console.log('Diagnostic - EMAILJS_TEMPLATE_ID present:', !!EMAILJS_TEMPLATE_ID, 'length:', (EMAILJS_TEMPLATE_ID || '').length);
console.log('Diagnostic - EMAILJS_PUBLIC_KEY present:', !!EMAILJS_PUBLIC_KEY, 'length:', (EMAILJS_PUBLIC_KEY || '').length);
console.log('Diagnostic - EMAILJS_PRIVATE_KEY present:', !!EMAILJS_PRIVATE_KEY, 'length:', (EMAILJS_PRIVATE_KEY || '').length);
console.log('Diagnostic - TERMII_API_KEY present:', !!TERMII_API_KEY, 'length:', (TERMII_API_KEY || '').length);
console.log('Diagnostic - TERMII_SENDER_ID present:', !!TERMII_SENDER_ID, 'value:', TERMII_SENDER_ID || '(not set — falling back to the unregistered "Termii" demo sender)');

// Nigeria is UTC+1 (WAT), no daylight saving. GitHub Actions runs in UTC,
// so we shift "now" forward by 60 minutes to match the local time patients enter.
const NIGERIA_OFFSET_MINUTES = 60;

// How many minutes a medication can be overdue before we alert the caregiver.
// Single source of truth — do not hardcode this number elsewhere.
const REMINDER_DELAY_MINUTES = 10;

function localDateStr(d) {
  // This runs server-side (firebase-admin), so getFullYear()/getMonth()
  // would reflect THIS PROCESS's own configured timezone — almost always
  // UTC on a cloud runtime — not any individual user's timezone. That's a
  // different problem than the client-side version of this same fix.
  // Every current user is in Nigeria (UTC+1, no DST), so that offset is
  // applied explicitly here rather than trusting the server's own TZ
  // setting, or assuming it happens to already be UTC+1.
  // NOTE: if users outside Nigeria are ever added, this needs to become
  // per-user (store each user's UTC offset and apply it here per record)
  // instead of one hardcoded offset for everyone.
  d = d || new Date();
  const NIGERIA_UTC_OFFSET_MS = 60 * 60 * 1000;
  const nigeriaTime = new Date(d.getTime() + NIGERIA_UTC_OFFSET_MS);
  return nigeriaTime.toISOString().split('T')[0];
}
function todayStr() {
  return localDateStr();
}

function nowMinutesNigeria() {
  const now = new Date();
  return ((now.getUTCHours() * 60 + now.getUTCMinutes()) + NIGERIA_OFFSET_MINUTES) % 1440;
}

function timeToMinutes(t) {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}


// ---------------------------------------------------------------------------
// Should this medicine be allowed to alert a caregiver right now?
// One strict rule set, so an old, expired, deleted-looking or just-added medicine can never send an alert.
// Returns { alert: true } or { alert: false, why: '...' } (the reason is logged so a surprise alert can be traced).
// ---------------------------------------------------------------------------
const STALE_AFTER_MINUTES = 180;   // a dose more than 3 hours late is not an actionable "just missed it" alert

function nigeriaDateOf(ms) {
  const d = new Date(ms + NIGERIA_OFFSET_MINUTES * 60000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function nigeriaMinutesOf(ms) {
  const d = new Date(ms + NIGERIA_OFFSET_MINUTES * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function addDaysStr(dateStr, days) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function medAlertDecision(med, todayStrNow, nowMin, nowMs) {
  if (!med || !med.id || !med.time || !/^\d{1,2}:\d{2}$/.test(String(med.time))) return { alert: false, why: 'bad record' };
  const created = Number(med.createdAt) || parseInt(med.id, 10) || 0;
  // 1. Expiry. Same rule as the app: a duration counts from the start date; with no duration the medicine lasts 1 hour.
  const startStr = (typeof med.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(med.startDate)) ? med.startDate : (created ? nigeriaDateOf(created) : null);
  if (med.durationDays && Number(med.durationDays) > 0) {
    if (!startStr) return { alert: false, why: 'no start date, cannot prove it is active' };
    const endStr = addDaysStr(startStr, Math.round(Number(med.durationDays)));
    if (todayStrNow >= endStr) return { alert: false, why: 'expired on ' + endStr };
  } else {
    if (!created) return { alert: false, why: 'no duration and no creation time' };
    if (nowMs - created > 60 * 60 * 1000) return { alert: false, why: 'short-term medicine expired' };
  }
  // 2. A medicine that does not start until a later day must stay silent.
  if (startStr && todayStrNow < startStr) return { alert: false, why: 'starts later' };
  // 3. A medicine added after today's dose time could not have been taken on time: its first alert is tomorrow.
  if (created && nigeriaDateOf(created) === todayStrNow && nigeriaMinutesOf(created) >= timeToMinutes(med.time)) return { alert: false, why: 'added after today\'s dose time' };
  // 4. Overdue enough, but not stale.
  const overdueBy = nowMin - timeToMinutes(med.time);
  if (overdueBy < REMINDER_DELAY_MINUTES) return { alert: false, why: 'not overdue yet' };
  if (overdueBy > STALE_AFTER_MINUTES) return { alert: false, why: 'too late to be useful (' + overdueBy + ' min)' };
  return { alert: true };
}

async function sendEmail(toEmail, patientName, caregiverName, alertMessage) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: toEmail,
          patient_name: patientName,
          caregiver_name: caregiverName || 'there',
          alert_message: alertMessage
        }
      })
    });
    const text = await res.text();
    console.log('Email result:', res.status, text);
    return res.ok;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

function getWeeklyStats(data) {
  const vitals = data.vitals || [];
  const meds = data.meds || [];
  const medLogs = data.medLogs || {};
  const weekAgo = Date.now() - 7 * 86400000;

  const weekVitals = vitals.filter(function(v) {
    return new Date(v.dateISO || v.date).getTime() >= weekAgo;
  });

  let avgText = 'No readings logged this week';
  if (weekVitals.length > 0) {
    const avgSys = Math.round(weekVitals.reduce(function(s, v) { return s + v.sys; }, 0) / weekVitals.length);
    const avgDia = Math.round(weekVitals.reduce(function(s, v) { return s + v.dia; }, 0) / weekVitals.length);
    avgText = avgSys + '/' + avgDia + ' average across ' + weekVitals.length + ' reading' + (weekVitals.length > 1 ? 's' : '');
  }

  let adherenceText = 'No medications on file';
  if (meds.length > 0) {
    let totalPossible = 0, totalTaken = 0;
    for (let i = 0; i < 7; i++) {
      const d = localDateStr(new Date(Date.now() - i * 86400000));
      const dayLog = medLogs[d] || {};
      meds.forEach(function(m) {
        totalPossible++;
        if (dayLog[m.id]) totalTaken++;
      });
    }
    const pct = totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) : 0;
    adherenceText = pct + '% of doses taken this week';
  }

  return 'This week: ' + avgText + '. Medication adherence: ' + adherenceText + '. Current streak: ' + (data.streak || 0) + ' days.';
}

async function maybeSendWeeklyDigest(doc) {
  const data = doc.data();
  const uid = doc.id;
  if (!data.cgEmail) return;

  const now = new Date();
  const nigeriaNow = new Date(now.getTime() + NIGERIA_OFFSET_MINUTES * 60000);
  const isSunday = nigeriaNow.getUTCDay() === 0;
  const isEveningWindow = nigeriaNow.getUTCHours() === 18; // 6pm Nigeria time
  const today = todayStr();

  if (!isSunday || !isEveningWindow) return;
  if (data.lastDigestSent === today) return;

  const summary = getWeeklyStats(data);
  const ok = await sendEmail(
    data.cgEmail,
    data.userName || 'Your loved one',
    data.cgName,
    'Weekly summary for ' + (data.userName || 'your loved one') + ': ' + summary
  );
  if (ok) {
    await db.collection('users').doc(uid).set({ lastDigestSent: today }, { merge: true });
  }
}

async function sendSMS(toPhone, message) {
  if (!TERMII_API_KEY) { console.log('SMS skipped: TERMII_API_KEY not set.'); return false; }
  if (!toPhone) { console.log('SMS skipped: no caregiver phone number on file.'); return false; }
  let digits = toPhone.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '234' + digits.slice(1);
  if (!digits.startsWith('234')) digits = '234' + digits;
  try {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: digits,
        from: TERMII_SENDER_ID || 'Termii',
        sms: message,
        type: 'plain',
        channel: 'dnd' // was 'generic' — see sentrax-sos-sms.js's comment for why
      })
    });
    const text = await res.text();
    console.log('SMS result:', res.status, text);
    return res.ok;
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return false;
  }
}

async function checkUser(doc) {
  const data = doc.data();
  const uid = doc.id;
  if (!data.cgEmail && !data.cgPhone) return; // no alert channel on file at all

  await maybeSendWeeklyDigest(doc);

  const today = todayStr();
  const nowMin = nowMinutesNigeria();
  const updates = {};

  const meds = data.meds || [];
  const medLogs = data.medLogs || {};
  const todayLog = medLogs[today] || {};
  const medAlertsSent = data.medAlertsSent || {};

  for (const med of meds) {
    if (todayLog[med.id]) continue;
    const decision = medAlertDecision(med, today, nowMin, Date.now());
    if (!decision.alert) { if (decision.why !== 'not overdue yet') console.log('Skip medicine alert:', med && med.name, '-', decision.why); continue; }
    const overdueBy = nowMin - timeToMinutes(med.time);
    const key = med.id + '_' + today;
    if (overdueBy >= REMINDER_DELAY_MINUTES && !medAlertsSent[key]) {
      const medMessage = (data.userName || 'Your loved one') + ' has not taken their medication "' + med.name + '" (due at ' + med.time + '). It has been overdue for over ' + REMINDER_DELAY_MINUTES + ' minutes.';
      let emailOk = true, smsOk = true;
      if (data.cgEmail) emailOk = await sendEmail(data.cgEmail, data.userName || 'Your loved one', data.cgName, medMessage);
      if (data.cgPhone) {
        const gate = await smsAllowance.canSendAlertSms(db, uid, 'meds');
        if (gate.ok) { smsOk = await sendSMS(data.cgPhone, 'SentraX Alert: ' + medMessage); if (smsOk) await smsAllowance.recordAlertSms(db, uid); }
        else console.log('SMS skipped, monthly allowance used (' + gate.used + '/' + gate.limit + ', ' + gate.plan + '):', uid);   // smsOk stays true: the alert counts as sent, and the email is not repeated
      }
      if (emailOk && smsOk) {
        medAlertsSent[key] = true;
        updates.medAlertsSent = medAlertsSent;
      }
    }
  }

  const vitals = data.vitals || [];
  if (vitals.length > 0) {
    const latest = vitals[0];
    if (latest.severity >= 3 && data.lastBpAlertISO !== latest.dateISO) {
      const bpMessage = (data.userName || 'Your loved one') + "'s blood pressure just read " + latest.sys + '/' + latest.dia + ' (' + latest.level + '). Please check on them as soon as possible.';
      let emailOk = true, smsOk = true;
      if (data.cgEmail) emailOk = await sendEmail(data.cgEmail, data.userName || 'Your loved one', data.cgName, bpMessage);
      if (data.cgPhone) {
        const gate = await smsAllowance.canSendAlertSms(db, uid, 'bp');   // 'bp' also has a small safety reserve after the allowance
        if (gate.ok) { smsOk = await sendSMS(data.cgPhone, 'SentraX Alert: ' + bpMessage); if (smsOk) await smsAllowance.recordAlertSms(db, uid); }
        else console.log('SMS skipped, monthly allowance and reserve used (' + gate.used + '/' + gate.limit + ', ' + gate.plan + '):', uid);
      }
      if (emailOk && smsOk) {
        updates.lastBpAlertISO = latest.dateISO;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.collection('users').doc(uid).set(updates, { merge: true });
  }
}

async function main() {
  const snapshot = await db.collection('users').get();
  console.log('Scanning', snapshot.size, 'users...');
  for (const doc of snapshot.docs) {
    try {
      await checkUser(doc);
    } catch (err) {
      console.error('Error checking user', doc.id, err);
    }
  }
  console.log('Check complete.');
}

main().then(function() { process.exit(0); }).catch(function(err) { console.error(err); process.exit(1); });
