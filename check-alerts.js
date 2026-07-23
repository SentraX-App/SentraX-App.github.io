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

console.log('Diagnostic - EMAILJS_SERVICE_ID present:', !!EMAILJS_SERVICE_ID, 'length:', (EMAILJS_SERVICE_ID || '').length);
console.log('Diagnostic - EMAILJS_TEMPLATE_ID present:', !!EMAILJS_TEMPLATE_ID, 'length:', (EMAILJS_TEMPLATE_ID || '').length);
console.log('Diagnostic - EMAILJS_PUBLIC_KEY present:', !!EMAILJS_PUBLIC_KEY, 'length:', (EMAILJS_PUBLIC_KEY || '').length);
console.log('Diagnostic - EMAILJS_PRIVATE_KEY present:', !!EMAILJS_PRIVATE_KEY, 'length:', (EMAILJS_PRIVATE_KEY || '').length);
console.log('Diagnostic - TERMII_API_KEY present:', !!TERMII_API_KEY, 'length:', (TERMII_API_KEY || '').length);

// Nigeria is UTC+1 (WAT), no daylight saving. GitHub Actions runs in UTC,
// so we shift "now" forward by 60 minutes to match the local time patients enter.
const NIGERIA_OFFSET_MINUTES = 60;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function nowMinutesNigeria() {
  const now = new Date();
  return ((now.getUTCHours() * 60 + now.getUTCMinutes()) + NIGERIA_OFFSET_MINUTES) % 1440;
}

function timeToMinutes(t) {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
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
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
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
        from: 'N-Alert',
        sms: message,
        type: 'plain',
        channel: 'generic'
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
  if (!data.cgEmail) return;

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
    const scheduledTodayISO = today + 'T' + med.time + ':00';
    if (med.stopped && med.stoppedAt && new Date(med.stoppedAt) < new Date(scheduledTodayISO)) continue;
    const overdueBy = nowMin - timeToMinutes(med.time);
    const key = med.id + '_' + today;
    if (overdueBy >= 30 && !medAlertsSent[key]) {
      const medMessage = (data.userName || 'Your loved one') + ' has not taken their medication "' + med.name + '" (due at ' + med.time + '). It has been overdue for over 30 minutes.';
      const ok = await sendEmail(data.cgEmail, data.userName || 'Your loved one', data.cgName, medMessage);
      if (data.cgPhone) await sendSMS(data.cgPhone, 'SentraX Alert: ' + medMessage);
      if (ok) {
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
      const ok = await sendEmail(data.cgEmail, data.userName || 'Your loved one', data.cgName, bpMessage);
      if (data.cgPhone) await sendSMS(data.cgPhone, 'SentraX Alert: ' + bpMessage);
      if (ok) {
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
