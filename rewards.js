/*
 * rewards.js — Sentra-X Coins & Streaks
 * ========================================
 * Gamification layer: earn coins for reading articles and buying from the
 * Marketplace, plus a daily streak with milestone bonuses. Coins are
 * store credit ONLY — spendable toward Marketplace purchases at checkout,
 * never redeemable for cash, never withdrawable. This is a deliberate
 * product decision: it keeps this a standard loyalty-points model (like
 * airline miles or shopping-app cashback) rather than anything resembling
 * a cash-out financial product, which is simpler and safer for everyone.
 *
 * Isolated from everything else, same pattern as articles.js/store.js — a
 * brand new file, no rewrites to existing logic. Other files only ever call
 * one-line, defensively-guarded hooks like:
 *   if (window.SentraXRewards) window.SentraXRewards.awardArticleRead(id);
 * so if this file ever fails to load for any reason, nothing else breaks.
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
  // Daily-open coins stay OFF (0) — not requested back. Marketplace and
  // streak milestones are re-enabled below at small, deliberately modest
  // rates.
  //
  // COIN_TO_NGN changed from 1 to 1/20 (20 coins = ₦1) per product
  // decision. To avoid silently crushing every reward to 1/20th its real
  // value, the hand-set coin AMOUNTS below are scaled up 20x to match —
  // this is a redenomination, not a devaluation. ARTICLE_READ_COINS further
  // down needs no manual change since its formula already divides by
  // COIN_TO_NGN and adjusts automatically.
  const PURCHASE_COINS_PER_NGN = 50;      // was 1000 (1 coin/₦1000). Now 1 coin per ₦50 spent — same ~0.1% real-value rate under the new coin denomination.
  const PURCHASE_COINS_MIN = 20;          // was 1 (worth ₦1). Now 20 coins, still worth ₦1 — same real floor.
  const DAILY_OPEN_COINS = 0;             // disabled — opening the app still doesn't earn coins
  const STREAK_MILESTONES = { 7: 60, 100: 2000 }; // was {7:3, 100:100} — 20x'd to preserve real value (₦3 and ₦100 respectively)
  const COIN_TO_NGN = 1 / 20;             // 20 coins = ₦1. Coins are marketplace store credit ONLY — never cash, never withdrawable.
  const FX_NGN_PER_USD = 1600;            // used only to convert the USD ad RPM below into Naira for the article-reward formula — no longer used for any cash payout, since that flow is gone

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

  // ---- Trusted server time (streak-manipulation defense) -----------------
  // A same-origin fetch is exempt from CORS header restrictions, so the
  // browser exposes the full response, including the Date header — the
  // server's clock, not the device's. Changing your phone's date does
  // nothing to this value, since it never comes from the device at all.
  // This is deliberately the ONE thing in the streak check that can't be
  // faked by adjusting a setting — spoofing it would mean forging a real
  // HTTP response, not just changing the time on your phone.
  //
  // Honest limit: this only works while online. Offline, there's no
  // external clock to check against, so we fall back to the device's own
  // date — same as before. That's an unavoidable gap in any client-only
  // app, not something more code can close.
  function getTrustedDate() {
    if (typeof fetch === 'undefined') return Promise.reject(new Error('no fetch'));
    const bustUrl = location.origin + location.pathname.replace(/[^/]*$/, '') + 'manifest.json?_=' + Date.now();
    return fetch(bustUrl, { cache: 'no-store' }).then(function (res) {
      const serverDate = res.headers.get('Date');
      if (!serverDate) throw new Error('no Date header');
      const d = new Date(serverDate);
      if (isNaN(d.getTime())) throw new Error('unparseable Date header');
      return d;
    });
  }

  function dateStr(d) { return d.toISOString().split('T')[0]; }

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
  function hasReadArticle(articleId) {
    return getData().readArticleIds.indexOf(articleId) !== -1;
  }

  function awardArticleRead(articleId) {
    if (!articleId) return;
    const data = getData();
    if (data.readArticleIds.indexOf(articleId) !== -1) return; // already credited
    data.readArticleIds.push(articleId);
    addCoins(data, ARTICLE_READ_COINS);
    saveData(data);
    showCoinToast(ARTICLE_READ_COINS, 'for reading');
  }

  // ---- Earning: purchases -------------------------------------------------
  // Small, order-size-proportional rate (0.1% cashback) — never a flat cost
  // regardless of order size.
  function awardPurchase(orderTotalNaira) {
    if (!PURCHASE_COINS_PER_NGN || !orderTotalNaira || orderTotalNaira <= 0) return;
    const earned = Math.max(PURCHASE_COINS_MIN, Math.floor(orderTotalNaira / PURCHASE_COINS_PER_NGN));
    const data = getData();
    addCoins(data, earned);
    saveData(data);
    showCoinToast(earned, 'for your order');
  }

  // ---- Earning: daily streak -------------------------------------------
  // Streak count itself is still tracked every day (needed for the 100-day
  // milestone and the streak badge on the Rewards screen) — it just no
  // longer pays a coin for the act of opening the app.
  //
  // The date used here comes from getTrustedDate() (the server's clock)
  // whenever we're online, specifically so that changing the device's date
  // — the easy, common way people fast-forward a streak — has no effect.
  function checkDailyStreak() {
    getTrustedDate()
      .catch(function () { return new Date(); }) // offline: no external clock available, fall back to device time
      .then(applyDailyStreak);
  }

  function applyDailyStreak(now) {
    const data = getData();
    const t = dateStr(now);
    if (data.lastActiveDate === t) return; // already checked for this (trusted) date

    const y = new Date(now.getTime());
    y.setDate(y.getDate() - 1);
    const yStr = dateStr(y);

    if (data.lastActiveDate === yStr) {
      data.streak += 1;
    } else {
      data.streak = 1; // first time ever, or the streak broke
    }
    data.longestStreak = Math.max(data.longestStreak, data.streak);
    data.lastActiveDate = t;

    const milestoneBonus = STREAK_MILESTONES[data.streak];
    if (milestoneBonus) {
      addCoins(data, milestoneBonus);
      saveData(data);
      showCoinToast(milestoneBonus, data.streak + '-day streak! 🔥');
    } else {
      saveData(data); // persist the updated streak/date even with nothing to award
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

    root.innerHTML =
      '<div class="rwd-header">' +
      '<div class="rwd-header-row">' +
      '<div><div class="rwd-coin-count">' + data.coins.toLocaleString() + ' <span>🪙</span></div><div class="rwd-coin-label">Sentra-X Coins</div></div>' +
      '<div class="rwd-streak-box"><div class="rwd-streak-num">🔥 ' + data.streak + '</div><div class="rwd-streak-label">day streak</div></div>' +
      '</div>' +
      '<button class="rwd-redeem-btn" onclick="showScreen(\'marketplace\')">🛍️ Shop the Marketplace</button>' +
      '</div>' +

      '<div class="rwd-earn-card">' +
      '<h4>How to earn coins</h4>' +
      '<div class="rwd-earn-row"><span>📰 Read an article</span><b>+' + ARTICLE_READ_COINS + '</b></div>' +
      '<div class="rwd-earn-row"><span>🛍️ Shop the Marketplace</span><b>+1 per ₦' + PURCHASE_COINS_PER_NGN.toLocaleString() + '</b></div>' +
      '<div class="rwd-earn-row"><span>🔥 7-day streak (one-time)</span><b>+' + STREAK_MILESTONES[7] + '</b></div>' +
      '<div class="rwd-earn-row"><span>🏁 100-day streak (one-time)</span><b>+' + STREAK_MILESTONES[100] + '</b></div>' +
      '<p class="rwd-disclaimer">20 🪙 = ₦1 · worth ≈₦' + (data.coins * COIN_TO_NGN).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' in Marketplace credit today · not cash, not withdrawable</p>' +
      '</div>';

    updateBalancePills();
  }


  // ---- Spending: Marketplace checkout only --------------------------------
  // Called by store.js at the exact moment a payment succeeds — same trust
  // point the existing awardPurchase() already uses, so this introduces no
  // new timing risk beyond what purchase-reward already has. Deducting only
  // on confirmed success (never at checkout submission) means there's never
  // a need to refund coins for an abandoned or failed payment — nothing was
  // ever deducted in the first place if payment didn't go through.
  function getCoins() {
    return getData().coins;
  }

  function spendCoins(amount) {
    if (!amount || amount <= 0) return;
    const data = getData();
    data.coins = Math.max(0, data.coins - amount); // floor at 0, never negative
    saveData(data);
  }

  if (typeof window !== 'undefined') {
    window.SentraXRewards = {
      render: renderRewards,
      awardArticleRead: awardArticleRead,
      hasReadArticle: hasReadArticle,
      awardPurchase: awardPurchase,
      checkDailyStreak: checkDailyStreak,
      getCoins: getCoins,
      spendCoins: spendCoins,
      coinToNgn: COIN_TO_NGN
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARTICLE_READ_COINS: ARTICLE_READ_COINS, COIN_TO_NGN: COIN_TO_NGN, PURCHASE_COINS_PER_NGN: PURCHASE_COINS_PER_NGN, PURCHASE_COINS_MIN: PURCHASE_COINS_MIN };
  }
})();
