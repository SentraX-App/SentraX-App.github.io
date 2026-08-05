/*
 * store.js — Sentra-X Marketplace
 * ========================================
 * Sells non-regulated medical aids and wellness items (monitors, mobility
 * aids, first aid supplies, support braces, medication organizers, etc.)
 * — nothing prescription-only or clinically regulated.
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
  // Deliberately excludes anything that counts as a regulated medical
  // device (blood pressure monitors, pulse oximeters, thermometers,
  // glucose meters, nebulizers, TENS units, etc.) — everything here is a
  // non-prescription support/comfort/safety item. Also avoids generic
  // items already sold in any supermarket — these are specialty
  // caregiving and home-safety products people seek out on purpose.
  const CATEGORIES = [
    { key: 'mobility', name: 'Mobility Aids', emoji: '🦯' },
    { key: 'safety', name: 'Home Safety & Alerts', emoji: '🆘' },
    { key: 'firstaid', name: 'First Aid & Wound Care', emoji: '🩹' },
    { key: 'support', name: 'Support & Recovery', emoji: '🦵' },
    { key: 'medaids', name: 'Medication Aids', emoji: '💊' }
  ];

  const CATEGORY_NAME = {};
  const CATEGORY_EMOJI = {};
  CATEGORIES.forEach(function (c) { CATEGORY_NAME[c.key] = c.name; CATEGORY_EMOJI[c.key] = c.emoji; });

  const PRODUCTS = [
    { id: 'walking-cane', name: 'Adjustable Walking Cane', category: 'mobility', price: 6000, emoji: '🦯',
      short: 'Height-adjustable, foldable, non-slip base.',
      long: 'A lightweight, height-adjustable cane with a comfortable ergonomic handle and a wide non-slip rubber tip for stability on most surfaces. Folds down for easy storage and travel.' },
    { id: 'crutches', name: 'Elbow Crutches (Pair)', category: 'mobility', price: 15000, emoji: '🩼',
      short: 'Adjustable height, padded arm cuffs.',
      long: 'A sturdy pair of adjustable elbow crutches with padded, contoured arm cuffs and comfortable hand grips, designed to support recovery from injury or reduced mobility.' },
    { id: 'rollator', name: '3-Wheel Folding Rollator Walker', category: 'mobility', price: 45000, emoji: '🚶',
      short: 'Folds flat, with hand brakes and a seat.',
      long: 'A compact, lightweight three-wheel walker with hand brakes and a fold-down seat for resting on the go — much easier to maneuver through doorways and tight spaces than a standard 4-wheel frame. Folds flat for the car boot.' },
    { id: 'gait-belt', name: 'Caregiver Transfer & Gait Belt', category: 'mobility', price: 7500, emoji: '🪢',
      short: 'Helps caregivers safely support a walk or transfer.',
      long: 'A padded, quick-release belt that gives a caregiver a secure grip when helping someone stand, walk, or transfer between a bed, chair, or car — reduces strain on both of you and lowers fall risk during assisted movement.' },
    { id: 'grab-bar', name: 'Bathroom Safety Grab Bar', category: 'safety', price: 9500, emoji: '🛁',
      short: 'Wall-mounted support rail for bath & toilet.',
      long: 'A sturdy, textured stainless-steel grab bar that mounts securely to the wall to help prevent slips and falls in the bathroom — a simple addition that adds real peace of mind for elderly or recovering household members.' },
    { id: 'shower-chair', name: 'Folding Shower Chair', category: 'safety', price: 18000, emoji: '🚿',
      short: 'Non-slip legs, drains freely, folds for storage.',
      long: 'A sturdy, water-resistant chair that lets someone sit safely while bathing — non-slip rubber feet, drainage holes, and a folding frame that tucks away when not in use.' },
    { id: 'raised-toilet-seat', name: 'Raised Toilet Seat with Handles', category: 'safety', price: 14000, emoji: '🚽',
      short: 'Adds height and side handles for safer sit-to-stand.',
      long: 'Fits over most standard toilets to add extra height and sturdy side handles, making sitting down and standing up significantly safer and easier for anyone with limited mobility or recovering from surgery.' },
    { id: 'emergency-alarm', name: 'Personal Emergency Alarm Pendant', category: 'safety', price: 13500, emoji: '🆘',
      short: 'Wearable panic button — one press alerts your caregiver.',
      long: 'A wearable panic-button pendant for anyone living alone or at fall risk — one press sounds a loud local alarm to bring help immediately. Pairs naturally with the SOS and caregiver-alert habits you already use in Sentra-X.' },
    { id: 'first-aid-kit', name: 'Premium First Aid Kit (120-piece)', category: 'firstaid', price: 12000, emoji: '🧰',
      short: 'Bandages, antiseptic wipes, scissors & more.',
      long: 'A comprehensive 120-piece kit covering everyday cuts, scrapes, sprains, and minor emergencies — bandages, gauze, antiseptic wipes, tape, scissors, and a compact carry case that fits in a bag, car, or kitchen cabinet.' },
    { id: 'wound-dressing-kit', name: 'Advanced Wound Care Dressing Kit', category: 'firstaid', price: 9000, emoji: '🩹',
      short: 'Hydrocolloid patches for faster, cleaner healing.',
      long: 'A set of advanced hydrocolloid and film dressings that create a protective, moisture-balanced healing environment for cuts and grazes — a step up from basic plasters for wounds that need a bit more care.' },
    { id: 'hotcold-pack', name: 'Reusable Hot & Cold Gel Pack', category: 'firstaid', price: 4500, emoji: '🧊',
      short: 'Freeze or microwave for pain & swelling relief.',
      long: 'A flexible gel pack that molds to the body for targeted relief — freeze it for swelling and minor injuries, or warm it for sore muscles and cramps. Reusable, with a soft protective sleeve included.' },
    { id: 'knee-brace', name: 'Elastic Knee Support Brace', category: 'support', price: 5500, emoji: '🦵',
      short: 'Compression support for aching or weak knees.',
      long: 'A breathable, elastic knee sleeve that provides gentle compression and support for everyday aches, mild strains, or recovery — comfortable enough to wear under clothing throughout the day.' },
    { id: 'wrist-splint', name: 'Adjustable Wrist Splint', category: 'support', price: 6500, emoji: '🖐️',
      short: 'Stabilizes the wrist for strain or repetitive pain.',
      long: 'A rigid-but-comfortable splint that keeps the wrist in a neutral, supported position — helpful for strain, repetitive stress, or recovery, with adjustable straps for a secure, personalized fit.' },
    { id: 'compression-socks', name: 'Compression Socks (Travel & Circulation)', category: 'support', price: 7000, emoji: '🧦',
      short: 'Improves circulation — great for long days or travel.',
      long: 'Graduated compression socks that help support healthy circulation in the legs — useful for long periods of standing or sitting, travel, or as part of a broader recovery and wellness routine.' },
    { id: 'cervical-pillow', name: 'Cervical Neck Support Pillow', category: 'support', price: 9500, emoji: '🛏️',
      short: 'Ergonomic contour for neck pain & better sleep posture.',
      long: 'A contoured memory-foam pillow shaped to cradle and align the neck during sleep — a common recommendation for easing neck stiffness and supporting better spinal posture overnight.' },
    { id: 'postpartum-belt', name: 'Postpartum Recovery Belt', category: 'support', price: 11000, emoji: '🤱',
      short: 'Gentle abdominal & back support after birth.',
      long: 'A soft, adjustable wrap that gives gentle abdominal and lower-back support in the weeks after childbirth — helps with posture and comfort as the body recovers, breathable enough for all-day wear.' },
    { id: 'posture-brace', name: 'Posture Corrector Back Brace', category: 'support', price: 8000, emoji: '🧍',
      short: 'Adjustable straps to support upright posture.',
      long: 'An adjustable, breathable back brace that gently pulls the shoulders back to encourage healthier posture — comfortable enough for daily wear at a desk or during light activity.' },
    { id: 'pill-organizer', name: '7-Day AM/PM Pill Organizer', category: 'medaids', price: 4000, emoji: '💊',
      short: 'Morning & night compartments, 7 days.',
      long: 'A twice-daily medicine organizer with separate morning and evening compartments for every day of the week — pairs perfectly with Sentra-X reminder alerts for anyone managing more than one medication.' },
    { id: 'pill-crusher', name: 'Pill Crusher & Splitter', category: 'medaids', price: 3500, emoji: '⚙️',
      short: 'Crushes or splits tablets for easier dosing.',
      long: 'A simple, sturdy tool that crushes tablets to powder or splits them precisely in half — useful for anyone who has trouble swallowing pills whole or needs an exact half-dose.' }
  ];

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

  // ---- Main grid render --------------------------------------------------
  function coverHtml(p) {
    return '<div class="mkt-cover" data-category="' + p.category + '" onclick="SentraXStore.open(\'' + p.id + '\')">' + p.emoji + '</div>';
  }

  function productCardHtml(p) {
    return '<div class="mkt-card">' +
      coverHtml(p) +
      '<div class="mkt-body">' +
      '<div class="mkt-cat-tag">' + CATEGORY_EMOJI[p.category] + ' ' + CATEGORY_NAME[p.category] + '</div>' +
      '<h4 onclick="SentraXStore.open(\'' + p.id + '\')">' + esc(p.name) + '</h4>' +
      '<div class="mkt-price">' + formatPrice(p.price) + '</div>' +
      '<button class="mkt-add-btn" onclick="event.stopPropagation();SentraXStore.addToCart(\'' + p.id + '\',1)">+ Add to Cart</button>' +
      '</div></div>';
  }

  function renderStore() {
    const root = document.getElementById('marketplace-root');
    if (!root) return;

    const chipsHtml = '<div class="mkt-chip-row">' +
      '<button class="mkt-chip' + (selectedCategory === 'all' ? ' active' : '') + '" onclick="SentraXStore.selectCategory(\'all\')">All</button>' +
      CATEGORIES.map(function (c) {
        return '<button class="mkt-chip' + (selectedCategory === c.key ? ' active' : '') + '" onclick="SentraXStore.selectCategory(\'' + c.key + '\')">' + c.emoji + ' ' + c.name + '</button>';
      }).join('') + '</div>';

    const filtered = selectedCategory === 'all' ? PRODUCTS : PRODUCTS.filter(function (p) { return p.category === selectedCategory; });

    const gridHtml = '<div class="mkt-grid">' + filtered.map(productCardHtml).join('') + '</div>' +
      (filtered.length === 0 ? '<div class="empty">No items in this category yet</div>' : '');

    root.innerHTML =
      '<div class="mkt-header">' +
      '<div class="mkt-header-row">' +
      '<div><h3>🛍️ Marketplace</h3><p>Everyday health & mobility aids, delivered to your door.</p></div>' +
      '<button class="mkt-cart-btn" onclick="SentraXStore.openCart()">🛒<span id="mkt-cart-badge" class="mkt-cart-badge" style="display:none;">0</span></button>' +
      '</div></div>' +
      chipsHtml + gridHtml +
      '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">Non-prescription health & mobility aids only. Card payment via Paystack is launching soon.</p>';

    updateCartBadge();
  }

  function selectCategory(key) {
    selectedCategory = key;
    renderStore();
  }

  // ---- Product detail overlay ------------------------------------------
  let detailProductId = null;
  let detailQty = 1;

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
    if (!p) return;
    detailProductId = id;
    detailQty = 1;
    renderProductOverlay();
    document.getElementById('product-reader-overlay').style.display = 'block';
    document.getElementById('product-reader-overlay').scrollTop = 0;
  }

  function renderProductOverlay() {
    const p = productsById[detailProductId];
    if (!p) return;
    const overlay = ensureOverlay('product-reader-overlay');
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXStore.closeProduct()">←</button>' +
      '<div class="mkt-reader-cover" data-category="' + p.category + '">' + p.emoji + '</div>' +
      '<div class="art-reader-body">' +
      '<div class="mkt-cat-tag" style="display:inline-block;">' + CATEGORY_EMOJI[p.category] + ' ' + CATEGORY_NAME[p.category] + '</div>' +
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
      '<div class="art-reader-footnote">Non-prescription item. Card payment via Paystack is launching soon — orders are confirmed manually until then.</div>' +
      '</div>';
  }

  function changeDetailQty(delta) {
    detailQty = Math.max(1, detailQty + delta);
    const qtyEl = document.getElementById('mkt-detail-qty');
    if (qtyEl) {
      // Cheap in-place update instead of a full re-render for a snappier feel.
      qtyEl.textContent = detailQty;
      const p = productsById[detailProductId];
      const btn = document.querySelector('#product-reader-overlay .art-reader-body > button');
      if (btn && p) btn.textContent = 'Add to Cart — ' + formatPrice(p.price * detailQty);
    }
  }

  function addToCartFromDetail() {
    if (!detailProductId) return;
    addToCart(detailProductId, detailQty);
    closeProduct();
    openCart();
  }

  function closeProduct() {
    const overlay = document.getElementById('product-reader-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ---- Cart / checkout / confirmation overlay (single sheet, 3 steps) --
  function openCart() {
    const overlay = ensureOverlay('mkt-cart-overlay');
    overlay.className = 'mkt-sheet-backdrop';
    renderCartStep();
    overlay.style.display = 'block';
  }

  function closeCart() {
    const overlay = document.getElementById('mkt-cart-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function cartItemRow(id, qty) {
    const p = productsById[id];
    if (!p) return '';
    return '<div class="mkt-cart-row">' +
      '<div class="mkt-cart-emoji">' + p.emoji + '</div>' +
      '<div class="mkt-cart-info">' +
      '<div class="mkt-cart-name">' + esc(p.name) + '</div>' +
      '<div class="mkt-cart-unit">' + formatPrice(p.price) + ' each</div>' +
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
    renderCheckoutStep();
  }

  function renderCheckoutStep() {
    const sheet = document.getElementById('mkt-cart-overlay');
    if (!sheet) return;
    const cart = getCart();
    const total = cartTotal(cart);
    const count = cartCount(cart);

    sheet.innerHTML = mktSheetShell('Checkout',
      '<button class="mkt-back-link" onclick="SentraXStore.renderCartStepPublic()">← Back to cart</button>' +
      '<div class="mkt-checkout-summary">' + count + ' item' + (count === 1 ? '' : 's') + ' · <b>' + formatPrice(total) + '</b></div>' +
      '<input type="text" id="mkt-co-name" placeholder="Full name">' +
      '<input type="tel" id="mkt-co-phone" placeholder="Phone number, e.g. 2348012345678">' +
      '<textarea id="mkt-co-address" placeholder="Delivery address" rows="3" style="width:100%;padding:13px;margin:6px 0;border:1px solid rgba(255,255,255,0.14);border-radius:12px;font-size:16px;background:rgba(255,255,255,0.06);color:#f1f5f9;font-family:inherit;resize:vertical;"></textarea>' +
      '<div class="mkt-paystack-note">🔒 Card payment via Paystack is launching soon. Your order is saved now — we\'ll reach out to confirm payment and delivery.</div>' +
      '<div id="mkt-co-error" style="color:#fca5a5;font-size:13px;margin-top:4px;min-height:16px;"></div>' +
      '<button onclick="SentraXStore.placeOrder()">Place Order — ' + formatPrice(total) + '</button>');
  }

  function placeOrder() {
    const name = (document.getElementById('mkt-co-name').value || '').trim();
    const phone = (document.getElementById('mkt-co-phone').value || '').trim();
    const address = (document.getElementById('mkt-co-address').value || '').trim();
    const errEl = document.getElementById('mkt-co-error');
    if (!name || !phone || !address) {
      if (errEl) errEl.textContent = 'Please fill in your name, phone number, and delivery address.';
      return;
    }

    const cart = getCart();
    const items = Object.keys(cart).map(function (id) {
      const p = productsById[id];
      return { id: id, name: p.name, price: p.price, qty: cart[id] };
    });
    const total = cartTotal(cart);
    const order = {
      ref: 'SXM-' + Date.now().toString(36).toUpperCase(),
      items: items,
      total: total,
      name: name,
      phone: phone,
      address: address,
      status: 'pending_payment',
      createdAt: Date.now()
    };

    const orders = JSON.parse(localStorage.getItem('mkt-orders') || '[]');
    orders.unshift(order);
    localStorage.setItem('mkt-orders', JSON.stringify(orders));

    // Best-effort sync so the order isn't only sitting in local storage —
    // uses the same helper the rest of the app already syncs through.
    if (typeof syncToFirestore === 'function') {
      try { syncToFirestore({ marketplaceOrders: orders }); } catch (e) { /* offline is fine, order is saved locally */ }
    }

    // TODO(paystack): once merchant verification is approved, call
    // payWithPaystack(order) here instead of going straight to the
    // "pending payment" confirmation below, then mark the order paid
    // in the Paystack callback.
    saveCart({});
    renderSuccessStep(order);
  }

  // Stub — fill in once Paystack verification is approved. Left unused/
  // uncalled on purpose so nothing tries to charge a card today.
  function payWithPaystack(order) {
    // Example shape once ready:
    // const handler = PaystackPop.setup({
    //   key: 'PAYSTACK_PUBLIC_KEY',
    //   email: <customer email>,
    //   amount: order.total * 100, // kobo
    //   ref: order.ref,
    //   callback: function(response) { /* mark order paid, sync, show success */ },
    //   onClose: function() {}
    // });
    // handler.openIframe();
  }

  function renderSuccessStep(order) {
    const sheet = document.getElementById('mkt-cart-overlay');
    if (!sheet) return;
    sheet.innerHTML = mktSheetShell('Order Received',
      '<div class="mkt-success-check">✅</div>' +
      '<div class="mkt-success-ref">Order ' + order.ref + '</div>' +
      '<div class="mkt-checkout-summary" style="margin-bottom:14px;">' + order.items.length + ' item' + (order.items.length === 1 ? '' : 's') + ' · <b>' + formatPrice(order.total) + '</b></div>' +
      '<p style="font-size:13.5px;color:#cbd5e1;line-height:1.5;text-align:center;">Thanks, ' + esc(order.name.split(' ')[0]) + '! Card payment via Paystack is launching soon — we\'ll contact you on ' + esc(order.phone) + ' to confirm payment and arrange delivery.</p>' +
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
      placeOrder: placeOrder,
      PRODUCTS: PRODUCTS
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PRODUCTS: PRODUCTS, formatPrice: formatPrice };
  }
})();
