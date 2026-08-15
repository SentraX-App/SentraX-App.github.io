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
    if (mutedReplies && synth) synth.cancel();
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
        synth.cancel();
        setTimeout(function () { synth.cancel(); }, 60);
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
        synth.cancel();
      }
    });
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  }

  let bankedTranscript = ''; // finalized speech from BEFORE the most recent internal restart — kept separate so a restart's fresh index-0 result can't silently overwrite it
  let finalResults = []; // finalized transcript segments for the CURRENT recognition session, indexed by result index — overwritten, never appended, so a re-fired index can't duplicate text
  let finalTranscript = ''; // finalResults joined — current session only
  let lastInterim = ''; // most recent not-yet-final text, tracked so stopping mid-phrase doesn't lose it
  let userStoppedManually = false; // distinguishes "you tapped stop" from the engine pausing on its own

  // Called right before restarting recognition after the engine drops it
  // on its own (continuous mode is prone to this on Android). Folds
  // whatever the just-ended session captured into bankedTranscript, then
  // clears the per-session index tracker — otherwise the NEW session's
  // result numbering starts again from 0, and its first result would
  // silently overwrite finalResults[0] from the session that just ended,
  // which is what was quietly deleting the start of longer sentences
  // (e.g. "how are you doing today" surviving as just "doing today").
  function bankCurrentTranscript() {
    bankedTranscript = (bankedTranscript + ' ' + finalTranscript).trim();
    finalResults = [];
    finalTranscript = '';
  }

  function setupRecognition() {
    if (!SpeechRecognitionImpl) return;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'en-NG';
    recognition.interimResults = true; // show live partial text as you speak, so it feels as responsive as typing instead of a silent wait
    recognition.continuous = true; // keep listening across natural pauses in speech instead of the engine cutting off after the first one
    recognition.maxAlternatives = 1;

    recognition.onresult = function (e) {
      const input = document.getElementById('ai-chat-input');
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        // Android Chrome can re-fire onresult for an index it already
        // marked final, with a progressively longer transcript each time
        // (the browser refining its own guess). Writing to finalResults[i]
        // — instead of finalTranscript += ... — means a repeat visit to
        // the same index safely overwrites that one entry rather than
        // piling another copy onto the end, which is what produced the
        // "hello hello I said hello I said you..." pattern.
        if (result.isFinal) finalResults[i] = result[0].transcript;
        else interim += result[0].transcript;
      }
      finalTranscript = finalResults.join(' ').trim();
      lastInterim = interim;
      const combined = (bankedTranscript + ' ' + finalTranscript + ' ' + interim).trim();
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
    const text = (bankedTranscript + ' ' + finalTranscript + ' ' + lastInterim).trim();
    bankedTranscript = '';
    finalResults = [];
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
    btn.textContent = listening ? '⏺️' : '🎙️';
    btn.title = listening ? 'Listening… tap to stop' : 'Tap to speak';
  }

  function startListening() {
    if (!recognition) return;
    bankedTranscript = '';
    finalResults = [];
    finalTranscript = '';
    lastInterim = '';
    userStoppedManually = false;
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
          actuallyStart();
        })
        .catch(function () {
          alert('Sentra-X needs microphone access to use voice input. Please allow microphone permission and try again.');
        });
    } else {
      actuallyStart();
    }
  }

  function actuallyStart() {
    try { recognition.start(); listening = true; updateMicBtn(); }
    catch (e) { /* already running — ignore */ }
  }

  function stopListening() {
    // Called when YOU tap the mic to stop — this is what actually sends
    // whatever was captured. The engine's own onend (above) defers to
    // finishListening() too, but only once userStoppedManually is true.
    userStoppedManually = true;
    try { recognition.stop(); } catch (e) { finishListening(); }
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
      if (document.visibilityState === 'hidden' && synth) synth.cancel();
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
