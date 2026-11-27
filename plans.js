/* Sentra Care: paid doctor-chat plans.
 *
 * Everything here is ADDITIVE. No existing screen, feature or data is locked or changed: free users keep every feature they have today,
 * and the marketplace, Sentra Quest, rewards and article ads are untouched. If anything in this file fails (offline, rules not deployed,
 * Paystack blocked) the person simply stays on the free app.
 *
 * Money safety: a person can never grant themselves a plan. Plans live in /entitlements, which only an admin account can write
 * (see firestore.rules). A payment is recorded as a pending /paymentClaims document; the doctor dashboard (doctor.html) confirms it
 * against the Paystack dashboard and then activates the plan, exactly like marketplace orders are confirmed today.
 */
(function () {
  'use strict';

  var PAYSTACK_PUBLIC_KEY = 'pk_live_a6b2acb7e65e0b4eb742f559d1ce231345df3e8d';   // same public key the marketplace uses
  var PERIOD_DAYS = 30;                   // one payment = 30 days of access
  var DOCTOR = { name: 'Dr Isaac', role: 'Pioneer doctor, Sentra-X' };

  var PLANS = {
    normal: { id: 'normal', name: 'Normal', who: 'For one person',        seats: 1, price: 2000 },
    duo:    { id: 'duo',    name: 'Duo',    who: 'For a pair',             seats: 2, price: 3000, promoPrice: 1500, promoLimit: 5 },
    family: { id: 'family', name: 'Family', who: 'For your whole family',  seats: 6, price: 6000 }
  };
  var ORDER = ['normal', 'duo', 'family'];

  var FREE_AI_PER_DAY = 5;          // free Health Assistant questions per day
  var FREE_SCANS_PER_MONTH = 2;     // free document scans per month
  var ENT_CACHE = 'sxcare_ent_cache', USE_KEY = 'sxcare_use_v1';
  // Caregiver SMS costs real money, so it has a monthly allowance by plan (Duo and Family: per person). Email, WhatsApp, the emergency call
  // button and the state emergency line are never limited. Keep ALERT_SMS in step with ALERT_LIMITS in sms-allowance.js (server side).
  var SOS_SMS = { free: 6, normal: 20, duo: 25, family: 30 };
  var ALERT_SMS = { free: 10, normal: 40, duo: 50, family: 60 };

  var INCLUDED = [
    'Chat with a Sentra-X doctor inside the app',
    'Unlimited Health Assistant questions',
    'Unlimited document scans to fill in your Passport',
    'A doctor-ready health report to print or save as PDF',
    'More caregiver SMS every month',
    'Share your readings with the doctor, only if you choose'
  ];
  var STAYS_FREE = ['Blood pressure and camera heart-rate checks', 'Medicines and reminders', 'History, trends and weekly summary', 'Emergency SOS and caregiver alerts',
    'First Aid, Maternal & Child and your Passport', 'Health Library, Marketplace, Move & Play and Rewards'];

  var st = { user: null, ent: null, active: false, isOwner: false, promoLeft: 0, pending: null, view: 'home', loaded: false, poll: null, chatUnsub: null, badgeUnsub: null, busy: false, notice: '' };

  function db() { return firebase.firestore(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return '\u20A6' + Number(n).toLocaleString('en-NG'); }
  function fmtDate(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtTime(ms) { return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function root() { return document.getElementById('care-root'); }
  function myName() {
    var u = st.user; if (!u) return 'Patient';
    var n = ''; try { n = localStorage.getItem('userName') || ''; } catch (_e) { /* storage blocked */ }
    return (n || u.displayName || (u.email || '').split('@')[0] || 'Patient').slice(0, 60);
  }
  function daysLeft(e) { return e ? Math.ceil((e.expiresAt - Date.now()) / 86400000) : 0; }
  function activeOf(e) { return !!(e && e.status === 'active' && e.expiresAt > Date.now()); }
  function priceFor(id) {
    // The launch price is for a first purchase only, never for a renewal.
    if (id === 'duo' && !st.ent && st.promoLeft > 0) return PLANS.duo.promoPrice;
    return PLANS[id].price;
  }

  /* ---------------- loading ---------------- */
  function load() {
    var u = st.user; if (!u) return Promise.resolve();
    var d = db();
    var ERR = { err: true };
    var own = d.collection('entitlements').doc(u.uid).get().catch(function () { return ERR; });
    var member = d.collection('memberOf').doc(u.uid).get().catch(function () { return ERR; });
    var promo = d.collection('promos').doc('duo').get().catch(function () { return null; });
    var pend = d.collection('paymentClaims').where('uid', '==', u.uid).where('status', '==', 'pending').get().catch(function () { return null; });
    var smsDoc = d.collection('smsUsage').doc(u.uid).get().catch(function () { return null; });
    return Promise.all([own, member, promo, pend, smsDoc]).then(function (r) {
      var ownSnap = r[0], memSnap = r[1], promoSnap = r[2], pendSnap = r[3];
      if (ownSnap === ERR || memSnap === ERR) { useCache(); return; }   // offline or blocked: keep the last known plan instead of dropping a paying user to free
      st.lastLoad = Date.now();
      var sd = r[4]; st.alertUsed = (sd && sd.exists && sd.data().month === new Date().toISOString().slice(0, 7)) ? (sd.data().alerts || 0) : null;
      var ent = ownSnap && ownSnap.exists ? ownSnap.data() : null;
      var next = ent ? Promise.resolve(ent) : (memSnap && memSnap.exists ? d.collection('entitlements').doc(memSnap.data().ownerUid).get().then(function (s) { return s.exists ? s.data() : null; }).catch(function () { return null; }) : Promise.resolve(null));
      return next.then(function (e) {
        st.ent = e; st.isOwner = !!(e && e.ownerUid === u.uid); st.active = activeOf(e);
        var p = promoSnap && promoSnap.exists ? promoSnap.data() : null;
        st.promoLeft = p ? Math.max(0, (p.limit || 0) - (p.claimed || 0)) : 0;
        st.pending = null;
        if (pendSnap && !pendSnap.empty) { pendSnap.forEach(function (x) { if (!st.pending) st.pending = x.data(); }); }
        st.loaded = true; cacheEnt();
      });
    });
  }
  function cacheEnt() {
    try { localStorage.setItem(ENT_CACHE, JSON.stringify({ uid: st.user.uid, ent: st.ent ? { plan: st.ent.plan, status: st.ent.status, expiresAt: st.ent.expiresAt, ownerUid: st.ent.ownerUid, seats: st.ent.seats } : null })); } catch (_e) { /* storage blocked */ }
  }
  function useCache() {
    var c = null; try { c = JSON.parse(localStorage.getItem(ENT_CACHE) || 'null'); } catch (_e) { c = null; }
    if (c && st.user && c.uid === st.user.uid && c.ent) { st.ent = c.ent; st.isOwner = c.ent.ownerUid === st.user.uid; st.active = activeOf(c.ent); }
    st.loaded = true;
  }

  /* ---------------- rendering ---------------- */
  function render() {
    var el = root(); if (!el) return;
    if (!st.user) { el.innerHTML = '<div class="card care-empty"><h3>Doctor Care</h3><p>Please sign in to chat with a doctor.</p></div>'; return; }
    if (!st.loaded) { el.innerHTML = '<div class="care-loading"><div class="care-spin"></div>Loading your plan\u2026</div>'; return; }
    if (st.view === 'chat') { renderChatShell(); return; }
    var h = '';
    if (st.notice) h += '<div class="care-note">' + esc(st.notice) + '</div>';
    h += heroHtml();
    if (st.pending) h += pendingHtml();
    if (st.ent && st.active) h += activeHtml();
    else {
      if (st.ent) h += expiredHtml();
      h += plansHtml();
      h += freeHtml();
    }
    h += '<p class="care-legal">Doctor chat gives general health guidance based on what you share. It is not for emergencies and does not replace an in-person examination. <a href="terms.html">Terms</a> \u00B7 <a href="privacy.html">Privacy</a></p>';
    el.innerHTML = h;
  }

  function freeHtml() {
    function row(k, v) { return '<div class="care-allow-row"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }
    return '<div class="card care-free"><h3>Still free for everyone</h3><ul class="care-list care-list-free">' + STAYS_FREE.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<div class="care-allow"><div class="care-allow-title">Free allowances</div>' + row('Health Assistant', FREE_AI_PER_DAY + ' questions a day') + row('Document scan', FREE_SCANS_PER_MONTH + ' a month') +
      row('Caregiver SMS', SOS_SMS.free + ' for SOS, ' + ALERT_SMS.free + ' for alerts') +
      '<div class="care-allow-note">Caregiver email, WhatsApp and the emergency call button are always free.</div></div></div>';
  }

  function heroHtml() {
    var doc = '<div class="care-doc"><div class="care-avatar" aria-hidden="true">DI</div><div><div class="care-doc-name">' + esc(DOCTOR.name) + '</div><div class="care-doc-role">' + esc(DOCTOR.role) + '</div></div></div>';
    if (st.ent && st.active) return '<div class="card care-hero care-hero-compact">' + doc + '</div>';
    return '<div class="card care-hero">' + doc + '<h2>Talk to a real doctor, and get more from Sentra-X</h2><p>Chat with a Sentra-X doctor, ask the Health Assistant as much as you like, scan documents and print a doctor-ready report.</p></div>';
  }

  function pendingHtml() {
    var p = st.pending, plan = PLANS[p.plan] || { name: p.plan };
    return '<div class="card care-pending"><div class="care-pending-ico">\u23F3</div><div><b>Payment received</b><p>Your ' + esc(plan.name) + ' plan (' + fmt(p.amount) + ') is being confirmed. It usually switches on within a few hours. You can leave this page; we will show it here as soon as it is active.</p><div class="care-ref">Reference: ' + esc(p.reference) + '</div></div></div>';
  }

  function plansHtml() {
    var cards = ORDER.map(function (id) {
      var p = PLANS[id], price = priceFor(id), promo = id === 'duo' && price === p.promoPrice, per = Math.round(price / p.seats);
      var ribbon = promo ? '<div class="care-ribbon">Launch offer \u00B7 ' + st.promoLeft + ' of ' + p.promoLimit + ' left</div>' : (id === 'family' ? '<div class="care-ribbon alt">Best value</div>' : '');
      var seats = p.seats === 1 ? '1 person' : (id === 'family' ? 'Up to ' + p.seats + ' people' : p.seats + ' people');
      var multi = p.seats > 1;
      return '<div class="care-plan' + (id === 'duo' ? ' featured' : '') + '">' + ribbon +
        '<div class="care-plan-top"><div><h4>' + p.name + '</h4><div class="care-who">' + p.who + '</div></div>' +
        '<div class="care-price">' + fmt(price) + '<span>/ month</span></div></div>' +
        '<div class="care-meta"><span>' + seats + '</span>' + (multi ? '<span>about ' + fmt(per) + ' each</span>' : '') + (promo ? '<span>then ' + fmt(p.price) + '</span>' : '') + '</div>' +
        '<ul class="care-plan-facts">' + (multi ? '<li>A private doctor chat for each person</li>' : '') +
        '<li>Caregiver SMS' + (multi ? ' per person' : '') + ': ' + SOS_SMS[id] + ' SOS \u00B7 ' + ALERT_SMS[id] + ' alerts a month</li></ul>' +
        '<button type="button" class="care-choose" data-act="choose" data-plan="' + id + '">' + (st.ent ? 'Renew with ' : 'Choose ') + p.name + '</button></div>';
    }).join('');
    return '<div class="care-sect">Choose a plan</div>' + cards +
      '<div class="card care-incl"><h3>Every plan includes</h3><ul class="care-list">' + INCLUDED.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  function expiredHtml() {
    var p = PLANS[st.ent.plan] || { name: '' };
    return '<div class="card care-expired"><b>Your ' + esc(p.name) + ' plan ended on ' + fmtDate(st.ent.expiresAt) + '</b><p>Renew to keep chatting. Your earlier messages are still here.</p>' +
      '<button type="button" class="ghost" data-act="chat">Read my chat history</button></div>';
  }

  function activeHtml() {
    var e = st.ent, p = PLANS[e.plan] || { name: e.plan, seats: e.seats || 1 }, left = daysLeft(e), soon = left <= 7;
    var h = '<div class="card care-status"><div class="care-status-top"><span class="care-chip">' + esc(p.name) + ' plan</span><span class="care-active">\u25CF Active</span></div>' +
      '<div class="care-until">Active until <b>' + fmtDate(e.expiresAt) + '</b> \u00B7 ' + left + ' day' + (left === 1 ? '' : 's') + ' left</div>' +
      '<button type="button" class="care-open" data-act="chat">\uD83D\uDCAC Open doctor chat<span id="care-unread" class="care-unread" style="display:none;"></span></button>' +
      '<button type="button" class="ghost" data-act="report">\uD83D\uDCC4 Make a health report</button>' +
      (st.isOwner ? '<button type="button" class="' + (soon ? 'care-renew' : 'ghost') + '" data-act="choose" data-plan="' + e.plan + '">Renew ' + esc(p.name) + ' \u00B7 ' + fmt(PLANS[e.plan] ? PLANS[e.plan].price : 0) + '</button>' : '') + '</div>';
    if (st.isOwner && (e.seats || 1) > 1) h += membersHtml();
    if (!st.isOwner) h += '<div class="card"><h3>Shared plan</h3><p class="care-small">You are on ' + esc(e.ownerName || 'a family member') + '\u2019s ' + esc(p.name) + ' plan. You have your own private chat with the doctor.</p></div>';
    h += '<details class="card care-more"><summary>What your plan includes</summary><ul class="care-list">' + INCLUDED.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
    h += '<div class="card care-id"><h3>Your Care ID</h3><p class="care-small">Give this to the person who pays for a Duo or Family plan so they can add you.</p><div class="care-idrow"><code id="care-myid">' + esc(st.user.uid) + '</code><button type="button" class="ghost" data-act="copyid">Copy</button></div></div>';
    return h;
  }

  function membersHtml() {
    var e = st.ent, uids = e.memberUids || [], names = e.memberNames || {}, seats = e.seats || 1;
    var rows = uids.map(function (id) {
      var me = id === st.user.uid;
      return '<div class="care-member"><div class="care-mav">' + esc((me ? myName() : (names[id] || '?')).charAt(0).toUpperCase()) + '</div><div class="care-mname">' + esc(me ? myName() + ' (you)' : (names[id] || 'Member')) + '</div>' +
        (me ? '' : '<button type="button" class="care-x" data-act="rmmember" data-id="' + esc(id) + '" aria-label="Remove member">Remove</button>') + '</div>';
    }).join('');
    var free = seats - uids.length;
    var add = free > 0 ? '<div class="care-add"><input id="care-mid" placeholder="Paste their Care ID" autocomplete="off" autocapitalize="off" spellcheck="false"><input id="care-mnm" placeholder="Their name" maxlength="40"><button type="button" class="ghost" data-act="addmember">Add to my plan</button></div>' : '<p class="care-small">All ' + seats + ' places are in use.</p>';
    return '<div class="card care-members"><h3>People on your plan (' + uids.length + ' of ' + seats + ')</h3>' + rows + add + '</div>';
  }

  /* ---------------- payment ---------------- */
  function choose(planId) {
    if (!PLANS[planId]) return;
    if (!st.user) { st.notice = 'Please sign in first.'; render(); return; }
    if (!st.user.email) { st.notice = 'Your account needs an email address to pay.'; render(); return; }
    if (st.pending && !window.confirm('You already have a payment waiting to be confirmed. Pay again anyway?')) return;
    if (typeof PaystackPop === 'undefined') { st.notice = 'Card payment could not load. Check your connection or turn off ad-blocking for Sentra-X, then try again.'; render(); return; }
    if (st.busy) return; st.busy = true;
    var price = priceFor(planId), promo = planId === 'duo' && price === PLANS.duo.promoPrice;
    var ref = 'SXC-' + planId.toUpperCase() + '-' + st.user.uid.slice(0, 6) + '-' + Date.now();
    var settled = false, loaded = false;
    function done() { st.busy = false; }
    try {
      var popup = new PaystackPop();
      var tx = popup.newTransaction({
        key: PAYSTACK_PUBLIC_KEY, email: st.user.email, amount: Math.round(price * 100), currency: 'NGN', reference: ref,
        metadata: { custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: PLANS[planId].name + (promo ? ' (launch offer)' : '') },
          { display_name: 'Customer Name', variable_name: 'customer_name', value: myName() },
          { display_name: 'Sentra-X ID', variable_name: 'uid', value: st.user.uid }
        ] },
        onLoad: function () { loaded = true; },
        onSuccess: function (r) { settled = true; done(); recordClaim({ uid: st.user.uid, plan: planId, amount: price, reference: (r && r.reference) || ref, status: 'pending', promo: promo, userName: myName(), email: st.user.email, createdAt: Date.now() }); },
        onCancel: function () { settled = true; done(); },
        onError: function (err) { settled = true; done(); st.notice = 'Payment could not start' + (err && err.message ? ': ' + err.message : '.') + ' Please try again.'; render(); }
      });
      setTimeout(function () {
        if (!loaded && !settled) { try { popup.cancelTransaction(tx.id); } catch (_e) { /* best effort */ } settled = true; done(); st.notice = 'Payment did not load in time. Check your connection and try again.'; render(); }
      }, 12000);
    } catch (e) { done(); st.notice = 'Payment could not be opened just now. Please try again.'; render(); }
  }

  function recordClaim(c) {
    try { localStorage.setItem('sxcare_claim', JSON.stringify(c)); } catch (_e) { /* storage blocked */ }
    return db().collection('paymentClaims').doc(c.reference).set(c).then(function () {
      try { localStorage.removeItem('sxcare_claim'); } catch (_e) { /* ignore */ }
      st.pending = c; st.notice = ''; render(); startPoll();
    }).catch(function () {
      st.notice = 'We received your payment but could not record it just now. Keep this reference and contact us: ' + c.reference;
      render();
    });
  }
  function retryUnsent() {
    var c = null; try { c = JSON.parse(localStorage.getItem('sxcare_claim') || 'null'); } catch (_e) { c = null; }
    if (c && st.user && c.uid === st.user.uid) recordClaim(c);
  }
  function startPoll() {
    stopPoll(); var n = 0;
    st.poll = setInterval(function () {
      n++; if (n > 150 || !st.pending) { stopPoll(); return; }
      load().then(function () { if (!st.pending || st.active) { stopPoll(); } if (st.view === 'home') render(); }).catch(function () { /* try again next tick */ });
    }, 12000);
  }
  function stopPoll() { if (st.poll) { clearInterval(st.poll); st.poll = null; } }

  /* ---------------- members (Duo / Family) ---------------- */
  function addMember() {
    var id = (document.getElementById('care-mid').value || '').trim(), nm = (document.getElementById('care-mnm').value || '').trim().slice(0, 40);
    var e = st.ent; if (!e || !st.isOwner) return;
    if (id.length < 20 || /[\/\s.]/.test(id)) { st.notice = 'That Care ID does not look right. Ask them to copy it from Doctor Care in their app.'; render(); return; }
    if (id === st.user.uid || (e.memberUids || []).indexOf(id) !== -1) { st.notice = 'That person is already on your plan.'; render(); return; }
    if (!nm) { st.notice = 'Please type their name so you can recognise them.'; render(); return; }
    if ((e.memberUids || []).length >= (e.seats || 1)) { st.notice = 'All places on your plan are in use.'; render(); return; }
    var d = db(), FV = firebase.firestore.FieldValue, upd = { memberUids: FV.arrayUnion(id) }; upd['memberNames.' + id] = nm;
    var b = d.batch();
    b.update(d.collection('entitlements').doc(st.user.uid), upd);
    b.set(d.collection('memberOf').doc(id), { ownerUid: st.user.uid, ownerName: myName(), addedAt: Date.now() });
    b.commit().then(function () { st.notice = nm + ' now has their own private chat with the doctor.'; return load(); }).then(render).catch(function () { st.notice = 'Could not add them just now. Please try again.'; render(); });
  }
  function removeMember(id) {
    if (!st.ent || !st.isOwner || !window.confirm('Remove this person from your plan?')) return;
    var d = db(), FV = firebase.firestore.FieldValue, upd = { memberUids: FV.arrayRemove(id) }; upd['memberNames.' + id] = FV.delete();
    var b = d.batch();
    b.update(d.collection('entitlements').doc(st.user.uid), upd);
    b.delete(d.collection('memberOf').doc(id));
    b.commit().then(function () { st.notice = 'Removed from your plan.'; return load(); }).then(render).catch(function () { st.notice = 'Could not remove them just now. Please try again.'; render(); });
  }

  /* ---------------- chat ---------------- */
  function threadRef() { return db().collection('consults').doc(st.user.uid); }
  function consented() { try { return localStorage.getItem('sxcare_consent_v1') === '1'; } catch (_e) { return false; } }

  function renderChatShell() {
    var el = root();
    var canSend = st.active;
    var h = '<div class="care-chat"><div class="care-chat-head"><button type="button" class="care-back" data-act="back" aria-label="Back">\u2039</button>' +
      '<div class="care-avatar sm" aria-hidden="true">DI</div><div class="care-chat-title"><b>' + esc(DOCTOR.name) + '</b><span>Sentra-X doctor</span></div></div>';
    if (!consented()) {
      h += '<div class="card care-consent"><h3>Before you start</h3><ul class="care-list"><li>This chat is <b>not for emergencies</b>. If it is urgent, use Emergency SOS or call your local emergency number now.</li>' +
        '<li>The doctor gives general guidance from what you share. It is not a diagnosis.</li><li>Your messages are saved in your Sentra-X account and can be read by Sentra-X doctors.</li></ul>' +
        '<button type="button" data-act="consent">I understand, continue</button></div></div>';
      el.innerHTML = h; return;
    }
    h += '<div class="care-emerg">Not for emergencies. If it is urgent, use Emergency SOS or call your local emergency number.</div>' +
      '<div id="care-msgs" class="care-msgs" aria-live="polite"><div class="care-loading"><div class="care-spin"></div></div></div>';
    if (canSend) {
      h += '<div class="care-share"><label class="care-switch"><input type="checkbox" id="care-share" aria-label="Share my readings with the doctor"><span class="care-slider"></span></label><div><b>Share my readings with the doctor</b><small>The doctor can see your history while this is on.</small></div></div>' +
        '<div class="care-composer"><button type="button" class="care-attach" data-act="attach">+ Attach my latest readings</button>' +
        '<div class="care-inputrow"><textarea id="care-text" rows="1" maxlength="2000" placeholder="Write to the doctor\u2026"></textarea><button type="button" class="care-send" data-act="send" aria-label="Send">\u27A4</button></div></div>';
    } else {
      h += '<div class="card care-expired"><b>Your plan has ended</b><p>Renew to send new messages.</p><button type="button" data-act="back">See plans</button></div>';
    }
    h += '</div>';
    el.innerHTML = h;
    var ta = document.getElementById('care-text');
    if (ta) {
      var draft = ''; try { draft = localStorage.getItem('sxcare_draft') || ''; localStorage.removeItem('sxcare_draft'); } catch (_e) { draft = ''; }
      if (draft) ta.value = draft;
      ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
      ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 700) { ev.preventDefault(); send(); } });
      ta.dispatchEvent(new Event('input'));
    }
    var sh = document.getElementById('care-share');
    if (sh) {
      threadRef().get().then(function (s) { sh.checked = !!(s.exists && s.data().shareVitals); }).catch(function () { /* no thread yet */ });
      sh.addEventListener('change', function () { setShare(sh.checked); });
    }
    listenMessages();
    fitChat(); setTimeout(fitChat, 120);
  }
  // Sizes the chat to the space between its top and the bottom bar, so the message box is never hidden behind it.
  function fitChat() {
    var c = document.querySelector('.care-chat'); if (!c) return;
    var nav = document.querySelector('nav'), vv = window.visualViewport, vh = vv ? vv.height : window.innerHeight;
    var keyboard = vv && (window.innerHeight - vv.height) > 120;
    var h = vh - c.getBoundingClientRect().top - (keyboard || !nav ? 0 : nav.getBoundingClientRect().height) - 12;
    c.style.height = Math.max(300, Math.floor(h)) + 'px';
  }
  window.addEventListener('resize', fitChat);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitChat);

  function listenMessages() {
    if (st.chatUnsub) { st.chatUnsub(); st.chatUnsub = null; }
    st.chatUnsub = threadRef().collection('messages').orderBy('at').limitToLast(200).onSnapshot(function (snap) {
      var list = []; snap.forEach(function (d) { list.push(d.data()); }); paintMessages(list);
      threadRef().set({ unreadPatient: false }, { merge: true }).catch(function () { /* no thread yet, or plan ended */ });
    }, function () {
      var box = document.getElementById('care-msgs'); if (box) box.innerHTML = '<div class="care-empty-chat">Could not load the chat. Check your connection and try again.</div>';
    });
  }

  function paintMessages(list) {
    var box = document.getElementById('care-msgs'); if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="care-empty-chat"><div class="care-empty-ico">\uD83D\uDC4B</div><b>Say hello to ' + esc(DOCTOR.name) + '</b><p>Tell the doctor what you would like help with. Doctors reply during working hours.</p></div>'; return; }
    var h = '', lastDay = '';
    list.forEach(function (m) {
      var day = fmtDate(m.at); if (day !== lastDay) { h += '<div class="care-day">' + day + '</div>'; lastDay = day; }
      var mine = m.from === 'patient';
      h += '<div class="care-msg ' + (mine ? 'mine' : 'theirs') + '"><div class="care-bubble">' + esc(m.text).replace(/\n/g, '<br>') + '</div><div class="care-time">' + (mine ? '' : esc(m.senderName || DOCTOR.name) + ' \u00B7 ') + fmtTime(m.at) + '</div></div>';
    });
    box.innerHTML = h; box.scrollTop = box.scrollHeight;
  }

  function send() {
    var ta = document.getElementById('care-text'); if (!ta || !st.active) return;
    var text = ta.value.trim(); if (!text || st.busy) return;
    st.busy = true;
    var d = db(), now = Date.now(), ref = threadRef(), planId = st.ent && st.ent.plan;
    var b = d.batch();
    b.set(ref.collection('messages').doc(), { from: 'patient', text: text, at: now, senderUid: st.user.uid });
    b.set(ref, { patientUid: st.user.uid, patientName: myName(), plan: planId, lastMessage: text.slice(0, 120), lastAt: now, unreadDoctor: true, unreadPatient: false }, { merge: true });
    b.commit().then(function () { ta.value = ''; ta.dispatchEvent(new Event('input')); }).catch(function () {
      var box = document.getElementById('care-msgs'); if (box) { var n = document.createElement('div'); n.className = 'care-day'; n.textContent = 'Message not sent. Check your connection and try again.'; box.appendChild(n); box.scrollTop = box.scrollHeight; }
    }).then(function () { setTimeout(function () { st.busy = false; }, 600); });
  }

  function setShare(on) {
    threadRef().set({ patientUid: st.user.uid, patientName: myName(), plan: st.ent && st.ent.plan, shareVitals: !!on, sharedAt: Date.now() }, { merge: true }).catch(function () {
      var sh = document.getElementById('care-share'); if (sh) sh.checked = !on;
    });
  }

  function attachReadings() {
    var ta = document.getElementById('care-text'); if (!ta) return;
    var v = []; try { v = JSON.parse(localStorage.getItem('vitals') || '[]'); } catch (_e) { v = []; }
    if (!v.length) { ta.value = (ta.value ? ta.value + '\n' : '') + 'I have not logged any readings yet.'; ta.dispatchEvent(new Event('input')); return; }
    var lines = v.slice(0, 5).map(function (r) {
      var parts = []; if (r.sys && r.dia) parts.push('BP ' + r.sys + '/' + r.dia); if (r.hr) parts.push('pulse ' + r.hr); if (r.weight) parts.push(r.weight + ' kg');
      return '\u2022 ' + (r.date || fmtDate(new Date(r.dateISO).getTime())) + ': ' + parts.join(', ');
    });
    ta.value = (ta.value ? ta.value + '\n\n' : '') + 'My latest readings:\n' + lines.join('\n'); ta.dispatchEvent(new Event('input')); ta.focus();
  }

  /* ---------------- unread badge ---------------- */
  function startBadge() {
    if (st.badgeUnsub || !st.user) return;
    try {
      st.badgeUnsub = threadRef().onSnapshot(function (s) { setDot(!!(s.exists && s.data().unreadPatient)); }, function () { /* no access: no badge */ });
    } catch (_e) { /* ignore */ }
  }
  function setDot(on) {
    ['nav-more', 'nav-care'].forEach(function (id) {
      var b = document.getElementById(id); if (!b) return;
      var d = b.querySelector('.care-dot');
      if (on && !d) { d = document.createElement('i'); d.className = 'care-dot'; d.setAttribute('aria-label', 'New message from your doctor'); b.appendChild(d); }
      if (!on && d) d.remove();
    });
    var u = document.getElementById('care-unread'); if (u) { u.style.display = on ? 'inline-block' : 'none'; u.textContent = on ? 'New' : ''; }
  }

  /* ---------------- public ---------------- */
  function open() {
    st.view = 'home'; st.notice = ''; render();
    load().then(function () { render(); if (st.pending) startPoll(); }).catch(function () { st.loaded = true; render(); });
  }
  function leaveChat() { if (st.chatUnsub) { st.chatUnsub(); st.chatUnsub = null; } st.view = 'home'; render(); }

  function askAbout(kind) {
    var text = '';
    try {
      if (kind === 'pulse') { var hr = (document.getElementById('heartrate') || {}).value; text = 'Hello doctor, my pulse scan read ' + (hr || 'an unusual rate') + ' bpm at rest. Could you advise?'; }
      else { var v = JSON.parse(localStorage.getItem('vitals') || '[]')[0]; if (v) text = 'Hello doctor, I just logged a blood pressure of ' + v.sys + '/' + v.dia + (v.hr ? ' with a pulse of ' + v.hr : '') + '. Could you advise?'; }
      if (text) localStorage.setItem('sxcare_draft', text);
    } catch (_e) { /* draft is optional */ }
    if (typeof showScreen === 'function') showScreen('care');
    if (st.active) { st.view = 'chat'; render(); }
  }

  function afterReading() {
    var slot = document.getElementById('ask-doctor-slot'); if (!slot) return;
    var res = document.getElementById('result');
    if (!res || res.style.display === 'none' || !res.textContent) { slot.innerHTML = ''; return; }
    var sev = 0; try { sev = (JSON.parse(localStorage.getItem('vitals') || '[]')[0] || {}).severity || 0; } catch (_e) { sev = 0; }
    slot.innerHTML = '<button type="button" class="ghost care-ask' + (sev >= 2 ? ' strong' : '') + '" onclick="SXCare.askAbout(\'bp\')">\uD83E\uDE7A ' + (sev >= 2 ? 'Ask a doctor about this reading' : 'Ask a doctor') + '</button>';
  }

  document.addEventListener('click', function (ev) {
    var r = root(); if (!r || !r.contains(ev.target)) return;
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'choose') choose(b.getAttribute('data-plan'));
    else if (a === 'chat') { st.view = 'chat'; render(); }
    else if (a === 'back') leaveChat();
    else if (a === 'consent') { try { localStorage.setItem('sxcare_consent_v1', '1'); } catch (_e) { /* ignore */ } renderChatShell(); }
    else if (a === 'send') send();
    else if (a === 'attach') attachReadings();
    else if (a === 'report') openReport();
    else if (a === 'addmember') addMember();
    else if (a === 'rmmember') removeMember(b.getAttribute('data-id'));
    else if (a === 'copyid') { var t = st.user.uid; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'Copied'; }).catch(function () { var c = document.getElementById('care-myid'); if (c && window.getSelection) { var rg = document.createRange(); rg.selectNodeContents(c); var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); } b.textContent = 'Select and copy'; }); }
  });

  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(function (u) {
      st.user = u || null; st.loaded = false; st.ent = null; st.active = false; st.pending = null;
      if (st.badgeUnsub) { st.badgeUnsub(); st.badgeUnsub = null; }
      if (st.chatUnsub) { st.chatUnsub(); st.chatUnsub = null; }
      stopPoll(); setDot(false);
      if (u) { retryUnsent(); startBadge(); load().then(function () { refreshMeters(); }).catch(function () { /* stay on what we know */ }); }
    });
  }
  // After a reading is saved, offer a doctor shortcut without touching the existing save code.
  var tries = 0, wrap = setInterval(function () {
    if (typeof window.checkBP === 'function' && !window.checkBP.__care) {
      var orig = window.checkBP;
      window.checkBP = function () { var r = orig.apply(this, arguments); try { afterReading(); } catch (_e) { /* never block saving */ } return r; };
      window.checkBP.__care = true; clearInterval(wrap);
    } else if (++tries > 40) clearInterval(wrap);
  }, 250);


  /* ================= extra features in paid plans ================= *
   * Free users keep every core feature. Two things that cost real money per use get a free allowance, and a paid plan removes it:
   * the Health Assistant (FREE_AI_PER_DAY a day) and document scanning (FREE_SCANS_PER_MONTH a month). If the plan is not known yet
   * (still loading, offline) the app never blocks anyone.
   */
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function monthKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }
  function usage() {
    var u = {}; try { u = JSON.parse(localStorage.getItem(USE_KEY) || '{}') || {}; } catch (_e) { u = {}; }
    var uid = st.user ? st.user.uid : 'anon'; if (u.uid !== uid) u = { uid: uid };
    if (u.day !== dayKey()) { u.day = dayKey(); u.ai = 0; }
    if (u.month !== monthKey()) { u.month = monthKey(); u.scans = 0; u.sos = 0; }
    u.ai = u.ai || 0; u.scans = u.scans || 0; u.sos = u.sos || 0; return u;
  }
  function saveUsage(u) { try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (_e) { /* storage blocked */ } }
  function isPaid() { return activeOf(st.ent); }
  function unknown() { return !!st.user && !st.loaded; }
  function limited() { return !!st.user && !isPaid() && !unknown(); }
  function aiLeft() { return Math.max(0, FREE_AI_PER_DAY - usage().ai); }
  function scansLeft() { return Math.max(0, FREE_SCANS_PER_MONTH - usage().scans); }

  var SHEETS = {
    ai: { ico: '\uD83D\uDCAC', title: 'You have used today\u2019s free questions', msg: 'Free accounts get ' + FREE_AI_PER_DAY + ' Health Assistant questions a day. They reset tomorrow. With a Doctor Care plan you can ask as much as you like.' },
    scan: { ico: '\uD83D\uDCF7', title: 'You have used this month\u2019s free scans', msg: 'Free accounts get ' + FREE_SCANS_PER_MONTH + ' document scans a month. With a Doctor Care plan you can scan as many documents as you need.' },
    report: { ico: '\uD83D\uDCC4', title: 'Doctor-ready health report', msg: 'Print or save a clear summary of your last 90 days of readings and medicines to show a doctor. It comes with every Doctor Care plan.' }
  };
  function showSheet(kind) {
    var t = SHEETS[kind]; if (!t) return;
    var el = document.getElementById('care-sheet');
    if (!el) {
      el = document.createElement('div'); el.id = 'care-sheet'; el.className = 'care-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'care-sheet-title');
      document.body.appendChild(el);
      el.addEventListener('click', function (e) {
        if (e.target === el || e.target.closest('[data-sheet="close"]')) { el.style.display = 'none'; }
        else if (e.target.closest('[data-sheet="plans"]')) { el.style.display = 'none'; if (typeof showScreen === 'function') showScreen('care'); }
      });
    }
    el.innerHTML = '<div class="care-sheet-card"><div class="care-sheet-ico" aria-hidden="true">' + t.ico + '</div><h3 id="care-sheet-title">' + esc(t.title) + '</h3><p>' + esc(t.msg) + '</p>' +
      '<ul class="care-list">' + INCLUDED.slice(0, 4).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<button type="button" data-sheet="plans">See plans</button><button type="button" class="secondary" data-sheet="close">Not now</button></div>';
    el.style.display = 'flex';
  }

  function ensureMeters() {
    if (!document.getElementById('care-ai-meter')) {
      var row = document.querySelector('#ai-screen .ai-send-row');
      if (row) { var m = document.createElement('div'); m.id = 'care-ai-meter'; m.className = 'care-meter'; m.style.display = 'none'; row.parentNode.insertBefore(m, row); }
    }
    if (!document.getElementById('care-sms-meter')) {
      var fs = document.getElementById('family-screen');
      if (fs) { var q = document.createElement('div'); q.id = 'care-sms-meter'; q.className = 'care-meter care-meter-col'; q.style.display = 'none'; fs.insertBefore(q, fs.firstChild); }
    }
    if (!document.getElementById('care-scan-meter')) {
      var sb = document.getElementById('pp-scan-btn');
      if (sb) { var s = document.createElement('div'); s.id = 'care-scan-meter'; s.className = 'care-meter'; s.style.display = 'none'; sb.insertAdjacentElement('afterend', s); }
    }
  }
  function refreshMeters() {
    ensureMeters();
    var a = document.getElementById('care-ai-meter'), s = document.getElementById('care-scan-meter'), q = document.getElementById('care-sms-meter');
    if (q) {
      if (!st.user || unknown()) q.style.display = 'none';
      else {
        var key = smsKey(), line = '<span>SOS SMS left this month: <b>' + sosLeft() + '</b> of ' + SOS_SMS[key] + '</span>';
        if (st.alertUsed !== null) line += '<span>Automatic alert SMS left: <b>' + Math.max(0, ALERT_SMS[key] - st.alertUsed) + '</b> of ' + ALERT_SMS[key] + '</span>';
        q.style.display = 'flex'; q.innerHTML = '<div class="care-meter-lines">' + line + '<small>Email, WhatsApp and the call button are always free.</small></div>' + (isPaid() ? '' : '<button type="button" class="care-meter-link" data-care-go="1">Get more</button>');
      }
    }
    if (a) {
      if (!limited()) a.style.display = 'none';
      else { var n = aiLeft(); a.style.display = 'flex'; a.innerHTML = '<span>' + (n > 0 ? '<b>' + n + '</b> of ' + FREE_AI_PER_DAY + ' free questions left today' : 'Free questions used for today. They reset tomorrow.') + '</span><button type="button" class="care-meter-link" data-care-go="1">Go unlimited</button>'; }
    }
    if (s) {
      if (!limited()) s.style.display = 'none';
      else { var k = scansLeft(); s.style.display = 'flex'; s.innerHTML = '<span><b>' + k + '</b> of ' + FREE_SCANS_PER_MONTH + ' free scans left this month</span><button type="button" class="care-meter-link" data-care-go="1">Go unlimited</button>'; }
    }
    if (st.user && st.loaded && st.lastLoad && Date.now() - st.lastLoad > 300000) { st.lastLoad = Date.now(); load().then(function () { refreshMeters(); }).catch(function () { /* keep what we know */ }); }
  }

  function smsKey() { return isPaid() && st.ent && SOS_SMS[st.ent.plan] ? st.ent.plan : 'free'; }
  function sosLeft() { return Math.max(0, SOS_SMS[smsKey()] - usage().sos); }
  // Called once per caregiver SMS during an SOS. Always true for the primary caregiver and whenever the plan is not known yet:
  // a counter must never hold back an emergency.
  function sosSmsAllowed(isPrimary) {
    if (!st.user || unknown()) return true;
    var u = usage();
    if (u.sos < SOS_SMS[smsKey()]) { u.sos++; saveUsage(u); try { refreshMeters(); } catch (_e) { /* cosmetic */ } return true; }
    return !!isPrimary;
  }
  function sosSmsNote() {
    if (!st.user || unknown() || sosLeft() > 0) return '';
    return '\n\nYour SMS allowance for this month is used up. Your primary caregiver still gets an SMS, other caregivers get email, and WhatsApp and the call button always work.';
  }

  function wrapAi() {
    if (typeof window.sendAiMessage !== 'function' || window.sendAiMessage.__care) return;
    var orig = window.sendAiMessage;
    window.sendAiMessage = function () {
      var inp = document.getElementById('ai-chat-input'), had = !!(inp && inp.value.trim());
      if (had && limited() && aiLeft() <= 0) { showSheet('ai'); return; }
      var r = orig.apply(this, arguments);
      if (had && inp && inp.value === '' && limited()) { var u = usage(); u.ai++; saveUsage(u); }   // counted only if the message was really sent
      try { refreshMeters(); } catch (_e) { /* cosmetic */ }
      return r;
    };
    window.sendAiMessage.__care = true;
  }
  function wrapScan() {
    var S = window.SentraXPassportScan; if (!S || S.__care) return false;
    var open = S.open, handle = S.handleFile, conf = S.confirm;
    S.open = function () { if (limited() && scansLeft() <= 0) { showSheet('scan'); return; } return open.apply(this, arguments); };
    S.handleFile = function (input) { if (limited() && scansLeft() <= 0) { try { input.value = ''; } catch (_e) { /* ignore */ } showSheet('scan'); return; } return handle.apply(this, arguments); };
    S.confirm = function () { var r = conf.apply(this, arguments); if (limited()) { var u = usage(); u.scans++; saveUsage(u); } try { refreshMeters(); } catch (_e) { /* cosmetic */ } return r; };   // a scan counts when the person uses its result
    S.__care = true; return true;
  }

  /* ---------------- doctor-ready health report (paid) ---------------- */
  function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  function openReport() {
    if (!st.user) return;
    if (limited()) { showSheet('report'); return; }
    var v = []; try { v = JSON.parse(localStorage.getItem('vitals') || '[]'); } catch (_e) { v = []; }
    var cut90 = Date.now() - 90 * 86400000, cut30 = Date.now() - 30 * 86400000;
    v = v.filter(function (r) { var t = new Date(r.dateISO || r.date).getTime(); return isFinite(t) && t >= cut90; });
    if (!v.length) { window.alert('Log at least one reading first. The report covers your last 90 days.'); return; }
    function tm(r) { return new Date(r.dateISO || r.date).getTime(); }
    function bpOf(list) { return list.filter(function (r) { return Number(r.sys) > 0 && Number(r.dia) > 0; }); }
    var bp90 = bpOf(v), bp30 = bp90.filter(function (r) { return tm(r) >= cut30; });
    var pulse = v.filter(function (r) { return Number(r.hr) > 0; }).map(function (r) { return Number(r.hr); });
    function avgBp(l) { return l.length ? avg(l.map(function (r) { return Number(r.sys); })) + '/' + avg(l.map(function (r) { return Number(r.dia); })) : '\u2014'; }
    var hi = bp90.slice().sort(function (a, b) { return Number(b.sys) - Number(a.sys); })[0], lo = bp90.slice().sort(function (a, b) { return Number(a.sys) - Number(b.sys); })[0];
    var wt = v.filter(function (r) { return Number(r.weight) > 0; })[0];
    var meds = []; try { meds = JSON.parse(localStorage.getItem('meds') || '[]'); } catch (_e) { meds = []; }
    var cond = ''; try { cond = localStorage.getItem('userCondition') || ''; } catch (_e) { cond = ''; }
    var th = 'style="text-align:left;border-bottom:1px solid #999;padding:4px 6px;"', td = 'style="border-bottom:1px solid #ddd;padding:4px 6px;"';
    var rows = v.slice(0, 30).map(function (r) {
      return '<tr><td ' + td + '>' + esc(fmtDate(tm(r))) + '</td><td ' + td + '>' + (r.sys && r.dia ? esc(r.sys + '/' + r.dia) : '') + '</td><td ' + td + '>' + esc(r.hr || '') + '</td><td ' + td + '>' + esc(r.weight || '') + '</td><td ' + td + '>' + esc(r.level || '') + '</td></tr>';
    }).join('');
    var html = '<div style="font-family:Arial,sans-serif;color:#000;">' +
      '<h1 style="margin:0 0 4px;font-size:22px;">Sentra-X Health Report</h1>' +
      '<p style="margin:0 0 14px;font-size:13px;">' + esc(myName()) + (cond ? ' \u00B7 ' + esc(cond) : '') + ' \u00B7 Created ' + esc(fmtDate(Date.now())) + ' \u00B7 Last 90 days</p>' +
      '<h2 style="font-size:16px;margin:12px 0 6px;">Summary</h2><table style="border-collapse:collapse;width:100%;font-size:13px;">' +
      '<tr><td ' + td + '>Readings logged</td><td ' + td + '><b>' + v.length + '</b></td></tr>' +
      '<tr><td ' + td + '>Average blood pressure, last 30 days</td><td ' + td + '><b>' + avgBp(bp30) + '</b></td></tr>' +
      '<tr><td ' + td + '>Average blood pressure, last 90 days</td><td ' + td + '><b>' + avgBp(bp90) + '</b></td></tr>' +
      '<tr><td ' + td + '>Highest reading</td><td ' + td + '><b>' + (hi ? esc(hi.sys + '/' + hi.dia) + ' on ' + esc(fmtDate(tm(hi))) : '\u2014') + '</b></td></tr>' +
      '<tr><td ' + td + '>Lowest reading</td><td ' + td + '><b>' + (lo ? esc(lo.sys + '/' + lo.dia) + ' on ' + esc(fmtDate(tm(lo))) : '\u2014') + '</b></td></tr>' +
      '<tr><td ' + td + '>Average pulse</td><td ' + td + '><b>' + (avg(pulse) ? avg(pulse) + ' bpm' : '\u2014') + '</b></td></tr>' +
      '<tr><td ' + td + '>Latest weight</td><td ' + td + '><b>' + (wt ? esc(wt.weight) + ' kg' : '\u2014') + '</b></td></tr></table>' +
      '<h2 style="font-size:16px;margin:14px 0 6px;">Recent readings' + (v.length > 30 ? ' (latest 30)' : '') + '</h2>' +
      '<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><tr><th ' + th + '>Date</th><th ' + th + '>BP</th><th ' + th + '>Pulse</th><th ' + th + '>Weight</th><th ' + th + '>Result</th></tr>' + rows + '</table>' +
      '<h2 style="font-size:16px;margin:14px 0 6px;">Current medicines</h2>' +
      (meds.length ? '<ul style="margin:0;padding-left:18px;font-size:13px;">' + meds.map(function (m) { return '<li>' + esc(m.name || '') + (m.time ? ' \u00B7 ' + esc(m.time) : '') + '</li>'; }).join('') + '</ul>' : '<p style="font-size:13px;margin:0;">None listed.</p>') +
      '<p style="margin-top:18px;font-size:11.5px;color:#444;">Created by the patient from their Sentra-X app. These are self-recorded readings. This is not a medical record or a diagnosis.</p></div>';
    var area = document.getElementById('care-report-print');
    if (!area) { area = document.createElement('div'); area.id = 'care-report-print'; area.className = 'print-only'; document.body.appendChild(area); }
    area.innerHTML = html;
    function clean() { var a = document.getElementById('care-report-print'); if (a) a.innerHTML = ''; }
    window.addEventListener('afterprint', clean, { once: true });
    setTimeout(function () { window.print(); }, 50);
  }

  document.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('[data-care-go]')) { if (typeof showScreen === 'function') showScreen('care'); } });
  wrapAi();
  var scanTries = 0, scanWrap = setInterval(function () { if (wrapScan() || ++scanTries > 40) clearInterval(scanWrap); }, 250);

  window.SXCare = { open: open, askAbout: askAbout, afterReading: afterReading, openReport: openReport, refreshMeters: refreshMeters, sosSmsAllowed: sosSmsAllowed, sosSmsNote: sosSmsNote, PLANS: PLANS, _state: st };
})();
