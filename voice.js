/*
 * voice.js — Sentra-X Voice Assistant
 * ========================================
 * Adds voice input (speech-to-text) and read-aloud (text-to-speech) to the
 * existing AI Health Assistant chat — no new backend, no API keys, no
 * changes to script.js. Uses the browser's built-in Web Speech API.
 *
 * SPEAKING SCOPE — deliberately narrow, by design:
 *   1. The welcome/intro line (shown when opening the assistant with no
 *      existing conversation) ALWAYS speaks, once per session, regardless
 *      of the mute toggle.
 *   2. A live assistant reply (the result of you actually sending a
 *      message) speaks by default — you can mute this with the toggle.
 *   3. Reopening an OLD saved conversation (history replay) NEVER speaks,
 *      even in bulk — otherwise every past chat you revisit would narrate
 *      itself in full, which nobody wants.
 *   4. Nothing outside the AI Assistant chat is ever touched or read.
 *
 * How #1 vs #2 vs #3 are told apart without editing script.js: a history
 * replay always adds several message nodes to the chat log in one burst
 * (one per past message). A single live reply — or the one-line intro —
 * always adds exactly ONE node at a time. So: multiple nodes in one
 * batch = history replay, skip it entirely. Exactly one node, and it's
 * the very first thing this page session has ever seen = the intro,
 * always speak it. Exactly one node after that = a live reply, speak it
 * unless muted.
 *
 * Mic button: transcribes speech into #ai-chat-input, then calls the
 * existing global sendAiMessage() exactly as if typed and sent.
 *
 * LANGUAGE: recognition is set to en-NG (Nigerian English), the closest
 * available option in the free browser speech engine — it tends to
 * handle Nigerian Pidgin reasonably since Pidgin is English-lexified,
 * but this is NOT the same as genuine native support for Pidgin, Yoruba,
 * Igbo, or Hausa. The free Web Speech API doesn't offer those as
 * selectable languages at all. Real multi-language support would need a
 * paid cloud speech service with its own API key — a separate, bigger
 * piece of work, not a setting to flip here.
 *
 * Feature-detected: on a browser/WebView without SpeechRecognition or
 * speechSynthesis support, the relevant button just hides itself instead
 * of throwing errors. Isolated file, same pattern as store.js/articles.js.
 */

(function () {
  'use strict';

  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  let recognition = null;
  let listening = false;
  let mutedReplies = localStorage.getItem('voice-muted-replies') === '1';
  let introSpokenThisSession = false;

  function speak(text) {
    if (!synth || !text) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    synth.speak(utter);
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
      if (addedBotNodes.length > 1) return;

      if (!introSpokenThisSession) {
        introSpokenThisSession = true;
        speak(addedBotNodes[0].textContent);
      } else if (!mutedReplies) {
        speak(addedBotNodes[0].textContent);
      }
    });
    observer.observe(log, { childList: true });
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
    setupRecognition();
    injectButtons();
    watchChatLog();
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
