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
    { id: 'walking-cane', name: 'Adjustable Walking Cane', category: 'mobility', price: 8500, emoji: '🦯',
      short: 'Height-adjustable, foldable, non-slip base.',
      long: 'A lightweight, height-adjustable cane with a comfortable ergonomic handle and a wide non-slip rubber tip for stability on most surfaces. Folds down for easy storage and travel.' },
    { id: 'crutches', name: 'Elbow Crutches (Pair)', category: 'mobility', price: 11000, emoji: '🩼',
      short: 'Adjustable height, padded arm cuffs.',
      long: 'A sturdy pair of adjustable elbow crutches with padded, contoured arm cuffs and comfortable hand grips, designed to support recovery from injury or reduced mobility.' },
    { id: 'rollator', name: '3-Wheel Folding Rollator Walker', category: 'mobility', price: 48000, emoji: '🚶',
      short: 'Folds flat, with hand brakes and a seat.',
      long: 'A compact, lightweight three-wheel walker with hand brakes and a fold-down seat for resting on the go — much easier to maneuver through doorways and tight spaces than a standard 4-wheel frame. Folds flat for the car boot.' },
    { id: 'wheelchair', name: 'Foldable Manual Wheelchair', category: 'mobility', price: 68000, emoji: '🦽',
      short: 'Lightweight frame, folds for transport.',
      long: 'A lightweight, foldable manual wheelchair with comfortable armrests and footrests — folds down easily for storage in a car boot, making it practical for both home use and outings.' },
    { id: 'first-aid-kit', name: 'Premium First Aid Kit (120-piece)', category: 'firstaid', price: 12000, emoji: '🧰',
      short: 'Bandages, antiseptic wipes, scissors & more.',
      long: 'A comprehensive 120-piece kit covering everyday cuts, scrapes, sprains, and minor emergencies — bandages, gauze, antiseptic wipes, tape, scissors, and a compact carry case that fits in a bag, car, or kitchen cabinet.' },
    { id: 'face-masks', name: 'Disposable Face Masks (Pack of 50)', category: 'firstaid', price: 3000, emoji: '😷',
      short: '3-ply protection, comfortable ear loops.',
      long: 'A pack of 50 disposable 3-ply face masks with soft ear loops — a practical everyday essential for hospital visits, caregiving, or general protection at home.' },
    { id: 'hand-sanitizer', name: 'Hand Sanitizer (Pack of 3)', category: 'firstaid', price: 2500, emoji: '🧴',
      short: '70% alcohol, travel-size, pack of 3.',
      long: 'A pack of three 70% alcohol hand sanitizer bottles — everyday essentials for hygiene at home, on the go, or during hospital visits.' },
    { id: 'knee-brace', name: 'Elastic Knee Support Brace', category: 'support', price: 5500, emoji: '🦵',
      short: 'Compression support for aching or weak knees.',
      long: 'A breathable, elastic knee sleeve that provides gentle compression and support for everyday aches, mild strains, or recovery — comfortable enough to wear under clothing throughout the day.' },
    { id: 'wrist-splint', name: 'Adjustable Wrist Splint', category: 'support', price: 6500, emoji: '🖐️',
      short: 'Stabilizes the wrist for strain or repetitive pain.',
      long: 'A rigid-but-comfortable splint that keeps the wrist in a neutral, supported position — helpful for strain, repetitive stress, or recovery, with adjustable straps for a secure, personalized fit.' },
    { id: 'posture-brace', name: 'Posture Corrector Back Brace', category: 'support', price: 8000, emoji: '🧍',
      short: 'Adjustable straps to support upright posture.',
      long: 'An adjustable, breathable back brace that gently pulls the shoulders back to encourage healthier posture — comfortable enough for daily wear at a desk or during light activity.' },
    { id: 'pill-organizer', name: 'Weekly Pill Organizer (7-Day, AM/PM)', category: 'medaids', price: 4500, emoji: '💊',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pilulier%20semainier.JPG?width=500',
      short: 'Morning & evening compartments for every day of the week.',
      long: 'A 7-day pill organizer with separate morning and evening compartments for each day, making it easy to see at a glance whether today\'s doses have been taken — helpful for managing several medications at once.' },
    { id: 'compression-socks', name: 'Compression Socks (Pair)', category: 'support', price: 5000, emoji: '🧦',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Compression%20socks.jpg?width=500',
      short: 'Graduated compression to support leg circulation.',
      long: 'A pair of graduated compression socks that gently support circulation in the legs and feet — often worn for long periods of sitting or standing, swelling, or general leg comfort.' },
    { id: 'hot-cold-pack', name: 'Reusable Hot & Cold Gel Pack', category: 'firstaid', price: 4000, emoji: '🧊',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cold%20Hot%20Pack.jpg?width=500',
      short: 'Freeze it or microwave it — flexible, reusable relief.',
      long: 'A flexible reusable gel pack that can be frozen for cold therapy or warmed for heat therapy — a simple, reusable way to ease minor aches, swelling, or muscle tension at home.' },
    { id: 'hot-water-bottle', name: 'Rubber Hot Water Bottle', category: 'firstaid', price: 3500, emoji: '🍶',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hot%20Water%20Bottle.jpg?width=500',
      short: 'Classic warmth for aches, cramps, or cold nights.',
      long: 'A traditional rubber hot water bottle for soothing warmth — commonly used for cramps, muscle aches, or simply staying warm on cold nights.' },
    { id: 'grab-bar', name: 'Bathroom Grab Bar / Safety Rail', category: 'safety', price: 9500, emoji: '🚿',
      short: 'Wall-mounted support rail for showers, tubs & toilets.',
      long: 'A sturdy wall-mounted grab bar that gives extra stability when getting in or out of the shower, bath, or toilet — one of the simplest ways to reduce fall risk in the bathroom, where most home falls happen.' },
    { id: 'raised-toilet-seat', name: 'Raised Toilet Seat with Handles', category: 'safety', price: 15000, emoji: '🚽',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Electric%20raised%20toilet%20seat%20for%20elderly.jpg?width=500',
      short: 'Adds height and side handles for easier, safer sitting.',
      long: 'Fits over most standard toilets to raise the seat height and add side handles for extra support — reduces strain on knees and hips when sitting down or standing up, and lowers fall risk in the bathroom.' },
    { id: 'shower-chair', name: 'Shower Chair / Bath Transfer Bench', category: 'safety', price: 22000, emoji: '🪑',
      short: 'Stable seated support for safer bathing.',
      long: 'A sturdy, non-slip chair for the shower or bath, letting you sit safely while washing rather than standing on a wet, slippery surface — widely recommended for reducing fall risk during bathing.' },
    { id: 'bath-mat', name: 'Non-Slip Bath Mat', category: 'safety', price: 4500, emoji: '🛁',
      short: 'Textured rubber grip for wet bathroom floors.',
      long: 'A textured rubber mat that grips the floor of the shower or tub, reducing the risk of slipping on a wet surface — one of the cheapest, simplest ways to make a bathroom safer.' },
    { id: 'medical-id-bracelet', name: 'Medical Alert ID Bracelet', category: 'safety', price: 6000, emoji: '🆔',
      short: 'Engraved bracelet for allergies, conditions & emergency contact.',
      long: 'An engraved stainless steel bracelet listing your condition, allergies, or medications, so emergency responders have vital information even if you can\'t speak for yourself.' },
    { id: 'large-print-labels', name: 'Large-Print Medication Labels (Pack)', category: 'medaids', price: 2000, emoji: '🔍',
      short: 'Bold, easy-to-read stick-on labels for pill bottles.',
      long: 'A pack of bold, large-print stick-on labels for medication bottles — makes it much easier to tell doses apart at a glance, especially helpful for anyone managing several medications or with reduced eyesight.' }
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
    const src = p.image || ('images/products/' + p.id + '.jpg');
    return '<div class="mkt-cover" data-category="' + p.category + '" onclick="SentraXStore.open(\'' + p.id + '\')">' +
      '<span class="mkt-cover-fallback">' + (p.emoji || CATEGORY_EMOJI[p.category] || '📦') + '</span>' +
      '<img class="mkt-cover-img" src="' + src + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';">' +
      '</div>';
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
      '<div class="mkt-reader-cover" data-category="' + p.category + '"><span class="mkt-cover-fallback">' + (p.emoji || CATEGORY_EMOJI[p.category] || '📦') + '</span><img class="mkt-cover-img" src="' + (p.image || ('images/products/' + p.id + '.jpg')) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';"></div>' +
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
      '<div class="mkt-cart-emoji" data-category="' + p.category + '"><span class="mkt-cover-fallback" style="font-size:20px;">' + (p.emoji || CATEGORY_EMOJI[p.category] || '📦') + '</span><img class="mkt-cart-img" src="' + (p.image || ('images/products/' + p.id + '.jpg')) + '" alt="" onerror="this.style.display=\'none\';"></div>' +
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
    }).catch(function () {
      // Order is already safely saved (localStorage + Firestore) even if
      // this notification email fails to send — never blocks checkout.
    });
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

    notifySellerOfOrder(order);

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
