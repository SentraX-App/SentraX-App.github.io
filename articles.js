/*
 * articles.js — Sentra-X Health Articles
 * ========================================
 * Three independent sections, kept separate on purpose:
 *
 * 1) GUIDES — a vetted, evergreen library of longer explainer articles
 *    (300+ words each). These don't change day to day because they're
 *    meant to be accurate, careful, reference-quality content — not
 *    something regenerated on a timer. Order reshuffles daily (same
 *    order for everyone all day, changes at midnight UTC) so the list
 *    feels fresh without pretending the underlying content is new.
 *    Each article now has its own photo (not shared across every
 *    article with the same tag), so the feed doesn't look repetitive.
 *
 * 2) LATEST HEALTH NEWS — genuinely live. Pulls real headlines + short
 *    snippets + outbound links from CDC's public newsroom RSS feed.
 *    This is the section that's actually different every time it loads,
 *    because it's real published news, not a shuffle of fixed content.
 *    We only ever show a short snippet + "read full article" link out
 *    to the original source — never the full article text, since that
 *    isn't ours to redistribute.
 *
 * 3) HEALTH LIBRARY — real, full-length health topic content pulled
 *    from MedlinePlus (U.S. National Library of Medicine / NIH). Since
 *    this is U.S. federal government content, it's public domain and
 *    safe to display in FULL inside our own in-app reader — unlike
 *    section 2, no "opens on their site" needed here. Fetched through
 *    our own Cloudflare Worker proxy (avoids CORS issues + adds
 *    caching), refreshed at most once a day. No article writing
 *    required — this section grows/updates itself from a fixed list of
 *    topic searches.
 *
 * Isolated from everything else, same pattern as store.js and
 * bp-experimental.js: new file, no edits to script.js.
 * If any live feed is unreachable (offline, service down), it fails
 * quietly — the Guides section still renders fine either way, since
 * all sections are independent.
 */

(function () {
  'use strict';

  const CDC_FEED_URL = 'https://www.cdc.gov/media/rss.xml';
  const RSS_TO_JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
  // Optional: set this if/when we get a free rss2json API key — the
  // anonymous tier is shared globally and gets rate-limited under load.
  // Leave blank to keep current (no-key) behavior.
  const RSS_TO_JSON_API_KEY = '';
  const MAX_LIVE_ITEMS = 8;
  const SNIPPET_MAX_CHARS = 160;
  const LIVE_FETCH_TIMEOUT_MS = 8000;
  const LIVE_FETCH_RETRIES = 1;

  // ---- Health Library (MedlinePlus, public-domain, full-text) ----------
  // TODO: replace with your deployed medlib-worker.js URL, e.g.
  // 'https://sentrax-medlib.YOUR-SUBDOMAIN.workers.dev/'
  const MEDLIB_WORKER_URL = 'https://sentrax-medlib.alecedoh1994.workers.dev';
  const MEDLIB_CACHE_KEY = 'sentrax-medlib-cache-v1';
  const MEDLIB_CACHE_MS = 24 * 60 * 60 * 1000; // refresh at most once a day
  const MEDLIB_FETCH_TIMEOUT_MS = 8000;
  // Maps each Health Library topic id to the closest existing Guides tag,
  // purely so it can reuse the same hand-picked photo pool — MedlinePlus's
  // API returns no images of its own.
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

  // Each tag now has its own small photo pool (not just one shared
  // image), so articles sharing a tag don't all show the identical
  // picture. Articles are assigned photos round-robin within their
  // tag further down, so consecutive same-tag articles alternate.
  const TAG_PHOTOS = {
    Hypertension: ['https://commons.wikimedia.org/wiki/Special:FilePath/Blood%20pressure%20monitoring.jpg?width=500'],
    Diet: ['https://commons.wikimedia.org/wiki/Special:FilePath/Food-healthy-vegetables-potatoes%20(23958160949).jpg?width=500'],
    Medication: ['https://commons.wikimedia.org/wiki/Special:FilePath/201707%20medicine%20tablets%20elliptical.svg?width=500'],
    Activity: ['https://commons.wikimedia.org/wiki/Special:FilePath/Walkingexercise.jpg?width=500'],
    Sleep: ['https://commons.wikimedia.org/wiki/Special:FilePath/Classic%20alarm%20clock%2020180513.jpg?width=500'],
    Wellness: ['https://commons.wikimedia.org/wiki/Special:FilePath/Meditation%20Session.jpg?width=500'],
    Caregiving: ['https://commons.wikimedia.org/wiki/Special:FilePath/Human%20Connection.png?width=500'],
    Diabetes: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Blausen%200299%20Diabetes%20BloodGlucoseMeter.png?width=500',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Glucometer.jpg?width=500'
    ]
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

  function excerptFrom(body, maxChars) {
    if (body.length <= maxChars) return body;
    return body.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  }

  // ---- Guides: 300+ words each, general health information, not
  // medical advice — every article ends with a line encouraging the
  // person to talk to a real doctor/pharmacist for anything specific
  // to them. ----
  const ARTICLES = [
    { id: 'bp-basics', title: 'Understanding Your Blood Pressure Numbers', tag: 'Hypertension',
      body: `Blood pressure is written as two numbers, like 120/80. The top number (systolic) measures the pressure in your arteries when your heart beats and pushes blood out; the bottom number (diastolic) measures the pressure when your heart rests between beats. Generally, under 120/80 is considered normal, 120–129 with the bottom number still under 80 is called elevated, and 130/80 or higher is considered high. These ranges are general guidance, not a diagnosis — your own healthy range can depend on your age, other conditions you're managing, and what your doctor has told you specifically about your situation.

Home readings can also vary quite a bit from clinic readings, since unfamiliar settings, a rushed appointment, or even just the anxiety of being at a doctor's office can push numbers up temporarily — a pattern doctors call the "white coat effect." That's one more reason your own logged history, taken at rest in a calm, familiar setting, is often the more reliable picture of your everyday blood pressure over time, rather than any single reading.

It also helps to understand that blood pressure naturally moves throughout the day. It tends to be lower during sleep, rises somewhat in the morning, and can spike briefly with exercise, stress, caffeine, or a full bladder. A single high reading, on its own, usually isn't cause for alarm — it's the pattern over days and weeks that matters most to your doctor. This is part of why keeping a simple log, rather than fixating on one number, tends to give both you and your care team a much clearer picture.

If you're newly tracking your blood pressure, try to measure at roughly the same time each day, after sitting quietly for a few minutes, with your arm supported at heart level. Avoid measuring right after coffee, exercise, or a stressful conversation, since all of these can temporarily raise your numbers without reflecting your real baseline. Over time, this kind of consistent, calm measurement becomes one of the most useful tools you and your doctor have for understanding how your body is actually doing.

As always, this is general information to help you understand your own numbers — not a diagnosis. Talk to your doctor about what your specific target range should be.` },

    { id: 'salt-swap', title: 'Small Salt Swaps That Add Up', tag: 'Diet',
      body: `Cutting sodium doesn't have to mean bland, joyless food. Try swapping bouillon cubes and heavily salted seasoning mixes for fresh herbs, garlic, ginger, and the kind of pepper-soup spices many local dishes already rely on for flavor — a lot of the punch in familiar cooking comes from aromatics, not just salt. Rinsing canned or tinned foods like beans, sweetcorn, or fish before cooking also removes a meaningful amount of the added sodium sitting in the liquid.

Small, consistent swaps tend to stick far better than one big overnight overhaul. If you try to strip all the salt out of your diet in a single week, food can taste flat and the change rarely lasts. Instead, try adjusting one meal or one dish at a time — maybe start with breakfast, or with the stew you cook most often — and let your palate adjust gradually before tackling the next one.

Restaurant meals and packaged, processed foods are usually the biggest hidden source of sodium in most people's diets, often contributing far more than anything added at home with a shaker. Reading nutrition labels, comparing similar products side by side, and asking how a dish is prepared when eating out can matter more for your overall sodium intake than how carefully you season your own cooking. Soups, instant noodles, cured meats, and salty snacks are common culprits worth watching closely.

Your taste buds are more adaptable than most people expect. Research consistently shows that people who gradually reduce salt over a few weeks stop missing it — food that once tasted "just right" can start to taste too salty, and previously bland-seeming meals begin to taste full and satisfying. Herbs like thyme, rosemary, and curry leaf, along with citrus like lemon or lime, are especially good at making a dish feel complete without needing extra salt.

If you're managing high blood pressure, even a modest, sustained reduction in sodium can make a real difference to your numbers over time — but the goal is steady, livable change, not a strict, unsustainable overhaul. Talk to your doctor or a dietitian about what a reasonable target looks like for you.` },

    { id: 'med-adherence', title: 'Why Missing Doses Matters More Than You\u2019d Think', tag: 'Medication',
      body: `Blood pressure and diabetes medications often work by maintaining a steady level of the drug in your bloodstream over time, rather than delivering one big effect all at once. Skipping doses — even just occasionally — can cause your numbers to swing more than staying consistently on a slightly different plan would. In other words, an imperfect routine that you actually stick to is often better for your health than an ideal routine you keep missing.

If a medication schedule feels genuinely hard to keep up with — too many pills, awkward timing, side effects that make you want to skip a dose — that's worth telling your doctor directly rather than just quietly not taking it. There are often simpler dosing options available: once-daily formulations instead of multiple daily doses, combination pills that merge two medications into one, or a different drug in the same class that suits your routine better. "Try harder" is rarely the real answer; the right answer is often a plan that fits your actual life.

Linking a dose to an existing daily habit tends to work far better than relying on memory alone. Taking your morning pill right after brushing your teeth, or your evening dose while making tea, borrows the automatic nature of a habit you already have and attaches the new one to it. A pillbox organized by day, or a simple phone alarm labeled clearly, can also catch the days that would otherwise slip by completely unnoticed — especially on busy or unusual days that break your normal rhythm.

It's also worth understanding what actually happens if you do miss a dose occasionally: for most blood pressure and diabetes medications, missing one dose isn't a medical emergency, but it's not something to make a habit of either, since your levels of the drug — and the protection it offers — can dip meaningfully. If you're ever unsure whether to take a missed dose late or skip it and continue as normal, that's exactly the kind of question a pharmacist can answer quickly, without needing a full appointment.

Talk to your doctor or pharmacist about your specific medications and what missing a dose means for you.` },

    { id: 'walk-daily', title: 'A 20-Minute Walk Does More Than You\u2019d Expect', tag: 'Activity',
      body: `Regular walking — even a modest 20 minutes a day — is consistently linked to better blood pressure and blood sugar control over time. It doesn't need to be intense, and it doesn't need to happen all at once. Splitting it into two 10-minute walks works just as well if finding a single uninterrupted block of time is difficult, which makes it one of the most realistic forms of exercise to actually fit into a busy day.

The consistency matters more than the intensity. A slow, steady walk taken most days of the week tends to produce better long-term results than an occasional intense workout squeezed in when time allows. This is part of why walking is often recommended as a starting point for people who are newly managing a chronic condition, or who haven't exercised regularly in a while — it's low-impact, requires no equipment, and can be adjusted to whatever pace feels manageable that day.

Walking after meals in particular can help blunt the blood sugar rise that follows eating, since moving muscles pull glucose out of the bloodstream more efficiently while they're active. Even a short 10-to-15-minute walk after your largest meal of the day can measurably soften that post-meal spike, which is especially useful for anyone managing diabetes or prediabetes. Over time, this kind of small, repeated habit can add up to a meaningfully smoother blood sugar pattern.

Weather and heat can make daily walking harder to sustain in some climates. Choosing a route with some shade, walking earlier in the morning or later in the evening when it's cooler, and carrying water can make the habit easier to keep up rather than something you dread. If outdoor walking isn't practical some days, pacing indoors — even around a house or compound — still counts, and consistency across a week matters more than any single walk being perfect.

If you have a heart condition, joint problems, or any concern about starting a new activity, it's worth a quick check-in with your doctor before ramping up — not to discourage you, just to make sure walking is the right starting point for your specific situation.` },

    { id: 'harmattan-bp', title: 'Why Your Readings Might Shift With the Weather', tag: 'Hypertension',
      body: `Cold weather and dry, dusty conditions like harmattan can cause blood vessels to narrow slightly as the body works to conserve heat, which can nudge blood pressure readings upward for some people. This is a real, physiological response, not a measurement error — but it's also usually temporary and seasonal rather than a sign that your underlying condition has suddenly worsened. If you notice a seasonal pattern in your own readings, it's worth mentioning to your doctor specifically, since it can help them tell the difference between a genuine trend and normal weather-driven variation.

Dust in the air during harmattan can also irritate the airways, trigger mild breathing discomfort, and disrupt sleep quality for some people — and poor sleep is itself linked to higher blood pressure, creating a kind of compounding effect during dusty seasons. Keeping windows and doors closed during the peak dust hours of early morning and evening, using a damp cloth to wipe down surfaces, and staying well hydrated can all help reduce the indirect impact of harmattan on your numbers.

Dressing warmly during cooler mornings and evenings is a simple, often-overlooked step. Sudden cold exposure — stepping outside without a light jacket, or a cold indoor draft at night — can cause a brief spike in blood pressure as blood vessels constrict in response to the temperature change. This effect tends to be short-lived, but for people already managing hypertension, minimizing unnecessary cold exposure is a reasonable, low-effort precaution.

It's also worth remembering that harmattan dust can worsen underlying respiratory conditions like asthma or bronchitis, and the resulting breathing difficulty can itself raise blood pressure temporarily through stress and reduced oxygen efficiency. If you notice unusual shortness of breath alongside elevated readings during this season, that combination is worth flagging to your doctor rather than assuming it's simply "the weather."

None of this means your readings during harmattan are automatically wrong — it simply means seasonal context matters. Keeping a note of the season alongside your logged readings can help your doctor interpret your numbers more accurately over the year.` },

    { id: 'sleep-bp-link', title: 'The Sleep and Blood Pressure Connection', tag: 'Sleep',
      body: `Poor or short sleep is linked with higher blood pressure over time, and the relationship runs in both directions — high blood pressure can also disrupt sleep, creating a cycle that can be hard to break without addressing both sides. Normally, blood pressure dips somewhat during deep sleep, giving the cardiovascular system a nightly rest; when sleep is consistently short, fragmented, or poor quality, that natural dip can be blunted, and average blood pressure over time tends to run higher as a result.

Simple habits like a consistent bedtime and wake time — even on weekends — tend to help more than they get credit for, because they support your body's natural internal clock. Cutting caffeine after early afternoon is another straightforward change, since caffeine's effects can linger in the body for six hours or more, quietly interfering with sleep onset even if you don't feel "wired" by bedtime.

If snoring, gasping, or pauses in breathing during sleep are a regular pattern — either that you've noticed yourself or that a partner has mentioned — that's worth raising with a doctor specifically, since it can be a sign of sleep apnea. Sleep apnea is closely tied to blood pressure, and treating it can sometimes lead to a noticeable improvement in daytime readings, which is part of why doctors take snoring reports seriously rather than dismissing them as a minor nuisance.

Screen light late at night can also delay your body's natural wind-down process. The blue light from phones and televisions can suppress melatonin, the hormone that signals it's time to sleep, which can push your natural bedtime later than intended even when you feel tired. Dimming lights and stepping away from bright screens for an hour before bed is a small, practical change that many people find surprisingly effective once they try it consistently.

A comfortable, cool, and dark sleeping environment also supports better rest — something as simple as blackout curtains or a fan can make a real difference. If sleep problems persist despite these changes, or if you suspect sleep apnea, talk to your doctor about further evaluation.` },

    { id: 'stress-numbers', title: 'How Stress Shows Up in Your Numbers', tag: 'Wellness',
      body: `Stress causes a real, temporary rise in blood pressure — that's a normal, healthy short-term response, part of the body's built-in "fight or flight" system preparing you to react quickly to a challenge. The concern isn't the occasional stress spike itself; it's when stress becomes constant or chronic, since the body doesn't get a real chance to return to its calmer baseline between episodes, and that sustained elevation is what's linked to longer-term health effects.

Simple, low-cost tools genuinely help many people, even though they're a complement to treatment rather than a replacement for it. A few minutes of slow, deliberate breathing — inhaling for a count of four, holding briefly, and exhaling for a count of six — activates the body's calming nervous system response fairly quickly. A short prayer, a quiet moment alone, or simply stepping outside for fresh air can offer a similar reset, even during a demanding day.

Noticing your own early stress signals gives you a chance to pause before tension builds up over the course of a day rather than only reacting once you're already overwhelmed. A tight jaw, shallow or held breath, restlessness, or a knot in the stomach are common physical cues that stress is building. Learning to recognize your own personal pattern — everyone's is a little different — makes it much easier to catch stress early and respond to it deliberately.

Even a two-minute break can measurably lower that in-the-moment spike. Stepping away from a stressful task, splashing cool water on your face, or simply closing your eyes and focusing on your breath for two minutes are all small enough to fit into almost any day, yet they genuinely register physiologically, not just psychologically.

Longer-term, activities like regular exercise, spending time with supportive people, and getting enough sleep all build a kind of resilience that makes day-to-day stress easier to absorb without it accumulating. If stress feels constant, overwhelming, or is affecting your sleep or daily functioning over weeks rather than days, that's worth discussing with your doctor alongside your physical health, since the two are closely connected.` },

    { id: 'diabetes-basics', title: 'Blood Sugar 101: What the Numbers Mean', tag: 'Diabetes',
      body: `A fasting blood sugar under 100 mg/dL is generally considered normal, 100–125 mg/dL falls in the prediabetes range, and 126 mg/dL or higher on more than one test suggests diabetes. After eating, blood sugar naturally rises for a while as your body processes the meal — that's expected and not alarming on its own; it's the fasting numbers and the overall pattern over time that your doctor typically focuses on most.

Your doctor's specific targets for you may differ from these general population ranges, especially if you're managing multiple conditions, are pregnant, or have had diabetes for a long time with related complications. General reference ranges are a useful starting point for understanding your results, but they aren't a substitute for the personalized targets your own doctor sets based on your full health picture.

The A1C test, which reflects your average blood sugar over roughly the past three months, gives a fuller picture than any single reading and is often used alongside day-to-day glucose checks. Because it averages out the natural ups and downs of daily life, A1C is particularly useful for seeing the bigger trend — whether your overall management is improving, holding steady, or needs adjustment — rather than reacting to any one unusual day.

Keeping a simple log of your numbers around meals — before eating and roughly two hours after — can help you and your doctor spot patterns faster than memory alone ever could. You might notice, for example, that a particular meal or time of day consistently produces higher readings, which is exactly the kind of pattern that's useful to bring to an appointment rather than trying to describe from memory weeks later.

It's also worth knowing that blood sugar can be affected by far more than food alone — stress, illness, poor sleep, and even the time of day can all shift your numbers meaningfully. If your readings seem unusually high or low without an obvious cause, or if you're experiencing symptoms like excessive thirst, fatigue, or blurred vision, that's worth discussing with your doctor promptly rather than waiting for your next scheduled visit.` },

    { id: 'foot-checks', title: 'Why Foot Checks Matter More Than People Realize', tag: 'Diabetes',
      body: `Diabetes can gradually reduce feeling in the feet over time, a condition called peripheral neuropathy, meaning small cuts, blisters, or areas of pressure can go completely unnoticed and quietly worsen before they're discovered. A quick daily glance — checking between the toes, the soles, and the heels for any cut, redness, swelling, or unusual warmth — catches problems early, when they're easiest to treat and far less likely to lead to serious complications.

Well-fitting shoes matter more than people often expect. Shoes that are too tight can create pressure points that go unfelt due to reduced sensation, while shoes that are too loose can cause friction and blistering from repeated rubbing. Avoiding walking barefoot, even indoors, helps prevent small injuries from things like stray objects on the floor that would otherwise be felt and avoided immediately by someone without reduced sensation.

Washing feet daily and thoroughly drying them afterward — especially between the toes, where moisture tends to linger — reduces the risk of fungal infections, which are both more common and slower to heal in people managing diabetes. A light, unscented moisturizer on the soles and tops of the feet (but not between the toes, where extra moisture can encourage fungal growth) can help prevent the kind of dry, cracked skin that becomes an entry point for infection.

Trimming toenails straight across, rather than rounding the corners, helps prevent ingrown toenails, which can become a serious entry point for infection if left untreated. If reaching your feet comfortably is difficult, or if you notice any changes in the shape, color, or nails of your feet, a podiatrist or your regular doctor can help with routine care rather than leaving it entirely to guesswork.

If a cut, blister, or area of redness isn't noticeably improving within a couple of days, or if you notice any drainage, increasing redness, or warmth around it, it's worth having it looked at by a healthcare provider rather than waiting to see if it resolves on its own. Early attention to foot issues is one of the most effective ways to avoid more serious complications down the line.` },

    { id: 'hydration', title: 'Hydration\u2019s Quiet Role in Chronic Condition Management', tag: 'Diet',
      body: `Staying well-hydrated supports healthy kidney function, which matters more for people managing blood pressure or diabetes, since both conditions put extra long-term load on the kidneys' filtering systems. The kidneys rely on adequate fluid to flush waste products effectively; when the body is consistently under-hydrated, that filtering process becomes less efficient, which can compound over years for anyone already managing a chronic condition that affects the kidneys indirectly.

A simple, sustainable habit is keeping a bottle of water nearby and sipping through the day rather than trying to drink a large amount all at once, which can feel uncomfortable and is often abandoned after a few days. Spreading intake evenly across waking hours tends to be both more comfortable and more effective than attempting to "catch up" with a big glass of water in the evening.

If you're on medication that affects fluid balance — some blood pressure medications, particularly diuretics, work partly by adjusting how much fluid your body retains — it's worth asking your doctor specifically what a good daily fluid intake looks like for you. General hydration advice doesn't always apply cleanly to someone on these medications, and getting personalized guidance avoids both the risks of drinking too little and, in some specific cases, too much.

Pale yellow urine is generally a reasonable, simple sign of adequate hydration for most people, while consistently dark yellow or amber urine can be a useful early cue to drink more — especially during hot weather, after exercise, or during an illness involving fever. This isn't a precise medical test, but it's a practical everyday indicator that doesn't require any special equipment.

Certain drinks work against hydration rather than supporting it — alcohol and, to a lesser extent, caffeinated drinks have a mild diuretic effect, meaning they can increase fluid loss even as you're drinking them. This doesn't mean avoiding them entirely, but it's worth balancing them with extra plain water, particularly in hot climates or during physically demanding days. If you have any kidney or heart condition affecting fluid balance, always follow your doctor's specific guidance over general advice.` },

    { id: 'caregiver-burnout', title: 'Caregiving Is Real Work \u2014 Watch Your Own Signs Too', tag: 'Caregiving',
      body: `It's common for caregivers to focus entirely on the person they're supporting and quietly run themselves down in the process, sometimes without even noticing it's happening until exhaustion has built up significantly. Persistent tiredness that doesn't improve with a normal night's sleep, increased irritability over small things, or a constant feeling of being "on call" even during quiet moments are all worth noticing in yourself, not just in the person you're caring for.

Caregiving often comes with a particular kind of invisible labor — the mental load of tracking medication schedules, appointments, symptoms, and daily needs, on top of whatever else is already happening in your own life and work. This mental load is real work, even when it doesn't look like physical effort from the outside, and underestimating it is one of the most common ways caregivers end up burning out without realizing the toll was building.

Sharing responsibilities with other family members, even in small, imperfect rotations, tends to help more than people expect before they actually try it. It doesn't need to be an equal split to be meaningful — even having someone else handle one appointment a month, or sit with your loved one for an afternoon, gives you a genuine break rather than a theoretical one. Asking for this kind of help isn't a failure to cope; it's a normal and often necessary part of sustainable caregiving.

Setting aside even brief, protected time for yourself each week isn't indulgent — a walk, a phone call with a friend, a quiet cup of tea, or twenty minutes with a book are all part of what keeps you able to keep showing up well for someone else over the long run. Caregiver burnout doesn't just affect you; it can also reduce the quality of care you're able to give, which is part of why looking after yourself is genuinely part of looking after them too.

If you notice persistent low mood, resentment, or exhaustion that isn't easing with rest and support, that's worth mentioning to your own doctor — caregivers have health needs too, and support groups specifically for caregivers can also be a valuable source of both practical tips and emotional understanding from people in a similar position.` },

    { id: 'reading-labels', title: 'Reading a Medicine Label Properly', tag: 'Medication',
      body: `Beyond the dose itself, check the timing instructions on your medication label carefully. Phrases like "before meals," "with food," or "at bedtime" are there for a specific reason — they often affect how well the medication is absorbed into your bloodstream, or how it interacts with your body's natural daily rhythms, and taking a medication at the wrong time relative to food can sometimes reduce how effective it is, even at the correct dose.

If a label's instructions are unclear, or a pharmacy's handwritten note is hard to read, it's always fine to ask the pharmacist to clarify before you leave the counter. This is a completely normal, expected question — pharmacists field it constantly, and getting clarity in the moment is far better than guessing or, worse, not taking the medication at all out of uncertainty.

It's worth checking expiry dates whenever you pick up a refill, particularly for medications you don't use every day, like an emergency inhaler or as-needed pain relief. Expired medication can gradually lose potency, meaning it may not work as reliably as intended even if it still looks and smells normal, and in rare cases some medications can degrade into different, less desirable compounds past their expiry date.

Storage matters more than most people realize. Storing medication away from heat and direct sunlight — not on a windowsill, and not in a car that heats up during the day — helps preserve its effectiveness, since heat can quietly break down the active ingredients in many common medications faster than the printed expiry date accounts for. Bathroom cabinets, despite being a common storage spot, are actually often too humid for some medications; a cool, dry drawer is usually a better choice.

Understanding what a label means also includes knowing what to do if you notice something unusual — a change in the pill's color or shape from a previous refill of the "same" medication, for instance, is worth asking about, since it could indicate a switch to a different generic manufacturer (usually harmless) or, rarely, a dispensing error worth catching early. If anything about your label or medication looks or feels different than expected, don't hesitate to ask your pharmacist.` },

    { id: 'exercise-caution', title: 'Starting to Exercise With a Chronic Condition', tag: 'Activity',
      body: `If you're newly diagnosed or haven't exercised in a while, starting gradually matters far more than starting hard. A short walk, some light stretching, or a few minutes of stair climbing is a completely reasonable place to begin — the goal in the first few weeks is building a consistent habit, not achieving a particular fitness level, and most of the health benefits of exercise come from consistency over time rather than intensity in any single session.

Very high blood pressure or certain heart conditions can mean specific activities should wait until your doctor gives the go-ahead. This isn't meant to discourage you from being active — it's simply about making sure the type and intensity of exercise you choose is the right starting point for your specific situation. A quick check-in before starting anything new, especially anything more vigorous than walking, is a sensible and normal step, not an overreaction.

Warming up for a few minutes before any activity — even a brisk walk — helps prepare your heart and muscles gradually rather than asking your body to jump straight into exertion. A slow, easy pace for the first five minutes, gradually building up, tends to feel more comfortable and sustainable than starting at full effort immediately.

Paying attention to how you feel during activity is one of the most important safety habits you can build. Stopping for dizziness, chest discomfort, unusual shortness of breath, or a racing heartbeat that doesn't settle after resting are all signals worth taking seriously rather than pushing through. Most sessions won't involve any of these, but knowing to stop and rest — or seek medical attention if symptoms are severe or don't resolve — is an important part of exercising safely with a chronic condition.

As your fitness improves, you can gradually increase either the duration or the intensity of your activity, but not usually both at once — a common, sustainable approach is adding a few extra minutes each week before considering a faster pace. Celebrate small, steady progress rather than comparing your pace to what you could do before diagnosis, or to anyone else's routine; your own consistent improvement is what matters most here.` },

    { id: 'sugar-hidden', title: 'Where Sugar Hides in "Healthy" Foods', tag: 'Diet',
      body: `Sauces, flavored yogurts, and even some breads carry more added sugar than people expect — often more than an actual dessert serving, despite being marketed or perceived as everyday, wholesome staples. A single serving of flavored yogurt, for example, can sometimes contain nearly as much sugar as a small chocolate bar, simply because sweetness is added to compensate for the natural tartness of plain yogurt.

Checking the ingredients list for sugar under its many different names gives a far truer picture than the front-of-pack marketing alone. Sugar can appear as glucose syrup, honey, molasses, fruit concentrate, dextrose, maltose, or a dozen other terms, and manufacturers sometimes use several of these together in smaller amounts so that no single one appears too high on the ingredients list, even though the combined total sugar content is significant.

Whole fruit tells a genuinely different story from fruit juice, even though both come from the same source. The fiber naturally present in whole fruit slows down how quickly sugar is absorbed into the bloodstream, which is part of why eating an orange affects blood sugar quite differently than drinking the equivalent amount of orange juice — the juice delivers a much faster, more concentrated sugar hit without the fiber to buffer it.

A genuinely useful habit is comparing two similar products side by side before buying, since sugar content between near-identical items — two brands of the same cereal, or two flavors of the same yogurt — can vary more than most people assume. Reading past the front label, which often highlights things like "natural" or "no artificial flavors" that say nothing about sugar content, and going straight to the nutrition panel is the most reliable way to make an informed comparison.

Bread, particularly sweetened or flavored varieties, and many breakfast cereals marketed toward children or as "heart healthy," are other common places sugar hides in plain sight. None of this means these foods need to be eliminated entirely — it's more about knowing what you're actually eating so you can make informed choices, particularly if you're managing diabetes or watching your weight as part of managing your blood pressure.` },

    { id: 'alcohol-bp', title: 'How Alcohol Interacts With Blood Pressure Medication', tag: 'Medication',
      body: `Alcohol can amplify the effects of many blood pressure medications, sometimes causing readings to drop suddenly or bringing on dizziness and lightheadedness, particularly when standing up quickly. This happens because alcohol itself has a mild blood-pressure-lowering effect, and combined with medication that's already working to lower your blood pressure, the combined effect can be stronger and less predictable than either alone.

It can also interact with diabetes medication by affecting blood sugar in ways that are harder to predict than food alone. Alcohol can initially raise blood sugar, particularly sweetened drinks, but can later cause blood sugar to drop, sometimes hours after drinking has stopped — which is part of why the timing and pattern of any effects can catch people off guard if they're not expecting it.

This doesn't necessarily mean alcohol is off-limits entirely for everyone managing these conditions, but it does mean it's worth asking your doctor or pharmacist specifically about your own medications rather than assuming a "normal" amount is automatically safe for everyone. Some medications interact with alcohol far more significantly than others, and your doctor can give you guidance specific to what you're actually taking.

Drinking on an empty stomach tends to make these effects stronger and less predictable, since food slows the absorption of alcohol into the bloodstream. If you do choose to drink, having food alongside it, drinking water in between, and being mindful of the total amount can all help reduce the unpredictability of how it interacts with your medication.

It's also worth knowing the warning signs to watch for after drinking while on these medications: unusual dizziness, confusion, a racing or irregular heartbeat, or symptoms of low blood sugar like shakiness, sweating, or sudden intense hunger. If you experience any of these, it's worth mentioning to your doctor, even if the episode passed on its own — this kind of pattern is useful information for them to have when reviewing your treatment plan.` },

    { id: 'travel-meds', title: 'Traveling Without Missing a Dose', tag: 'Medication',
      body: `Time zone changes are one of the most common reasons people accidentally skip or double up on medication while traveling, simply because the usual daily anchor points — waking up, meals, bedtime — shift and become disorienting for a few days. A simple approach for shorter trips: keep taking your doses according to your home time zone's schedule rather than trying to instantly adjust to local time, which avoids the confusion of recalculating your routine mid-trip.

For longer trips, or when crossing many time zones, it's worth asking your doctor ahead of time how to adjust your medication schedule gradually rather than switching abruptly. Some doctors recommend shifting dose times by an hour or two each day until you're aligned with the new time zone; others may suggest a different approach depending on your specific medication. Getting this guidance before you travel, rather than figuring it out mid-trip, makes the transition much smoother.

Packing medication in carry-on luggage rather than checked baggage protects against delays, lost bags, or temperature extremes in a cargo hold disrupting your entire schedule. Checked luggage can be delayed for days, and some medications are sensitive to the temperature swings that can occur in an aircraft hold — keeping your medication with you removes both risks entirely.

It also helps to carry a little more medication than you think you'll need, along with a written note or printed list of your prescriptions, including generic names, in case a trip runs longer than planned or you need to replace lost medication while away from home. This is particularly useful if you're traveling internationally, since brand names for the same medication can vary significantly between countries, and a pharmacist abroad will find a generic name far more useful than a local brand name.

If you're traveling somewhere with a significant climate difference — much hotter or more humid than home — ask your pharmacist whether your specific medications need any special storage precautions during the trip, since some are more heat-sensitive than others.` },

    { id: 'family-history', title: 'What Family History Actually Tells You', tag: 'Wellness',
      body: `Having a parent or sibling with high blood pressure or diabetes raises your own risk of developing the same condition, but it isn't a guarantee — genetics load the dice, so to speak, but daily habits still matter enormously in how things actually play out over a lifetime. Two siblings with the same family history can end up with very different outcomes depending on diet, activity levels, weight, stress management, and how early any changes are caught and addressed.

Knowing your family history is most useful as a reason to start monitoring earlier and more consistently, not as something to feel resigned to or fatalistic about. If you know these conditions run in your family, that knowledge is genuinely valuable information — it means you and your doctor can watch for early warning signs proactively, rather than waiting for symptoms to appear before starting to pay attention.

Sharing your family history clearly with your doctor helps them decide how often to check your numbers and which screenings make sense at your age, even before any symptoms appear. Some screening guidelines shift earlier specifically for people with a strong family history, since catching elevated blood pressure or blood sugar early — sometimes years before it would otherwise be noticed — gives far more room to make manageable lifestyle adjustments before things progress.

It's worth asking older relatives about their own diagnoses and roughly what age they were when symptoms or diagnosis first appeared, if you don't already know this. This kind of detail — not just "high blood pressure runs in the family" but "my mother was diagnosed in her forties" — gives your doctor a much more useful picture than a vague family history alone, and can genuinely influence how they approach your own care and screening schedule.

Family history isn't only about the conditions themselves — it can also include useful context like how relatives responded to certain treatments, or family patterns around related conditions like kidney disease or heart problems. Sharing as much detail as you reasonably can with your doctor turns a vague sense of "it runs in my family" into genuinely actionable information for your own care.` },

    { id: 'blood-sugar-swings', title: 'Why Blood Sugar Can Swing After Big Meals', tag: 'Diabetes',
      body: `Large meals, especially ones heavy in refined carbohydrates like white rice, white bread, or sugary drinks, can cause a sharper blood sugar rise than the same total calories spread across several smaller meals throughout the day. Refined carbohydrates are broken down and absorbed quickly, delivering a fast surge of glucose into the bloodstream, whereas the same calories from a more balanced meal tend to be absorbed more gradually.

Eating vegetables or protein before the carbohydrate-heavy part of a meal can noticeably blunt that spike. This simple reordering — starting with a salad or some protein before moving to the rice or bread — slows down how quickly the carbohydrates that follow are absorbed, which can meaningfully soften the resulting blood sugar rise without requiring you to change what you're eating, only the order.

A short walk within about 30 minutes of eating helps too, since moving muscles pull glucose out of the bloodstream more efficiently while they're active, effectively giving your body an extra pathway to manage the incoming sugar from a meal beyond insulin alone. Even a gentle 10-to-15-minute walk after a large meal can make a measurable difference to how high your blood sugar rises afterward.

Portion size matters as much as food choice for many people. A large plate of even relatively healthy food can still produce a significant blood sugar rise simply due to the total carbohydrate load involved. Using a smaller plate, being mindful of portions particularly for rice, bread, and other starches, and filling a good portion of the plate with vegetables are all practical ways to manage the total carbohydrate load of a meal without feeling deprived.

None of this means cutting out favorite meals entirely — it's more about pacing and pairing them thoughtfully so the rise and fall of your blood sugar feels gentler rather than sharp. Eating at consistent times each day, rather than skipping meals and then eating a very large one later, also helps prevent the kind of extreme swings that come from an empty stomach meeting a large plate of food all at once.` },

    { id: 'monitor-technique', title: 'Getting an Accurate Reading at Home', tag: 'Hypertension',
      body: `A surprising number of "high" home blood pressure readings are actually technique issues rather than real spikes in your underlying blood pressure. Sitting with your back supported, your feet flat on the floor rather than crossed, and your arm resting at heart level on a table or armrest all make a measurable difference to the accuracy of your reading — an unsupported arm, for instance, can add several points to your systolic number simply from the muscular effort of holding it up.

Talking, a full bladder, or having just had caffeine or a cigarette can all temporarily raise a reading, sometimes significantly. Talking during measurement is a particularly common and underappreciated cause of inflated readings, since even casual conversation raises blood pressure slightly — it's worth staying quiet for the full duration of the measurement, including a few minutes beforehand while the cuff settles into place.

Waiting a few minutes after sitting down before measuring — rather than checking your blood pressure the moment you sit, especially after walking or climbing stairs — gives your body a chance to settle to its resting state first. Taking two readings about a minute apart and using the average, or noting both, gives a more reliable picture than relying on a single, possibly rushed, measurement.

Keeping the cuff on the same arm and measuring at a similar time of day makes your own trend line easier to trust and interpret over time. Blood pressure naturally varies somewhat between your left and right arm for many people, so switching arms between readings can introduce confusing variation that has nothing to do with your actual health status changing.

Cuff size matters more than people often realize — a cuff that's too small for your arm can produce falsely high readings, while one that's too large can sometimes produce falsely low ones. If you're unsure whether your home cuff is the right size, or if your readings seem inconsistent with what you feel or with clinic measurements, it's worth bringing your home monitor to a doctor's appointment so they can check its accuracy against a clinical reading directly.` },

    { id: 'kidney-basics', title: 'Why Blood Pressure and Kidneys Are Closely Linked', tag: 'Hypertension',
      body: `The kidneys and blood pressure affect each other in both directions, creating a relationship that runs both ways rather than a simple one-way cause and effect. High blood pressure can gradually damage the kidneys' delicate filtering structures over years, reducing their ability to clean waste from the blood effectively; struggling kidneys can, in turn, push blood pressure higher still, since the kidneys play a direct role in regulating blood pressure through fluid balance and hormone signals.

This two-way relationship is part of why doctors often check kidney function alongside blood pressure for anyone managing hypertension long-term, even when there are no obvious symptoms of kidney trouble. A simple blood test measuring creatinine, and sometimes a urine test checking for protein, can catch early kidney changes well before someone would notice any physical symptoms — which is exactly why these checks matter even when you're feeling fine.

Swelling in the ankles or unusually foamy urine can sometimes be early signs worth mentioning at a checkup, though it's worth being clear that many kidney changes cause no obvious symptoms early on at all. This absence of noticeable symptoms in the early stages is exactly why routine monitoring matters more than waiting to feel something — by the time symptoms do appear, kidney function may already have declined significantly.

Managing blood pressure well is one of the most effective things you can do to protect your kidneys over the long term, and certain blood pressure medications are specifically chosen by doctors, in part, because they offer extra protective benefits for kidney function beyond just lowering blood pressure numbers. This is one reason it's worth taking your prescribed medication consistently even if you feel completely fine — the protective benefit is happening quietly in the background.

Diabetes adds an additional layer of risk to kidney health, since high blood sugar over time can also damage the same filtering structures independently of blood pressure. If you're managing both hypertension and diabetes, kidney monitoring becomes even more important, and it's worth asking your doctor how often you should be screened given your specific combination of conditions.` },

    { id: 'medication-refill', title: 'Building a Refill Routine That Actually Sticks', tag: 'Medication',
      body: `Running out of medication unexpectedly is one of the most common, and most avoidable, reasons people end up with gaps in their treatment. It rarely happens because someone decides to stop taking their medication — far more often, it happens quietly, when a busy week slips by and the last few pills are used up before anyone thought to reorder, leaving a gap that can last days before it's noticed and resolved.

Picking a fixed day each month — like the first Saturday, or whichever date lines up naturally with when you usually get paid or do a bigger errand run — turns refilling into a routine rather than something to remember under pressure at the last minute. Attaching the refill check to an existing routine, the same way habits work best generally, makes it far more likely to actually happen consistently month after month.

Some pharmacies offer refill reminders by text message or a phone app, which is worth asking about if your schedule tends to be unpredictable or if you simply forget dates easily. These automated reminders can catch you even during unusually busy stretches when a manual, memory-based system might fail, and setting one up is typically a one-time conversation with your pharmacy rather than an ongoing effort on your part.

Keeping a small backup supply for unexpected delays, where affordable and practical, adds a buffer without needing to actively think about it day to day. This isn't about stockpiling excessively — even a few days' extra supply can be the difference between a minor inconvenience and an actual gap in treatment if a pharmacy is temporarily out of stock, a trip runs longer than planned, or life simply gets in the way of a scheduled refill.

If cost is a barrier to keeping a buffer supply or refilling on time, that's worth discussing openly with your doctor or pharmacist — there may be assistance programs, generic alternatives, or longer prescription intervals available that can ease the financial pressure without compromising your treatment.` },

    { id: 'kids-caregiving', title: 'Talking to Children About a Parent\u2019s Condition', tag: 'Caregiving',
      body: `Children often sense when something is wrong even without being told directly — a shift in a parent's energy, more frequent doctor visits, or overheard adult conversations all register with children more than adults sometimes realize. Vague reassurance, meant to protect them, can sometimes worry them more than a simple, honest, age-appropriate explanation would, since children's imaginations can fill in gaps with something far scarier than reality.

Naming the condition plainly tends to reduce anxiety more than avoiding the topic entirely. Something like "Mummy has high blood pressure, and this medicine and these check-ups help keep her healthy" gives a child a concrete, manageable picture of what's happening, rather than leaving them to piece together fragments of overheard conversation into their own, often more frightening, version of events.

Letting children ask questions — even ones that repeat over days or weeks — gives them a genuine sense of control over something that otherwise feels uncertain and outside their influence. It's completely normal for a child to ask the same question multiple times as they process new information; answering patiently each time, rather than treating repeated questions as a nuisance, helps them feel secure enough to keep communicating openly about their worries.

It also helps to reassure children clearly that the condition is being actively managed and that it isn't their responsibility to fix or worry about. Children, especially younger ones, can sometimes internalize a sense of responsibility for a parent's health in ways that aren't obvious unless directly addressed — explicitly telling them "this is the doctor's and my job to manage, not yours" can relieve a burden they may not have voiced.

Age matters for how much detail to share — a very young child may only need the simple reassurance described above, while an older child or teenager may want and benefit from more detail, including what symptoms to watch for or what to do in an emergency if they're ever alone with the affected parent. Tailoring the conversation to what a child can actually process, and revisiting it as they grow older, tends to work better than a single one-time conversation.` },

    { id: 'exercise-diabetes-timing', title: 'When to Exercise if You Take Diabetes Medication', tag: 'Activity',
      body: `Some diabetes medications, particularly insulin and certain oral drugs like sulfonylureas, can increase the risk of blood sugar dropping too low — a condition called hypoglycemia — during or after exercise. This happens because exercise itself lowers blood sugar by helping muscles take up glucose more efficiently, and when that effect stacks on top of medication that's already working to lower blood sugar, the combined effect can sometimes push levels lower than intended.

Checking your blood sugar before a workout is a simple, valuable safety habit, particularly if you're on a medication with this risk or if you're trying a new type or intensity of exercise for the first time. If your reading is on the lower side before you even start, having a small snack beforehand can help prevent a drop during activity, rather than starting already close to the edge.

Carrying a fast-acting sugar source, like glucose tablets or a small juice box, is worth building into your routine as a matter of habit, similar to always carrying your phone. If you do start to feel shaky, sweaty, unusually tired, or lightheaded during exercise, having a quick source of sugar on hand means you can address it immediately rather than needing to find something nearby, potentially while already feeling unwell.

Exercising around the same time each day also makes it considerably easier to notice your own patterns and adjust your medication timing or snack habits if needed, since your body's response to a consistent routine becomes more predictable over time than if your exercise timing varies constantly. This predictability is genuinely useful information to share with your doctor, since it can help fine-tune your overall treatment plan.

If you regularly feel shaky, sweaty, or unusually tired during or after activity, it's worth reviewing your medication timing and exercise routine with your doctor rather than simply pushing through it each time or reducing your activity out of caution. There's often a workable adjustment — whether to timing, dose, or a pre-exercise snack — that lets you stay active safely without repeated low blood sugar episodes.` },

    { id: 'salt-eating-out', title: 'Managing Sodium When Eating Out', tag: 'Diet',
      body: `Restaurant and street food is often significantly higher in sodium than equivalent home cooking, partly because salt is a cheap, reliable way to make food taste consistently good at scale, and partly because busy kitchens often rely on pre-made, salt-heavy bases like stock, bouillon, and sauces to save preparation time during service.

Asking for sauces and seasoning on the side, or requesting "less salt" when ordering, genuinely works more often than people expect, especially at smaller, less rigid kitchens where dishes are made closer to order rather than pre-prepared in bulk. It doesn't always work at every establishment, particularly larger chains with standardized recipes, but it's a simple request that costs nothing to try and frequently makes a real difference.

Soups, stews, and anything built on a bouillon-based broth tend to run particularly high in sodium, sometimes containing most or all of a reasonable daily sodium target in a single bowl. This doesn't mean avoiding these dishes entirely, but it's worth being aware that a bowl of soup as a starter, followed by a main course, can add up to considerably more sodium than either dish would suggest on its own.

Balancing a heavier, saltier meal out with lighter, home-cooked meals for the rest of the day is a practical, sustainable way to manage overall sodium intake without giving up eating out altogether — which for many people, particularly with a busy schedule or as part of social life, isn't a realistic thing to eliminate entirely. Thinking in terms of your whole day or week, rather than judging each individual meal in isolation, tends to be both more accurate and less stressful.

Fried and heavily processed items on a menu — think processed meats, packaged snacks served as sides, or pre-made sauces — are usually the highest-sodium options available, often more so than the main protein or vegetables themselves. When possible, choosing grilled or freshly prepared options over fried or heavily sauced ones is a reasonable rule of thumb for keeping sodium more in check while still enjoying eating out.` },

    { id: 'mental-health-chronic', title: 'The Emotional Weight of a Chronic Diagnosis', tag: 'Wellness',
      body: `It's common to feel a mix of frustration, denial, sadness, or low mood after being diagnosed with a chronic condition, even one that's very manageable with treatment. A diagnosis can feel like an unwelcome shift in identity — suddenly being someone who takes daily medication, attends regular checkups, or has to think carefully about food and activity in a way that wasn't necessary before — and adjusting to that shift takes real emotional processing, not just practical adaptation.

These feelings are a normal response to an unexpected life change, not a sign of weakness or of handling things badly. There's sometimes an unspoken expectation that a manageable diagnosis shouldn't come with much emotional weight, but the reality is that even conditions with excellent treatment options can bring up real grief, anxiety, or frustration, and giving yourself permission to feel that, rather than dismissing it, tends to support better long-term adjustment.

Talking to others managing the same condition — whether through a structured support group, an online community, or simply a friend or family member going through something similar — often helps more than people expect going in. There's a particular kind of understanding that comes from someone who's navigated the same daily realities: the same medication routines, the same dietary adjustments, the same doctor's appointments, that can be hard to find even from the most supportive friend without the condition themselves.

Practical coping strategies matter alongside emotional ones. Breaking the adjustment into smaller, manageable pieces — learning to manage medication first, then gradually working on diet, then activity — rather than trying to overhaul everything at once, tends to feel less overwhelming and more sustainable. Small, consistent progress, celebrated along the way, builds confidence that compounds over time.

If low mood persists for weeks rather than easing, or starts noticeably affecting your sleep, appetite, relationships, or ability to manage daily responsibilities, it's worth raising with a doctor alongside your physical care rather than assuming it will simply pass on its own. Mental health and physical health are closely connected, particularly with chronic conditions, and addressing both together tends to lead to better outcomes than treating either in isolation.` }
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

  function dateSeed(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return y * 10000 + m * 100 + dd;
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

  // Assign each article its own photo, round-robin within its tag, so
  // articles sharing a tag alternate between that tag's available
  // photos instead of all showing the identical image.
  const ARTICLE_PHOTO = {};
  (function assignPhotos() {
    const counters = {};
    ARTICLES.forEach(function (a) {
      const pool = TAG_PHOTOS[a.tag];
      if (!pool || !pool.length) return;
      const n = counters[a.tag] || 0;
      ARTICLE_PHOTO[a.id] = pool[n % pool.length];
      counters[a.tag] = n + 1;
    });
  })();

  function renderArticles() {
    const root = document.getElementById('articles-root');
    if (!root) return;
    const order = todaysOrder();

    let html = '<div id="live-news-section"><p style="font-size:12px;color:#64748b;text-align:center;">Loading latest health news…</p></div><div style="height:14px;"></div>' +
      '<div id="med-library-section"></div><div style="height:14px;"></div>' +
      '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">📚 Guides</h3><p>Vetted, plain-language reads on managing your condition</p></div>';
    order.forEach(function (a, i) {
      const altClass = i % 2 === 1 ? ' art-card-alt' : '';
      html += '<div class="art-card' + altClass + '" onclick="SentraXArticles.open(\'' + a.id + '\')">' +
        coverHtml(a.tag, ARTICLE_PHOTO[a.id], null, i) +
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
    loadMedLibrary();
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
    const photo = ARTICLE_PHOTO[article.id];
    const hasPhoto = !!photo;
    const emoji = TAG_EMOJI[article.tag] || '📰';
    overlay.innerHTML =
      '<button class="art-reader-back" onclick="SentraXArticles.close()">←</button>' +
      coverHtml(article.tag, photo, 'height:180px;', 0).replace('art-cover', 'art-cover art-reader-cover') +
      '<div class="art-reader-body">' +
      (hasPhoto ? '' : '<div style="font-size:44px;margin-bottom:4px;">' + emoji + '</div>') +
      '<h2>' + article.title + '</h2>' +
      '<p>' + article.body.replace(/\n\n/g, '</p><p>') + '</p>' +
      '<div class="art-reader-footnote">General health information, not medical advice. Talk to your doctor or pharmacist about anything specific to you.</div>' +
      '</div>';
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
        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">📡 Latest Health News</h3><p>Straight from the CDC newsroom — new every visit</p></div>';
        items.forEach(function (item, i) {
          const id = 'live-' + i;
          liveNewsById[id] = item;
          const snippet = snippetFrom(item);
          const altClass = i % 2 === 1 ? ' art-card-alt' : '';
          const fallbackCover = '<div class="art-cover" data-tag="Wellness" style="width:64px;height:64px;flex-shrink:0;font-size:22px;">📡</div>';
          const thumb = item.thumbnail
            ? '<img src="' + item.thumbnail + '" alt="" loading="lazy" class="live-news-thumb" data-fallback-index="' + i + '" style="width:64px;height:64px;object-fit:cover;border-radius:12px;flex-shrink:0;">'
            : fallbackCover;
          html += '<div class="art-card' + altClass + '" style="display:flex;align-items:center;gap:0;cursor:pointer;" onclick="SentraXArticles.openLive(\'' + id + '\')">' +
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

  // Strict allowlist sanitizer for MedlinePlus's FullSummary HTML. Keeps
  // only safe formatting tags, drops everything else down to plain text
  // (including the <span class="qt0"> query-highlight wrappers NIH's API
  // adds around matched terms — we don't need the highlighting, so those
  // just unwrap to their inner text). No script/style/on*-attribute can
  // survive this since only a fixed tag whitelist is ever kept.
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
        try { localStorage.setItem(MEDLIB_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage full/unavailable — still usable this session */ }
        return data;
      });
  }

  let medLibraryById = {};

  function loadMedLibrary() {
    const container = document.getElementById('med-library-section');
    if (!container || !MEDLIB_WORKER_URL) return;

    fetchMedLibrary()
      .then(function (data) {
        if (!data || !data.items || !data.items.length) { container.innerHTML = ''; return; }
        medLibraryById = {};
        let html = '<div class="articles-header" style="padding:16px 18px;margin-bottom:12px;"><h3 style="font-size:15px;">🏥 Health Library</h3><p>Full topic guides from MedlinePlus (U.S. National Library of Medicine)</p></div>';
        data.items.forEach(function (item, i) {
          medLibraryById[item.id] = item;
          const tag = MEDLIB_TAG_MAP[item.id] || 'Wellness';
          html += '<div class="art-card" onclick="SentraXArticles.openMedLib(\'' + item.id + '\')">' +
            coverHtml(tag, null, 'width:64px;height:64px;flex-shrink:0;', i) +
            '<div class="art-body">' +
            '<h4>' + item.title + '</h4>' +
            '<div class="art-readmore">Read more →</div>' +
            '</div></div>';
        });
        container.innerHTML = html;
      })
      .catch(function () {
        container.innerHTML = ''; // fails quietly — Guides section is unaffected
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
      coverHtml(readerTag, null, 'height:180px;', 0).replace('art-cover', 'art-cover art-reader-cover').replace('<span class="art-tag">' + readerTag + '</span>', '<span class="art-reader-tag">Health Library</span>') +
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
    window.SentraXArticles = { render: renderArticles, open: openArticle, openLive: openLiveArticle, openMedLib: openMedLibArticle, close: closeArticle, ARTICLES: ARTICLES };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ARTICLES: ARTICLES, shuffled: shuffled, stripHtml: stripHtml, truncate: truncate, snippetFrom: snippetFrom };
  }
})();
