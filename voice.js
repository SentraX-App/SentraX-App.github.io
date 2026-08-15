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

  let recognition = null;
  let listening = false;
  let mutedReplies = localStorage.getItem('voice-muted-replies') === '1';
  let pendingLiveReplies = 0; // >0 means a real sendAiMessage() call is in flight

  function speak(text) {
    if (!synth || !text) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    synth.speak(utter);
  }

  // Android/Chrome sometimes loads TTS voices lazily on first use, causing
  // a noticeable delay before the very first utterance of a session
  // actually starts speaking. Priming getVoices() early (and again on the
  // voiceschanged event some browsers fire once loading finishes) avoids
  // paying that delay right when the person is waiting for the intro.
  function primeSpeechEngine() {
    if (!synth) return;
    synth.getVoices();
    synth.addEventListener('voiceschanged', function () { synth.getVoices(); });
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

  // Wraps the real global sendAiMessage (defined in script.js, loaded
  // before this file) so we know FOR CERTAIN — not by guessing — when a
  // bot message about to appear is a genuine live reply, as opposed to an
  // old conversation being replayed on open. A counter (not a boolean)
  // handles the case of a second message being sent before the first
  // reply has come back.
  function wrapSendAiMessage() {
    if (typeof window.sendAiMessage !== 'function') return;
    const original = window.sendAiMessage;
    window.sendAiMessage = function () {
      pendingLiveReplies++;
      return original.apply(this, arguments);
    };
  }

  function isAiScreenActive() {
    const screen = document.getElementById('ai-screen');
    return !!screen && screen.classList.contains('active');
  }

  function watchChatLog() {
    const log = document.getElementById('ai-chat-log');
    if (!log || !window.MutationObserver) return;
    const observer = new MutationObserver(function (mutations) {
      const addedBotNodes = [];
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.classList.contains('ai-msg') &&
              node.classList.contains('bot') && !node.classList.contains('typing')) {
            addedBotNodes.push(node);
          }
        });
      });

      if (addedBotNodes.length === 0) return;

      // Multiple bot bubbles added in one batch only happens when an old
      // conversation with more than one exchange is being replayed on
      // open — never during a real one-at-a-time chat. Always silent.
      if (addedBotNodes.length > 1) {
        pendingLiveReplies = Math.max(0, pendingLiveReplies - 1);
        return;
      }

      const text = addedBotNodes[0].textContent;
      const wasLiveSend = pendingLiveReplies > 0;
      if (wasLiveSend) pendingLiveReplies--;

      if (text === INTRO_TEXT) {
        // Genuine intro — always speak, every time it's shown.
        speak(text);
      } else if (wasLiveSend) {
        // A real reply to a message this session actually sent.
        if (!mutedReplies) speak(text);
      }
      // Anything else — a single old message being replayed on open,
      // that happens to not be the intro and wasn't a live send —
      // is correctly left silent.
    });
    observer.observe(log, { childList: true });
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

  function setupRecognition() {
    if (!SpeechRecognitionImpl) return;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'en-NG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function (e) {
      const transcript = e.results[0][0].transcript;
      const input = document.getElementById('ai-chat-input');
      if (input) {
        input.value = transcript;
        if (typeof window.sendAiMessage === 'function') window.sendAiMessage();
      }
    };
    recognition.onerror = function () { stopListening(); };
    recognition.onend = function () { stopListening(); };
  }

  function updateMicBtn() {
    const btn = document.getElementById('voice-mic-btn');
    if (!btn) return;
    btn.textContent = listening ? '⏺️' : '🎙️';
    btn.title = listening ? 'Listening… tap to stop' : 'Tap to speak';
  }

  function startListening() {
    if (!recognition) return;
    try { recognition.start(); listening = true; updateMicBtn(); }
    catch (e) { /* already running or blocked — ignore */ }
  }

  function stopListening() {
    listening = false;
    updateMicBtn();
  }

  function toggleMic() {
    if (!recognition) return;
    if (listening) { recognition.stop(); stopListening(); }
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

  function init() {
    primeSpeechEngine();
    wrapSendAiMessage();
    setupRecognition();
    injectButtons();
    watchChatLog();
    watchAiScreenVisibility();
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
