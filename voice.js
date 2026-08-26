/*
 * voice.js — Sentra-X Voice Assistant
 * ========================================
 * Adds voice input (speech-to-text) and read-aloud (text-to-speech) to the
 * existing AI Health Assistant chat — no new backend, no API keys, no
 * changes to script.js. Uses the browser's built-in Web Speech API.
 *
 * SPEAKING SCOPE — deliberately narrow, by design:
 *   1. The welcome/intro line (shown when opening the assistant with no
 *      existing conversation) ALWAYS speaks, every time it's shown,
 *      regardless of the mute toggle — identified by exact text match
 *      against the known intro string, not by guessing from batch size.
 *   2. A live assistant reply (the result of you actually sending a
 *      message) speaks by default — you can mute this with the toggle.
 *      Identified by wrapping the real sendAiMessage() so we know for
 *      certain a live send is in flight, not by inference.
 *   3. Reopening an OLD saved conversation (history replay) NEVER speaks,
 *      even if it happens to contain only one message — the exact-text
 *      check in #1 and the wrapped-send tracking in #2 mean a lone old
 *      message matches neither case, so it's correctly left silent.
 *   4. Speech is immediately cancelled the moment you navigate away from
 *      the AI screen, so it can never keep talking after you've left.
 *   5. Nothing outside the AI Assistant chat is ever touched or read.
 *
 * Mic button: transcribes speech into #ai-chat-input, then calls the
 * existing global sendAiMessage() exactly as if typed and sent.
 *
 * LANGUAGE: recognition is set to en-NG (Nigerian English), the closest
 * available option in the free browser speech engine.
 *
 * Feature-detected: on a browser/WebView without SpeechRecognition or
 * speechSynthesis support, the relevant button just hides itself instead
 * of throwing errors. Isolated file, same pattern as store.js/articles.js.
 */

(function () {
  'use strict';

  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  // Must match script.js's renderAiWelcome() intro string EXACTLY — this
  // is how a genuine intro is told apart from an old one-message
  // conversation being replayed, which looks identical by node-count alone.
  const INTRO_TEXT = "Hi, I'm your Sentra-X health assistant. Ask me anything about symptoms, medications, or general wellness — and remember, for emergencies always call 112.";

  // Must match script.js's AI_WELCOME_BACK_VARIANTS list exactly — these
  // are the "welcome back" lines shown (not saved to history) whenever
  // you reopen an existing conversation. Unlike the intro, these respect
  // the mute toggle rather than always speaking.
  const WELCOME_BACK_VARIANTS = [
    "Welcome back — what's up?",
    "Good to see you again. What's on your mind?",
    "I'm here — go ahead.",
    "Back again? What can I help with today?",
    "Hey, picking back up — what do you need?"
  ];

  let recognition = null;
  let listening = false;
  let micReady = false; // true only once recognition.onstart actually fires — see updateMicBtn
  let mutedReplies = localStorage.getItem('voice-muted-replies') === '1';
  let pendingLiveReplies = 0; // >0 means a real sendAiMessage() call is in flight
  let micPermissionConfirmed = false; // once true, skip re-probing getUserMedia on every tap

  let speechKeepAlive = null;

  function stopSpeechKeepAlive() {
    if (speechKeepAlive) { clearInterval(speechKeepAlive); speechKeepAlive = null; }
  }

  // Cancels speech AND stops the keep-alive interval together — every place
  // that used to call synth.cancel() directly now goes through this, so the
  // interval never outlives the speech it was keeping alive.
  let speechGeneration = 0; // bumped on every stop/new speak() — lets a delayed speak() below detect it's been superseded and bail out instead of firing late

  function stopSpeaking() {
    speechGeneration++; // invalidates any pending delayed speak() queued before this stop
    if (synth) synth.cancel();
    stopSpeechKeepAlive();
  }

  function speak(text) {
    if (!synth || !text) return;
    stopSpeaking();
    const myGeneration = ++speechGeneration;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = stopSpeechKeepAlive;
    utter.onerror = stopSpeechKeepAlive;
    // Android Chrome's speechSynthesis.speak() is unreliable when called
    // immediately after cancel() — cancel() isn't actually instantaneous
    // under the hood even though the API makes it look synchronous.
    // Depending on timing, the engine either silently drops the next
    // utterance entirely or stalls before starting it — which is exactly
    // the "sometimes no voice at all" / "noticeable pause before it
    // starts" pattern. A short, fixed delay here trades an invisible,
    // unpredictable stall (or a vanished utterance) for a small, reliable
    // one instead. The generation check means if speak() gets called
    // again before this timer fires, this stale call quietly bails out
    // rather than firing late on top of the newer one.
    setTimeout(function () {
      if (myGeneration !== speechGeneration) return; // superseded by a newer speak()/stop while waiting
      // Chrome — desktop and Android alike — has a long-standing bug where
      // speechSynthesis silently pauses itself mid-utterance after about 15
      // seconds unless resume() is called periodically; this is the browser's
      // own queue stalling, not anything in this app cutting it off. Calling
      // resume() while nothing is paused is a harmless no-op, so this is safe
      // to run unconditionally for the whole time it's speaking.
      speechKeepAlive = setInterval(function () {
        if (synth.speaking) synth.resume();
        else stopSpeechKeepAlive();
      }, 12000);
      synth.speak(utter);
    }, 150);
  }

  // Android/Chrome sometimes loads TTS voices lazily on first use, causing
  // a noticeable delay before the very first utterance of a session
  // actually starts speaking. Priming getVoices() early (and again on the
  // voiceschanged event some browsers fire once loading finishes) avoids
  // paying that delay right when the person is waiting for the intro.
  // Also speaks a near-silent utterance immediately — on some Android
  // engines, getVoices() alone doesn't fully warm the TTS pipeline, and
  // only an actual speak() call does, which is what was causing a real
  // delay before the very first reply of a session was heard.
  function primeSpeechEngine() {
    if (!synth) return;
    synth.getVoices();
    synth.addEventListener('voiceschanged', function () { synth.getVoices(); });
    try {
      const warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      synth.speak(warm);
    } catch (e) { /* best effort */ }
  }

  function updateReadAloudBtn() {
    const btn = document.getElementById('voice-readaloud-btn');
    if (!btn) return;
    btn.textContent = mutedReplies ? '🔈' : '🔊';
    btn.title = mutedReplies ? 'Replies muted — tap to unmute' : 'Replies read aloud — tap to mute';
    btn.style.opacity = mutedReplies ? '0.55' : '1';
  }

  function toggleReadAloud() {
    mutedReplies = !mutedReplies;
    localStorage.setItem('voice-muted-replies', mutedReplies ? '1' : '0');
    updateReadAloudBtn();
    if (mutedReplies) stopSpeaking();
  }

  // Listens for script.js's own 'send started' event instead of wrapping
  // sendAiMessage(). Wrapping had a real bug: it incremented the counter
  // for EVERY call, including ones sendAiMessage's own in-flight guard
  // immediately rejects (a double-tap while a reply is still streaming) —
  // that call never fires a matching 'reply-done' event, so the counter
  // only ever went up for it, never back down. Listening for this event
  // instead is accurate by construction: script.js only dispatches it once
  // a send has actually passed both guards and committed to a real request.
  function watchSendStarted() {
    document.addEventListener('sentrax-ai-send-started', function () {
      pendingLiveReplies++;
    });
  }

  function isAiScreenActive() {
    const screen = document.getElementById('ai-screen');
    return !!screen && screen.classList.contains('active');
  }

  // Wraps the real global showScreen (defined in script.js) so speech is
  // stopped the INSTANT navigation away from the AI screen happens —
  // synchronously, before the DOM even updates — rather than waiting on
  // the MutationObserver in watchAiScreenVisibility() below to notice the
  // class change after the fact. Android's TTS engine can be slow or
  // flaky about honoring a single cancel() call mid-sentence, so this
  // fires cancel() twice (immediately, then again shortly after) to make
  // sure speech actually stops when you leave for Marketplace, Family,
  // or any other screen — not just eventually.
  function wrapShowScreen() {
    if (typeof window.showScreen !== 'function') return;
    const original = window.showScreen;
    window.showScreen = function (name) {
      if (name !== 'ai' && isAiScreenActive() && synth) {
        stopSpeaking();
        setTimeout(stopSpeaking, 60);
      }
      return original.apply(this, arguments);
    };
  }

  function watchChatLog() {
    const log = document.getElementById('ai-chat-log');
    if (!log || !window.MutationObserver) return;
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1 || !node.classList.contains('ai-msg') || !node.classList.contains('bot')) return;
          if (node.classList.contains('typing')) return; // placeholder only — real text handled by the reply-done event below

          // A bot bubble that wasn't the typing placeholder only appears this
          // way when an old conversation is being replayed on open (its
          // messages get appended as fully-formed nodes). The intro line is
          // one such node and always speaks; anything else stays silent.
          if (node.textContent === INTRO_TEXT) speak(node.textContent);
          else if (WELCOME_BACK_VARIANTS.indexOf(node.textContent) !== -1 && !mutedReplies) speak(node.textContent);
        });
      });
    });
    observer.observe(log, { childList: true });
  }

  // script.js dispatches this exactly once, exactly when a reply is truly
  // finished (streamed successfully, came back empty, or errored out) — so
  // speaking it is a direct response to a real event, not a guess based on
  // typing having "gone quiet" for a while (which was cutting speech off
  // early whenever the stream paused mid-reply).
  function watchReplyDone() {
    document.addEventListener('sentrax-ai-reply-done', function (e) {
      const isLiveSend = pendingLiveReplies > 0;
      if (isLiveSend) pendingLiveReplies--;
      if (!isLiveSend) return; // history replay never fires this event anyway, but stay defensive
      const text = e.detail && e.detail.text;
      if (text && !mutedReplies) speak(text);
    });
  }

  // Stop talking the instant the AI screen is no longer the active one,
  // so speech can never continue after the person has navigated away.
  function watchAiScreenVisibility() {
    const screen = document.getElementById('ai-screen');
    if (!screen || !window.MutationObserver) return;
    const observer = new MutationObserver(function () {
      if (!screen.classList.contains('active') && synth) {
        stopSpeaking();
      }
    });
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  }

  // Web Speech doesn't know "Sentra" — it isn't a dictionary word, so the
  // engine substitutes the closest common English word it does know. This
  // is a vocabulary limitation of the recognition engine itself, not a
  // capture/timing issue — every race-condition fix above still matters
  // and still applies, this specifically handles the one word the engine
  // will never get right on its own no matter how cleanly the audio is
  // captured. Deliberately scoped to "<confusable-word> x" as a pair, so
  // it can only ever correct the app's own name being spoken back — it
  // can never rewrite a real, unrelated health phrase like "central
  // nervous system" or "central sleep apnea", since neither is followed
  // by a bare "x".
  const BRAND_MISHEAR_RE = /\b(central|centra|sentral|sentrall|centre|center|sundra|sundry|sandra|santra)\s+x\b/gi;
  function correctBrandMishears(text) {
    if (!text) return text;
    return text.replace(BRAND_MISHEAR_RE, function (match) {
      return match.charAt(0) === match.charAt(0).toUpperCase() ? 'Sentra X' : 'sentra x';
    });
  }

  let bankedTranscript = ''; // finalized speech from BEFORE the most recent internal restart — kept separate so a restart's fresh index-0 result can't silently overwrite it
  // completedSegments/currentRunText replace the earlier index-based
  // approach entirely. Evidence from a real device showed the previous
  // assumption was wrong: Android wasn't re-firing the SAME index with
  // growing text (which index-overwrite would have fixed) — it was
  // producing DIFFERENT indices that each independently held the ENTIRE
  // cumulative phrase so far ("when" / "when are" / "when are they" / ...
  // each a distinct final result). Joining distinct indices together, as
  // the previous fix did, multiplied that growth into exactly the
  // repeating pattern seen in testing.
  //
  // ingestFinalResult() below is index-agnostic on purpose — every final
  // result is compared by its actual TEXT against what's already
  // captured, not trusted by position:
  //   - if the new text is a superset extending currentRunText (or is an
  //     exact repeat), it REPLACES currentRunText — this is the engine
  //     revising/growing its guess for the phrase still in progress.
  //   - otherwise, it's a genuinely new phrase following a pause: the old
  //     run gets banked into completedSegments and a new run begins.
  // Because comparison is by content, reprocessing an already-seen result
  // is naturally harmless (comparing a string against itself is always a
  // "superset" match), so there's no need to trust the engine's index
  // numbering to know what's already been consumed.
  let completedSegments = []; // fully-finished phrases from earlier in this recognition session
  let currentRunText = ''; // the in-progress phrase's latest, most-complete revision

  // Word-overlap similarity (0-1). Used to catch "this is basically the
  // same phrase being said again" even when wording/typos differ too
  // much for the exact-prefix check above to recognize it as a revision
  // of the same utterance rather than a brand-new one.
  function wordOverlapRatio(a, b) {
    const wordsA = a.split(' ').filter(Boolean);
    const wordsB = b.split(' ').filter(Boolean);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let shared = 0;
    setA.forEach(function (w) { if (setB.has(w)) shared++; });
    return shared / Math.max(setA.size, setB.size);
  }

  function ingestFinalResult(text) {
    if (!text) return;
    // Compared after stripping punctuation and casing, not just casing —
    // this is why the duplication bug came back. The earlier lowercase-only
    // fix handled the engine revising "Hello" → "hello" between growing
    // revisions of the same phrase, but Android also revises PUNCTUATION
    // mid-string between revisions (e.g. "hi sentra x" → "hi, sentra x" —
    // a comma inserted before the rest of the phrase). That breaks a literal
    // substring/prefix check even case-insensitively, since the comma means
    // the old text no longer appears as a literal prefix of the new one —
    // so the old (correct) run got wrongly archived as "finished" and the
    // revised text started a new run, stacking both together in the output.
    // Stripping to letters/digits/spaces before comparing survives any
    // punctuation or spacing revision the engine makes along the way.
    const normalize = function (s) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); };
    const norm = normalize(text);
    const currentNorm = normalize(currentRunText);
    if (!currentRunText || norm.indexOf(currentNorm) === 0 || currentNorm.indexOf(norm) === 0) {
      // Extends (or repeats, or is a rare same-or-shorter revision of)
      // the current run — keep whichever is longer/more complete.
      if (text.length >= currentRunText.length) currentRunText = text;
      return;
    }
    // Doesn't extend the current run — but before treating it as a
    // genuinely new phrase, check whether it's really just a retry of
    // the LAST completed segment (e.g. someone repeating themselves with
    // slightly different wording each time). A high word-overlap match
    // there means "replace," not "stack on top of."
    const lastSegment = completedSegments[completedSegments.length - 1];
    if (lastSegment && wordOverlapRatio(norm, normalize(lastSegment)) >= 0.6) {
      completedSegments[completedSegments.length - 1] = (text.length >= lastSegment.length) ? text : lastSegment;
      currentRunText = '';
      return;
    }
    // Genuinely unrelated to anything captured so far — a new phrase.
    completedSegments.push(currentRunText);
    currentRunText = text;
  }

  function currentFinalTranscript() {
    return completedSegments.concat(currentRunText ? [currentRunText] : []).join(' ').trim();
  }

  let finalTranscript = ''; // currentFinalTranscript() — recomputed after every onresult, kept as a variable so the rest of the file can read it plainly
  let lastInterim = ''; // most recent not-yet-final text, tracked so stopping mid-phrase doesn't lose it
  let userStoppedManually = false; // distinguishes "you tapped stop" from the engine pausing on its own

  // Called right before restarting recognition after the engine drops it
  // on its own (continuous mode is prone to this on Android). Folds
  // whatever the just-ended session captured into bankedTranscript, then
  // clears the per-session run tracker — otherwise the new session's
  // fresh results could be compared against (and confused with) the
  // previous session's leftover run state.
  function bankCurrentTranscript() {
    bankedTranscript = (bankedTranscript + ' ' + finalTranscript).trim();
    completedSegments = [];
    currentRunText = '';
    finalTranscript = '';
  }

  function setupRecognition() {
    if (!SpeechRecognitionImpl) return;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'en-NG';
    recognition.interimResults = true; // show live partial text as you speak, so it feels as responsive as typing instead of a silent wait
    recognition.continuous = true; // keep listening across natural pauses in speech instead of the engine cutting off after the first one
    recognition.maxAlternatives = 1;

    // Best-effort vocabulary bias toward the app's own name. Browser support
    // for SpeechGrammarList is inconsistent (some engines weight it lightly,
    // some ignore it) — the regex correction above is the reliable fix and
    // works regardless; this is free, harmless to add, and helps on engines
    // that do honor it.
    const GrammarListImpl = window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (GrammarListImpl) {
      try {
        const grammar = '#JSGF V1.0; grammar brand; public <brand> = Sentra X | SentraX | hi Sentra X ;';
        const list = new GrammarListImpl();
        list.addFromString(grammar, 1);
        recognition.grammars = list;
      } catch (e) { /* best effort — recognition still works fine without it */ }
    }

    recognition.onstart = function () {
      micReady = true;
      updateMicBtn();
    };

    recognition.onresult = function (e) {
      const input = document.getElementById('ai-chat-input');
      let interim = '';
      // Deliberately processes ALL results every time (from 0), not just
      // from e.resultIndex onward — since ingestFinalResult() compares by
      // text content rather than trusting index position, reprocessing an
      // already-seen result is harmless (a string always "extends" itself),
      // so there's no need to rely on the engine's index numbering being
      // stable or non-overlapping, which testing showed it isn't.
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) ingestFinalResult(result[0].transcript.trim());
        else interim += result[0].transcript;
      }
      finalTranscript = currentFinalTranscript();
      lastInterim = interim;
      const combined = correctBrandMishears((bankedTranscript + ' ' + finalTranscript + ' ' + interim).trim());
      if (input) input.value = combined; // live preview, never auto-sent mid-session
    };

    recognition.onerror = function (e) {
      // 'no-speech' just means a quiet gap — the engine often stops the
      // session over this even in continuous mode, and its own 'end'
      // event fires immediately afterward regardless. Restarting from
      // BOTH onerror and onend for what is really the same underlying
      // drop was the actual cause of the duplicated/interleaved transcript
      // ("how how are you how are you doing..."): both handlers could
      // each independently succeed at recognition.start() a few
      // milliseconds apart, briefly running two overlapping recognition
      // sessions that each transcribed the same speech from the start.
      // onend (below) already handles restarting — this only needs to
      // leave genuine, non-'no-speech' errors to finish the session.
      if (e.error === 'no-speech') return;
      finishListening();
    };
    recognition.onend = function () {
      // The engine can end the session on its own even in continuous mode
      // (Android is prone to this). If the person hasn't tapped stop,
      // seamlessly resume so it doesn't feel like it "cut off." Banking
      // first means the restart's fresh result numbering (starting at 0
      // again) can never silently overwrite what this session already
      // captured.
      if (!userStoppedManually && listening) {
        bankCurrentTranscript();
        micReady = false;
        updateMicBtn();
        try { recognition.start(); return; } catch (err) { /* fall through to finishing */ }
      }
      finishListening();
    };
  }

  function finishListening() {
    listening = false;
    updateMicBtn();
    // Combine every layer: speech banked across any internal restarts,
    // the current session's finalized speech, and whatever was still
    // interim (unconfirmed by the engine) at the moment you tapped stop.
    // Previously this only read finalTranscript — so stopping a beat
    // before the engine finished "finalizing" your last phrase (common;
    // finalization typically lags slightly behind what's already visible
    // on screen) meant that trailing text was silently dropped, sometimes
    // leaving nothing to send at all even though the words were sitting
    // right there in the input box.
    const text = correctBrandMishears((bankedTranscript + ' ' + finalTranscript + ' ' + lastInterim).trim());
    bankedTranscript = '';
    completedSegments = [];
    currentRunText = '';
    finalTranscript = '';
    lastInterim = '';
    if (text) {
      const input = document.getElementById('ai-chat-input');
      if (input) input.value = text;
      if (typeof window.sendAiMessage === 'function') window.sendAiMessage();
    }
  }

  function updateMicBtn() {
    const btn = document.getElementById('voice-mic-btn');
    if (!btn) return;
    if (listening && !micReady) {
      // recognition.start() succeeding doesn't mean audio capture has
      // actually begun yet — Android in particular has a real warm-up gap
      // between the call returning and the engine truly listening, during
      // which anything spoken is silently lost. That gap is what was
      // making the first attempt after returning to the app (or after any
      // restart) capture nothing, or drop the first word, even though no
      // error ever occurred to catch. Rather than pretend we're ready
      // before we are, this shows a distinct "starting up" state and
      // waits for the engine's own onstart event (below) before inviting
      // the person to actually speak.
      btn.textContent = '🎙️…';
      btn.title = 'Starting up — one moment…';
      return;
    }
    btn.textContent = listening ? '⏺️' : '🎙️';
    btn.title = listening ? 'Listening… tap to stop' : 'Tap to speak';
  }

  function startListening() {
    if (!recognition) return;
    bankedTranscript = '';
    completedSegments = [];
    currentRunText = '';
    finalTranscript = '';
    lastInterim = '';
    userStoppedManually = false;
    micReady = false;

    // If the AI's voice reply is still speaking (or just finished a
    // moment ago), claiming the microphone immediately can silently fail
    // — Android's audio subsystem doesn't always release the TTS output
    // session the instant speech ends, and recognition.start() throws in
    // a way indistinguishable from "already listening," so it was being
    // swallowed as if nothing happened. This is specifically what made
    // the FIRST tap right after the AI spoke capture nothing, while a
    // second tap moments later (audio session now actually free) worked
    // fine. Force-stopping speech and giving the OS a brief moment to
    // truly release the session before claiming the mic avoids the race.
    if (synth && synth.speaking) {
      stopSpeaking();
      setTimeout(claimMicrophone, 200);
      return;
    }
    claimMicrophone();
  }

  function claimMicrophone() {
    // Once permission has been confirmed granted, skip getUserMedia
    // entirely and go straight to recognition.start(). Re-probing on
    // EVERY tap (open a mic stream, immediately close it, then hand the
    // mic to SpeechRecognition) was racing the hardware teardown against
    // the engine trying to claim it — that's what was making voice work
    // inconsistently, not just on the very first attempt.
    if (micPermissionConfirmed) {
      actuallyStart();
      return;
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          stream.getTracks().forEach(function (t) { t.stop(); }); // we only needed the permission grant
          micPermissionConfirmed = true;
          // On the very first-ever use, the mic hardware is claimed here
          // for the permission probe, released, then immediately re-claimed
          // by recognition.start() below — that open→close→reopen on cold
          // hardware doesn't always fully settle before audio capture
          // actually begins, which was clipping the first word or two of
          // the very first thing anyone ever said to it (e.g. "hi" getting
          // dropped, or the next word being misheard). A brief pause here,
          // same pattern already used for the TTS-to-mic handoff below,
          // gives the hardware a moment to genuinely release first.
          setTimeout(actuallyStart, 150);
        })
        .catch(function () {
          alert('Sentra-X needs microphone access to use voice input. Please allow microphone permission and try again.');
        });
    } else {
      actuallyStart();
    }
  }

  function actuallyStart(isRetry) {
    try {
      recognition.start();
      listening = true;
      updateMicBtn();
    } catch (e) {
      // Could genuinely be "already running" (harmless — a session is
      // already active, nothing to do) OR a transient failure to actually
      // claim the microphone hardware (e.g. still settling right after
      // TTS, or after a just-ended previous session) — these throw
      // identically, so there's no reliable way to tell them apart from
      // the caught error alone. Retrying once after a brief pause makes
      // the genuine-failure case self-heal automatically instead of
      // silently doing nothing and requiring a second manual tap; if it
      // really was "already running," this retry just throws again and
      // is ignored the same as before.
      if (!isRetry) setTimeout(function () { actuallyStart(true); }, 250);
    }
  }

  function stopListening() {
    // Called when YOU tap the mic to stop — this is what actually sends
    // whatever was captured. userStoppedManually is set immediately so
    // no restart-on-drop kicks in, but the actual recognition.stop()
    // call is delayed slightly: tapping the exact instant you finish your
    // last word can interrupt the engine before it's finished capturing
    // that word's audio, silently dropping it (this was cutting off
    // trailing words like "...and sleep"). Giving it a brief moment to
    // catch up first — while onresult keeps updating the transcript as
    // normal in the meantime — fixes that without adding any perceptible
    // delay to the UI, since the mic button already switches state
    // immediately below.
    userStoppedManually = true;
    updateMicBtn();
    setTimeout(function () {
      try { recognition.stop(); } catch (e) { finishListening(); }
    }, 500);
  }

  function toggleMic() {
    if (!recognition) return;
    if (listening) { stopListening(); }
    else { startListening(); }
  }

  function injectButtons() {
    const sendRow = document.querySelector('#ai-screen div[style*="display:flex"][style*="gap:8px"]');
    if (!sendRow || document.getElementById('voice-mic-btn')) return;

    if (SpeechRecognitionImpl) {
      const micBtn = document.createElement('button');
      micBtn.id = 'voice-mic-btn';
      micBtn.type = 'button';
      micBtn.textContent = '🎙️';
      micBtn.title = 'Tap to speak';
      micBtn.style.cssText = 'width:auto;padding:0 14px;';
      micBtn.onclick = toggleMic;
      sendRow.insertBefore(micBtn, sendRow.firstChild);
    }

    if (synth) {
      const speakerBtn = document.createElement('button');
      speakerBtn.id = 'voice-readaloud-btn';
      speakerBtn.type = 'button';
      speakerBtn.style.cssText = 'width:auto;padding:0 14px;';
      speakerBtn.onclick = toggleReadAloud;
      sendRow.appendChild(speakerBtn);
    }

    updateMicBtn();
    updateReadAloudBtn();
  }

  function watchAppBackgrounded() {
    // Also stop speech if the whole app is backgrounded (e.g. the user
    // switches to another app or the phone locks) — not just when
    // navigating between screens inside Sentra-X.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') stopSpeaking();
    });
  }

  function init() {
    primeSpeechEngine();
    watchSendStarted();
    wrapShowScreen();
    setupRecognition();
    injectButtons();
    watchChatLog();
    watchReplyDone();
    watchAiScreenVisibility();
    watchAppBackgrounded();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (typeof window !== 'undefined') {
    window.SentraXVoice = { toggleMic: toggleMic, toggleReadAloud: toggleReadAloud };
  }
})();
