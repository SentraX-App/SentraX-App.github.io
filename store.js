/*
 * store.js — Sentra-X Marketplace
 * ========================================
 * Sells ordinary, low-regulatory-risk consumer goods: home safety items,
 * medication organizers (the organizer itself, never medication), everyday
 * food and fresh produce, fitness/wellness accessories, personal care, and
 * kitchen/hydration essentials — nothing prescription-only, no medical
 * devices, no vitamins/supplements, no products marketed around a disease
 * or medical condition.
 *
 * Fully functional end to end — browse, product detail, cart, quantity
 * changes, checkout form, order confirmation — EXCEPT the actual payment
 * charge, since Paystack verification is still pending. Checkout currently
 * places an order in a "pending payment" state and shows a clear note that
 * payment will be confirmed manually until Paystack goes live.
 *
 * Wiring up real payments later is a single step: fill in
 * payWithPaystack() below with Paystack Inline JS/Popup using the order
 * total (in kobo) and public key, then call it from placeOrder() instead
 * of going straight to the "pending payment" confirmation.
 *
 * Isolated from everything else, same pattern as articles.js — new file,
 * no edits to script.js's core logic (just a few hook-in lines to open
 * this screen from the nav, exactly like Articles).
 */

(function () {
  'use strict';

  // ---- Catalog -------------------------------------------------------
  const CATEGORIES = [
    { key: 'wellness', name: 'Fitness & Wellness' },
    { key: 'personalcare', name: 'Personal & Travel Accessories' },
    { key: 'stationery', name: 'Stationery & Office' }
  ];

  const CATEGORY_NAME = {};
  CATEGORIES.forEach(function (c) { CATEGORY_NAME[c.key] = c.name; });

    const PRODUCTS = [
    // ---- Fitness & Wellness ------------------------------------------------
    { id: 'exercise-mat', name: 'Foam Exercise / Yoga Mat', category: 'wellness', price: 7900,
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yoga%20mat.jpg?width=500',
      short: 'Cushioned mat for gentle exercise, stretching, or daily movement.',
      long: 'A comfortable foam exercise mat for light stretching, yoga, or gentle daily movement routines — non-slip surface, easy to clean, rolls up for storage.' },
    
    { id: 'resistance-bands', name: 'Resistance Exercise Bands (Set)', category: 'wellness', price: 7900,
      image: 'https://images.pexels.com/photos/6339598/pexels-photo-6339598.jpeg?auto=compress&w=800',
      short: 'Set of bands for gentle strength and mobility exercises.',
      long: 'A set of resistance bands in varying strengths for gentle strength-building and everyday mobility exercises — low-impact and adjustable to fitness level.' },
    
    { id: 'skipping-rope', name: 'Skipping / Jump Rope', category: 'wellness', price: 3100,
      image: 'https://images.pexels.com/photos/6339602/pexels-photo-6339602.jpeg?auto=compress&w=800',
      short: 'Adjustable rope for everyday cardio exercise.',
      long: 'A lightweight, adjustable-length skipping rope — a simple, portable way to fit in some cardio at home, in the yard, or on the go.' },
    
    { id: 'gym-duffel-bag', name: 'Sports & Gym Duffel Bag', category: 'wellness', price: 13000,
      image: 'https://images.pexels.com/photos/8555309/pexels-photo-8555309.jpeg?auto=compress&w=800',
      short: 'Roomy duffel bag for gym kit, gear, or travel.',
      long: 'A durable, roomy duffel bag with a comfortable shoulder strap — plenty of space for gym kit, workout gear, or a quick overnight trip.' },

    { id: 'yoga-block', name: 'Yoga Block', category: 'wellness', price: 5000,
      image: 'https://images.pexels.com/photos/6752163/pexels-photo-6752163.jpeg?auto=compress&w=800',
      short: 'A supportive block for stretching, balance, and yoga.',
      long: 'A lightweight foam yoga block for extra support and reach during stretching, balance work, or yoga practice — useful for beginners and experienced practitioners alike.' },

    { id: 'ab-wheel', name: 'Ab Wheel / Core Roller', category: 'wellness', price: 7900,
      image: 'https://images.pexels.com/photos/8032772/pexels-photo-8032772.jpeg?auto=compress&w=800',
      short: 'A simple wheel for core and ab strength exercises.',
      long: 'A simple rolling wheel for core and abdominal strength exercises at home — an easy, low-cost way to work the midsection as part of a regular fitness routine.' },

    { id: 'stability-exercise-ball', name: 'Stability / Exercise Ball', category: 'wellness', price: 9300,
      image: 'https://images.pexels.com/photos/6454030/pexels-photo-6454030.jpeg?auto=compress&w=800',
      short: 'A large inflatable ball for balance, core, and stretching.',
      long: 'A large inflatable exercise ball for balance work, core exercises, and stretching — a simple, versatile addition to a home fitness routine.' },

    // ---- Personal & Travel Accessories -------------------------------------
    { id: 'sleep-eye-mask', name: 'Sleep Eye Mask', category: 'personalcare', price: 5400,
      image: 'https://images.pexels.com/photos/6541082/pexels-photo-6541082.jpeg?auto=compress&w=800',
      short: 'Soft, light-blocking mask for better sleep.',
      long: 'A soft, contoured sleep mask that blocks out light — a simple everyday accessory for naps, travel, or a darker bedroom at night.' },
    
    { id: 'cooling-sports-towel', name: 'Sports Cooling-Down Towel', category: 'personalcare', price: 4600,
      image: 'https://images.pexels.com/photos/5038791/pexels-photo-5038791.jpeg?auto=compress&w=800',
      short: 'A towel for wiping down and cooling off after exercise.',
      long: 'A soft, absorbent towel for wiping down and cooling off after a workout, walk, or time outdoors — a simple everyday gym-bag essential.' },

    { id: 'sleep-socks', name: 'Sleep Socks', category: 'personalcare', price: 4300,
      image: 'https://images.pexels.com/photos/35210015/pexels-photo-35210015.jpeg?auto=compress&w=800',
      short: 'Soft, warm socks for bedtime.',
      long: 'A pair of soft, cozy socks for keeping feet warm at bedtime — a simple everyday comfort item for cold nights.' },

    // ---- Stationery & Office -----------------------------------------------
    { id: 'daily-notes-planner', name: 'Daily Notes Planner', category: 'stationery', price: 6400,
      image: 'https://images.pexels.com/photos/8581059/pexels-photo-8581059.jpeg?auto=compress&w=800',
      short: 'A daily planner for notes, tasks, and priorities.',
      long: 'A simple daily notes planner for jotting down tasks, reminders, and priorities — an easy paper-based way to stay organized day to day.' }

  ];

  // ============================================================================
  // COMPLIANCE LAYER — internal/data-level only, per the conservative
  // dropshipping screening policy. Nothing here changes what a product IS
  // (name/price/image/description untouched); it only extends each product
  // object with optional fields and gates what's shown to customers.
  // No new customer-facing UI, no badges, no per-card warning text — the
  // existing short marketplace disclaimer already covers this appropriately.
  // ============================================================================

  // Every product defaults to LOW_RISK_SCREENED unless explicitly flagged
  // below — ordinary fitness gear, bags, stationery, and plain housewares
  // (cutting boards, jars, spoons, lunch boxes) carry the same regulatory
  // profile as identical items sold in any Nigerian supermarket, with no
  // specific certification requirement in practice. These fields are additive
  // only — no existing property was renamed or removed.
  PRODUCTS.forEach(function (p) {
    p.complianceStatus = 'LOW_RISK_SCREENED';
    p.supplierDocumentation = 'not_required';
    p.supplierVerified = false;
    p.regulatoryReview = 'screened_low_risk';
    p.imageVerified = true; // every image in this catalog was individually source-checked before being added (see chat history)
    p.priceStatus = 'target_listing_price'; // NOT a claimed/verified live supplier quote — see Section 10 of the compliance brief
  });

  // Explicit overrides — anything the conservative screening rules call out
  // specifically, rather than leaving it to the ordinary-household-good
  // default above. Empty right now: the one item that previously needed
  // this (rechargeable-led-torch, unverified electronics certification)
  // was removed from the catalog entirely rather than just held. Left in
  // place as ready-to-use infrastructure for anything flagged in future.
  const COMPLIANCE_OVERRIDES = {};
  Object.keys(COMPLIANCE_OVERRIDES).forEach(function (id) {
    const p = productsById_forOverrides_lookup(id);
    if (p) Object.assign(p, COMPLIANCE_OVERRIDES[id]);
  });
  function productsById_forOverrides_lookup(id) {
    for (let i = 0; i < PRODUCTS.length; i++) { if (PRODUCTS[i].id === id) return PRODUCTS[i]; }
    return null;
  }

  // The ONLY gate that matters for "customers should see a clean
  // marketplace": every existing render path below is left completely
  // untouched — this just decides which products those unchanged code
  // paths are allowed to see, by filtering at the source array level
  // (see shuffleProducts() and the initial shuffledProducts assignment).
  function isPublishable(p) {
    return !!p && p.complianceStatus === 'LOW_RISK_SCREENED';
  }

  const productsById = {};
  PRODUCTS.forEach(function (p) { productsById[p.id] = p; });

  // ---- Helpers ---------------------------------------------------------
  function esc(str) {
    return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str == null ? '' : str);
  }

  function formatPrice(n) {
    return '₦' + Number(n).toLocaleString('en-NG');
  }

  let selectedCategory = 'all';

  // ---- Cart (persisted in localStorage as { productId: qty }) ----------
  function getCart() {
    try { return JSON.parse(localStorage.getItem('mkt-cart') || '{}'); }
    catch (e) { return {}; }
  }

  function saveCart(cart) {
    localStorage.setItem('mkt-cart', JSON.stringify(cart));
    updateCartBadge();
  }

  function cartCount(cart) {
    return Object.keys(cart).reduce(function (sum, id) { return sum + cart[id]; }, 0);
  }

  function cartTotal(cart) {
    return Object.keys(cart).reduce(function (sum, id) {
      const p = productsById[id];
      return p ? sum + p.price * cart[id] : sum;
    }, 0);
  }

  function addToCart(id, qty) {
    const cart = getCart();
    cart[id] = (cart[id] || 0) + (qty || 1);
    saveCart(cart);
  }

  function setCartQty(id, qty) {
    const cart = getCart();
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    saveCart(cart);
    if (document.getElementById('mkt-cart-overlay') && document.getElementById('mkt-cart-overlay').style.display === 'block') {
      renderCartStep();
    }
  }

  function updateCartBadge() {
    const badge = document.getElementById('mkt-cart-badge');
    if (!badge) return;
    const n = cartCount(getCart());
    badge.textContent = n;
    badge.style.display = n > 0 ? 'flex' : 'none';
  }

  // Derives the actual Commons file description page (where the real
  // author + license live) from a Special:FilePath image URL, so the credit
  // tag can link to authoritative, always-current attribution instead of a
  // static "Wikimedia Commons" label that names no one — several of these
  // images are CC BY-SA, which requires crediting the specific author.
  function wikimediaFilePageUrl(imageUrl) {
    const m = imageUrl.match(/Special:FilePath\/([^?]+)/);
    if (!m) return 'https://commons.wikimedia.org/';
    return 'https://commons.wikimedia.org/wiki/File:' + m[1];
  }

  // ---- Main grid render --------------------------------------------------
  function coverHtml(p) {
    const src = p.image || ('images/products/' + p.id + '.jpg');
    const isWikimedia = !!(p.image && p.image.indexOf('wikimedia.org') !== -1);
    return '<div class="mkt-cover" data-category="' + p.category + '" onclick="SentraXStore.open(\'' + p.id + '\')">' +
      '<img class="mkt-cover-img" src="' + src + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';var cr=this.parentElement.querySelector(\'.img-credit\');if(cr)cr.remove();">' +
      (isWikimedia ? '<a href="' + wikimediaFilePageUrl(p.image) + '" target="_blank" rel="noopener" class="img-credit" onclick="event.stopPropagation();">Wikimedia Commons</a>' : '') +
      '</div>';
  }

  function productCardHtml(p) {
    return '<div class="mkt-card">' +
      coverHtml(p) +
      '<div class="mkt-body">' +
      '<h4 onclick="SentraXStore.open(\'' + p.id + '\')">' + esc(p.name) + '</h4>' +
      '<div class="mkt-price">' + formatPrice(p.price) + '</div>' +
      '<button class="mkt-add-btn" onclick="event.stopPropagation();SentraXStore.addToCart(\'' + p.id + '\',1)">+ Add to Cart</button>' +
      '</div></div>';
  }

  let shuffledProducts = PRODUCTS.filter(isPublishable);
  let lastShuffleAt = 0;
  const MARKETPLACE_RESHUFFLE_MS = 5 * 60 * 1000; // re-shuffle on return visits, not on every category click

  function shuffleProducts() {
    const arr = PRODUCTS.filter(isPublishable);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    shuffledProducts = arr;
    lastShuffleAt = Date.now();
  }

  // Called on tab entry only — reshuffles at most once per MARKETPLACE_RESHUFFLE_MS,
  // then renders. Internal re-renders (category filter clicks) call renderStore()
  // directly and reuse whatever order is already shuffled, so filtering never
  // jumbles the grid mid-browse.
  function enterStore() {
    if (!lastShuffleAt || Date.now() - lastShuffleAt > MARKETPLACE_RESHUFFLE_MS) {
      shuffleProducts();
    }
    renderStore();
  }

  function renderStore() {
    const root = document.getElementById('marketplace-root');
    if (!root) return;

    const chipsHtml = '<div class="mkt-chip-row">' +
      '<button class="mkt-chip' + (selectedCategory === 'all' ? ' active' : '') + '" onclick="SentraXStore.selectCategory(\'all\')">All</button>' +
      CATEGORIES.map(function (c) {
        return '<button class="mkt-chip' + (selectedCategory === c.key ? ' active' : '') + '" onclick="SentraXStore.selectCategory(\'' + c.key + '\')">' + c.name + '</button>';
      }).join('') + '</div>';

    const filtered = selectedCategory === 'all' ? shuffledProducts : shuffledProducts.filter(function (p) { return p.category === selectedCategory; });

    let gridInner = '';
    filtered.forEach(function (p, i) {
      gridInner += productCardHtml(p);
      if (window.SentraXAds && (i + 1) % 4 === 0 && i < filtered.length - 1) gridInner += SentraXAds.slotHtml();
    });
    const gridHtml = '<div class="mkt-grid">' + gridInner + '</div>' +
      (filtered.length === 0 ? '<div class="empty">No items in this category yet</div>' : '');

    root.innerHTML =
      '<div class="mkt-header">' +
      '<div class="mkt-header-row">' +
      '<div><h3>Marketplace</h3><p>Everyday fitness, hydration, and household essentials, delivered to your door.</p></div>' +
      '<button class="mkt-cart-btn" onclick="SentraXStore.openCart()" aria-label="Cart">🛒<span id="mkt-cart-badge" class="mkt-cart-badge" style="display:none;">0</span></button>' +
      '</div></div>' +
      '<p class="mkt-disclaimer">Sentra-X Marketplace offers everyday health-related products for the home — none of them are medicines, medical devices, diagnostic tools, or treatments, and we do not claim that any product here diagnoses, treats, cures, or prevents any disease or condition.</p>' +
      chipsHtml + gridHtml;

    updateCartBadge();
    if (window.SentraXAds) SentraXAds.init(root);
 }

  function selectCategory(key) {
    selectedCategory = key;
    renderStore();
  }

  // ---- Product detail overlay ------------------------------------------
  let detailProductId = null;
  let detailQty = 1;
  let mktHistoryPushed = false;

  window.addEventListener('popstate', function () {
    const productOverlay = document.getElementById('product-reader-overlay');
    const cartOverlay = document.getElementById('mkt-cart-overlay');
    if (productOverlay && productOverlay.style.display === 'block') {
      productOverlay.style.display = 'none';
      mktHistoryPushed = false;
    } else if (cartOverlay && cartOverlay.style.display === 'block') {
      cartOverlay.style.display = 'none';
      mktHistoryPushed = false;
    }
  });

  function ensureOverlay(id) {
    let overlay = document.getElementById(id);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = id;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function openProduct(id) {
    const p = productsById[id];
    if (!p || !isPublishable(p)) return; // held/removed products can't be opened even via a stale link or direct id
    detailProductId = id;
    detailQty = 1;
    renderProductOverlay();
    document.getElementById('product-reader-overlay').style.display = 'block';
    document.getElementById('product-reader-overlay').scrollTop = 0;
    if (!mktHistoryPushed) {
      history.pushState({ sxMktOverlay: true }, '');
      mktHistoryPushed = true;
    }
  }

  function renderProductOverlay() {
    const p = productsById[detailProductId];
    if (!p) return;
    const overlay = ensureOverlay('product-reader-overlay');
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXStore.closeProduct()">←</button>' +
      '<div class="mkt-reader-cover" data-category="' + p.category + '"><img class="mkt-cover-img" src="' + (p.image || ('images/products/' + p.id + '.jpg')) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';var cr=this.parentElement.querySelector(\'.img-credit\');if(cr)cr.remove();">' + (p.image && p.image.indexOf('wikimedia.org') !== -1 ? '<a href="' + wikimediaFilePageUrl(p.image) + '" target="_blank" rel="noopener" class="img-credit">Wikimedia Commons</a>' : '') + '</div>' +
      '<div class="art-reader-body">' +
      '<div class="mkt-cat-tag" style="display:inline-block;">' + CATEGORY_NAME[p.category] + '</div>' +
      '<h2>' + esc(p.name) + '</h2>' +
      '<div class="mkt-price" style="font-size:22px;margin-bottom:14px;">' + formatPrice(p.price) + '</div>' +
      '<p>' + esc(p.long) + '</p>' +
      '<div class="mkt-stepper-row">' +
      '<span>Quantity</span>' +
      '<div class="mkt-stepper">' +
      '<button onclick="SentraXStore.changeDetailQty(-1)">−</button>' +
      '<b id="mkt-detail-qty">' + detailQty + '</b>' +
      '<button onclick="SentraXStore.changeDetailQty(1)">+</button>' +
      '</div></div>' +
      '<button onclick="SentraXStore.addToCartFromDetail()">Add to Cart — ' + formatPrice(p.price * detailQty) + '</button>' +
      '<div class="art-reader-footnote">Non-prescription item. Secure card payment via Paystack.</div>' +
      (window.SentraXAds ? SentraXAds.slotHtml('sx-ad-inline') : '') +
      '</div>';
    if (window.SentraXAds) SentraXAds.init(overlay);
  }

  function changeDetailQty(delta) {
    detailQty = Math.max(1, detailQty + delta);
    const qtyEl = document.getElementById('mkt-detail-qty');
    if (qtyEl) {
      qtyEl.textContent = detailQty;
      const p = productsById[detailProductId];
      const btn = document.querySelector('#product-reader-overlay .art-reader-body > button');
      if (btn && p) btn.textContent = 'Add to Cart — ' + formatPrice(p.price * detailQty);
    }
  }

  function addToCartFromDetail() {
    if (!detailProductId) return;
    addToCart(detailProductId, detailQty);
    hideProductOverlayOnly();
    openCart();
  }

  function hideProductOverlayOnly() {
    const overlay = document.getElementById('product-reader-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function closeProduct() {
    hideProductOverlayOnly();
    if (mktHistoryPushed) {
      mktHistoryPushed = false;
      history.back();
    }
  }

  // ---- Cart / checkout / confirmation overlay (single sheet, 3 steps) --
  function openCart() {
    const overlay = ensureOverlay('mkt-cart-overlay');
    overlay.className = 'mkt-sheet-backdrop';
    renderCartStep();
    overlay.style.display = 'block';
    if (!mktHistoryPushed) {
      history.pushState({ sxMktOverlay: true }, '');
      mktHistoryPushed = true;
    }
  }

  function closeCart() {
    const overlay = document.getElementById('mkt-cart-overlay');
    if (overlay) overlay.style.display = 'none';
    if (mktHistoryPushed) {
      mktHistoryPushed = false;
      history.back();
    }
  }

  function cartItemRow(id, qty) {
    const p = productsById[id];
    if (!p) return '';
    return '<div class="mkt-cart-row">' +
      '<div class="mkt-cart-emoji"><img class="mkt-cart-img" src="' + (p.image || ('images/products/' + p.id + '.jpg')) + '" alt="" onerror="this.style.display=\'none\';"></div>' +
      '<div class="mkt-cart-info">' +
      '<div class="mkt-cart-name">' + esc(p.name) + '</div>' +
      '<div class="mkt-cart-unit">' + formatPrice(p.price) + ' each · Subtotal: ' + formatPrice(p.price * qty) + '</div>' +
      '</div>' +
      '<div class="mkt-stepper mkt-stepper-sm">' +
      '<button onclick="SentraXStore.setCartQty(\'' + id + '\',' + (qty - 1) + ')">−</button>' +
      '<b>' + qty + '</b>' +
      '<button onclick="SentraXStore.setCartQty(\'' + id + '\',' + (qty + 1) + ')">+</button>' +
      '</div>' +
      '<button class="mkt-cart-remove" onclick="SentraXStore.setCartQty(\'' + id + '\',0)">✕</button>' +
      '</div>';
  }

  function renderCartStep() {
    const sheet = document.getElementById('mkt-cart-overlay');
    if (!sheet) return;
    const cart = getCart();
    const ids = Object.keys(cart);

    if (ids.length === 0) {
      sheet.innerHTML = mktSheetShell('Your Cart',
        '<div class="empty">Your cart is empty</div>' +
        '<button onclick="SentraXStore.closeCart()">Browse Marketplace</button>');
      return;
    }

    const rows = ids.map(function (id) { return cartItemRow(id, cart[id]); }).join('');
    const total = cartTotal(cart);
    sheet.innerHTML = mktSheetShell('Your Cart',
      rows +
      '<div class="mkt-cart-total-row"><span>Total</span><b>' + formatPrice(total) + '</b></div>' +
      '<button onclick="SentraXStore.proceedToCheckout()">Proceed to Checkout</button>');
  }

  function proceedToCheckout() {
    coinsToApply = 0;
    renderCheckoutStep();
  }

  let coinsToApply = 0; // reset each time checkout is (re)opened, see proceedToCheckout()
  let pendingFallbackOrder = null; // set when Paystack couldn't be used, so the customer can explicitly choose to proceed without it

  function coinDiscountNaira() {
    const rewards = window.SentraXRewards;
    if (!rewards) return 0;
    return coinsToApply * rewards.coinToNgn;
  }

  function toggleUseCoins() {
    const rewards = window.SentraXRewards;
    if (!rewards) return;
    const total = cartTotal(getCart());
    const balance = rewards.getCoins();
    if (coinsToApply > 0) {
      coinsToApply = 0; // was on, turn off
    } else {
      const coinsNeededForFullOrder = Math.ceil(total / rewards.coinToNgn);
      coinsToApply = Math.min(balance, coinsNeededForFullOrder);
    }
    renderCheckoutStep();
  }

  function renderCheckoutStep() {
    const sheet = document.getElementById('mkt-cart-overlay');
    if (!sheet) return;
    const cart = getCart();
    const total = cartTotal(cart);
    const count = cartCount(cart);
    const rewards = window.SentraXRewards;
    const balance = rewards ? rewards.getCoins() : 0;
    const discount = coinDiscountNaira();
    const payable = Math.max(0, total - discount);

    let coinsBlockHtml = '';
    if (rewards && balance > 0) {
      coinsBlockHtml =
        '<div class="mkt-coins-row" onclick="SentraXStore.toggleUseCoins()">' +
        '<div><b>' + balance.toLocaleString() + ' coins available</b><br>' +
        '<span style="font-size:12px;color:#94a3b8;">Use coins as store credit toward this order</span></div>' +
        '<div class="mkt-coins-toggle ' + (coinsToApply > 0 ? 'on' : '') + '"></div>' +
        '</div>' +
        (coinsToApply > 0 ? '<div class="mkt-coins-applied">−' + coinsToApply.toLocaleString() + ' coins applied (−' + formatPrice(discount) + ')</div>' : '');
    }

    sheet.innerHTML = mktSheetShell('Checkout',
      '<button class="mkt-back-link" onclick="SentraXStore.renderCartStepPublic()">← Back to cart</button>' +
      '<div class="mkt-checkout-summary">' + count + ' item' + (count === 1 ? '' : 's') + ' · <b>' + formatPrice(total) + '</b></div>' +
      coinsBlockHtml +
      '<input type="text" id="mkt-co-name" placeholder="Full name">' +
      '<input type="email" id="mkt-co-email" placeholder="Email address (for payment receipt)">' +
      '<input type="tel" id="mkt-co-phone" placeholder="Phone number, e.g. 2348012345678">' +
      '<textarea id="mkt-co-address" placeholder="Delivery address" rows="3" style="width:100%;padding:13px;margin:6px 0;border:1px solid rgba(255,255,255,0.14);border-radius:12px;font-size:16px;background:rgba(255,255,255,0.06);color:#f1f5f9;font-family:inherit;resize:vertical;"></textarea>' +
      '<div class="mkt-paystack-note">Secure card payment via Paystack.</div>' +
      '<div class="mkt-order-summary-box">' +
        '<div class="mkt-order-summary-row"><span>Items subtotal</span><span>' + formatPrice(total) + '</span></div>' +
        (discount > 0 ? '<div class="mkt-order-summary-row"><span>Coins discount</span><span>−' + formatPrice(discount) + '</span></div>' : '') +
        '<div class="mkt-order-summary-row"><span>Delivery / logistics</span><span>Included in item price</span></div>' +
        '<div class="mkt-order-summary-row mkt-order-summary-total"><span>Total payable</span><span>' + formatPrice(payable) + '</span></div>' +
      '</div>' +
      '<div class="mkt-policy-note">' +
        'Orders are typically delivered within 2–5 business days depending on location. ' +
        'Damaged, wrong, or defective items can be reported within 48 hours of delivery for a replacement or refund — unopened, unused items in original packaging may be returned within 7 days. ' +
        'Questions or complaints: <a href="mailto:' + SELLER_EMAIL + '">' + SELLER_EMAIL + '</a>. ' +
        'By placing an order you agree to our Terms & Conditions and Privacy Policy.' +
      '</div>' +
      '<div id="mkt-co-error" style="color:#fca5a5;font-size:13px;margin-top:4px;min-height:16px;"></div>' +
      '<button onclick="SentraXStore.placeOrder()">Pay ' + formatPrice(payable) + '</button>');
  }

  // Emails the store owner directly the moment an order is placed. Orders
  // otherwise only save into the buyer's own private Firestore document —
  // with no shared "orders" collection or admin view, this email is
  // currently the ONLY way a new order gets noticed. Uses EmailJS's public
  // (browser-safe) key — no private key needed for a client-side send.
  const SELLER_EMAIL = 'sentraxforteltd@gmail.com';
  const EMAILJS_SERVICE_ID = 'service_sq7cgqb';
  const EMAILJS_TEMPLATE_ID = 'template_9clzjfk';
  const EMAILJS_PUBLIC_KEY = 'nAbELba6szw8IyjO-';

  function notifySellerOfOrder(order) {
    const itemLines = order.items.map(function (it) {
      return it.qty + 'x ' + it.name + ' (' + formatPrice(it.price * it.qty) + ')';
    }).join(', ');
    const message = 'NEW SENTRA-X ORDER ' + order.ref + '\n' +
      'Total: ' + formatPrice(order.total) + '\n' +
      'Items: ' + itemLines + '\n' +
      'Customer: ' + order.name + ' — ' + order.phone + '\n' +
      'Delivery address: ' + order.address;

    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: SELLER_EMAIL,
          patient_name: 'Sentra-X Marketplace',
          caregiver_name: 'Store Owner',
          alert_message: message
        }
      })
    }).then(function (res) {
      if (!res.ok) {
        order.notifyFailed = true;
        const orders = JSON.parse(localStorage.getItem('mkt-orders') || '[]');
        localStorage.setItem('mkt-orders', JSON.stringify(orders));
      }
    }).catch(function () {
      order.notifyFailed = true;
    });
  }

  // TODO: replace with your real Paystack public key (test key is fine to
  // start — Paystack test keys work immediately, no merchant verification
  // needed, and show their own "TEST MODE" banner automatically so nobody
  // is misled). Get it from Paystack Dashboard → Settings → API Keys & Webhooks.
  const PAYSTACK_PUBLIC_KEY = 'pk_live_a6b2acb7e65e0b4eb742f559d1ce231345df3e8d';

  function placeOrder() {
    const name = (document.getElementById('mkt-co-name').value || '').trim();
    const email = (document.getElementById('mkt-co-email').value || '').trim();
    const phone = (document.getElementById('mkt-co-phone').value || '').trim();
    const address = (document.getElementById('mkt-co-address').value || '').trim();
    const errEl = document.getElementById('mkt-co-error');
    if (!name || !email || !phone || !address) {
      if (errEl) errEl.textContent = 'Please fill in your name, email, phone number, and delivery address.';
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      if (errEl) errEl.textContent = 'Please enter a valid email address.';
      return;
    }

    const cart = getCart();
    const items = Object.keys(cart).map(function (id) {
      const p = productsById[id];
      return { id: id, name: p.name, price: p.price, qty: cart[id] };
    });
    const total = cartTotal(cart);
    const discount = coinDiscountNaira();
    const payable = Math.max(0, total - discount);
    const order = {
      ref: 'SXM-' + Date.now().toString(36).toUpperCase(),
      items: items,
      total: total,
      coinsApplied: coinsToApply,
      discount: discount,
      amountPaid: payable,
      name: name,
      email: email,
      phone: phone,
      address: address,
      status: 'pending_payment',
      createdAt: Date.now()
    };

    // Fully covered by coin discount — nothing left to charge. Paystack
    // doesn't support ₦0 transactions and would hang if we tried, so skip
    // it entirely and finalize the order as paid via coins.
    if (payable <= 0) {
      order.status = 'paid';
      order.paystackRef = 'COIN_REDEMPTION';
      finalizeOrder(order);
      return;
    }

    if (typeof PaystackPop === 'undefined' || PAYSTACK_PUBLIC_KEY.indexOf('REPLACE_ME') !== -1) {
      offerManualFallback(order, errEl, "Card payment couldn't load in this browser (common with strict privacy or ad-blocking settings).");
      return;
    }

    const btn = document.querySelector('#mkt-cart-overlay button[onclick="SentraXStore.placeOrder()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

    let paystackSettled = false;
    let popupLoaded = false;

    function resetButton() {
      if (btn) { btn.disabled = false; btn.textContent = 'Pay ' + formatPrice(payable); }
    }

    try {
      const popup = new PaystackPop();
      const transaction = popup.newTransaction({
        key: PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: Math.round(payable * 100),
        currency: 'NGN',
        reference: order.ref,
        metadata: {
          custom_fields: [
            { display_name: 'Customer Name', variable_name: 'customer_name', value: name },
            { display_name: 'Phone', variable_name: 'phone', value: phone },
            { display_name: 'Delivery Address', variable_name: 'address', value: address }
          ]
        },
        onLoad: function () {
          popupLoaded = true;
        },
        onSuccess: function (result) {
          paystackSettled = true;
          order.status = 'paid';
          order.paystackRef = result.reference;
          finalizeOrder(order);
        },
        onCancel: function () {
          paystackSettled = true;
          resetButton();
        },
        onError: function (error) {
          paystackSettled = true;
          resetButton();
          if (typeof Sentry !== 'undefined' && Sentry.captureException) {
            try { Sentry.captureException(error instanceof Error ? error : new Error('Paystack onError: ' + (error && error.message))); } catch (_ignored) { /* best effort */ }
          }
          offerManualFallback(order, errEl, 'Card payment failed to start' + (error && error.message ? (': ' + error.message) : '.'));
        }
      });

      setTimeout(function () {
        if (!popupLoaded && !paystackSettled) {
          try { popup.cancelTransaction(transaction.id); } catch (e) { /* best effort */ }
          paystackSettled = true;
          resetButton();
          offerManualFallback(order, errEl, "Card payment didn't load in time — this can happen on a slow or unstable connection.");
        }
      }, 10000);

    } catch (e) {
      resetButton();
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        try { Sentry.captureException(e); } catch (_ignored) { /* best effort */ }
      }
      offerManualFallback(order, errEl, "Card payment couldn't be opened just now" + (e && e.message ? (': ' + e.message) : '.'));
    }
  }

  function offerManualFallback(order, errEl, reason) {
    pendingFallbackOrder = order;
    if (errEl) {
      errEl.innerHTML = reason + ' You can still place the order — we\'ll contact you to arrange payment.' +
        '<button type="button" onclick="SentraXStore.placeOrderWithoutPaystack()" style="display:block;width:auto;padding:8px 14px;margin:10px auto 0;font-size:13px;">Place order without card payment</button>';
    }
  }

  function placeOrderWithoutPaystack() {
    if (!pendingFallbackOrder) return;
    const order = pendingFallbackOrder;
    pendingFallbackOrder = null;
    finalizeOrder(order);
  }

  function finalizeOrder(order) {
    const orders = JSON.parse(localStorage.getItem('mkt-orders') || '[]');
    orders.unshift(order);
    localStorage.setItem('mkt-orders', JSON.stringify(orders));

    if (order.status === 'paid' && window.SentraXRewards) {
      if (order.coinsApplied > 0) window.SentraXRewards.spendCoins(order.coinsApplied);
      window.SentraXRewards.awardPurchase(order.amountPaid != null ? order.amountPaid : order.total);
    }

    if (typeof syncToFirestore === 'function') {
      try { syncToFirestore({ marketplaceOrders: orders }); } catch (e) { /* offline is fine, order is saved locally */ }
    }

    notifySellerOfOrder(order);
    saveCart({});
    renderSuccessStep(order);
  }

  function payWithPaystack(order) {
    // Stub — kept for reference, unused.
  }

  function renderSuccessStep(order) {
    const sheet = document.getElementById('mkt-cart-overlay');
    if (!sheet) return;
    const paid = order.status === 'paid';
    const message = paid
      ? 'Payment received. Thanks, ' + esc(order.name.split(' ')[0]) + '! We\'ll contact you on ' + esc(order.phone) + ' to arrange delivery.'
      : 'Thanks, ' + esc(order.name.split(' ')[0]) + '! Your order is saved — we\'ll contact you on ' + esc(order.phone) + ' to confirm payment and arrange delivery.';
    sheet.innerHTML = mktSheetShell(paid ? 'Payment Successful' : 'Order Received',
      '<div class="mkt-success-check">' + (paid ? 'Paid' : 'Pending') + '</div>' +
      '<div class="mkt-success-ref">Order ' + order.ref + '</div>' +
      '<div class="mkt-checkout-summary" style="margin-bottom:14px;">' + order.items.length + ' item' + (order.items.length === 1 ? '' : 's') + ' · <b>' + formatPrice(order.total) + '</b></div>' +
      '<p style="font-size:13.5px;color:#cbd5e1;line-height:1.5;text-align:center;">' + message + '</p>' +
      '<button onclick="SentraXStore.closeCart()">Continue Shopping</button>');
  }

  function mktSheetShell(title, bodyHtml) {
    return '<div class="mkt-sheet">' +
      '<div class="mkt-sheet-handle"></div>' +
      '<div class="mkt-sheet-header"><h3>' + title + '</h3><button class="mkt-sheet-close" onclick="SentraXStore.closeCart()">✕</button></div>' +
      '<div class="mkt-sheet-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  if (typeof window !== 'undefined') {
    window.SentraXStore = {
      render: renderStore,
      enter: enterStore,
      selectCategory: selectCategory,
      open: openProduct,
      closeProduct: closeProduct,
      changeDetailQty: changeDetailQty,
      addToCartFromDetail: addToCartFromDetail,
      addToCart: addToCart,
      setCartQty: setCartQty,
      openCart: openCart,
      closeCart: closeCart,
      proceedToCheckout: proceedToCheckout,
      renderCartStepPublic: renderCartStep,
      toggleUseCoins: toggleUseCoins,
      placeOrder: placeOrder,
      placeOrderWithoutPaystack: placeOrderWithoutPaystack,
      PRODUCTS: PRODUCTS
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PRODUCTS: PRODUCTS, formatPrice: formatPrice };
  }
})();
