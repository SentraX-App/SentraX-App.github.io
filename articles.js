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
  // rss2json.com bridges RSS/XML to JSON so the browser can fetch it
  // directly (browsers can't cross-origin-fetch raw XML feeds without a
  // server in between). Free tier, no key needed for light use.
  const RSS_TO_JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const MAX_LIVE_ITEMS = 5;
  const SNIPPET_MAX_CHARS = 160;

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

  const ARTICLES = [
    {
      id: 'bp-basics',
      title: 'Understanding Your Blood Pressure Numbers',
      tag: 'Hypertension',
      body: 'Blood pressure is written as two numbers, like 120/80. The top number (systolic) measures pressure when your heart beats; the bottom (diastolic) measures pressure when it rests between beats. Generally, under 120/80 is considered normal, 120-129/under 80 is elevated, and 130/80 or higher is considered high. These ranges are general guidance, not a diagnosis — your own healthy range can depend on age, other conditions, and what your doctor has told you specifically.'
    },
    {
      id: 'salt-swap',
      title: 'Small Salt Swaps That Add Up',
      tag: 'Diet',
      body: 'Cutting sodium doesn\u2019t mean bland food. Try swapping bouillon cubes for fresh herbs, garlic, ginger, and pepper soup spices — many local dishes get their punch from aromatics, not just salt. Rinsing canned or tinned foods before cooking removes a meaningful amount of added sodium too. Small, consistent swaps tend to stick better than one big overhaul.'
    },
    {
      id: 'med-adherence',
      title: 'Why Missing Doses Matters More Than You\u2019d Think',
      tag: 'Medication',
      body: 'Blood pressure and diabetes medications often work by keeping a steady level in your body over time. Skipping doses \u2014 even occasionally \u2014 can cause your numbers to swing more than staying consistently on a slightly different plan would. If a medication schedule feels hard to keep up with, that\u2019s worth telling your doctor directly; there are often simpler dosing options, not just "try harder."'
    },
    {
      id: 'walk-daily',
      title: 'A 20-Minute Walk Does More Than You\u2019d Expect',
      tag: 'Activity',
      body: 'Regular walking \u2014 even a modest 20 minutes a day \u2014 is consistently linked to better blood pressure and blood sugar control over time. It doesn\u2019t need to be intense. Splitting it into two 10-minute walks works just as well if a single block of time is hard to find. The consistency matters more than the intensity.'
    },
    {
      id: 'harmattan-bp',
      title: 'Why Your Readings Might Shift With the Weather',
      tag: 'Hypertension',
      body: 'Cold weather and dry, dusty conditions like harmattan can cause blood vessels to narrow slightly, which can nudge blood pressure readings up for some people. If you notice a seasonal pattern in your own readings, it\u2019s worth mentioning to your doctor \u2014 it can help them tell the difference between a real trend and normal day-to-day variation.'
    },
    {
      id: 'sleep-bp-link',
      title: 'The Sleep and Blood Pressure Connection',
      tag: 'Sleep',
      body: 'Poor or short sleep is linked with higher blood pressure over time, and the relationship runs both ways \u2014 high blood pressure can also disrupt sleep. Simple habits like a consistent bedtime and cutting caffeine after early afternoon tend to help more than they get credit for. If snoring or gasping during sleep is a regular pattern, that\u2019s worth raising with a doctor specifically, since it can be a sign of sleep apnea, which is closely tied to blood pressure.'
    },
    {
      id: 'stress-numbers',
      title: 'How Stress Shows Up in Your Numbers',
      tag: 'Wellness',
      body: 'Stress causes a real, temporary rise in blood pressure \u2014 that\u2019s a normal short-term response. The concern is when stress is constant, since the body doesn\u2019t get a chance to return to baseline. Simple, low-cost tools \u2014 a few minutes of slow breathing, a short prayer or quiet moment, stepping outside \u2014 genuinely help many people, though they\u2019re a complement to treatment, not a replacement for it.'
    },
    {
      id: 'diabetes-basics',
      title: 'Blood Sugar 101: What the Numbers Mean',
      tag: 'Diabetes',
      body: 'A fasting blood sugar under 100 mg/dL is generally considered normal, 100-125 is prediabetes range, and 126+ on more than one test suggests diabetes. After eating, numbers naturally rise \u2014 that\u2019s expected, not alarming on its own. Your doctor\u2019s specific targets for you may differ from general ranges, especially if you\u2019re managing multiple conditions.'
    },
    {
      id: 'foot-checks',
      title: 'Why Foot Checks Matter More Than People Realize',
      tag: 'Diabetes',
      body: 'Diabetes can reduce feeling in the feet over time, meaning small cuts or blisters can go unnoticed and worsen. A quick daily glance \u2014 checking between toes, soles, and heels for any cut, redness, or swelling \u2014 catches problems early, when they\u2019re easiest to treat. Well-fitting shoes and avoiding walking barefoot help prevent injuries in the first place.'
    },
    {
      id: 'hydration',
      title: 'Hydration\u2019s Quiet Role in Chronic Condition Management',
      tag: 'Diet',
      body: 'Staying well-hydrated supports kidney function, which matters more for people managing blood pressure or diabetes, since both conditions put extra load on the kidneys over time. A simple habit: keep a bottle nearby and sip through the day rather than drinking a large amount at once. If you\u2019re on medication that affects fluid balance (like some blood pressure medications), ask your doctor what a good daily intake looks like for you specifically.'
    },
    {
      id: 'caregiver-burnout',
      title: 'Caregiving Is Real Work \u2014 Watch Your Own Signs Too',
      tag: 'Caregiving',
      body: 'It\u2019s common for caregivers to focus entirely on the person they\u2019re supporting and quietly run themselves down in the process. Persistent exhaustion, irritability, or feeling constantly "on call" are worth noticing in yourself, not just the person you\u2019re caring for. Sharing responsibilities with other family members, even in small rotations, tends to help more than people expect before they try it.'
    },
    {
      id: 'reading-labels',
      title: 'Reading a Medicine Label Properly',
      tag: 'Medication',
      body: 'Beyond the dose, check the timing instructions \u2014 "before meals," "with food," or "at bedtime" are there for a reason, often affecting how well the medication is absorbed or how it interacts with your body\u2019s natural rhythms. If a label\u2019s instructions are unclear or a pharmacy\u2019s handwriting is hard to read, it\u2019s always fine to ask the pharmacist to clarify before you leave \u2014 that\u2019s a normal, expected question, not a bother.'
    },
    {
      id: 'exercise-caution',
      title: 'Starting to Exercise With a Chronic Condition',
      tag: 'Activity',
      body: 'If you\u2019re newly diagnosed or haven\u2019t exercised in a while, starting gradually matters more than starting hard. A short walk, light stretching, or a few minutes of stair climbing is a reasonable place to begin. Very high blood pressure or certain heart conditions can mean specific activities should wait until your doctor gives the go-ahead \u2014 worth a quick check-in before starting anything new, not to discourage you, just to make sure it\u2019s the right starting point for your specific situation.'
    }
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
      html += '<div class="card" style="margin-bottom:10px;">' +
        '<div style="font-size:11px;color:#60a5fa;font-weight:700;text-transform:uppercase;">' + a.tag + '</div>' +
        '<h3 style="margin:4px 0 6px;">' + a.title + '</h3>' +
        '<p style="font-size:13px;color:#cbd5e1;line-height:1.5;margin:0;">' + a.body + '</p>' +
        '</div>';
    });
    html += '<p style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;">' +
      'General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</p>';
    root.innerHTML = html;

    loadLiveNews();
  }

  function loadLiveNews() {
    const container = document.getElementById('live-news-section');
    if (!container || typeof fetch === 'undefined') return;

    fetch(RSS_TO_JSON_ENDPOINT + encodeURIComponent(CDC_FEED_URL))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.status !== 'ok' || !data.items || !data.items.length) {
          container.innerHTML = ''; // fail quietly, static articles above still stand
          return;
        }
        const items = data.items.slice(0, MAX_LIVE_ITEMS);
        let html = '<h3 style="margin:0 0 8px;">📡 Latest Health News</h3>';
        items.forEach(function (item) {
          const snippet = snippetFrom(item);
          html += '<a href="' + item.link + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;">' +
            '<div class="card" style="margin-bottom:8px;">' +
            '<div style="font-size:10px;color:#64748b;">CDC Newsroom</div>' +
            '<div style="font-size:14px;font-weight:600;margin:2px 0 4px;">' + item.title + '</div>' +
            (snippet ? '<div style="font-size:12px;color:#94a3b8;">' + snippet + '</div>' : '') +
            '<div style="font-size:11px;color:#60a5fa;margin-top:4px;">Read full article →</div>' +
            '</div></a>';
        });
        container.innerHTML = html;
      })
      .catch(function () {
        // Offline, feed down, or blocked — fail quietly. The curated
        // static section already rendered above and works regardless.
        container.innerHTML = '';
      });
  }

  if (typeof window !== 'undefined') {
    window.SentraXArticles = { render: renderArticles, ARTICLES: ARTICLES };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARTICLES: ARTICLES, shuffled: shuffled, stripHtml: stripHtml, truncate: truncate, snippetFrom: snippetFrom };
  }
})();
