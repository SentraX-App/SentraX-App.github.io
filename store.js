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
    { key: 'safety', name: 'Home Safety & Alerts', emoji: '🆘' },
    { key: 'firstaid', name: 'First Aid & Comfort', emoji: '🩹' },
    { key: 'medaids', name: 'Medication Aids', emoji: '💊' },
    { key: 'wellness', name: 'Fitness & Wellness', emoji: '🧘' },
    { key: 'nutrition', name: 'Food & Nutrition', emoji: '🍚' },
    { key: 'fruits', name: 'Fresh Fruits', emoji: '🍎' },
    { key: 'personalcare', name: 'Personal & Skin Care', emoji: '🧴' },
    { key: 'kitchen-living', name: 'Kitchen & Everyday Living', emoji: '🧺' }
  ];

  const CATEGORY_NAME = {};
  const CATEGORY_EMOJI = {};
  CATEGORIES.forEach(function (c) { CATEGORY_NAME[c.key] = c.name; CATEGORY_EMOJI[c.key] = c.emoji; });

  const PRODUCTS = [
    // ---- Home Safety & Alerts -----------------------------------------
    { id: 'smoke-detector', name: 'Home Smoke Detector', category: 'safety', price: 15000, emoji: '🚨',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Smoke%20detector.JPG?width=500',
      short: 'Battery-powered smoke alarm for early fire warning at home.',
      long: 'A reliable, battery-powered smoke detector that gives an early audible warning if smoke is detected — one of the simplest, most effective home safety additions, especially in a household where every extra minute of warning matters.' },
    { id: 'fire-extinguisher-1kg', name: 'Compact Home Fire Extinguisher (1kg, Dry Powder)', category: 'safety', price: 23400, emoji: '🧯',
      image: 'https://images.pexels.com/photos/4805958/pexels-photo-4805958.jpeg?auto=compress&w=800',
      short: 'A small dry-powder extinguisher for kitchen and home fire emergencies.',
      long: 'A compact 1kg dry-powder fire extinguisher — small enough to keep in a kitchen cupboard or hallway, but effective on the everyday fire risks most homes actually face (cooking oil, electrical, general combustibles). Comes with a pressure gauge so you can check at a glance that it\u2019s still ready to use.' },

    // ---- First Aid & Comfort -------------------------------------------
    { id: 'hot-cold-pack', name: 'Reusable Hot & Cold Gel Pack', category: 'firstaid', price: 11700, emoji: '🧊',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cold%20Hot%20Pack.jpg?width=500',
      short: 'Freeze it or warm it — flexible and reusable for everyday comfort.',
      long: 'A flexible, reusable gel pack you can freeze for cold or warm up for heat — a simple, reusable comfort accessory to keep at home.' },
    { id: 'hot-water-bottle', name: 'Rubber Hot Water Bottle', category: 'firstaid', price: 10400, emoji: '🍶',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hot%20Water%20Bottle.jpg?width=500',
      short: 'Classic warmth for cold nights.',
      long: 'A traditional rubber hot water bottle for soothing warmth on cold nights — a simple, everyday household comfort item.' },


    // ---- Medication Aids -------------------------------------------------
    { id: 'pill-organizer', name: 'Weekly Pill Organizer (7-Day, AM/PM)', category: 'medaids', price: 11700, emoji: '💊',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pilulier%20semainier.JPG?width=500',
      short: 'Morning & evening compartments for every day of the week.',
      long: 'A 7-day pill organizer with separate morning and evening compartments for each day, making it easy to see at a glance whether today\'s doses have been taken — helpful for keeping track of a routine.' },

    // ---- Fitness & Wellness ----------------------------------------------
    { id: 'exercise-mat', name: 'Foam Exercise / Yoga Mat', category: 'wellness', price: 22100, emoji: '🧘',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yoga%20mat.jpg?width=500',
      short: 'Cushioned mat for gentle exercise, stretching, or daily movement.',
      long: 'A comfortable foam exercise mat for light stretching, yoga, or gentle daily movement routines — non-slip surface, easy to clean, rolls up for storage.' },
    { id: 'resistance-bands', name: 'Resistance Exercise Bands (Set)', category: 'wellness', price: 18200, emoji: '🎗️',
      image: 'https://images.pexels.com/photos/6339598/pexels-photo-6339598.jpeg?auto=compress&w=800',
      short: 'Set of bands for gentle strength and mobility exercises.',
      long: 'A set of resistance bands in varying strengths for gentle strength-building and everyday mobility exercises — low-impact and adjustable to fitness level.' },
    { id: 'foam-roller', name: 'Foam Roller', category: 'wellness', price: 23400, emoji: '🎢',
      image: 'https://images.pexels.com/photos/6207527/pexels-photo-6207527.jpeg?auto=compress&w=800',
      short: 'Roller for muscle care, stretching, and tension relief.',
      long: 'A durable foam roller for muscle care and self-massage — helps ease tightness and improve flexibility, popular as part of an everyday fitness or stretching routine.' },
    { id: 'skipping-rope', name: 'Skipping / Jump Rope', category: 'wellness', price: 7200, emoji: '🪢',
      image: 'https://images.pexels.com/photos/6339602/pexels-photo-6339602.jpeg?auto=compress&w=800',
      short: 'Adjustable rope for everyday cardio exercise.',
      long: 'A lightweight, adjustable-length skipping rope — a simple, portable way to fit in some cardio at home, in the yard, or on the go.' },
    { id: 'gym-duffel-bag', name: 'Sports & Gym Duffel Bag', category: 'wellness', price: 27300, emoji: '🎒',
      image: 'https://images.pexels.com/photos/8555309/pexels-photo-8555309.jpeg?auto=compress&w=800',
      short: 'Roomy duffel bag for gym kit, gear, or travel.',
      long: 'A durable, roomy duffel bag with a comfortable shoulder strap — plenty of space for gym kit, workout gear, or a quick overnight trip.' },
    { id: 'moisturizing-foot-lotion', name: 'Moisturizing Foot & Body Lotion', category: 'wellness', price: 11700, emoji: '🧴',
      image: 'https://images.pexels.com/photos/5797999/pexels-photo-5797999.jpeg?auto=compress&w=800',
      short: 'Deeply moisturizing lotion for everyday dry-skin care.',
      long: 'A deeply moisturizing, fragrance-conscious lotion for feet and body — a gentle daily choice for dry or sensitive skin.' },

    // ---- Food & Nutrition -------------------------------------------
    { id: 'brown-rice-5kg', name: 'Premium Brown Rice (5kg)', category: 'nutrition', price: 29900, emoji: '🍚',
      image: 'https://images.pexels.com/photos/6103071/pexels-photo-6103071.jpeg?auto=compress&w=800',
      short: 'Wholegrain brown rice, 5kg bag.',
      long: 'A 5kg bag of wholegrain brown rice — higher in fibre than white rice, a simple everyday swap for your rice bowl.' },
    { id: 'pure-honey-500ml', name: 'Pure Natural Honey (500ml)', category: 'nutrition', price: 18200, emoji: '🍯',
      image: 'https://images.pexels.com/photos/4480158/pexels-photo-4480158.jpeg?auto=compress&w=800',
      short: 'Unprocessed natural honey, 500ml jar.',
      long: 'A 500ml jar of pure, unprocessed natural honey — a natural sweetener alternative to refined sugar, commonly used in tea, on toast, or in cooking.' },
    { id: 'rolled-oats-1kg', name: 'Rolled Oats (1kg)', category: 'nutrition', price: 13600, emoji: '🥣',
      image: 'https://images.pexels.com/photos/1080105/pexels-photo-1080105.jpeg?auto=compress&w=800',
      short: 'Wholegrain rolled oats, 1kg pack.',
      long: 'A 1kg pack of wholegrain rolled oats — a high-fibre breakfast staple that\'s quick to prepare.' },
    { id: 'fresh-ginger-500g', name: 'Fresh Ginger Root (500g)', category: 'nutrition', price: 4600, emoji: '🫚',
      image: 'https://images.pexels.com/photos/20234970/pexels-photo-20234970.jpeg?auto=compress&w=800',
      short: 'Fresh ginger root, 500g.',
      long: 'Fresh ginger root, 500g — a kitchen staple used in cooking, teas, and everyday Nigerian kitchens.' },
    { id: 'zobo-drink', name: 'Chilled Zobo (Hibiscus) Drink (1.5L)', category: 'nutrition', price: 5200, emoji: '🥤',
      short: 'A tangy, refreshing hibiscus drink, a Nigerian favorite.',
      long: 'A bottle of chilled zobo — a tangy, deep-red hibiscus drink loved across Nigeria, made from dried roselle sepals. Refreshing on its own, and a popular alternative to sugary soft drinks.',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Zobo%20drink%20(hibiscus%20juice)%2001.png?width=500' },
    { id: 'tiger-nuts-500g', name: 'Dried Tiger Nuts / Aya (500g)', category: 'nutrition', price: 8400, emoji: '🌰',
      short: 'A crunchy, naturally sweet everyday snack.',
      long: 'Dried tiger nuts (aya) — a crunchy, naturally sweet snack popular across Nigeria, eaten on their own or blended into the well-loved tiger nut milk drink (kunu aya).',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Dried%20tiger%20nuts%20at%20bakin%20dogo%20market.jpg?width=500' },
    { id: 'garlic-bulbs-250g', name: 'Fresh Garlic Bulbs (250g)', category: 'nutrition', price: 3900, emoji: '🧄',
      short: 'A kitchen everyday essential for cooking and seasoning.',
      long: 'Fresh garlic bulbs — an everyday kitchen essential for seasoning soups, stews, and sauces, and one of the most commonly used aromatics in Nigerian cooking.',
      image: 'https://images.pexels.com/photos/2920402/pexels-photo-2920402.jpeg?auto=compress&w=800' },
    { id: 'cashew-nuts-500g', name: 'Roasted Cashew Nuts (500g)', category: 'nutrition', price: 16900, emoji: '🥜',
      short: 'A protein-rich, satisfying everyday snack.',
      long: 'Roasted cashew nuts — a satisfying, protein-rich snack, and one of Nigeria\'s own major cash crops. Good on their own, in a trail mix, or added to a meal for extra crunch.',
      image: 'https://images.pexels.com/photos/4663476/pexels-photo-4663476.jpeg?auto=compress&w=800' },
    { id: 'groundnuts-500g', name: 'Roasted Groundnuts (500g)', category: 'nutrition', price: 5800, emoji: '🥜',
      short: 'A classic, protein-rich Nigerian snack.',
      long: 'Roasted groundnuts (peanuts) — a classic, widely loved Nigerian snack, whether eaten straight from the bag, paired with garri, or added to soups and stews.',
      image: 'https://images.pexels.com/photos/209371/pexels-photo-209371.jpeg?auto=compress&w=800' },
    { id: 'mixed-fruit-smoothies-4pk', name: 'Mixed Fruit Smoothie Bottles (4-Pack)', category: 'nutrition', price: 15600, emoji: '🥤',
      short: 'Cold-pressed, no added sugar — grab and go.',
      long: 'Four bottled smoothies in a mix of fruit blends — a quick, cold-pressed way to get real fruit into your day without any prep. No added sugar, just fruit.' ,
      image: 'https://images.pexels.com/photos/4443490/pexels-photo-4443490.jpeg?auto=compress&w=800' },
    { id: 'strawberry-smoothie', name: 'Strawberry Fruit Smoothie (500ml)', category: 'nutrition', price: 6500, emoji: '🍓',
      short: 'Real strawberries, banana and a touch of orange.',
      long: 'A thick, chilled smoothie blending strawberries, banana and orange — a satisfying drink on its own or a great breakfast companion.',
      image: 'https://images.pexels.com/photos/775032/pexels-photo-775032.jpeg?auto=compress&w=800' },
    { id: 'chamomile-lavender-tea', name: 'Chamomile & Lavender Herbal Tea (20 bags)', category: 'nutrition', price: 9800, emoji: '🍵',
      short: 'A calming, caffeine-free wind-down tea.',
      long: 'A soothing caffeine-free blend of chamomile and lavender — a gentle way to wind down in the evening, whether it becomes part of a bedtime routine or just a quiet moment with a warm cup.',
      image: 'https://images.pexels.com/photos/341514/pexels-photo-341514.jpeg?auto=compress&w=800' },
    { id: 'ginger-lemongrass-tea', name: 'Ginger & Lemongrass Herbal Tea (20 bags)', category: 'nutrition', price: 9100, emoji: '🌿',
      short: 'A warming, zesty everyday herbal blend.',
      long: 'A warming, naturally caffeine-free blend of ginger and lemongrass — bright and zesty, good any time of day, hot or iced.',
      image: 'https://images.pexels.com/photos/8329281/pexels-photo-8329281.jpeg?auto=compress&w=800' },
    { id: 'turmeric-ginger-powder', name: 'Turmeric & Ginger Powder (200g)', category: 'nutrition', price: 10400, emoji: '🌕',
      short: 'Stir into drinks, smoothies or meals.',
      long: 'A blend of ground turmeric and ginger — stir a spoonful into warm milk for a golden latte, into a smoothie, or straight into cooking. A pantry staple in many Nigerian kitchens.',
      image: 'https://images.pexels.com/photos/8760466/pexels-photo-8760466.png?auto=compress&w=800' },
    { id: 'moringa-powder-250g', name: 'Moringa Leaf Powder (250g)', category: 'nutrition', price: 11000, emoji: '🌿',
      short: 'Nutrient-dense leaf powder, a popular local ingredient.',
      long: 'Dried, ground moringa leaf powder — a nutrient-dense addition to smoothies, tea, or meals, and a popular everyday food ingredient across Nigerian kitchens.',
      image: 'https://images.pexels.com/photos/1313432/pexels-photo-1313432.jpeg?auto=compress&w=800' },

    // ---- Fresh Fruits ---------------------------------------------------
    { id: 'fruit-basket-mixed', name: 'Mixed Fruit Basket (Seasonal)', category: 'fruits', price: 27300, emoji: '🧺',
      image: 'https://images.pexels.com/photos/15626438/pexels-photo-15626438.jpeg?auto=compress&w=800',
      short: 'A seasonal mix of fresh fruit, basket-packed.',
      long: 'A basket of fresh seasonal fruit, hand-picked and ready to eat — a thoughtful gift for a loved one, or a simple way to keep fresh fruit stocked at home. Contents vary by season and availability.' },
    { id: 'apples-1kg', name: 'Fresh Apples (1kg)', category: 'fruits', price: 10400, emoji: '🍎',
      image: 'https://images.pexels.com/photos/220911/pexels-photo-220911.jpeg?auto=compress&w=800',
      short: 'Fresh apples, approx. 1kg.',
      long: 'Fresh, crisp apples — approximately 1kg per order. A simple, high-fibre snack that travels well and needs no preparation.' },
    { id: 'oranges-1kg', name: 'Fresh Oranges (1kg)', category: 'fruits', price: 4600, emoji: '🍊',
      image: 'https://images.pexels.com/photos/3737623/pexels-photo-3737623.jpeg?auto=compress&w=800',
      short: 'Fresh juicy oranges, approx. 1kg.',
      long: 'Fresh, juicy oranges — approximately 1kg per order. A good everyday source of Vitamin C, whether eaten whole or juiced.' },
    { id: 'bananas-bunch', name: 'Fresh Bananas (Bunch)', category: 'fruits', price: 5800, emoji: '🍌',
      image: 'https://images.pexels.com/photos/365810/pexels-photo-365810.jpeg?auto=compress&w=800',
      short: 'A fresh bunch of ripe bananas.',
      long: 'A fresh bunch of ripe bananas — a convenient, potassium-rich snack, good for energy and easy on the stomach.' },
    { id: 'watermelon-whole', name: 'Fresh Watermelon (Whole)', category: 'fruits', price: 7800, emoji: '🍉',
      short: 'A juicy, hydrating everyday favorite.',
      long: 'A whole fresh watermelon — juicy, naturally hydrating, and one of the most popular fruits for hot weather across Nigeria.',
      image: 'https://images.pexels.com/photos/880447/pexels-photo-880447.jpeg?auto=compress&w=800' },
    { id: 'pawpaw-whole', name: 'Fresh Pawpaw / Papaya (Whole)', category: 'fruits', price: 5200, emoji: '🥭',
      short: 'A soft, naturally sweet everyday fruit.',
      long: 'A whole fresh pawpaw (papaya) — soft, naturally sweet, and a common everyday fruit across Nigerian markets, whether eaten on its own or blended into a smoothie.',
      image: 'https://images.pexels.com/photos/4113833/pexels-photo-4113833.jpeg?auto=compress&w=800' },
    { id: 'fresh-coconut', name: 'Fresh Coconut (Whole)', category: 'fruits', price: 3900, emoji: '🥥',
      short: 'Coconut water and flesh in one whole fruit.',
      long: 'A whole fresh coconut — crack it open for naturally refreshing coconut water, or scoop out the flesh for snacking or cooking. A popular find at markets and roadside stalls across Nigeria.',
      image: 'https://images.pexels.com/photos/1803516/pexels-photo-1803516.jpeg?auto=compress&w=800' },
    { id: 'fresh-pineapple', name: 'Fresh Pineapple (Whole)', category: 'fruits', price: 5200, emoji: '🍍',
      image: 'https://images.pexels.com/photos/14772875/pexels-photo-14772875.jpeg?auto=compress&w=800',
      short: 'A juicy, tropical everyday fruit.',
      long: 'A whole fresh pineapple — sweet, juicy, and a popular everyday fruit across Nigerian markets, whether eaten fresh, blended, or added to a fruit salad.' },
    { id: 'fresh-avocado', name: 'Fresh Avocado (Pack of 3)', category: 'fruits', price: 6500, emoji: '🥑',
      image: 'https://images.pexels.com/photos/3029520/pexels-photo-3029520.jpeg?auto=compress&w=800',
      short: 'Creamy, ripe avocados, pack of 3.',
      long: 'Three fresh avocados — creamy and versatile, good sliced on toast, in a salad, or blended into a smoothie.' },

    // ---- Personal & Skin Care --------------------------------------------
    { id: 'neem-teatree-soap', name: 'Neem & Tea Tree Herbal Soap (Bar)', category: 'personalcare', price: 5800, emoji: '🧼',
      short: 'Handmade, herb-infused daily cleansing bar.',
      long: 'A handmade soap bar infused with neem and tea tree — a gentle, herbal daily cleanser with a fresh, natural scent. A cosmetic skincare bar, not a medicated treatment.',
      image: 'https://images.pexels.com/photos/16244099/pexels-photo-16244099.jpeg?auto=compress&w=800' },
    { id: 'rose-shea-soap', name: 'Rose & Shea Butter Soap (Bar)', category: 'personalcare', price: 5800, emoji: '🌹',
      short: 'Moisturizing handmade bar with real shea butter.',
      long: 'A moisturizing handmade soap bar blending shea butter with rose — gentle enough for daily use, leaving skin soft rather than stripped.',
      image: 'https://images.pexels.com/photos/10853720/pexels-photo-10853720.jpeg?auto=compress&w=800' },
    { id: 'mens-shaving-cream', name: "Men's Herbal Shaving Cream (150g)", category: 'personalcare', price: 10400, emoji: '🪒',
      short: 'Rich lather for a smooth, comfortable shave.',
      long: 'A rich, herb-infused shaving cream that softens facial hair and cushions the skin for a closer, more comfortable shave with less irritation.',
      image: 'https://images.pexels.com/photos/7253888/pexels-photo-7253888.jpeg?auto=compress&w=800' },
    { id: 'herbal-hair-scalp-oil', name: 'Herbal Hair & Scalp Oil (200ml)', category: 'personalcare', price: 11700, emoji: '💆',
      short: 'Nourishing blend for scalp massage & hair care.',
      long: 'A nourishing herbal oil blend for scalp massage and hair care — worked through the scalp and lengths as part of an everyday hair care routine.',
      image: 'https://images.pexels.com/photos/14656188/pexels-photo-14656188.jpeg?auto=compress&w=800' },
    { id: 'sleep-eye-mask', name: 'Sleep Eye Mask', category: 'personalcare', price: 6500, emoji: '😴',
      image: 'https://images.pexels.com/photos/6541082/pexels-photo-6541082.jpeg?auto=compress&w=800',
      short: 'Soft, light-blocking mask for better sleep.',
      long: 'A soft, contoured sleep mask that blocks out light — a simple everyday accessory for naps, travel, or a darker bedroom at night.' },
    { id: 'microfiber-towel', name: 'Quick-Dry Microfiber Towel', category: 'personalcare', price: 9100, emoji: '🧻',
      image: 'https://images.pexels.com/photos/11370616/pexels-photo-11370616.jpeg?auto=compress&w=800',
      short: 'Lightweight, fast-drying towel for home, gym, or travel.',
      long: 'A lightweight, fast-drying microfiber towel — compact enough for a gym bag or travel case, and quicker to dry than a regular cotton towel.' },

    // ---- Kitchen & Everyday Living -----------------------------------
    { id: 'insulated-water-bottle', name: 'Insulated Stainless Steel Water Bottle', category: 'kitchen-living', price: 19500, emoji: '🥤',
      image: 'https://images.pexels.com/photos/3737800/pexels-photo-3737800.jpeg?auto=compress&w=800',
      short: 'Keeps drinks cold or hot for hours.',
      long: 'A double-walled insulated stainless steel bottle that keeps drinks cold or hot for hours — a durable everyday alternative to single-use bottles.' },
    { id: 'sports-water-bottle', name: 'Everyday Sports Water Bottle', category: 'kitchen-living', price: 6500, emoji: '💧',
      image: 'https://images.pexels.com/photos/12478893/pexels-photo-12478893.jpeg?auto=compress&w=800',
      short: 'Lightweight reusable bottle for gym, work, or school.',
      long: 'A lightweight, reusable water bottle for everyday hydration at the gym, work, or school — simple and easy to carry.' },
    { id: 'glass-storage-jars', name: 'Glass Food Storage Jars (Set)', category: 'kitchen-living', price: 16900, emoji: '🫙',
      image: 'https://images.pexels.com/photos/8580763/pexels-photo-8580763.jpeg?auto=compress&w=800',
      short: 'Airtight glass jars for pantry storage.',
      long: 'A set of clear glass jars with airtight lids — good for storing rice, beans, spices, or snacks neatly in the pantry.' },
    { id: 'meal-prep-containers', name: 'Reusable Meal Prep Containers (Set)', category: 'kitchen-living', price: 14300, emoji: '🍱',
      image: 'https://images.pexels.com/photos/30635720/pexels-photo-30635720.jpeg?auto=compress&w=800',
      short: 'Stackable containers for meal prep or leftovers.',
      long: 'A set of stackable, reusable containers for portioning meals ahead, packing lunch, or storing leftovers — microwave- and dishwasher-friendly.' },
    { id: 'reusable-tote-bag', name: 'Reusable Canvas Tote Bag', category: 'kitchen-living', price: 6500, emoji: '🛍️',
      image: 'https://images.pexels.com/photos/8148587/pexels-photo-8148587.jpeg?auto=compress&w=800',
      short: 'Sturdy everyday bag for groceries or errands.',
      long: 'A sturdy, reusable canvas tote bag — handy for grocery runs, market trips, or everyday errands instead of single-use plastic bags.' },

    // ---- Batch 2 additions (see chat for verification notes) ---------
    { id: 'rechargeable-led-torch', name: 'Rechargeable LED Torch', category: 'safety', price: 19500, emoji: '🔦',
      image: 'https://images.pexels.com/photos/985117/pexels-photo-985117.jpeg?auto=compress&w=800',
      short: 'A reliable rechargeable torch for power outages or outdoor use.',
      long: 'A rechargeable LED torch for power outages, night walks, or general household use — a simple, practical safety item to keep charged and within reach.' },
    { id: 'green-tea-20bags', name: 'Green Tea (20 bags)', category: 'nutrition', price: 7800, emoji: '🍵',
      image: 'https://images.pexels.com/photos/4390014/pexels-photo-4390014.jpeg?auto=compress&w=800',
      short: 'A classic everyday tea, hot or iced.',
      long: 'A box of 20 green tea bags — a simple, naturally light everyday tea, good hot in the morning or iced through the afternoon.' },
    { id: 'chia-seeds-250g', name: 'Chia Seeds (250g)', category: 'nutrition', price: 11000, emoji: '🌱',
      image: 'https://images.pexels.com/photos/3682192/pexels-photo-3682192.jpeg?auto=compress&w=800',
      short: 'Stir into smoothies, yoghurt, or overnight oats.',
      long: 'A jar of chia seeds — stir into a smoothie, yoghurt, or overnight oats for added texture, a popular everyday addition for anyone building healthier breakfast habits.' },
    { id: 'dried-dates-500g', name: 'Dried Dates (500g)', category: 'nutrition', price: 9800, emoji: '🌴',
      image: 'https://images.pexels.com/photos/20632756/pexels-photo-20632756.jpeg?auto=compress&w=800',
      short: 'A naturally sweet, ready-to-eat everyday snack.',
      long: 'Dried dates — a naturally sweet, ready-to-eat snack straight from the pack, popular on their own, added to smoothies, or stirred into oats.' },
    { id: 'fresh-mango', name: 'Fresh Mango (Pack of 2)', category: 'fruits', price: 5800, emoji: '🥭',
      image: 'https://images.pexels.com/photos/7543137/pexels-photo-7543137.jpeg?auto=compress&w=800',
      short: 'Sweet, juicy mangoes — a tropical everyday favorite.',
      long: 'Two fresh mangoes — sweet and juicy, a popular tropical fruit across Nigerian markets, eaten fresh, sliced into a salad, or blended into a smoothie.' },
    { id: 'fresh-grapes-500g', name: 'Fresh Grapes (500g)', category: 'fruits', price: 14300, emoji: '🍇',
      image: 'https://images.pexels.com/photos/3085151/pexels-photo-3085151.jpeg?auto=compress&w=800',
      short: 'A sweet, snackable bunch of fresh grapes.',
      long: 'A bunch of fresh grapes — a sweet, easy, no-prep snack, good on their own or added to a fruit plate.' },
    { id: 'bamboo-toothbrush', name: 'Bamboo Toothbrush', category: 'personalcare', price: 3200, emoji: '🪥',
      image: 'https://images.pexels.com/photos/3654597/pexels-photo-3654597.jpeg?auto=compress&w=800',
      short: 'An eco-friendly everyday toothbrush.',
      long: 'A bamboo-handled toothbrush — a simple, everyday eco-friendly swap for a standard plastic toothbrush.' },
    { id: 'wooden-cutting-board', name: 'Wooden Cutting Board', category: 'kitchen-living', price: 11000, emoji: '🪵',
      image: 'https://images.pexels.com/photos/6208155/pexels-photo-6208155.jpeg?auto=compress&w=800',
      short: 'A sturdy everyday board for food prep.',
      long: 'A sturdy wooden cutting board for everyday food prep — durable, easy to clean, and gentle on knife edges.' },
    { id: 'kids-lunch-box', name: 'Lunch Box (Kids & Adults)', category: 'kitchen-living', price: 9800, emoji: '🍱',
      image: 'https://images.pexels.com/photos/5852333/pexels-photo-5852333.jpeg?auto=compress&w=800',
      short: 'A compact box for packed lunches, school or work.',
      long: 'A compact, easy-to-carry lunch box for packed meals and snacks — good for school runs, the office, or a day out.' },
    { id: 'magnifying-glass', name: 'Large Lens Magnifying Glass', category: 'medaids', price: 13000, emoji: '🔍',
      image: 'https://images.pexels.com/photos/906055/pexels-photo-906055.jpeg?auto=compress&w=800',
      short: 'Handheld magnifier for reading small print and medicine labels.',
      long: 'A handheld magnifying glass with a large, clear lens — makes reading medicine labels, dosage instructions, and small print far easier.' }
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
      '<div class="mkt-cat-tag">' + CATEGORY_EMOJI[p.category] + ' ' + CATEGORY_NAME[p.category] + '</div>' +
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
        return '<button class="mkt-chip' + (selectedCategory === c.key ? ' active' : '') + '" onclick="SentraXStore.selectCategory(\'' + c.key + '\')">' + c.emoji + ' ' + c.name + '</button>';
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
      '<div><h3>🛍️ Marketplace</h3><p>Everyday health & mobility aids, delivered to your door.</p></div>' +
      '<button class="mkt-cart-btn" onclick="SentraXStore.openCart()">🛒<span id="mkt-cart-badge" class="mkt-cart-badge" style="display:none;">0</span></button>' +
      '</div></div>' +
      chipsHtml + gridHtml +
      '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">Non-prescription health & mobility aids only.</p>';

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
