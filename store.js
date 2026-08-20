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
  const CATEGORIES = [
    { key: 'wellness', name: 'Fitness & Wellness', emoji: '🧘' },
    { key: 'comfort', name: 'Home Comfort & Accessibility', emoji: '🛋️' },
    { key: 'medaids', name: 'Medication Aids', emoji: '💊' },
    { key: 'kitchen-living', name: 'Kitchen & Everyday Living', emoji: '🍽️' }
  ];

  const CATEGORY_NAME = {};
  const CATEGORY_EMOJI = {};
  CATEGORIES.forEach(function (c) { CATEGORY_NAME[c.key] = c.name; CATEGORY_EMOJI[c.key] = c.emoji; });

  const PRODUCTS = [
    { id: 'hot-cold-pack', name: 'Reusable Hot & Cold Gel Pack', category: 'comfort', price: 11700, emoji: '🧊',
      short: 'Freeze it or warm it — flexible and reusable for everyday comfort.',
      long: 'A flexible, reusable gel pack you can freeze for cold or warm up for heat — a simple, reusable comfort accessory to keep at home.',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cold%20Hot%20Pack.jpg?width=500' },
    { id: 'hot-water-bottle', name: 'Rubber Hot Water Bottle', category: 'comfort', price: 10400, emoji: '🍶',
      short: 'Classic warmth for cold nights.',
      long: 'A traditional rubber hot water bottle for soothing warmth on cold nights — a simple, everyday household comfort item.',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hot%20Water%20Bottle.jpg?width=500' },
    { id: 'first-aid-box', name: 'Compact First Aid Box (Home & Office)', category: 'comfort', price: 22100, emoji: '📦',
      short: 'A simple, wall-mountable box for everyday minor cuts and scrapes.',
      long: 'A compact, no-frills first aid box for home or office — covers everyday minor cuts and scrapes without the bulk of a full kit. Easy to keep in a kitchen drawer, car, or by the front door.',
      image: 'https://images.pexels.com/photos/5149757/pexels-photo-5149757.jpeg?auto=compress&w=800' },
    { id: 'moisturizing-foot-lotion', name: 'Moisturizing Foot & Body Lotion', category: 'comfort', price: 11700, emoji: '🧴',
      short: 'Deeply moisturizing lotion for everyday dry-skin care.',
      long: 'A deeply moisturizing, fragrance-conscious lotion for feet and body — a gentle daily choice for dry or sensitive skin.',
      image: 'https://images.pexels.com/photos/5797999/pexels-photo-5797999.jpeg?auto=compress&w=800' },
    { id: 'neem-teatree-soap', name: 'Neem & Tea Tree Herbal Soap (Bar)', category: 'comfort', price: 5800, emoji: '🧼',
      short: 'Handmade, herb-infused daily cleansing bar.',
      long: 'A handmade soap bar infused with neem and tea tree — a gentle, herbal daily cleanser with a fresh, natural scent. A cosmetic skincare bar, not a medicated treatment.',
      image: 'https://images.pexels.com/photos/16244099/pexels-photo-16244099.jpeg?auto=compress&w=800' },
    { id: 'rose-shea-soap', name: 'Rose & Shea Butter Soap (Bar)', category: 'comfort', price: 6100, emoji: '🌹',
      short: 'Moisturizing handmade bar with real shea butter.',
      long: 'A moisturizing handmade soap bar blending shea butter with rose — gentle enough for daily use, leaving skin soft rather than stripped.',
      image: 'https://images.pexels.com/photos/10853720/pexels-photo-10853720.jpeg?auto=compress&w=800' },
    { id: 'mens-shaving-cream', name: "Men's Herbal Shaving Cream (150g)", category: 'comfort', price: 8300, emoji: '🪒',
      short: 'Rich lather for a smooth, comfortable shave.',
      long: 'A rich, herb-infused shaving cream that softens facial hair and cushions the skin for a closer, more comfortable shave with less irritation.',
      image: 'https://images.pexels.com/photos/7253888/pexels-photo-7253888.jpeg?auto=compress&w=800' },
    { id: 'herbal-hair-scalp-oil', name: 'Herbal Hair & Scalp Oil (200ml)', category: 'comfort', price: 9100, emoji: '💆',
      short: 'Nourishing blend for scalp massage & hair care.',
      long: 'A nourishing herbal oil blend for scalp massage and hair care — worked through the scalp and lengths to help with dryness and everyday hair care routines.',
      image: 'https://images.pexels.com/photos/14656188/pexels-photo-14656188.jpeg?auto=compress&w=800' },
    { id: 'sleep-eye-mask', name: 'Sleep Eye Mask', category: 'comfort', price: 4300, emoji: '😴',
      short: 'Soft, light-blocking mask for better sleep.',
      long: 'A soft, contoured eye mask that blocks light for better sleep — useful at home, while traveling, or for daytime naps.',
      image: 'https://images.pexels.com/photos/6787202/pexels-photo-6787202.jpeg?auto=compress&w=800' },
    { id: 'microfiber-towel', name: 'Quick-Dry Microfiber Towel', category: 'comfort', price: 6700, emoji: '🧻',
      short: 'Lightweight, fast-drying, compact for travel or gym.',
      long: 'A lightweight, fast-drying microfiber towel — compact enough for the gym bag or travel case, while still absorbing well.',
      image: 'https://images.pexels.com/photos/6693658/pexels-photo-6693658.jpeg?auto=compress&w=800' },
    { id: 'bamboo-toothbrush', name: 'Bamboo Toothbrush', category: 'comfort', price: 2400, emoji: '🪥',
      short: 'Biodegradable handle, soft bristles.',
      long: 'An everyday toothbrush with a biodegradable bamboo handle and soft bristles — a simple, eco-friendly swap for the bathroom.',
      image: 'https://images.pexels.com/photos/3737576/pexels-photo-3737576.jpeg?auto=compress&w=800' },
    { id: 'rechargeable-led-torch', name: 'Rechargeable LED Torch', category: 'comfort', price: 9700, emoji: '🔦',
      short: 'USB-rechargeable, bright and reliable for home use.',
      long: 'A bright, USB-rechargeable LED torch for home use — handy during power outages or for everyday around-the-house use, no disposable batteries needed.',
      image: 'https://images.pexels.com/photos/6800226/pexels-photo-6800226.jpeg?auto=compress&w=800' },
    { id: 'magnifying-glass', name: 'Large Lens Magnifying Glass', category: 'comfort', price: 6800, emoji: '🔍',
      short: 'Comfortable grip, wide lens for reading and close-up tasks.',
      long: 'A magnifying glass with a wide lens and comfortable grip — useful for reading small print, labels, or any close-up task around the house.',
      image: 'https://images.pexels.com/photos/6153354/pexels-photo-6153354.jpeg?auto=compress&w=800' },
    { id: 'adhesive-bandages-pack', name: 'Adhesive Bandages Variety Pack', category: 'comfort', price: 3600, emoji: '🩹',
      short: 'Assorted sizes for everyday minor cuts and scrapes.',
      long: 'An assorted pack of adhesive bandages in various sizes — a household essential for everyday minor cuts and scrapes.',
      image: 'https://images.pexels.com/photos/3873201/pexels-photo-3873201.jpeg?auto=compress&w=800' },
    { id: 'travel-first-aid-pouch', name: 'Travel First Aid Pouch', category: 'comfort', price: 7200, emoji: '🎒',
      short: 'Compact, empty pouch to organize your own supplies.',
      long: 'A compact, empty organizer pouch sized for a small first aid kit — pack it with your own everyday supplies for travel, the car, or a bag.',
      image: 'https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&w=800' },
    { id: 'exercise-mat', name: 'Foam Exercise / Yoga Mat', category: 'wellness', price: 14300, emoji: '🧘',
      short: 'Cushioned mat for gentle exercise, stretching, or physio routines.',
      long: 'A comfortable foam exercise mat for light stretching, physiotherapy exercises, or gentle daily movement routines — non-slip surface, easy to clean, rolls up for storage.',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yoga%20mat.jpg?width=500' },
    { id: 'resistance-bands', name: 'Resistance Exercise Bands (Set)', category: 'wellness', price: 9400, emoji: '🎗️',
      short: 'Set of bands for gentle strength and mobility exercises.',
      long: 'A set of resistance bands in varying strengths for gentle strength-building, joint mobility, and physiotherapy-style exercises — low-impact and adjustable to fitness level.',
      image: 'https://images.pexels.com/photos/6339598/pexels-photo-6339598.jpeg?auto=compress&w=800' },
    { id: 'foam-roller', name: 'Foam Roller', category: 'wellness', price: 14300, emoji: '🎢',
      short: 'Roller for muscle recovery, stretching, and tension relief.',
      long: 'A durable foam roller for muscle recovery and self-massage — helps ease muscle tightness and improve flexibility, popular for both rehabilitation and general wellness routines.',
      image: 'https://images.pexels.com/photos/6207527/pexels-photo-6207527.jpeg?auto=compress&w=800' },
    { id: 'skipping-rope', name: 'Skipping / Jump Rope', category: 'wellness', price: 4800, emoji: '🪢',
      short: 'Adjustable length, simple cardio anytime.',
      long: 'An adjustable-length skipping rope for quick, simple cardio at home or outdoors — no gym required.',
      image: 'https://images.pexels.com/photos/4162451/pexels-photo-4162451.jpeg?auto=compress&w=800' },
    { id: 'gym-duffel-bag', name: 'Sports & Gym Duffel Bag', category: 'wellness', price: 13600, emoji: '🎒',
      short: 'Spacious, durable bag for gym or travel.',
      long: 'A spacious, durable duffel bag for the gym, sports, or a weekend trip — room for kit, shoes, and everyday essentials.',
      image: 'https://images.pexels.com/photos/4662354/pexels-photo-4662354.jpeg?auto=compress&w=800' },
    { id: 'pill-organizer', name: 'Weekly Pill Organizer (7-Day, AM/PM)', category: 'medaids', price: 6200, emoji: '💊',
      short: 'Morning & evening compartments for every day of the week.',
      long: 'A 7-day pill organizer with separate morning and evening compartments for each day, making it easy to see at a glance whether today\'s doses have been taken — helpful for managing several medications at once.',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pilulier%20semainier.JPG?width=500' },
    { id: 'insulated-water-bottle', name: 'Insulated Stainless Steel Water Bottle', category: 'kitchen-living', price: 9800, emoji: '🍶',
      short: 'Keeps drinks cold or hot for hours.',
      long: 'A double-walled insulated stainless steel water bottle — keeps drinks cold or hot for hours, an everyday reusable swap for single-use bottles.',
      image: 'https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg?auto=compress&w=800' },
    { id: 'sports-water-bottle', name: 'Everyday Sports Water Bottle', category: 'kitchen-living', price: 4200, emoji: '🥤',
      short: 'Lightweight, leak-proof, easy to carry.',
      long: 'A lightweight, leak-proof sports water bottle — easy to carry to the gym, work, or school for everyday hydration.',
      image: 'https://images.pexels.com/photos/4753986/pexels-photo-4753986.jpeg?auto=compress&w=800' },
    { id: 'glass-storage-jars', name: 'Glass Food Storage Jars (Set)', category: 'kitchen-living', price: 8900, emoji: '🫙',
      short: 'Airtight glass jars for pantry organization.',
      long: 'A set of airtight glass storage jars for the pantry — keeps dry goods fresh and your shelves organized.',
      image: 'https://images.pexels.com/photos/4198668/pexels-photo-4198668.jpeg?auto=compress&w=800' },
    { id: 'meal-prep-containers', name: 'Reusable Meal Prep Containers (Set)', category: 'kitchen-living', price: 7600, emoji: '🍱',
      short: 'Stackable, microwave-safe containers.',
      long: 'A set of stackable, microwave-safe meal prep containers — an easy everyday way to portion, store, and reheat meals.',
      image: 'https://images.pexels.com/photos/4198567/pexels-photo-4198567.jpeg?auto=compress&w=800' },
    { id: 'reusable-tote-bag', name: 'Reusable Canvas Tote Bag', category: 'kitchen-living', price: 3900, emoji: '👜',
      short: 'Sturdy, everyday shopping tote.',
      long: 'A sturdy canvas tote bag for everyday shopping or errands — a simple reusable swap for single-use bags.',
      image: 'https://images.pexels.com/photos/6068958/pexels-photo-6068958.jpeg?auto=compress&w=800' },
    { id: 'wooden-cutting-board', name: 'Wooden Cutting Board', category: 'kitchen-living', price: 6300, emoji: '🪵',
      short: 'Durable everyday kitchen prep board.',
      long: 'A durable wooden cutting board for everyday kitchen prep — sized for daily chopping and food prep.',
      image: 'https://images.pexels.com/photos/4198718/pexels-photo-4198718.jpeg?auto=compress&w=800' },
    { id: 'kids-lunch-box', name: 'Lunch Box (Kids & Adults)', category: 'kitchen-living', price: 5400, emoji: '🍱',
      short: 'Compartmentalized, easy to pack and carry.',
      long: 'A compartmentalized lunch box for kids or adults — easy to pack, carry, and clean for everyday school or work lunches.',
      image: 'https://images.pexels.com/photos/8951240/pexels-photo-8951240.jpeg?auto=compress&w=800' }
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

  function wikimediaFilePageUrl(imageUrl) {
    const m = /Special:FilePath\/([^?]+)/.exec(imageUrl || '');
    return m ? 'https://commons.wikimedia.org/wiki/File:' + m[1] : null;
  }

  // ---- Main grid render --------------------------------------------------
  function coverHtml(p) {
    const src = p.image || ('images/products/' + p.id + '.jpg');
    return '<div class="mkt-cover" data-category="' + p.category + '" onclick="SentraXStore.open(\'' + p.id + '\')">' +
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

  function shuffleProducts() {
    const arr = PRODUCTS.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  let hasEntered = false;

  function enterStore() {
    hasEntered = true;
    renderStore();
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
      '<div><h3>🛍️ Marketplace</h3><p>Everyday health & mobility aids, delivered to your door.</p></div>' +
      '<button class="mkt-cart-btn" onclick="SentraXStore.openCart()">🛒<span id="mkt-cart-badge" class="mkt-cart-badge" style="display:none;">0</span></button>' +
      '</div></div>' +
      chipsHtml + gridHtml +
      '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">Non-prescription health & mobility aids only. Card payment via Paystack is launching soon.</p>';

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
    if (!p) return;
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
      '<div class="mkt-reader-cover" data-category="' + p.category + '"><img class="mkt-cover-img" src="' + (p.image || ('images/products/' + p.id + '.jpg')) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';"></div>' +
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
      '<div class="mkt-cart-emoji"><img class="mkt-cart-img" src="images/products/' + p.id + '.jpg" alt="" onerror="this.style.display=\'none\';"></div>' +
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
    coinsToApply = 0;
    renderCheckoutStep();
  }

  let coinsToApply = 0;
  let pendingFallbackOrder = null;

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
      coinsToApply = 0;
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
        '<div><b>' + balance.toLocaleString() + ' 🪙 available</b><br>' +
        '<span style="font-size:12px;color:#94a3b8;">Use coins as store credit toward this order</span></div>' +
        '<div class="mkt-coins-toggle ' + (coinsToApply > 0 ? 'on' : '') + '"></div>' +
        '</div>' +
        (coinsToApply > 0 ? '<div class="mkt-coins-applied">−' + coinsToApply.toLocaleString() + ' 🪙 applied (−' + formatPrice(discount) + ')</div>' : '');
    }

    sheet.innerHTML = mktSheetShell('Checkout',
      '<button class="mkt-back-link" onclick="SentraXStore.renderCartStepPublic()">← Back to cart</button>' +
      '<div class="mkt-checkout-summary">' + count + ' item' + (count === 1 ? '' : 's') + ' · <b>' + formatPrice(total) + '</b></div>' +
      coinsBlockHtml +
      '<input type="text" id="mkt-co-name" placeholder="Full name">' +
      '<input type="email" id="mkt-co-email" placeholder="Email address (for payment receipt)">' +
      '<input type="tel" id="mkt-co-phone" placeholder="Phone number, e.g. 2348012345678">' +
      '<textarea id="mkt-co-address" placeholder="Delivery address" rows="3" style="width:100%;padding:13px;margin:6px 0;border:1px solid rgba(255,255,255,0.14);border-radius:12px;font-size:16px;background:rgba(255,255,255,0.06);color:#f1f5f9;font-family:inherit;resize:vertical;"></textarea>' +
      '<div class="mkt-paystack-note">🔒 Secure card payment via Paystack.</div>' +
      '<div id="mkt-co-error" style="color:#fca5a5;font-size:13px;margin-top:4px;min-height:16px;"></div>' +
      '<button onclick="SentraXStore.placeOrder()">Pay ' + formatPrice(payable) + '</button>');
  }

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
      '<div class="mkt-success-check">' + (paid ? '✅' : '📝') + '</div>' +
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
