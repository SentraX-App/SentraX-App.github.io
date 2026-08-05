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
      body: 'Blood pressure is written as two numbers, like 120/80. The top number (systolic) measures pressure when your heart beats; the bottom (diastolic) measures pressure when it rests between beats. Generally, under 120/80 is considered normal, 120-129/under 80 is elevated, and 130/80 or higher is considered high. These ranges are general guidance, not a diagnosis — your own healthy range can depend on age, other conditions, and what your doctor has told you specifically.' },
    { id: 'salt-swap', title: 'Small Salt Swaps That Add Up', tag: 'Diet',
      body: 'Cutting sodium doesn\u2019t mean bland food. Try swapping bouillon cubes for fresh herbs, garlic, ginger, and pepper soup spices — many local dishes get their punch from aromatics, not just salt. Rinsing canned or tinned foods before cooking removes a meaningful amount of added sodium too. Small, consistent swaps tend to stick better than one big overhaul.' },
    { id: 'med-adherence', title: 'Why Missing Doses Matters More Than You\u2019d Think', tag: 'Medication',
      body: 'Blood pressure and diabetes medications often work by keeping a steady level in your body over time. Skipping doses \u2014 even occasionally \u2014 can cause your numbers to swing more than staying consistently on a slightly different plan would. If a medication schedule feels hard to keep up with, that\u2019s worth telling your doctor directly; there are often simpler dosing options, not just "try harder."' },
    { id: 'walk-daily', title: 'A 20-Minute Walk Does More Than You\u2019d Expect', tag: 'Activity',
      body: 'Regular walking \u2014 even a modest 20 minutes a day \u2014 is consistently linked to better blood pressure and blood sugar control over time. It doesn\u2019t need to be intense. Splitting it into two 10-minute walks works just as well if a single block of time is hard to find. The consistency matters more than the intensity.' },
    { id: 'harmattan-bp', title: 'Why Your Readings Might Shift With the Weather', tag: 'Hypertension',
      body: 'Cold weather and dry, dusty conditions like harmattan can cause blood vessels to narrow slightly, which can nudge blood pressure readings up for some people. If you notice a seasonal pattern in your own readings, it\u2019s worth mentioning to your doctor \u2014 it can help them tell the difference between a real trend and normal day-to-day variation.' },
    { id: 'sleep-bp-link', title: 'The Sleep and Blood Pressure Connection', tag: 'Sleep',
      body: 'Poor or short sleep is linked with higher blood pressure over time, and the relationship runs both ways \u2014 high blood pressure can also disrupt sleep. Simple habits like a consistent bedtime and cutting caffeine after early afternoon tend to help more than they get credit for. If snoring or gasping during sleep is a regular pattern, that\u2019s worth raising with a doctor specifically, since it can be a sign of sleep apnea, which is closely tied to blood pressure.' },
    { id: 'stress-numbers', title: 'How Stress Shows Up in Your Numbers', tag: 'Wellness',
      body: 'Stress causes a real, temporary rise in blood pressure \u2014 that\u2019s a normal short-term response. The concern is when stress is constant, since the body doesn\u2019t get a chance to return to baseline. Simple, low-cost tools \u2014 a few minutes of slow breathing, a short prayer or quiet moment, stepping outside \u2014 genuinely help many people, though they\u2019re a complement to treatment, not a replacement for it.' },
    { id: 'diabetes-basics', title: 'Blood Sugar 101: What the Numbers Mean', tag: 'Diabetes',
      body: 'A fasting blood sugar under 100 mg/dL is generally considered normal, 100-125 is prediabetes range, and 126+ on more than one test suggests diabetes. After eating, numbers naturally rise \u2014 that\u2019s expected, not alarming on its own. Your doctor\u2019s specific targets for you may differ from general ranges, especially if you\u2019re managing multiple conditions.' },
    { id: 'foot-checks', title: 'Why Foot Checks Matter More Than People Realize', tag: 'Diabetes',
      body: 'Diabetes can reduce feeling in the feet over time, meaning small cuts or blisters can go unnoticed and worsen. A quick daily glance \u2014 checking between toes, soles, and heels for any cut, redness, or swelling \u2014 catches problems early, when they\u2019re easiest to treat. Well-fitting shoes and avoiding walking barefoot help prevent injuries in the first place.' },
    { id: 'hydration', title: 'Hydration\u2019s Quiet Role in Chronic Condition Management', tag: 'Diet',
      body: 'Staying well-hydrated supports kidney function, which matters more for people managing blood pressure or diabetes, since both conditions put extra load on the kidneys over time. A simple habit: keep a bottle nearby and sip through the day rather than drinking a large amount at once. If you\u2019re on medication that affects fluid balance (like some blood pressure medications), ask your doctor what a good daily intake looks like for you specifically.' },
    { id: 'caregiver-burnout', title: 'Caregiving Is Real Work \u2014 Watch Your Own Signs Too', tag: 'Caregiving',
      body: 'It\u2019s common for caregivers to focus entirely on the person they\u2019re supporting and quietly run themselves down in the process. Persistent exhaustion, irritability, or feeling constantly "on call" are worth noticing in yourself, not just the person you\u2019re caring for. Sharing responsibilities with other family members, even in small rotations, tends to help more than people expect before they try it.' },
    { id: 'reading-labels', title: 'Reading a Medicine Label Properly', tag: 'Medication',
      body: 'Beyond the dose, check the timing instructions \u2014 "before meals," "with food," or "at bedtime" are there for a reason, often affecting how well the medication is absorbed or how it interacts with your body\u2019s natural rhythms. If a label\u2019s instructions are unclear or a pharmacy\u2019s handwriting is hard to read, it\u2019s always fine to ask the pharmacist to clarify before you leave \u2014 that\u2019s a normal, expected question, not a bother.' },
    { id: 'exercise-caution', title: 'Starting to Exercise With a Chronic Condition', tag: 'Activity',
      body: 'If you\u2019re newly diagnosed or haven\u2019t exercised in a while, starting gradually matters more than starting hard. A short walk, light stretching, or a few minutes of stair climbing is a reasonable place to begin. Very high blood pressure or certain heart conditions can mean specific activities should wait until your doctor gives the go-ahead \u2014 worth a quick check-in before starting anything new, not to discourage you, just to make sure it\u2019s the right starting point for your specific situation.' }
  ];

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function renderArticles() {
    const root = document.getElementById('articles-root');
    if (!root) return;
    const order = shuffled(ARTICLES);

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
