/*
 * articles.js — Sentra-X Health Articles
 * ========================================
 * Curated, plain-language articles on chronic condition management.
 * Order is reshuffled every time the screen is opened, per product
 * requirement ("should change every fresh reload") — implemented as a
 * client-side shuffle of a fixed article pool, not a live feed. This is
 * general health information, not medical advice — every article ends
 * with a line encouraging the person to talk to a real doctor/pharmacist
 * for anything specific to them.
 *
 * Isolated from everything else, same pattern as store.js and
 * bp-experimental.js: new file, no edits to script.js.
 * Live section: pulls real headline + short snippet + link from CDC's own
 * public newsroom RSS feed (cdc.gov/media/rss.xml). We NEVER display full
 * article text — only a short snippet, with a "Read full article" link
 * out to the original source. Full-text reproduction isn't ours to
 * redistribute even when fetched live; snippet + outbound link is the
 * standard, legitimate pattern (same as Google News / Apple News).
 * If the live feed is unreachable (offline, service down), this fails
 * quietly — the curated static articles below still render fine either
 * way, since the two sections are independent.
 */

(function () {
  'use strict';

  const CDC_FEED_URL = 'https://www.cdc.gov/media/rss.xml';
  const RSS_TO_JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
  // Optional: set this if/when we get a free rss2json API key — the
  // anonymous tier is shared globally and gets rate-limited under load.
  // Leave blank to keep current (no-key) behavior.
  const RSS_TO_JSON_API_KEY = '';
  const MAX_LIVE_ITEMS = 5;
  const SNIPPET_MAX_CHARS = 160;
  const LIVE_FETCH_TIMEOUT_MS = 8000;
  const LIVE_FETCH_RETRIES = 1;

  function fetchWithTimeout(url, timeoutMs) {
    if (typeof AbortController === 'undefined') return fetch(url);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(function () {
      clearTimeout(timer);
    });
  }

  function fetchLiveFeedJson(attemptsLeft) {
    let url = RSS_TO_JSON_ENDPOINT + encodeURIComponent(CDC_FEED_URL);
    if (RSS_TO_JSON_API_KEY) url += '&api_key=' + encodeURIComponent(RSS_TO_JSON_API_KEY);
    return fetchWithTimeout(url, LIVE_FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        if (attemptsLeft > 0) {
          // Brief pause before the one retry — helps ride out a transient
          // rate-limit response instead of failing permanently on it.
          return new Promise(function (resolve) { setTimeout(resolve, 1200); })
            .then(function () { return fetchLiveFeedJson(attemptsLeft - 1); });
        }
        throw err;
      });
  }

  function stripHtml(html) {
    return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, maxChars) {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  }

  function snippetFrom(item) {
    return truncate(stripHtml(item.description || item.content || ''), SNIPPET_MAX_CHARS);
  }

  const TAG_EMOJI = {
    Hypertension: '🩺', Diet: '🥗', Medication: '💊', Activity: '🚶',
    Sleep: '😴', Diabetes: '🩸', Wellness: '🧘', Caregiving: '🤝'
  };

  const TAG_PHOTO = {
    Hypertension: 'https://commons.wikimedia.org/wiki/Special:FilePath/Blood%20pressure%20monitoring.jpg?width=500',
    Diet: 'https://commons.wikimedia.org/wiki/Special:FilePath/Food-healthy-vegetables-potatoes%20(23958160949).jpg?width=500',
    Medication: 'https://commons.wikimedia.org/wiki/Special:FilePath/201707%20medicine%20tablets%20elliptical.svg?width=500',
    Activity: 'https://commons.wikimedia.org/wiki/Special:FilePath/Walkingexercise.jpg?width=500'
  };

  function coverHtml(tag, sizeStyle) {
    const emoji = TAG_EMOJI[tag] || '📰';
    const photo = TAG_PHOTO[tag];
    if (photo) {
      return '<div class="art-cover art-cover-photo" data-tag="' + tag + '"' + (sizeStyle ? ' style="' + sizeStyle + '"' : '') + '>' +
        '<img src="' + photo + '" alt="" loading="lazy" onerror="this.parentElement.classList.add(\'art-cover-fallback\');this.remove();">' +
        '<span class="art-tag">' + tag + '</span></div>';
    }
    return '<div class="art-cover" data-tag="' + tag + '"' + (sizeStyle ? ' style="' + sizeStyle + '"' : '') + '><span class="art-tag">' + tag + '</span>' + emoji + '</div>';
  }

  function excerptFrom(body, maxChars) {
    if (body.length <= maxChars) return body;
    return body.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  }

  const ARTICLES = [
    { id: 'bp-basics', title: 'Understanding Your Blood Pressure Numbers', tag: 'Hypertension',
      body: 'Blood pressure is written as two numbers, like 120/80. The top number (systolic) measures pressure when your heart beats; the bottom (diastolic) measures pressure when it rests between beats. Generally, under 120/80 is considered normal, 120-129/under 80 is elevated, and 130/80 or higher is considered high. These ranges are general guidance, not a diagnosis — your own healthy range can depend on age, other conditions, and what your doctor has told you specifically. Home readings can also vary from clinic readings, since unfamiliar settings and rushed appointments sometimes push numbers up temporarily — a pattern doctors call "white coat" effect. That\u2019s one more reason your own logged history, taken at rest in a calm setting, is often the more reliable picture over time.' },
    { id: 'salt-swap', title: 'Small Salt Swaps That Add Up', tag: 'Diet',
      body: 'Cutting sodium doesn\u2019t mean bland food. Try swapping bouillon cubes for fresh herbs, garlic, ginger, and pepper soup spices — many local dishes get their punch from aromatics, not just salt. Rinsing canned or tinned foods before cooking removes a meaningful amount of added sodium too. Small, consistent swaps tend to stick better than one big overhaul. Restaurant and packaged foods are usually the biggest hidden source of sodium, often far more than what\u2019s added at home, so reading labels and asking how a dish is prepared when eating out can matter more than you\u2019d expect. Aim for gradual change rather than an abrupt switch — taste buds adjust to less salt within a few weeks.' },
    { id: 'med-adherence', title: 'Why Missing Doses Matters More Than You\u2019d Think', tag: 'Medication',
      body: 'Blood pressure and diabetes medications often work by keeping a steady level in your body over time. Skipping doses \u2014 even occasionally \u2014 can cause your numbers to swing more than staying consistently on a slightly different plan would. If a medication schedule feels hard to keep up with, that\u2019s worth telling your doctor directly; there are often simpler dosing options, not just "try harder." Linking a dose to an existing daily habit, like brushing your teeth or making morning tea, tends to work better than relying on memory alone. A pillbox or a phone reminder can also catch the days that would otherwise slip by unnoticed.' },
    { id: 'walk-daily', title: 'A 20-Minute Walk Does More Than You\u2019d Expect', tag: 'Activity',
      body: 'Regular walking \u2014 even a modest 20 minutes a day \u2014 is consistently linked to better blood pressure and blood sugar control over time. It doesn\u2019t need to be intense. Splitting it into two 10-minute walks works just as well if a single block of time is hard to find. The consistency matters more than the intensity. Walking after meals in particular can help blunt the blood sugar rise that follows eating, which is useful for anyone managing diabetes. Choosing a route with a bit of shade, or walking earlier or later in the day, can make the habit easier to keep up in hot weather.' },
    { id: 'harmattan-bp', title: 'Why Your Readings Might Shift With the Weather', tag: 'Hypertension',
      body: 'Cold weather and dry, dusty conditions like harmattan can cause blood vessels to narrow slightly, which can nudge blood pressure readings up for some people. If you notice a seasonal pattern in your own readings, it\u2019s worth mentioning to your doctor \u2014 it can help them tell the difference between a real trend and normal day-to-day variation. Dust in the air during harmattan can also irritate the airways and affect sleep quality, which indirectly nudges readings too. Keeping windows closed during peak dust hours, staying hydrated, and dressing warmly in cooler mornings are simple ways to reduce the weather-driven swing in your numbers.' },
    { id: 'sleep-bp-link', title: 'The Sleep and Blood Pressure Connection', tag: 'Sleep',
      body: 'Poor or short sleep is linked with higher blood pressure over time, and the relationship runs both ways \u2014 high blood pressure can also disrupt sleep. Simple habits like a consistent bedtime and cutting caffeine after early afternoon tend to help more than they get credit for. If snoring or gasping during sleep is a regular pattern, that\u2019s worth raising with a doctor specifically, since it can be a sign of sleep apnea, which is closely tied to blood pressure. Screen light late at night can also delay your body\u2019s natural wind-down, so dimming lights and stepping away from bright screens an hour before bed is a small, practical change worth trying.' },
    { id: 'stress-numbers', title: 'How Stress Shows Up in Your Numbers', tag: 'Wellness',
      body: 'Stress causes a real, temporary rise in blood pressure \u2014 that\u2019s a normal short-term response. The concern is when stress is constant, since the body doesn\u2019t get a chance to return to baseline. Simple, low-cost tools \u2014 a few minutes of slow breathing, a short prayer or quiet moment, stepping outside \u2014 genuinely help many people, though they\u2019re a complement to treatment, not a replacement for it. Noticing your own early stress signals, like a tight jaw, shallow breathing, or restlessness, gives you a chance to pause before tension builds up over the course of a day. Even a two-minute break can measurably lower that in-the-moment spike.' },
    { id: 'diabetes-basics', title: 'Blood Sugar 101: What the Numbers Mean', tag: 'Diabetes',
      body: 'A fasting blood sugar under 100 mg/dL is generally considered normal, 100-125 is prediabetes range, and 126+ on more than one test suggests diabetes. After eating, numbers naturally rise \u2014 that\u2019s expected, not alarming on its own. Your doctor\u2019s specific targets for you may differ from general ranges, especially if you\u2019re managing multiple conditions. The A1C test, which reflects your average blood sugar over roughly three months, gives a fuller picture than a single reading and is often used alongside day-to-day checks. Keeping a simple log of your numbers around meals can help you and your doctor spot patterns faster.' },
    { id: 'foot-checks', title: 'Why Foot Checks Matter More Than People Realize', tag: 'Diabetes',
      body: 'Diabetes can reduce feeling in the feet over time, meaning small cuts or blisters can go unnoticed and worsen. A quick daily glance \u2014 checking between toes, soles, and heels for any cut, redness, or swelling \u2014 catches problems early, when they\u2019re easiest to treat. Well-fitting shoes and avoiding walking barefoot help prevent injuries in the first place. Washing and thoroughly drying feet daily, especially between the toes, also reduces the risk of fungal infections that are more common and slower to heal with diabetes. If a cut isn\u2019t noticeably improving within a couple of days, it\u2019s worth having it looked at rather than waiting.' },
    { id: 'hydration', title: 'Hydration\u2019s Quiet Role in Chronic Condition Management', tag: 'Diet',
      body: 'Staying well-hydrated supports kidney function, which matters more for people managing blood pressure or diabetes, since both conditions put extra load on the kidneys over time. A simple habit: keep a bottle nearby and sip through the day rather than drinking a large amount at once. If you\u2019re on medication that affects fluid balance (like some blood pressure medications), ask your doctor what a good daily intake looks like for you specifically. Pale yellow urine is generally a reasonable sign of adequate hydration, while consistently dark urine can be a useful early cue to drink more, especially in hot weather.' },
    { id: 'caregiver-burnout', title: 'Caregiving Is Real Work \u2014 Watch Your Own Signs Too', tag: 'Caregiving',
      body: 'It\u2019s common for caregivers to focus entirely on the person they\u2019re supporting and quietly run themselves down in the process. Persistent exhaustion, irritability, or feeling constantly "on call" are worth noticing in yourself, not just the person you\u2019re caring for. Sharing responsibilities with other family members, even in small rotations, tends to help more than people expect before they try it. Setting aside even brief, protected time for yourself each week — a walk, a call with a friend, a quiet cup of tea — isn\u2019t indulgent, it\u2019s part of what keeps you able to keep showing up well for someone else.' },
    { id: 'reading-labels', title: 'Reading a Medicine Label Properly', tag: 'Medication',
      body: 'Beyond the dose, check the timing instructions \u2014 "before meals," "with food," or "at bedtime" are there for a reason, often affecting how well the medication is absorbed or how it interacts with your body\u2019s natural rhythms. If a label\u2019s instructions are unclear or a pharmacy\u2019s handwriting is hard to read, it\u2019s always fine to ask the pharmacist to clarify before you leave \u2014 that\u2019s a normal, expected question, not a bother. It\u2019s also worth checking expiry dates when you pick up a refill, and storing medication away from heat and direct sunlight, since both can quietly reduce how well a drug works.' },
    { id: 'exercise-caution', title: 'Starting to Exercise With a Chronic Condition', tag: 'Activity',
      body: 'If you\u2019re newly diagnosed or haven\u2019t exercised in a while, starting gradually matters more than starting hard. A short walk, light stretching, or a few minutes of stair climbing is a reasonable place to begin. Very high blood pressure or certain heart conditions can mean specific activities should wait until your doctor gives the go-ahead \u2014 worth a quick check-in before starting anything new, not to discourage you, just to make sure it\u2019s the right starting point for your specific situation. Warming up for a few minutes and paying attention to how you feel during activity — stopping for dizziness, chest discomfort, or unusual shortness of breath — helps you build the habit safely.' },
    { id: 'sugar-hidden', title: 'Where Sugar Hides in "Healthy" Foods', tag: 'Diet',
      body: 'Sauces, flavored yogurts, and even some breads carry more added sugar than people expect, often more than an actual dessert serving. Checking the ingredients list for sugar under its many names — glucose syrup, honey, molasses, fruit concentrate — gives a truer picture than the front-of-pack marketing. Whole fruit is a different story: its fiber slows sugar absorption, which is part of why an orange affects blood sugar differently than orange juice. A useful habit is comparing two similar products side by side before buying, since sugar content between near-identical items can vary more than most people assume.' },
    { id: 'alcohol-bp', title: 'How Alcohol Interacts With Blood Pressure Medication', tag: 'Medication',
      body: 'Alcohol can amplify the effects of many blood pressure medications, sometimes causing readings to drop suddenly or bringing on dizziness and lightheadedness. It can also interact with diabetes medication by affecting blood sugar in ways that are harder to predict. This doesn\u2019t necessarily mean alcohol is off-limits entirely, but it does mean it\u2019s worth asking your doctor or pharmacist specifically about your own medications rather than assuming a "normal" amount is safe for everyone. Drinking on an empty stomach tends to make these effects stronger and less predictable, so timing and food matter as much as quantity.' },
    { id: 'travel-meds', title: 'Traveling Without Missing a Dose', tag: 'Medication',
      body: 'Time zone changes are one of the most common reasons people accidentally skip or double up on medication while traveling. A simple approach: keep taking doses on your home time zone\u2019s schedule for short trips, or ask your doctor ahead of a longer trip how to adjust gradually. Packing medication in carry-on luggage rather than checked baggage protects against delays or lost bags disrupting your schedule entirely. It also helps to carry a little more than you think you\u2019ll need, along with a note of your prescriptions, in case a trip runs longer than planned.' },
    { id: 'family-history', title: 'What Family History Actually Tells You', tag: 'Wellness',
      body: 'Having a parent or sibling with high blood pressure or diabetes raises your own risk, but it isn\u2019t a guarantee — genetics load the dice, but daily habits still matter enormously in how things play out. Knowing your family history is most useful as a reason to start monitoring earlier and more consistently, not as something to feel resigned to. Sharing that history with your doctor helps them decide how often to check your numbers and which screenings make sense at your age. It\u2019s worth asking older relatives about their own diagnoses and rough age of onset if you don\u2019t already know it.' },
    { id: 'blood-sugar-swings', title: 'Why Blood Sugar Can Swing After Big Meals', tag: 'Diabetes',
      body: 'Large meals, especially ones heavy in refined carbohydrates like white rice, bread, or sugary drinks, can cause a sharper blood sugar rise than the same calories spread across smaller meals. Eating vegetables or protein before the carb-heavy part of a meal can noticeably blunt that spike. A short walk within 30 minutes of eating helps too, since moving muscles pull glucose out of the bloodstream more efficiently. None of this means cutting out favorite meals entirely — it\u2019s more about pacing and pairing them thoughtfully so the rise and fall feels gentler rather than sharp.' },
    { id: 'monitor-technique', title: 'Getting an Accurate Reading at Home', tag: 'Hypertension',
      body: 'A surprising number of "high" home readings are actually technique issues rather than real spikes. Sitting with your back supported, feet flat on the floor, and your arm resting at heart level makes a measurable difference. Talking, a full bladder, or having just had caffeine or a cigarette can all temporarily raise a reading. Waiting a few minutes after sitting down before measuring, and taking two readings a minute apart, gives a more reliable picture than a single rushed one. Keeping the cuff at the same arm and time of day also makes your own trend line easier to trust.' },
    { id: 'kidney-basics', title: 'Why Blood Pressure and Kidneys Are Closely Linked', tag: 'Hypertension',
      body: 'The kidneys and blood pressure affect each other in both directions: high blood pressure can gradually damage the kidneys\u2019 filtering ability, and struggling kidneys can in turn push blood pressure higher, creating a cycle over time if left unmanaged. This is part of why doctors often check kidney function alongside blood pressure for anyone managing hypertension long-term. Swelling in the ankles or unusually foamy urine can sometimes be early signs worth mentioning at a checkup, though many kidney changes cause no obvious symptoms early on, which is exactly why routine monitoring matters more than waiting to feel something.' },
    { id: 'medication-refill', title: 'Building a Refill Routine That Actually Sticks', tag: 'Medication',
      body: 'Running out of medication unexpectedly is one of the most common, and most avoidable, reasons people end up with gaps in treatment. Picking a fixed day each month — like the first Saturday — to check remaining supply and order refills turns it into a routine rather than something to remember under pressure. Some pharmacies offer refill reminders by text, which is worth asking about if your schedule is unpredictable. Keeping a small backup supply for unexpected delays, where affordable, adds a buffer without needing to think about it day to day.' },
    { id: 'kids-caregiving', title: 'Talking to Children About a Parent\u2019s Condition', tag: 'Caregiving',
      body: 'Children often sense when something is wrong even without being told directly, and vague reassurance can sometimes worry them more than simple, honest, age-appropriate explanation. Naming the condition plainly — "Mummy has high blood pressure, and this medicine and these check-ups help keep her healthy" — tends to reduce anxiety more than avoiding the topic. Letting them ask questions, even ones that repeat, gives them a sense of control over something that otherwise feels uncertain. It also helps to reassure them clearly that the condition is being managed and that it isn\u2019t their responsibility to fix or worry about.' },
    { id: 'exercise-diabetes-timing', title: 'When to Exercise if You Take Diabetes Medication', tag: 'Activity',
      body: 'Some diabetes medications, particularly insulin and certain oral drugs, can increase the risk of blood sugar dropping too low during or after exercise. Checking your blood sugar before a workout, and carrying a fast-acting sugar source like glucose tablets or juice, is a simple safety habit worth building. Exercising around the same time each day also makes it easier to notice your own patterns and adjust timing if needed. If you regularly feel shaky, sweaty, or unusually tired during activity, it\u2019s worth reviewing your medication timing with your doctor rather than just pushing through it.' },
    { id: 'salt-eating-out', title: 'Managing Sodium When Eating Out', tag: 'Diet',
      body: 'Restaurant and street food is often higher in sodium than home cooking, partly because salt is a cheap, reliable way to make food taste consistently good at scale. Asking for sauces and seasoning on the side, or requesting "less salt" when ordering, genuinely works more often than people expect, especially at smaller, less rigid kitchens. Soups, stews, and anything with a bouillon-based broth tend to run particularly high in sodium. Balancing a heavier meal out with lighter, home-cooked meals for the rest of the day is a practical way to manage it without giving up eating out altogether.' },
    { id: 'mental-health-chronic', title: 'The Emotional Weight of a Chronic Diagnosis', tag: 'Wellness',
      body: 'It\u2019s common to feel a mix of frustration, denial, or low mood after being diagnosed with a chronic condition, even one that\u2019s very manageable with treatment. These feelings are a normal response to an unexpected life change, not a sign of weakness or of handling things badly. Talking to others managing the same condition, whether through a support group or simply a friend going through something similar, often helps more than people expect going in. If low mood persists for weeks rather than easing, or starts affecting daily life, it\u2019s worth raising with a doctor alongside your physical care.' }
  ];

  // Deterministic PRNG (mulberry32) seeded from a number, so the same
  // seed always produces the same sequence — used to give every user
  // the same "today's" order, which then changes again tomorrow.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dateSeed(date) {
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
    return y * 10000 + m * 100 + d;
  }

  function shuffled(arr, seed) {
    const rand = typeof seed === 'number' ? mulberry32(seed) : Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Today's lineup: same order for everyone all day (feels like a fresh
  // daily feed), reshuffles automatically at midnight UTC. Falls back to
  // a plain random shuffle if Date is somehow unavailable.
  function todaysOrder() {
    try {
      return shuffled(ARTICLES, dateSeed(new Date()));
    } catch (e) {
      return shuffled(ARTICLES);
    }
  }

  function renderArticles() {
    const root = document.getElementById('articles-root');
    if (!root) return;
    const order = todaysOrder();

    let html = '<div id="live-news-section"><p style="font-size:12px;color:#64748b;text-align:center;">Loading latest health news…</p></div><div style="height:14px;"></div>';
    order.forEach(function (a) {
      html += '<div class="art-card" onclick="SentraXArticles.open(\'' + a.id + '\')">' +
        coverHtml(a.tag) +
        '<div class="art-body">' +
        '<h4>' + a.title + '</h4>' +
        '<p class="art-excerpt">' + excerptFrom(a.body, 90) + '</p>' +
        '<div class="art-readmore">Read more →</div>' +
        '</div></div>';
    });
    html += '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">' +
      'General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</p>';
    root.innerHTML = html;

    loadLiveNews();
  }

  function openArticle(id) {
    const article = ARTICLES.find(function (a) { return a.id === id; });
    if (!article) return;
    let overlay = document.getElementById('article-reader-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'article-reader-overlay';
      document.body.appendChild(overlay);
    }
    const hasPhoto = !!TAG_PHOTO[article.tag];
    const emoji = TAG_EMOJI[article.tag] || '📰';
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXArticles.close()">←</button>' +
      coverHtml(article.tag, 'height:180px;').replace('art-cover', 'art-cover art-reader-cover') +
      '<div class="art-reader-body">' +
      (hasPhoto ? '' : '<div style="font-size:44px;margin-bottom:4px;">' + emoji + '</div>') +
      '<h2>' + article.title + '</h2>' +
      '<p>' + article.body + '</p>' +
      '<div class="art-reader-footnote">General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</div>' +
      '</div>';
    if (!hasPhoto) {
      const coverEl = overlay.querySelector('.art-reader-cover');
      const listCover = document.querySelector('.art-cover[data-tag="' + article.tag + '"]');
      if (coverEl && listCover) {
        coverEl.style.background = getComputedStyle(listCover).backgroundImage;
      }
    }
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
  }

  function closeArticle() {
    const overlay = document.getElementById('article-reader-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  let liveNewsById = {};

  function openLiveArticle(id) {
    const item = liveNewsById[id];
    if (!item) return;
    let overlay = document.getElementById('article-reader-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'article-reader-overlay';
      document.body.appendChild(overlay);
    }
    const snippet = snippetFrom(item);
    const photoHtml = item.thumbnail
      ? '<div class="art-reader-cover" style="height:180px;"><img src="' + item.thumbnail + '" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove();"><span class="art-reader-tag">CDC Newsroom</span></div>'
      : '<div class="art-reader-cover" data-tag="Wellness" style="height:120px;"><span class="art-reader-tag">CDC Newsroom</span></div>';
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXArticles.close()">←</button>' +
      photoHtml +
      '<div class="art-reader-body">' +
      '<h2>' + item.title + '</h2>' +
      (snippet ? '<p>' + snippet + '</p>' : '') +
      '<p style="margin-top:20px;"><a href="' + item.link + '" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;font-weight:700;text-decoration:none;">Read full article on cdc.gov ↗</a></p>' +
      '<div class="art-reader-footnote">Summary only — full article is published by the CDC and opens on their site. General health information, not medical advice.</div>' +
      '</div>';
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
  }

  function loadLiveNews() {
    const container = document.getElementById('live-news-section');
    if (!container || typeof fetch === 'undefined') return;

    fetchLiveFeedJson(LIVE_FETCH_RETRIES)
      .then(function (data) {
        if (!data || data.status !== 'ok' || !data.items || !data.items.length) {
          container.innerHTML = '';
          return;
        }
        const items = data.items.slice(0, MAX_LIVE_ITEMS);
        liveNewsById = {};
        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">📡 Latest Health News</h3><p>Straight from the CDC newsroom</p></div>';
        items.forEach(function (item, i) {
          const id = 'live-' + i;
          liveNewsById[id] = item;
          const snippet = snippetFrom(item);
          const fallbackCover = '<div class="art-cover" data-tag="Wellness" style="width:64px;height:64px;flex-shrink:0;font-size:22px;">📡</div>';
          const thumb = item.thumbnail
            ? '<img src="' + item.thumbnail + '" alt="" loading="lazy" class="live-news-thumb" data-fallback-index="' + i + '" style="width:64px;height:64px;object-fit:cover;border-radius:12px;flex-shrink:0;">'
            : fallbackCover;
          html += '<div class="art-card" style="display:flex;align-items:center;gap:0;cursor:pointer;" onclick="SentraXArticles.openLive(\'' + id + '\')">' +
            thumb +
            '<div class="art-body" style="padding:12px 14px;">' +
            '<div style="font-size:10px;color:#64748b;">CDC Newsroom</div>' +
            '<div style="font-size:14px;font-weight:700;margin:2px 0 4px;color:#f1f5f9;">' + item.title + '</div>' +
            (snippet ? '<div style="font-size:12px;color:#94a3b8;">' + snippet + '</div>' : '') +
            '<div class="art-readmore" style="margin-top:6px;">Read more →</div>' +
            '</div></div>';
        });
        container.innerHTML = html;
        container.querySelectorAll('.live-news-thumb').forEach(function (img) {
          img.onerror = function () {
            const div = document.createElement('div');
            div.className = 'art-cover';
            div.setAttribute('data-tag', 'Wellness');
            div.style.cssText = 'width:64px;height:64px;flex-shrink:0;font-size:22px;';
            div.textContent = '📡';
            img.replaceWith(div);
          };
        });
      })
      .catch(function () {
        container.innerHTML = '';
      });
  }

  if (typeof window !== 'undefined') {
    window.SentraXArticles = { render: renderArticles, open: openArticle, openLive: openLiveArticle, close: closeArticle, ARTICLES: ARTICLES };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARTICLES: ARTICLES, shuffled: shuffled, stripHtml: stripHtml, truncate: truncate, snippetFrom: snippetFrom };
  }
})();
