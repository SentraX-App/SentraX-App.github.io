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
  const MEDLIB_CACHE_KEY = 'sentrax-medlib-cache-v1';
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
    'caregivers': 'Caregiving'
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

  const TAG_EMOJI = {
    Hypertension: '🩺', Diet: '🥗', Medication: '💊', Activity: '🚶',
    Sleep: '😴', Diabetes: '🩸', Wellness: '🧘', Caregiving: '🤝'
  };

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
    ]
  };

  // Several Health Library topics share a tag whose photo pool has more
  // than one image (e.g. high-blood-pressure / heart-disease / stroke all
  // map to the Hypertension tag). Cycling those round-robin by whatever
  // order the live feed happens to return items in caused mismatches —
  // "Stroke" could end up with the heart diagram instead of the stroke
  // scan, depending on API response order. This map pins each specific
  // topic id to the one photo from its tag's pool that actually matches
  // it, so the assignment is always the same regardless of feed order.
  const MEDLIB_PHOTO_OVERRIDE = {
    'high-blood-pressure': 'https://commons.wikimedia.org/wiki/Special:FilePath/Blood%20pressure%20monitoring.jpg?width=500',
    'heart-disease': 'https://commons.wikimedia.org/wiki/Special:FilePath/Diagram%20of%20the%20human%20heart.svg?width=500',
    'stroke': 'https://commons.wikimedia.org/wiki/Special:FilePath/Types%20of%20Stroke.jpg?width=500',
    'kidney-disease': 'https://commons.wikimedia.org/wiki/Special:FilePath/Kidney%20nephron.jpg?width=500',
    'healthy-aging': 'https://commons.wikimedia.org/wiki/Special:FilePath/Meditation%20Session.jpg?width=500'
  };

  function coverHtml(tag, photoUrl, sizeStyle, altIndex) {
    const emoji = TAG_EMOJI[tag] || '📰';
    const photo = photoUrl || (TAG_PHOTOS[tag] && TAG_PHOTOS[tag][0]);
    const altClass = altIndex % 2 === 1 ? ' art-cover-alt' : '';
    if (photo) {
      return '<div class="art-cover art-cover-photo' + altClass + '" data-tag="' + tag + '"' + (sizeStyle ? ' style="' + sizeStyle + '"' : '') + '>' +
        '<img src="' + photo + '" alt="" loading="lazy" onerror="this.parentElement.classList.add(\'art-cover-fallback\');this.remove();">' +
        '<span class="art-tag">' + tag + '</span></div>';
    }
    return '<div class="art-cover' + altClass + '" data-tag="' + tag + '"' + (sizeStyle ? ' style="' + sizeStyle + '"' : '') + '><span class="art-tag">' + tag + '</span>' + emoji + '</div>';
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
        });
        container.innerHTML = html;
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

  function loadMedLibrary() {
    const container = document.getElementById('med-library-section');
    if (!container || !MEDLIB_WORKER_URL) return;

    fetchMedLibrary()
      .then(function (data) {
        if (!data || !data.items || !data.items.length) { container.innerHTML = ''; return; }
        medLibraryById = {};
        medLibraryPhotoById = {};
        const tagCounters = {};
        data.items.forEach(function (item) {
          if (MEDLIB_PHOTO_OVERRIDE[item.id]) {
            medLibraryPhotoById[item.id] = MEDLIB_PHOTO_OVERRIDE[item.id];
            return;
          }
          const tag = MEDLIB_TAG_MAP[item.id] || 'Wellness';
          const pool = TAG_PHOTOS[tag];
          if (pool && pool.length) {
            const n = tagCounters[tag] || 0;
            medLibraryPhotoById[item.id] = pool[n % pool.length];
            tagCounters[tag] = n + 1;
          }
        });

        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">🏥 Health Library</h3><p>Full topic guides from MedlinePlus (U.S. National Library of Medicine)</p></div>';
        data.items.forEach(function (item, i) {
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
        });
        container.innerHTML = html;
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
      '</div>';
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
  }

  if (typeof window !== 'undefined') {
    window.SentraXArticles = { render: renderArticles, openLive: openLiveArticle, openMedLib: openMedLibArticle, close: closeArticle };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { stripHtml: stripHtml, truncate: truncate, snippetFrom: snippetFrom };
  }
})();
