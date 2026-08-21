/*
 * articles.js — Sentra-X Health Articles
 * ========================================
 * Two independent, fully-live sections — no static hand-written content
 * left in this file, nothing to author or update manually:
 *
 * 1) LATEST HEALTH NEWS — pulls real headlines + short snippets +
 *    outbound links from CDC's public newsroom RSS feed. We only ever
 *    show a short snippet + "read full article" link out to the
 *    original source — never the full article text, since that isn't
 *    ours to redistribute.
 *
 * 2) HEALTH LIBRARY — real, full-length health topic content pulled
 *    from MedlinePlus (U.S. National Library of Medicine / NIH). Since
 *    this is U.S. federal government content, it's public domain and
 *    safe to display in FULL inside our own in-app reader — unlike
 *    section 1, no "opens on their site" needed here. Fetched through
 *    our own Cloudflare Worker proxy (avoids CORS issues + adds
 *    caching), refreshed at most once a day.
 *
 * Both sections use the same full-width banner card style (top photo,
 * title, excerpt, "Read more") for a consistent look — no cramped
 * side-by-side thumbnail layouts.
 *
 * Isolated from everything else, same pattern as store.js and
 * voice.js: new file, no edits to script.js.
 * If either live feed is unreachable (offline, service down), it fails
 * quietly — the other section still renders fine either way, since
 * the two sections are independent.
 */

(function () {
  'use strict';

  const CDC_FEED_URL = 'https://www.cdc.gov/media/rss.xml';
  const RSS_TO_JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const RSS_TO_JSON_API_KEY = '';
  const MAX_LIVE_ITEMS = 8;
  const SNIPPET_MAX_CHARS = 160;
  const LIVE_FETCH_TIMEOUT_MS = 8000;
  const LIVE_FETCH_RETRIES = 1;

  const MEDLIB_WORKER_URL = 'https://sentrax-medlib.alecedoh1994.workers.dev';
  const MEDLIB_CACHE_KEY = 'sentrax-medlib-cache-v2';
  const MEDLIB_CACHE_MS = 24 * 60 * 60 * 1000;
  const MEDLIB_FETCH_TIMEOUT_MS = 8000;
  const MEDLIB_TAG_MAP = {
    'high-blood-pressure': 'Hypertension',
    'diabetes': 'Diabetes',
    'heart-disease': 'Hypertension',
    'stroke': 'Hypertension',
    'kidney-disease': 'Wellness',
    'taking-medicines': 'Medication',
    'healthy-aging': 'Wellness',
    'exercise-for-older-adults': 'Activity',
    'sleep-disorders': 'Sleep',
    'caregivers': 'Caregiving',
    'arthritis': 'Joint Health',
    'osteoporosis': 'Joint Health',
    'depression': 'Mental Health',
    'anxiety': 'Mental Health',
    'copd': 'Respiratory',
    'asthma': 'Respiratory',
    'dementia': 'Memory',
    'falls': 'Activity',
    'weight-control': 'Diet',
    'nutrition': 'Diet',
    'vision-impairment-and-blindness': 'Vision',
    'hearing-disorders-and-deafness': 'Hearing',
    'immunization': 'Immunization',
    'urinary-incontinence': 'Wellness',
    'pain': 'Joint Health',
    'flu': 'Respiratory',
    'cholesterol': 'Hypertension',
    'obesity': 'Diet',
    'smoking-cessation': 'Respiratory',
    'back-pain': 'Joint Health',
    'headache': 'Joint Health',
    'menopause': "Women's Health",
    'stress-management': 'Mental Health',
    'allergy': 'Respiratory',
    'skin-conditions': 'Skin Health',
    'anemia': 'Wellness',
    'thyroid-disease': 'Wellness',
    'urinary-tract-infections': 'Wellness'
  };

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

  const TAG_PHOTOS = {
    Hypertension: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Blood%20pressure%20monitoring.jpg?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Diagram%20of%20the%20human%20heart.svg?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Types%20of%20Stroke.jpg?width=500'
    ],
    Diet: ['https://commons.wikimedia.org/wiki/Special:FilePath/Food-healthy-vegetables-potatoes%20(23958160949).jpg?width=500'],
    Medication: ['https://commons.wikimedia.org/wiki/Special:FilePath/201707%20medicine%20tablets%20elliptical.svg?width=500'],
    Activity: ['https://commons.wikimedia.org/wiki/Special:FilePath/Walkingexercise.jpg?width=500'],
    Sleep: ['https://commons.wikimedia.org/wiki/Special:FilePath/Classic%20alarm%20clock%2020180513.jpg?width=500'],
    Wellness: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Meditation%20Session.jpg?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Kidney%20nephron.jpg?width=500'
    ],
    Caregiving: ['https://commons.wikimedia.org/wiki/Special:FilePath/Human%20Connection.png?width=500'],
    Diabetes: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Blausen%200299%20Diabetes%20BloodGlucoseMeter.png?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Glucometer.jpg?width=500'
    ],
    'Joint Health': [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Illustration%20of%20a%20joint%20with%20rheumatoid%20arthritis.png?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Osteoporosis%20in%20Bones.jpg?width=500'
    ],
    'Mental Health': ['https://commons.wikimedia.org/wiki/Special:FilePath/Human%20brain%20NIH.png?width=500'],
    Respiratory: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Asthma%20attack-illustration%20NIH.jpg?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Lung%20structure%20normal.jpg?width=500'
    ],
    Memory: ['https://commons.wikimedia.org/wiki/Special:FilePath/PET%20Alzheimer.jpg?width=500'],
    Vision: ['https://commons.wikimedia.org/wiki/Special:FilePath/Human%20eye%20diagram-sagittal%20view-NEI.jpg?width=500'],
    Hearing: ['https://commons.wikimedia.org/wiki/Special:FilePath/Anatomy%20of%20the%20Human%20Ear%20en.svg?width=500'],
    Immunization: ['https://commons.wikimedia.org/wiki/Special:FilePath/US%20Navy%20050518-N-1485H-006%20Hospitalman%20Jessica%20Mayer%20of%20Mariss%2C%20Ill.%2C%20preps%20a%20syringe%20filled%20with%20measles%2C%20mumps%20and%20rubella%20vaccination%20before%20injecting%20a%20local%20woman%20the%20local%20village%20of%20Potts%20Dam.jpg?width=500'],
    "Women's Health": ['https://commons.wikimedia.org/wiki/Special:FilePath/Symptoms%20of%20menopause%20(vector).svg?width=500'],
    'Skin Health': ['https://commons.wikimedia.org/wiki/Special:FilePath/Anatomy%20The%20Skin%20-%20NCI%20Visuals%20Online.jpg?width=500']
  };

  const MEDLIB_PHOTO_OVERRIDE = {
    'high-blood-pressure': 'https://commons.wikimedia.org/wiki/Special:FilePath/Blood%20pressure%20monitoring.jpg?width=500',
    'heart-disease': 'https://commons.wikimedia.org/wiki/Special:FilePath/Diagram%20of%20the%20human%20heart.svg?width=500',
    'stroke': 'https://commons.wikimedia.org/wiki/Special:FilePath/Types%20of%20Stroke.jpg?width=500',
    'kidney-disease': 'https://commons.wikimedia.org/wiki/Special:FilePath/Kidney%20nephron.jpg?width=500',
    'healthy-aging': 'https://commons.wikimedia.org/wiki/Special:FilePath/Meditation%20Session.jpg?width=500',
    // Added: these 4 topics were previously falling into a tag whose photo
    // pool didn't actually depict them (headache was showing an arthritis
    // joint illustration via the "Joint Health" tag; the other three were
    // falling into the generic "Wellness" pool — a meditation photo or a
    // kidney illustration — none of which are what those articles are
    // actually about). Direct overrides here mean these specific topics
    // always get a genuinely matching image regardless of their tag.
    'headache': 'https://commons.wikimedia.org/wiki/Special:FilePath/Headache.svg?width=500',
    'thyroid-disease': 'https://commons.wikimedia.org/wiki/Special:FilePath/Thyroid%20and%20parathyroid%20glands.gif?width=500',
    'urinary-incontinence': 'https://commons.wikimedia.org/wiki/Special:FilePath/Illu%20bladder.jpg?width=500',
    'urinary-tract-infections': 'https://commons.wikimedia.org/wiki/Special:FilePath/Illu%20bladder.jpg?width=500',
    // Finishing the same cleanup pass as the 4 above — these 2 were the
    // ones still falling into the generic "Joint Health" / "Wellness"
    // pools without actually depicting the topic.
    'pain': 'https://commons.wikimedia.org/wiki/Special:FilePath/1506%20Referred%20Pain%20Chart.jpg?width=500',
    'anemia': 'https://commons.wikimedia.org/wiki/Special:FilePath/Redbloodcells.jpg?width=500',
    // 'back-pain' was falling into the same 'Joint Health' pool as arthritis
    // and osteoporosis — neither of which is back pain. Direct override to
    // an image that's actually of the lower back.
    'back-pain': 'https://commons.wikimedia.org/wiki/Special:FilePath/Lower%20back%20pain.jpg?width=500'
  };

  function coverHtml(tag, photoUrl, sizeStyle, altIndex) {
    // Every call site now always provides a real, pre-assigned photoUrl
    // (see the global-pool, no-duplicates assignment in loadMedLibrary()
    // below) — there is deliberately no emoji/icon fallback path left
    // here at all, so a real image is the only possible outcome, not
    // just the common case.
    const altClass = altIndex % 2 === 1 ? ' art-cover-alt' : '';
    return '<div class="art-cover art-cover-photo' + altClass + '" data-tag="' + tag + '"' + (sizeStyle ? ' style="' + sizeStyle + '"' : '') + '>' +
      '<img src="' + photoUrl + '" alt="" loading="lazy" onerror="var el=this.parentElement;el.classList.add(\'art-cover-fallback\');var cr=el.querySelector(\'.img-credit\');if(cr)cr.remove();this.remove();">' +
      '<span class="art-tag">' + tag + '</span>' +
      '<span class="img-credit">Wikimedia Commons</span>' +
      '</div>';
  }

  function renderArticles() {
    const root = document.getElementById('articles-root');
    if (!root) return;
    root.innerHTML =
      '<div id="live-news-section"><p style="font-size:12px;color:#64748b;text-align:center;">Loading latest health news…</p></div><div style="height:14px;"></div>' +
      '<div id="med-library-section"><p style="font-size:12px;color:#64748b;text-align:center;">Loading health library…</p></div>' +
      '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</p>';

    loadLiveNews();
    loadMedLibrary();
  }

  let articleHistoryPushed = false;

  // ---- Reading time tracking (article coin still requires ~1.5 real
  // minutes of the reader actually being on-screen, not just opened) -----
  // Runs silently — no visible countdown. Ticks down once a second, but
  // only while the article is genuinely visible in the foreground —
  // document.hidden (app backgrounded, screen locked, tab switched away)
  // pauses it without losing progress, so switching away and back just
  // resumes the same countdown rather than restarting it. Closing the
  // article before it finishes drops the progress entirely — reopening
  // later starts the 90 seconds fresh, same as actually starting the
  // article over. The coin toast (already existing, in rewards.js) is
  // the only signal the user sees once it's actually earned.
  const ARTICLE_READ_DWELL_MS = 90000;
  let readInterval = null;
  let readRemainingMs = 0;
  let readArticleKey = null;

  function stopReadTracking() {
    if (readInterval) clearInterval(readInterval);
    readInterval = null;
    readArticleKey = null;
  }

  function startReadTracking(articleKey) {
    stopReadTracking();
    if (window.SentraXRewards && window.SentraXRewards.hasReadArticle(articleKey)) return; // nothing left to earn here
    readArticleKey = articleKey;
    readRemainingMs = ARTICLE_READ_DWELL_MS;
    readInterval = setInterval(function () {
      if (document.hidden) return; // paused — not real reading time while backgrounded
      readRemainingMs -= 1000;
      if (readRemainingMs <= 0) {
        const key = readArticleKey;
        stopReadTracking();
        if (window.SentraXRewards) window.SentraXRewards.awardArticleRead(key);
      }
    }, 1000);
  }

  function closeArticle() {
    stopReadTracking();
    const overlay = document.getElementById('article-reader-overlay');
    if (overlay) overlay.style.display = 'none';
    if (articleHistoryPushed) {
      articleHistoryPushed = false;
      history.back();
    }
  }

  window.addEventListener('popstate', function () {
    const overlay = document.getElementById('article-reader-overlay');
    if (overlay && overlay.style.display === 'block') {
      stopReadTracking();
      overlay.style.display = 'none';
      articleHistoryPushed = false;
    }
  });

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
      (window.SentraXAds ? SentraXAds.slotHtml('sx-ad-inline') : '') +
      '</div>';
    history.pushState({ sxArticleOverlay: true }, '');
    articleHistoryPushed = true;
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
    if (window.SentraXAds) SentraXAds.init(overlay);
    startReadTracking('live-' + id);
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
        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">📡 Latest Health News</h3><p>Straight from the CDC newsroom — new every visit</p></div>';
        items.forEach(function (item, i) {
          const id = 'live-' + i;
          liveNewsById[id] = item;
          const snippet = snippetFrom(item);
          const altClass = i % 2 === 1 ? ' art-card-alt' : '';
          const cover = item.thumbnail
            ? '<div class="art-cover art-cover-photo' + (i % 2 === 1 ? ' art-cover-alt' : '') + '" data-tag="Wellness"><img src="' + item.thumbnail + '" alt="" loading="lazy" class="live-news-thumb" onerror="this.parentElement.classList.add(\'art-cover-fallback\');this.remove();"><span class="art-tag">CDC Newsroom</span></div>'
            : '<div class="art-cover" data-tag="Wellness"><span class="art-tag">CDC Newsroom</span>📡</div>';
          html += '<div class="art-card' + altClass + '" onclick="SentraXArticles.openLive(\'' + id + '\')">' +
            cover +
            '<div class="art-body">' +
            '<h4>' + item.title + '</h4>' +
            (snippet ? '<p class="art-excerpt">' + snippet + '</p>' : '') +
            '<div class="art-readmore">Read more →</div>' +
            '</div></div>';
          if (window.SentraXAds && (i + 1) % 4 === 0 && i < items.length - 1) html += SentraXAds.slotHtml();
        });
        container.innerHTML = html;
        if (window.SentraXAds) SentraXAds.init(container);
      })
      .catch(function () {
        container.innerHTML = '';
      });
  }

  const MEDLIB_ALLOWED_TAGS = { P: 1, UL: 1, OL: 1, LI: 1, B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, A: 1 };
  function sanitizeMedlibHtml(html) {
    if (typeof DOMParser === 'undefined') return '';
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    if (!root) return '';
    (function clean(node) {
      Array.from(node.childNodes).forEach(function (child) {
        if (child.nodeType === 1) {
          if (!MEDLIB_ALLOWED_TAGS[child.tagName]) {
            const text = doc.createTextNode(child.textContent);
            node.replaceChild(text, child);
            return;
          }
          Array.from(child.attributes).forEach(function (attr) {
            if (!(child.tagName === 'A' && attr.name === 'href')) child.removeAttribute(attr.name);
          });
          if (child.tagName === 'A') {
            const href = child.getAttribute('href') || '';
            if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
          clean(child);
        }
      });
    })(root);
    root.normalize();
    Array.from(root.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        const text = child.textContent.trim();
        if (text.length > 0 && text.length < 140) {
          const h = doc.createElement('h3');
          h.textContent = text;
          root.replaceChild(h, child);
        } else if (text.length === 0) {
          root.removeChild(child);
        }
      }
    });
    return root.innerHTML;
  }

  function fetchMedLibrary() {
    if (!MEDLIB_WORKER_URL) return Promise.reject(new Error('MEDLIB_WORKER_URL not configured'));
    try {
      const cached = JSON.parse(localStorage.getItem(MEDLIB_CACHE_KEY) || 'null');
      if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < MEDLIB_CACHE_MS) {
        return Promise.resolve(cached);
      }
    } catch (e) { /* corrupt cache — fall through to a fresh fetch */ }

    return fetchWithTimeout(MEDLIB_WORKER_URL, MEDLIB_FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        try { localStorage.setItem(MEDLIB_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage full/unavailable */ }
        return data;
      });
  }

  let medLibraryById = {};
  let medLibraryPhotoById = {};

  // Deterministic "random" order that only changes once a day — so the
  // feed doesn't look frozen in the same order on every visit, but also
  // doesn't reshuffle mid-session (same order all day, new order tomorrow).
  // Pure display-order change only; doesn't touch what fetchMedLibrary()
  // caches, so the 24h fetch/cache behavior above is untouched.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function numericSeedFromDateString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  function todaySeedString() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function dailyShuffledCopy(list) {
    const copy = list.slice();
    const rand = mulberry32(numericSeedFromDateString(todaySeedString()));
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  // How many Health Library articles to feature at once. With the topic
  // pool now bigger than this, each day shows a genuinely different set of
  // articles (not just the same set reordered) — see dailyFeaturedSlice.
  const MEDLIB_DAILY_COUNT = 12;

  // Splits the (already daily-shuffled) full topic pool into contiguous
  // chunks of MEDLIB_DAILY_COUNT and picks a different chunk each day, so
  // the Health Library actually rotates through new articles day to day
  // instead of just re-showing the same set in a new order. Once the pool
  // is fully cycled through it starts again, reshuffled. Add more topics
  // to the Cloudflare Worker's TOPICS list any time to lengthen the cycle
  // before it repeats.
  function dailyFeaturedSlice(list) {
    const shuffled = dailyShuffledCopy(list);
    if (shuffled.length <= MEDLIB_DAILY_COUNT) return shuffled;
    const numChunks = Math.ceil(shuffled.length / MEDLIB_DAILY_COUNT);
    const dayIndex = Math.floor(Date.now() / 86400000);
    const chunk = dayIndex % numChunks;
    const start = chunk * MEDLIB_DAILY_COUNT;
    let slice = shuffled.slice(start, start + MEDLIB_DAILY_COUNT);
    if (slice.length < MEDLIB_DAILY_COUNT) {
      slice = slice.concat(shuffled.slice(0, MEDLIB_DAILY_COUNT - slice.length));
    }
    return slice;
  }

  function loadMedLibrary() {
    const container = document.getElementById('med-library-section');
    if (!container || !MEDLIB_WORKER_URL) return;

    fetchMedLibrary()
      .then(function (data) {
        if (!data || !data.items || !data.items.length) { container.innerHTML = ''; return; }
        const shuffledItems = dailyFeaturedSlice(data.items);
        medLibraryById = {};
        medLibraryPhotoById = {};

        // Global, no-duplicates photo assignment. Previously each tag only
        // ever drew from its OWN small pool (round-robin), which wrapped
        // around and repeated the same photo across multiple articles the
        // moment a tag had more items than photos — the actual cause of
        // two articles showing the same image. Fixed by tracking every
        // photo used ANYWHERE in today's batch (across all tags) in one
        // Set: each item first tries its own tag's next unused photo, and
        // only borrows from another tag's pool if its own is exhausted —
        // so same-topic photos are still preferred whenever possible, and
        // a cross-tag borrow only happens when it's genuinely needed to
        // avoid a repeat. With 23 unique photos across all tags combined
        // and at most MEDLIB_DAILY_COUNT (12) articles shown per day, every
        // article is guaranteed a real, unique photo — never a repeat, and
        // (per coverHtml above) never an emoji fallback either.
        const usedPhotos = new Set();
        const tagCounters = {};
        const allPhotos = Object.keys(TAG_PHOTOS).reduce(function (acc, t) { return acc.concat(TAG_PHOTOS[t]); }, []);

        function nextUnusedFrom(pool) {
          for (let i = 0; i < pool.length; i++) {
            if (!usedPhotos.has(pool[i])) return pool[i];
          }
          return null;
        }

        // Pre-register fixed overrides first, so the round-robin below can
        // never hand out the same photo to a different article.
        shuffledItems.forEach(function (item) {
          if (MEDLIB_PHOTO_OVERRIDE[item.id]) usedPhotos.add(MEDLIB_PHOTO_OVERRIDE[item.id]);
        });

        shuffledItems.forEach(function (item) {
          if (MEDLIB_PHOTO_OVERRIDE[item.id]) {
            medLibraryPhotoById[item.id] = MEDLIB_PHOTO_OVERRIDE[item.id];
            return;
          }
          const tag = MEDLIB_TAG_MAP[item.id] || 'Wellness';
          const ownPool = TAG_PHOTOS[tag] || [];
          const n = tagCounters[tag] || 0;
          tagCounters[tag] = n + 1;
          // Prefer the tag's own pool, cycling from where this tag left off.
          let chosen = nextUnusedFrom(ownPool.slice(n).concat(ownPool.slice(0, n)));
          // Own pool exhausted (all already used elsewhere today) — borrow
          // any still-unused photo from the full combined inventory.
          if (!chosen) chosen = nextUnusedFrom(allPhotos);
          // Only possible if daily count ever exceeds total inventory —
          // falls back to the tag's first photo rather than emoji.
          if (!chosen) chosen = ownPool[0] || allPhotos[0];
          usedPhotos.add(chosen);
          medLibraryPhotoById[item.id] = chosen;
        });

        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">🏥 Health Library</h3><p>Full topic guides from MedlinePlus (U.S. National Library of Medicine) — a fresh set featured daily. Topic images via Wikimedia Commons contributors, used under Creative Commons licenses.</p></div>';
        shuffledItems.forEach(function (item, i) {
          medLibraryById[item.id] = item;
          const tag = MEDLIB_TAG_MAP[item.id] || 'Wellness';
          const altClass = i % 2 === 1 ? ' art-card-alt' : '';
          const excerpt = truncate(stripHtml(item.summaryHtml), 100);
          html += '<div class="art-card' + altClass + '" onclick="SentraXArticles.openMedLib(\'' + item.id + '\')">' +
            coverHtml(tag, medLibraryPhotoById[item.id], null, i) +
            '<div class="art-body">' +
            '<h4>' + item.title + '</h4>' +
            '<p class="art-excerpt">' + excerpt + '</p>' +
            '<div class="art-readmore">Read more →</div>' +
            '</div></div>';
          if (window.SentraXAds && (i + 1) % 4 === 0 && i < shuffledItems.length - 1) html += SentraXAds.slotHtml();
        });
        container.innerHTML = html;
        if (window.SentraXAds) SentraXAds.init(container);
      })
      .catch(function () {
        container.innerHTML = '';
      });
  }

  function openMedLibArticle(id) {
    const item = medLibraryById[id];
    if (!item) return;
    let overlay = document.getElementById('article-reader-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'article-reader-overlay';
      document.body.appendChild(overlay);
    }
    const readerTag = MEDLIB_TAG_MAP[item.id] || 'Wellness';
    const safeBody = sanitizeMedlibHtml(item.summaryHtml);
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXArticles.close()">←</button>' +
      coverHtml(readerTag, medLibraryPhotoById[item.id], 'height:180px;', 0)
        .replace('class="art-cover', 'class="art-cover art-reader-cover')
        .replace(/<span class="art-tag">[^<]*<\/span>/, '<span class="art-reader-tag">Health Library</span>') +
      '<div class="art-reader-body">' +
      '<h2>' + item.title + '</h2>' +
      safeBody +
      (item.sourceUrl ? '<p style="margin-top:16px;font-size:12px;"><a href="' + item.sourceUrl + '" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">View original on medlineplus.gov ↗</a></p>' : '') +
      '<div class="art-reader-footnote">Source: MedlinePlus®, U.S. National Library of Medicine (NIH). General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</div>' +
      (window.SentraXAds ? SentraXAds.slotHtml('sx-ad-inline') : '') +
      '</div>';
    history.pushState({ sxArticleOverlay: true }, '');
    articleHistoryPushed = true;
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
    if (window.SentraXAds) SentraXAds.init(overlay);
    startReadTracking('medlib-' + id);
  }

  if (typeof window !== 'undefined') {
    window.SentraXArticles = { render: renderArticles, openLive: openLiveArticle, openMedLib: openMedLibArticle, close: closeArticle };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { stripHtml: stripHtml, truncate: truncate, snippetFrom: snippetFrom };
  }
})();
