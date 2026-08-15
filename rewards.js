/*
 * rewards.js — Sentra-X Coins & Streaks
 * ========================================
 * Gamification layer: earn coins for reading articles and buying from the
 * Marketplace, plus a daily streak with milestone bonuses. Coins can be
 * redeemed for a small cash payout in Naira or USD once a user crosses a
 * meaningful minimum balance — deliberately not a fast or trivial climb.
 *
 * Isolated from everything else, same pattern as articles.js/store.js — a
 * brand new file, no rewrites to existing logic. Other files only ever call
 * one-line, defensively-guarded hooks like:
 *   if (window.SentraXRewards) window.SentraXRewards.awardArticleRead(id);
 * so if this file ever fails to load for any reason, nothing else breaks.
 *
 * Payout is manual/admin-reviewed (same honest pattern as Marketplace
 * checkout before Paystack) — there's no automated bank/PayPal payout API
 * here, a redemption just becomes a reviewable request the admin fulfills
 * by hand, notified the same proven way as marketplace orders.
 */

(function () {
  'use strict';

  // ---- Ad-revenue-aware article reward -----------------------------------
  // ARTICLE_READ_COINS is DERIVED below, not hand-picked — it tracks what an
  // article read actually earns in ad revenue, with a safety margin, so the
  // reward can never structurally outpace the income funding it.
  //
  // IMPORTANT: this is never tied to whether a specific ad was clicked or
  // viewed by a specific user — AdSense deliberately never exposes that
  // per-user signal to publishers (anti-fraud design), and rewarding ad
  // interaction is a bannable AdSense policy violation regardless. This is
  // purely a payout-rate calibration using your account-wide averages.
  //
  // >>> UPDATE AD_RPM_USD_PER_1000 once you have real numbers: AdSense
  //     dashboard → Estimated earnings ÷ impressions × 1000, for Articles
  //     traffic specifically if you can filter to it. Nigeria-weighted
  //     generic/health content typically runs $0.25-$0.50 RPM — the 0.20
  //     below is a deliberately conservative placeholder (below the low end
  //     of that range, as a safety buffer) until you have real data. <<<
  const AD_RPM_USD_PER_1000 = 0.20;
  const IMPRESSIONS_PER_ARTICLE_READ = 1;   // the one guaranteed inline ad in the article detail view
  const AD_PAYOUT_MARGIN = 0.25;            // pay out 25% of estimated ad revenue as coins, keep 75% as a safety buffer
  const MIN_ARTICLE_READ_COINS = 1;         // floor — reading still has to feel worth something

  // ---- Tunables ---------------------------------------------------------
  const PURCHASE_COINS_PER_NGN = 250;     // 1 coin per ₦250 spent (≈0.4% cashback) — funded by marketplace margin, not ad revenue, so untouched here
  const PURCHASE_COINS_MIN = 10;          // floor, even for a cheap item
  const DAILY_OPEN_COINS = 3;             // loyalty bonus, not ad-funded — your call to size this
  const STREAK_MILESTONES = { 3: 15, 7: 40, 14: 100, 30: 250, 60: 600, 100: 1200 };
  const REDEEM_MIN_COINS = 2500;          // lowered alongside the article-coin cut below, so redemption stays reachable — reconsider once you have real RPM data
  const COIN_TO_NGN = 1;                  // 1 coin = ₦1
  const FX_NGN_PER_USD = 1600;            // approximate reference rate — adjust as needed

  const estimatedRevenuePerReadNgn = (AD_RPM_USD_PER_1000 / 1000) * IMPRESSIONS_PER_ARTICLE_READ * FX_NGN_PER_USD;
  const ARTICLE_READ_COINS = Math.max(
    MIN_ARTICLE_READ_COINS,
    Math.round((estimatedRevenuePerReadNgn * AD_PAYOUT_MARGIN) / COIN_TO_NGN)
  );

  // Reuses the same EmailJS project already wired up for marketplace order
  // notifications — same account, just a different template context.
  const ADMIN_EMAIL = 'sentraxforteltd@gmail.com';
  const EMAILJS_SERVICE_ID = 'service_sq7cgqb';
  const EMAILJS_TEMPLATE_ID = 'template_9clzjfk';
  const EMAILJS_PUBLIC_KEY = 'nAbELba6szw8IyjO-';

  function esc(str) {
    return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str == null ? '' : str);
  }

  function today() {
    return (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().split('T')[0];
  }

  // ---- Data (localStorage 'rwd-data', synced to Firestore as `rewards`) -
  function getData() {
    const defaults = { coins: 0, lifetimeCoins: 0, streak: 0, longestStreak: 0, lastActiveDate: null, readArticleIds: [], redemptions: [] };
    try {
      const d = JSON.parse(localStorage.getItem('rwd-data') || 'null');
      if (d) return Object.assign({}, defaults, d); // backfills any fields older saved data predates
    } catch (e) { /* fall through to default */ }
    return defaults;
  }

  function saveData(data) {
    localStorage.setItem('rwd-data', JSON.stringify(data));
    if (typeof syncToFirestore === 'function') {
      try { syncToFirestore({ rewards: data }); } catch (e) { /* offline is fine, saved locally */ }
    }
    updateBalancePills();
  }

  function addCoins(data, amount) {
    data.coins += amount;
    data.lifetimeCoins += amount;
  }

  // ---- Earning: articles --------------------------------------------------
  function awardArticleRead(articleId) {
    if (!articleId) return;
    const data = getData();
    if (data.readArticleIds.indexOf(articleId) !== -1) return; // already credited
    data.readArticleIds.push(articleId);
    addCoins(data, ARTICLE_READ_COINS);
    saveData(data);
    showCoinToast(ARTICLE_READ_COINS, 'for reading');
  }

  // ---- Earning: purchases ---------------------------------------------
  function awardPurchase(orderTotalNaira) {
    if (!orderTotalNaira || orderTotalNaira <= 0) return;
    const earned = Math.max(PURCHASE_COINS_MIN, Math.floor(orderTotalNaira / PURCHASE_COINS_PER_NGN));
    const data = getData();
    addCoins(data, earned);
    saveData(data);
    showCoinToast(earned, 'for your order');
  }

  // ---- Earning: daily streak -------------------------------------------
  function checkDailyStreak() {
    const data = getData();
    const t = today();
    if (data.lastActiveDate === t) return; // already credited today

    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yStr = y.toISOString().split('T')[0];

    if (data.lastActiveDate === yStr) {
      data.streak += 1;
    } else {
      data.streak = 1; // first time ever, or the streak broke
    }
    data.longestStreak = Math.max(data.longestStreak, data.streak);
    data.lastActiveDate = t;

    let earned = DAILY_OPEN_COINS;
    let milestoneHit = null;
    if (STREAK_MILESTONES[data.streak]) {
      milestoneHit = STREAK_MILESTONES[data.streak];
      earned += milestoneHit;
    }
    addCoins(data, earned);
    saveData(data);

    if (milestoneHit) {
      showCoinToast(earned, data.streak + '-day streak! 🔥');
    } else if (data.streak > 1) {
      showCoinToast(earned, 'daily streak (' + data.streak + ')');
    }
  }

  function showCoinToast(amount, label) {
    let toast = document.getElementById('rwd-toast');
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.id = 'rwd-toast';
    toast.className = 'rwd-toast';
    toast.innerHTML = '<b>+' + amount + ' 🪙</b><span>' + esc(label) + '</span>';
    document.body.appendChild(toast);
    // Force reflow so the entrance transition actually plays.
    void toast.offsetWidth;
    toast.classList.add('rwd-toast-in');
    setTimeout(function () {
      toast.classList.remove('rwd-toast-in');
      toast.classList.add('rwd-toast-out');
      setTimeout(function () { if (toast && toast.parentNode) toast.remove(); }, 400);
    }, 2200);
  }

  // ---- Small persistent balance pill, shown wherever a screen wants it --
  function updateBalancePills() {
    const data = getData();
    document.querySelectorAll('.rwd-balance-pill').forEach(function (el) {
      el.textContent = data.coins.toLocaleString() + ' 🪙';
    });
    document.querySelectorAll('.rwd-streak-pill').forEach(function (el) {
      el.textContent = '🔥 ' + data.streak;
    });
  }

  // ---- Main Rewards screen ------------------------------------------------
  function renderRewards() {
    const root = document.getElementById('rewards-root');
    if (!root) return;
    const data = getData();
    const progressPct = Math.min(100, Math.round((data.coins / REDEEM_MIN_COINS) * 100));
    const canRedeem = data.coins >= REDEEM_MIN_COINS;

    root.innerHTML =
      '<div class="rwd-header">' +
      '<div class="rwd-header-row">' +
      '<div>' +
      '<div class="rwd-coin-count">' + data.coins.toLocaleString() + ' <span>🪙</span></div>' +
      '<p>Sentra-X Coins <span class="rwd-cash-value">≈ ₦' + (data.coins * COIN_TO_NGN).toLocaleString() + '</span></p>' +
      '</div>' +
      '<div class="rwd-streak-box"><div class="rwd-streak-num">🔥 ' + data.streak + '</div><div class="rwd-streak-label">day streak</div></div>' +
      '</div>' +
      '<div class="rwd-progress-track"><div class="rwd-progress-fill" style="width:' + progressPct + '%;"></div></div>' +
      '<p class="rwd-progress-label">' + (canRedeem
        ? 'You can redeem now! 🎉'
        : (REDEEM_MIN_COINS - data.coins).toLocaleString() + ' more coins to your first redemption') + '</p>' +
      '<button class="rwd-redeem-btn" ' + (canRedeem ? '' : 'disabled') + ' onclick="SentraXRewards.openRedeem()">' +
      (canRedeem ? '💸 Redeem for cash' : '🔒 Redeem for cash') + '</button>' +
      '</div>' +

      '<div class="rwd-earn-card">' +
      '<h4>How to earn coins</h4>' +
      '<div class="rwd-earn-row"><span>📰 Read an article</span><b>+' + ARTICLE_READ_COINS + '</b></div>' +
      '<div class="rwd-earn-row"><span>🛍️ Shop the Marketplace</span><b>+1 per ₦' + PURCHASE_COINS_PER_NGN + '</b></div>' +
      '<div class="rwd-earn-row"><span>🔥 Keep your daily streak</span><b>+' + DAILY_OPEN_COINS + '/day</b></div>' +
      '<div class="rwd-earn-row"><span>🏁 100-day streak (one-time)</span><b>+' + STREAK_MILESTONES[100] + '</b></div>' +
      '<p class="rwd-disclaimer">1 🪙 = ₦' + COIN_TO_NGN + ' · rates may adjust to match real ad earnings</p>' +
      '</div>' +

      (data.redemptions.length ? '<div class="rwd-history-card"><h4>Redemption history</h4>' +
        data.redemptions.slice(0, 8).map(redemptionRowHtml).join('') + '</div>' : '');

    updateBalancePills();
  }

  function redemptionRowHtml(r) {
    const statusLabel = r.status === 'paid' ? '✅ Paid' : r.status === 'declined' ? '❌ Declined' : '⏳ Pending review';
    const amountLabel = r.currency === 'usd' ? '$' + r.amountUsd.toFixed(2) : '₦' + r.amountNaira.toLocaleString();
    return '<div class="rwd-history-row"><div><b>' + r.coins.toLocaleString() + ' coins</b><span>' + amountLabel + '</span></div><div class="rwd-history-status">' + statusLabel + '</div></div>';
  }

  // ---- Redeem flow — one sheet, reuses the exact cart-sheet CSS classes -
  let redeemCurrency = 'ngn';

  function ensureSheet() {
    let overlay = document.getElementById('rwd-redeem-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'rwd-redeem-overlay';
      overlay.className = 'mkt-sheet-backdrop';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function sheetShell(title, bodyHtml) {
    return '<div class="mkt-sheet">' +
      '<div class="mkt-sheet-handle"></div>' +
      '<div class="mkt-sheet-header"><h3>' + title + '</h3><button class="mkt-sheet-close" onclick="SentraXRewards.closeRedeem()">✕</button></div>' +
      '<div class="mkt-sheet-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  function openRedeem() {
    const data = getData();
    if (data.coins < REDEEM_MIN_COINS) return;
    redeemCurrency = 'ngn';
    const overlay = ensureSheet();
    renderRedeemStep();
    overlay.style.display = 'block';
  }

  function closeRedeem() {
    const overlay = document.getElementById('rwd-redeem-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function selectRedeemCurrency(cur) {
    redeemCurrency = cur;
    renderRedeemStep();
  }

  function renderRedeemStep() {
    const overlay = document.getElementById('rwd-redeem-overlay');
    if (!overlay) return;
    const data = getData();
    const naira = data.coins * COIN_TO_NGN;
    const usd = naira / FX_NGN_PER_USD;

    overlay.innerHTML = sheetShell('Redeem Coins',
      '<div class="rwd-redeem-amount">' + data.coins.toLocaleString() + ' 🪙 available</div>' +
      '<div class="mkt-chip-row">' +
      '<button class="mkt-chip' + (redeemCurrency === 'ngn' ? ' active' : '') + '" onclick="SentraXRewards.selectCurrency(\'ngn\')">🇳🇬 Naira</button>' +
      '<button class="mkt-chip' + (redeemCurrency === 'usd' ? ' active' : '') + '" onclick="SentraXRewards.selectCurrency(\'usd\')">💵 USD</button>' +
      '</div>' +
      '<div class="rwd-redeem-value">' + (redeemCurrency === 'usd' ? '$' + usd.toFixed(2) : '₦' + naira.toLocaleString()) + '</div>' +
      (redeemCurrency === 'ngn'
        ? '<input type="text" id="rwd-bank-name" placeholder="Bank name">' +
          '<input type="text" id="rwd-account-name" placeholder="Account holder name">' +
          '<input type="text" id="rwd-account-number" placeholder="Account number" inputmode="numeric">'
        : '<input type="email" id="rwd-paypal-email" placeholder="PayPal email address">') +
      '<div class="mkt-paystack-note">🕐 Payouts are reviewed and sent manually within a few business days — this isn\'t instant, but it\'s real.</div>' +
      '<div id="rwd-redeem-error" style="color:#fca5a5;font-size:13px;margin-top:4px;min-height:16px;"></div>' +
      '<button onclick="SentraXRewards.submitRedeem()">Request Payout</button>');
  }

  function submitRedeem() {
    const data = getData();
    const errEl = document.getElementById('rwd-redeem-error');
    let payoutDetails = {};

    if (redeemCurrency === 'ngn') {
      const bankName = (document.getElementById('rwd-bank-name').value || '').trim();
      const accountName = (document.getElementById('rwd-account-name').value || '').trim();
      const accountNumber = (document.getElementById('rwd-account-number').value || '').trim();
      if (!bankName || !accountName || !accountNumber) {
        if (errEl) errEl.textContent = 'Please fill in your bank name, account name, and account number.';
        return;
      }
      payoutDetails = { bankName: bankName, accountName: accountName, accountNumber: accountNumber };
    } else {
      const paypalEmail = (document.getElementById('rwd-paypal-email').value || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(paypalEmail)) {
        if (errEl) errEl.textContent = 'Please enter a valid PayPal email address.';
        return;
      }
      payoutDetails = { paypalEmail: paypalEmail };
    }

    const coinsToRedeem = data.coins; // redeem full balance each time — simplest, no partial-balance edge cases
    const redemption = {
      id: 'SXR-' + Date.now().toString(36).toUpperCase(),
      coins: coinsToRedeem,
      currency: redeemCurrency,
      amountNaira: coinsToRedeem * COIN_TO_NGN,
      amountUsd: (coinsToRedeem * COIN_TO_NGN) / FX_NGN_PER_USD,
      payoutDetails: payoutDetails,
      status: 'pending',
      createdAt: Date.now()
    };

    data.coins = 0; // deduct immediately so it can't be redeemed twice
    data.redemptions.unshift(redemption);
    saveData(data);
    notifyAdminOfRedemption(redemption);
    renderRedeemSuccess(redemption);
    renderRewards();
  }

  function notifyAdminOfRedemption(r) {
    const details = r.currency === 'usd'
      ? 'PayPal: ' + r.payoutDetails.paypalEmail
      : r.payoutDetails.bankName + ' — ' + r.payoutDetails.accountName + ' — ' + r.payoutDetails.accountNumber;
    const amountLabel = r.currency === 'usd' ? '$' + r.amountUsd.toFixed(2) : '₦' + r.amountNaira.toLocaleString();
    const message = 'New coin redemption request ' + r.id + ': ' + r.coins.toLocaleString() + ' coins (' + amountLabel + '). Payout to: ' + details;

    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: ADMIN_EMAIL,
          patient_name: 'Sentra-X Rewards',
          caregiver_name: 'Redemption Request',
          alert_message: message
        }
      })
    }).then(function (res) {
      if (!res.ok) flagNotifyFailed(r.id);
    }).catch(function () {
      flagNotifyFailed(r.id);
      // Request is already safely saved (localStorage + Firestore) even if
      // this admin email fails to send — never blocks the user's request.
    });
  }

  function flagNotifyFailed(redemptionId) {
    const data = getData();
    const match = data.redemptions.find(function (r) { return r.id === redemptionId; });
    if (match) { match.notifyFailed = true; saveData(data); }
  }

  function renderRedeemSuccess(r) {
    const overlay = document.getElementById('rwd-redeem-overlay');
    if (!overlay) return;
    const amountLabel = r.currency === 'usd' ? '$' + r.amountUsd.toFixed(2) : '₦' + r.amountNaira.toLocaleString();
    overlay.innerHTML = sheetShell('Request Sent',
      '<div class="mkt-success-check">✅</div>' +
      '<div class="mkt-success-ref">Request ' + r.id + '</div>' +
      '<p style="font-size:13.5px;color:#cbd5e1;line-height:1.5;text-align:center;">' + r.coins.toLocaleString() + ' coins redeemed for ' + amountLabel + '. We\'ll review and send your payout within a few business days.</p>' +
      '<button onclick="SentraXRewards.closeRedeem()">Done</button>');
  }

  if (typeof window !== 'undefined') {
    window.SentraXRewards = {
      render: renderRewards,
      awardArticleRead: awardArticleRead,
      awardPurchase: awardPurchase,
      checkDailyStreak: checkDailyStreak,
      openRedeem: openRedeem,
      closeRedeem: closeRedeem,
      selectCurrency: selectRedeemCurrency,
      submitRedeem: submitRedeem
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARTICLE_READ_COINS: ARTICLE_READ_COINS, REDEEM_MIN_COINS: REDEEM_MIN_COINS };
  }
})();
