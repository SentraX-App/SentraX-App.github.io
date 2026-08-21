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
    { key: 'kitchen-living', name: 'Kitchen & Everyday Living' },
    { key: 'stationery', name: 'Stationery & Office' },
    { key: 'computer-desk', name: 'Computer / Desk Accessories' }
  ];

  const CATEGORY_NAME = {};
  CATEGORIES.forEach(function (c) { CATEGORY_NAME[c.key] = c.name; });

    const PRODUCTS = [
    // ---- Fitness & Wellness ----------------------------------------------
    { id: 'exercise-mat', name: 'Foam Exercise / Yoga Mat', category: 'wellness', price: 22100,
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yoga%20mat.jpg?width=500',
      short: 'Cushioned mat for gentle exercise, stretching, or daily movement.',
      long: 'A comfortable foam exercise mat for light stretching, yoga, or gentle daily movement routines — non-slip surface, easy to clean, rolls up for storage.' },
    { id: 'resistance-bands', name: 'Resistance Exercise Bands (Set)', category: 'wellness', price: 18200,
      image: 'https://images.pexels.com/photos/6339598/pexels-photo-6339598.jpeg?auto=compress&w=800',
      short: 'Set of bands for gentle strength and mobility exercises.',
      long: 'A set of resistance bands in varying strengths for gentle strength-building and everyday mobility exercises — low-impact and adjustable to fitness level.' },
    { id: 'foam-roller', name: 'Foam Roller', category: 'wellness', price: 23400,
      image: 'https://images.pexels.com/photos/6207527/pexels-photo-6207527.jpeg?auto=compress&w=800',
      short: 'Roller for muscle care, stretching, and tension relief.',
      long: 'A durable foam roller for muscle care and self-massage — helps ease tightness and improve flexibility, popular as part of an everyday fitness or stretching routine.' },
    { id: 'skipping-rope', name: 'Skipping / Jump Rope', category: 'wellness', price: 7200,
      image: 'https://images.pexels.com/photos/6339602/pexels-photo-6339602.jpeg?auto=compress&w=800',
      short: 'Adjustable rope for everyday cardio exercise.',
      long: 'A lightweight, adjustable-length skipping rope — a simple, portable way to fit in some cardio at home, in the yard, or on the go.' },
    { id: 'gym-duffel-bag', name: 'Sports & Gym Duffel Bag', category: 'wellness', price: 27300,
      image: 'https://images.pexels.com/photos/8555309/pexels-photo-8555309.jpeg?auto=compress&w=800',
      short: 'Roomy duffel bag for gym kit, gear, or travel.',
      long: 'A durable, roomy duffel bag with a comfortable shoulder strap — plenty of space for gym kit, workout gear, or a quick overnight trip.' },

    // ---- Personal & Travel Accessories -------------------------------------
    { id: 'sleep-eye-mask', name: 'Sleep Eye Mask', category: 'personalcare', price: 6500,
      image: 'https://images.pexels.com/photos/6541082/pexels-photo-6541082.jpeg?auto=compress&w=800',
      short: 'Soft, light-blocking mask for better sleep.',
      long: 'A soft, contoured sleep mask that blocks out light — a simple everyday accessory for naps, travel, or a darker bedroom at night.' },
    { id: 'microfiber-towel', name: 'Quick-Dry Microfiber Towel', category: 'personalcare', price: 9100,
      image: 'https://images.pexels.com/photos/11370616/pexels-photo-11370616.jpeg?auto=compress&w=800',
      short: 'Lightweight, fast-drying towel for home, gym, or travel.',
      long: 'A lightweight, fast-drying microfiber towel — compact enough for a gym bag or travel case, and quicker to dry than a regular cotton towel.' },

    // ---- Kitchen & Everyday Living -----------------------------------,
    { id: 'bamboo-toothbrush', name: 'Bamboo Toothbrush', category: 'personalcare', price: 3200,
      image: 'https://images.pexels.com/photos/3654597/pexels-photo-3654597.jpeg?auto=compress&w=800',
      short: 'An eco-friendly everyday toothbrush.',
      long: 'A bamboo-handled toothbrush — a simple, everyday eco-friendly swap for a standard plastic toothbrush.' },

    // ---- Kitchen & Everyday Living ------------------------------------------
    { id: 'insulated-water-bottle', name: 'Insulated Stainless Steel Water Bottle', category: 'kitchen-living', price: 19500,
      image: 'https://images.pexels.com/photos/3737800/pexels-photo-3737800.jpeg?auto=compress&w=800',
      short: 'Keeps drinks cold or hot for hours.',
      long: 'A double-walled insulated stainless steel bottle that keeps drinks cold or hot for hours — a durable everyday alternative to single-use bottles.' },
    { id: 'sports-water-bottle', name: 'Everyday Sports Water Bottle', category: 'kitchen-living', price: 6500,
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Plastic%20Water%20Bottle.jpg?width=500',
      short: 'Lightweight reusable bottle for gym, work, or school.',
      long: 'A lightweight, reusable water bottle with a sports cap for everyday hydration at the gym, work, or school — simple and easy to carry.' },
    { id: 'reusable-bottle-600ml', name: '600ml Reusable Water Bottle', category: 'kitchen-living', price: 5400,
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/A%20blue%20water%20bottle.jpg?width=500',
      short: 'A compact everyday bottle, 600ml.',
      long: 'A compact 600ml reusable water bottle for everyday hydration — easy to carry in a bag or hold in one hand.' },
    { id: 'reusable-bottle-1000ml', name: '1000ml Reusable Water Bottle', category: 'kitchen-living', price: 7100,
      image: 'https://images.pexels.com/photos/18381807/pexels-photo-18381807.jpeg?auto=compress&w=800',
      short: 'A larger everyday bottle, 1000ml.',
      long: 'A larger 1000ml reusable water bottle for those who want fewer refills through the day — same easy-carry design as our 600ml bottle, just bigger.' },
    { id: 'vacuum-flask-steel', name: 'Stainless-Steel Vacuum Flask', category: 'kitchen-living', price: 6400,
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/A%20stainless%20steel%20thermoflask.jpg?width=500',
      short: 'A classic steel flask for hot or cold drinks.',
      long: 'A classic stainless-steel vacuum flask — sturdy, easy to clean, and a household staple for keeping tea, coffee, or cold drinks at temperature for hours.' },
    { id: 'glass-storage-jars', name: 'Glass Food Storage Jars (Set)', category: 'kitchen-living', price: 16900,
      image: 'https://images.pexels.com/photos/8580763/pexels-photo-8580763.jpeg?auto=compress&w=800',
      short: 'Airtight glass jars for pantry storage.',
      long: 'A set of clear glass jars with airtight lids — good for storing rice, beans, spices, or snacks neatly in the pantry.' },
    { id: 'meal-prep-containers', name: 'Reusable Meal Prep Containers (Set)', category: 'kitchen-living', price: 14300,
      image: 'https://images.pexels.com/photos/30635720/pexels-photo-30635720.jpeg?auto=compress&w=800',
      short: 'Stackable containers for meal prep or leftovers.',
      long: 'A set of stackable, reusable containers for portioning meals ahead, packing lunch, or storing leftovers — microwave- and dishwasher-friendly.' },
    { id: 'reusable-tote-bag', name: 'Reusable Canvas Tote Bag', category: 'kitchen-living', price: 6500,
      image: 'https://images.pexels.com/photos/8148587/pexels-photo-8148587.jpeg?auto=compress&w=800',
      short: 'Sturdy everyday bag for groceries or errands.',
      long: 'A sturdy, reusable canvas tote bag — handy for grocery runs, market trips, or everyday errands instead of single-use plastic bags.' },

    // ---- Batch 2 additions (see chat for verification notes) ---------,
    { id: 'rechargeable-led-torch', name: 'Rechargeable LED Torch', category: 'kitchen-living', price: 19500,
      image: 'https://images.pexels.com/photos/985117/pexels-photo-985117.jpeg?auto=compress&w=800',
      short: 'A reliable rechargeable torch for power outages or outdoor use.',
      long: 'A rechargeable LED torch for power outages, night walks, or general household use — a simple, practical safety item to keep charged and within reach.' },
    { id: 'wooden-cutting-board', name: 'Wooden Cutting Board', category: 'kitchen-living', price: 11000,
      image: 'https://images.pexels.com/photos/6208155/pexels-photo-6208155.jpeg?auto=compress&w=800',
      short: 'A sturdy everyday board for food prep.',
      long: 'A sturdy wooden cutting board for everyday food prep — durable, easy to clean, and gentle on knife edges.' },
    { id: 'kids-lunch-box', name: 'Lunch Box (Kids & Adults)', category: 'kitchen-living', price: 9800,
      image: 'https://images.pexels.com/photos/5852333/pexels-photo-5852333.jpeg?auto=compress&w=800',
      short: 'A compact box for packed lunches, school or work.',
      long: 'A compact, easy-to-carry lunch box for packed meals and snacks — good for school runs, the office, or a day out.' },

    // ---- Batch 3 additions — sourced from an audited catalog document,
    // each image individually verified before adding (see chat). Items
    // that would duplicate an existing product (resistance bands, yoga
    // mat, jump rope, chopping board, tote bag) or had a mismatched/
    // unverifiable photo (plastic storage basket, cleaning cloth set)
    // were left out per the source document's own "accuracy over count"
    // rule, rather than force a weak match.
    { id: 'household-storage-box', name: 'Household Storage Box', category: 'kitchen-living', price: 6400,
      image: 'https://images.pexels.com/photos/13969210/pexels-photo-13969210.jpeg?auto=compress&w=800',
      short: 'A lidded plastic box for tidy household storage.',
      long: 'A lidded plastic storage box for keeping household items organized and dust-free — stacks neatly on a shelf or in a cupboard.' },
    { id: 'woven-storage-basket', name: 'Woven Storage Basket', category: 'kitchen-living', price: 7500,
      image: 'https://images.pexels.com/photos/31390662/pexels-photo-31390662.jpeg?auto=compress&w=800',
      short: 'A woven basket for tidy, decorative storage.',
      long: 'A woven storage basket that looks good left out — handy for towels, toys, laundry, or general household clutter.' },
    { id: 'plastic-laundry-basket', name: 'Plastic Laundry Basket', category: 'kitchen-living', price: 10000,
      image: 'https://images.pexels.com/photos/4959881/pexels-photo-4959881.jpeg?auto=compress&w=800',
      short: 'A sturdy basket for carrying and sorting laundry.',
      long: 'A sturdy plastic laundry basket for carrying, sorting, and storing washing — light enough to carry full, easy to wipe clean.' },
    { id: 'dish-rack', name: 'Dish Rack', category: 'kitchen-living', price: 12300,
      image: 'https://images.pexels.com/photos/15040068/pexels-photo-15040068.jpeg?auto=compress&w=800',
      short: 'Holds washed dishes while they air-dry.',
      long: 'A dish rack that holds washed plates, cups, and cutlery while they air-dry by the sink — keeps the counter tidy in the meantime.' },
    { id: 'lunch-bag', name: 'Reusable Lunch Bag', category: 'kitchen-living', price: 5000,
      image: 'https://images.pexels.com/photos/9885402/pexels-photo-9885402.jpeg?auto=compress&w=800',
      short: 'A soft carry bag for packed lunches.',
      long: 'A soft, reusable lunch bag for carrying packed meals to school, work, or a day out — easier to fold flat and stow than a rigid box.' },
    { id: 'travel-toiletry-bag', name: 'Travel Toiletry Bag', category: 'personalcare', price: 6000,
      image: 'https://images.pexels.com/photos/9185875/pexels-photo-9185875.jpeg?auto=compress&w=800',
      short: 'Keeps toiletries together and contained while travelling.',
      long: 'A compact toiletry bag that keeps everything from a toothbrush to skincare together and contained inside a suitcase or overnight bag.' },
    { id: 'hanging-toiletry-pouch', name: 'Hanging Travel Toiletry Pouch', category: 'personalcare', price: 6500,
      image: 'https://images.pexels.com/photos/9185867/pexels-photo-9185867.jpeg?auto=compress&w=800',
      short: 'Hangs from a hook or door for easy access while travelling.',
      long: 'A toiletry pouch with a hook, so it hangs from a door or rail instead of taking up counter space — handy in a hotel bathroom or shared space.' },
    { id: 'compact-umbrella', name: 'Compact Umbrella', category: 'personalcare', price: 5400,
      image: 'https://images.pexels.com/photos/5052681/pexels-photo-5052681.jpeg?auto=compress&w=800',
      short: 'Folds small enough for an everyday bag.',
      long: 'A compact umbrella that folds down small enough to keep in a bag or car for whenever the rain catches you out.' },
    { id: 'wooden-serving-tray', name: 'Wooden Serving Tray', category: 'kitchen-living', price: 31400,
      image: 'https://images.pexels.com/photos/6962405/pexels-photo-6962405.jpeg?auto=compress&w=800',
      short: 'A tray for carrying food or drinks around the home.',
      long: 'A wooden serving tray for carrying drinks, snacks, or a full meal from the kitchen to the table — also doubles as a neat breakfast-in-bed tray.' },
    { id: 'kitchen-spatula', name: 'Kitchen Spatula', category: 'kitchen-living', price: 4500,
      image: 'https://images.pexels.com/photos/5514723/pexels-photo-5514723.jpeg?auto=compress&w=800',
      short: 'An everyday spatula for cooking and flipping.',
      long: 'A sturdy kitchen spatula for everyday cooking — flipping, stirring, and serving without scratching non-stick pans.' },
    { id: 'measuring-cup', name: 'Measuring Cup', category: 'kitchen-living', price: 4000,
      image: 'https://images.pexels.com/photos/8113743/pexels-photo-8113743.jpeg?auto=compress&w=800',
      short: 'A clear cup with marked measurements for cooking and baking.',
      long: 'A clear measuring cup with marked measurement lines — handy for cooking, baking, or measuring liquids accurately.' },
    { id: 'wooden-kitchen-spoon', name: 'Wooden Kitchen Spoon', category: 'kitchen-living', price: 3500,
      image: 'https://images.pexels.com/photos/8474057/pexels-photo-8474057.jpeg?auto=compress&w=800',
      short: 'A classic wooden spoon for everyday cooking.',
      long: 'A classic wooden cooking spoon — gentle on pots and pans, and a staple in most kitchens for stirring and serving.' },
    { id: 'dish-drying-rack', name: 'Dish Drying Rack', category: 'kitchen-living', price: 18900,
      image: 'https://images.pexels.com/photos/3869662/pexels-photo-3869662.jpeg?auto=compress&w=800',
      short: 'A rack for air-drying washed dishes by the sink.',
      long: 'A dish drying rack that sits by the sink, holding washed plates and bowls upright to air-dry without stacking wet dishes on the counter.' },
    { id: 'measuring-spoon-set', name: 'Measuring Spoon Set', category: 'kitchen-living', price: 4000,
      image: 'https://images.pexels.com/photos/9737802/pexels-photo-9737802.jpeg?auto=compress&w=800',
      short: 'A set of spoons for accurate cooking and baking measurements.',
      long: 'A set of measuring spoons in graduated sizes — for accurately measuring spices, baking ingredients, or liquids in everyday cooking.' },
    { id: 'microfiber-cleaning-cloth', name: 'Microfiber Cleaning Cloth', category: 'kitchen-living', price: 3500,
      image: 'https://images.pexels.com/photos/4440608/pexels-photo-4440608.jpeg?auto=compress&w=800',
      short: 'A reusable cloth for everyday surface cleaning.',
      long: 'A reusable microfiber cleaning cloth for wiping down counters, tables, and other everyday surfaces — washable and reusable instead of paper towels.' },
    { id: 'kitchen-sponge', name: 'Kitchen Sponge', category: 'kitchen-living', price: 3500,
      image: 'https://images.pexels.com/photos/4440527/pexels-photo-4440527.jpeg?auto=compress&w=800',
      short: 'An everyday sponge for washing dishes.',
      long: 'A standard kitchen sponge for everyday dish washing and surface cleanup.' },

    // ---- New batch: stationery & one kitchen item, all Pexels-verified --
    { id: 'daily-notes-planner', name: 'Daily Notes Planner', category: 'stationery', price: 10000,
      image: 'https://images.pexels.com/photos/6446244/pexels-photo-6446244.jpeg?auto=compress&w=800',
      short: 'A daily planner for notes, tasks, and priorities.',
      long: 'A simple daily notes planner for jotting down tasks, reminders, and priorities — an easy paper-based way to stay organized day to day.' },
    { id: 'sticky-notes-pack', name: 'Sticky Notes Pack', category: 'stationery', price: 3500,
      image: 'https://images.pexels.com/photos/6991439/pexels-photo-6991439.jpeg?auto=compress&w=800',
      short: 'A pack of sticky notes for quick reminders.',
      long: 'A pack of sticky notes for quick reminders, labels, or to-do lists — stick them anywhere you need a note to catch your eye.' },
    { id: 'memo-notepad', name: 'Memo Notepad', category: 'stationery', price: 4000,
      image: 'https://images.pexels.com/photos/7794001/pexels-photo-7794001.jpeg?auto=compress&w=800',
      short: 'A simple notepad for everyday notes.',
      long: 'A simple, everyday notepad for jotting down notes, messages, or lists — a handy desk or bag essential.' },
    { id: 'pencil-case', name: 'Pencil Case', category: 'stationery', price: 6000,
      image: 'https://images.pexels.com/photos/5963052/pexels-photo-5963052.jpeg?auto=compress&w=800',
      short: 'A case for keeping pens and pencils organized.',
      long: 'A sturdy pencil case for keeping pens, pencils, and small stationery items organized in a bag or on a desk.' },
    { id: 'pencil-pouch', name: 'Pencil Pouch', category: 'stationery', price: 6500,
      image: 'https://images.pexels.com/photos/7396388/pexels-photo-7396388.jpeg?auto=compress&w=800',
      short: 'A soft pouch for everyday stationery.',
      long: 'A soft, zippered pouch for carrying pens, pencils, and everyday stationery — compact enough for a bag or backpack.' },
    { id: 'ice-cube-tray', name: 'Ice Cube Tray', category: 'kitchen-living', price: 5000,
      image: 'https://images.pexels.com/photos/8287262/pexels-photo-8287262.jpeg?auto=compress&w=800',
      short: 'A flexible tray for freezing ice cubes or herbs.',
      long: 'A flexible ice cube tray — freeze water, juice, or herbs in neat portions for drinks and cooking.' },
    { id: 'mouse-pad-basic', name: 'Basic Computer Mouse Pad', category: 'computer-desk', price: 5000,
      image: 'https://images.pexels.com/photos/7538509/pexels-photo-7538509.jpeg?auto=compress&w=800',
      short: 'A simple everyday mouse pad for desk or home office use.',
      long: 'A basic mouse pad with a smooth surface for everyday desk use — sized for a standard mouse, whether at home, office, or study.' },
    { id: 'mouse-mat-large-desk', name: 'Large Desk Mouse Mat', category: 'computer-desk', price: 8500,
      image: 'https://images.pexels.com/photos/27559487/pexels-photo-27559487.jpeg?auto=compress&w=800',
      short: 'An extended desk mat with more room for mouse and keyboard.',
      long: 'A large desk mouse mat that extends across more of the desk surface — extra room for the mouse alongside a keyboard, for a tidier everyday desk setup. Keyboard, mouse, and laptop shown for scale are not included.' }
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

  let shuffledProducts = PRODUCTS.slice();
  let lastShuffleAt = 0;
  const MARKETPLACE_RESHUFFLE_MS = 5 * 60 * 1000; // re-shuffle on return visits, not on every category click

  function shuffleProducts() {
    const arr = PRODUCTS.slice();
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
      '<p class="mkt-disclaimer">Sentra-X Marketplace focuses on ordinary consumer fitness, lifestyle, household and organizational products — not medicines, medical devices, diagnostic tools, or treatments, and no product here is claimed to diagnose, treat, cure, or prevent any disease or condition.</p>' +
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
          // Popup actually rendered — the "stuck loading" case Paystack's own
          // docs warn about (transaction never loads) no longer applies here,
          // so cancel our own fallback timer.
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

      // Paystack's own guidance: if the transaction hasn't loaded within
      // ~10 seconds, cancel it and fall back — rather than leaving the
      // customer staring at a popup stuck on its own loading spinner with
      // no way out, which is what v1's setup()/openIframe() had no
      // mechanism to prevent.
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
      // Report to Sentry (already loaded on the page, just never called) —
      // this catch block was silently swallowing the real error before,
      // so "couldn't be opened" on another device gave zero diagnostic
      // info. Now the actual thrown error/stack is visible in the Sentry
      // dashboard, and the on-screen message includes the real reason too.
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        try { Sentry.captureException(e); } catch (_ignored) { /* best effort */ }
      }
      offerManualFallback(order, errEl, "Card payment couldn't be opened just now" + (e && e.message ? (': ' + e.message) : '.'));
    }
  }

  // Shown when Paystack genuinely can't be used (SDK blocked/failed to load,
  // popup didn't load in time, or threw an error). Previously this silently
  // completed the order as "pending payment" with zero visible feedback —
  // which, from the customer's side, looked exactly like tapping Pay and
  // having nothing happen at all. Now the customer sees why, and explicitly
  // chooses to continue without paying by card (order stays pending,
  // confirmed manually) rather than that decision being made silently for
  // them or being left stuck on an unresponsive popup.
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
