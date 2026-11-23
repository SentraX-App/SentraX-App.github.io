/*
 * sms-allowance.cjs: monthly SMS allowance for AUTOMATIC caregiver alerts (missed medicine, high blood pressure).
 *
 * Why: every automatic alert costs a real SMS (Termii). One person with several medicines can trigger several SMS a day, and a failed
 * send is retried on every run. This gives each person a monthly allowance that depends on their Doctor Care plan.
 *
 *   Free 10 a month | Normal 40 | Duo 50 each | Family 60 each
 *
 * What is NEVER limited: caregiver EMAIL, the SOS button, WhatsApp, and the emergency call button.
 * Safety reserve: a high blood pressure alert may still send up to CRITICAL_RESERVE extra SMS a month after the allowance is used up,
 * so a genuine emergency reading is never held back by a counter.
 *
 * Runs server-side with the Firebase Admin SDK, so it reads /entitlements (which people cannot write) and keeps its own counter in
 * /smsUsage/{uid} (which people can read but not write; see firestore.rules). It cannot be bypassed from the app.
 *
 * Use (check-alerts.js does this; the live sentrax-alert-checker Worker needs the same two calls around its SMS send):
 *   const gate = await canSendAlertSms(db, uid, 'bp');         // kind: 'meds' or 'bp'
 *   if (gate.ok) { const sent = await sendSMS(...); if (sent) await recordAlertSms(db, uid); }
 */
'use strict';

const ALERT_LIMITS = { free: 10, normal: 40, duo: 50, family: 60 };
const CRITICAL_RESERVE = 5;

// Nigeria is UTC+1 all year, so the month rolls over at local midnight.
function monthKey(now) { return new Date((now || Date.now()) + 3600000).toISOString().slice(0, 7); }
function isActive(e, now) { return !!(e && e.status === 'active' && e.expiresAt > (now || Date.now())); }

// 'free', or the plan id when this person is covered by their own active plan or by a Duo/Family plan that lists them.
async function planOf(db, uid, now) {
  const own = await db.collection('entitlements').doc(uid).get();
  if (own.exists && isActive(own.data(), now) && ALERT_LIMITS[own.data().plan]) return own.data().plan;
  const link = await db.collection('memberOf').doc(uid).get();
  if (link.exists && link.data().ownerUid) {
    const owner = await db.collection('entitlements').doc(link.data().ownerUid).get();
    if (owner.exists && isActive(owner.data(), now) && (owner.data().memberUids || []).indexOf(uid) !== -1 && ALERT_LIMITS[owner.data().plan]) return owner.data().plan;
  }
  return 'free';
}

async function canSendAlertSms(db, uid, kind, now) {
  const plan = await planOf(db, uid, now);
  const limit = ALERT_LIMITS[plan];
  const snap = await db.collection('smsUsage').doc(uid).get();
  const d = snap.exists ? snap.data() : {};
  const used = d.month === monthKey(now) ? (d.alerts || 0) : 0;
  const reserve = kind === 'bp' ? CRITICAL_RESERVE : 0;
  return { ok: used < limit + reserve, plan: plan, used: used, limit: limit, usingReserve: used >= limit };
}

// Call only after an SMS was really sent, so a failed send never uses up the allowance.
async function recordAlertSms(db, uid, now) {
  const ref = db.collection('smsUsage').doc(uid), mk = monthKey(now);
  return db.runTransaction(async function (tx) {
    const s = await tx.get(ref), d = s.exists ? s.data() : {};
    tx.set(ref, { month: mk, alerts: (d.month === mk ? (d.alerts || 0) : 0) + 1, updatedAt: now || Date.now() }, { merge: true });
  });
}

module.exports = { ALERT_LIMITS, CRITICAL_RESERVE, monthKey, planOf, canSendAlertSms, recordAlertSms };
