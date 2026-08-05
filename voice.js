/*
 * voice.js — Sentra-X Voice Assistant
 * ========================================
 * Adds voice input (speech-to-text) and read-aloud (text-to-speech) to the
 * existing AI Health Assistant chat — no new backend, no API keys, no
 * changes to script.js. Uses the browser's built-in Web Speech API, the
 * same free engine Chrome/Android already ships with.
 *
 * - Mic button: transcribes speech into #ai-chat-input, then calls the
 *   existing global sendAiMessage() exactly as if the user had typed and
 *   pressed Send. Never duplicates or reimplements chat logic.
 * - Read-aloud toggle: when on, a MutationObserver watches #ai-chat-log
 *   for new assistant replies and speaks them automatically. This avoids
 *   touching appendAiMessage()/sendAiMessage() in script.js entirely.
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
  let readAloud = localStorage.getItem('voice-read-aloud') === '1';

  // ---- Text-to-speech ---------------------------------------------------
  function speak(text) {
    if (!synth || !text) return;
    synth.cancel(); // don't queue/overlap replies
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    synth.speak(utter);
  }

  function updateReadAloudBtn() {
    const btn = document.getElementById('voice-readaloud-btn');
    if (!btn) return;
    btn.textContent = readAloud ? '🔊' : '🔈';
    btn.title = readAloud ? 'Read replies aloud: on' : 'Read replies aloud: off';
    btn.style.opacity = readAloud ? '1' : '0.55';
  }

  function toggleReadAloud() {
    readAloud = !readAloud;
    localStorage.setItem('voice-read-aloud', readAloud ? '1' : '0');
    updateReadAloudBtn();
    if (!readAloud && synth) synth.cancel();
  }

  // Watches for new assistant messages and speaks them when read-aloud is on.
  // Skips the "Thinking..." placeholder (class "typing") since that gets
  // removed and replaced with the real reply a moment later.
  function watchChatLog() {
    const log = document.getElementById('ai-chat-log');
    if (!log || !window.MutationObserver) return;
    const observer = new MutationObserver(function (mutations) {
      if (!readAloud) return;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.classList.contains('ai-msg') &&
              node.classList.contains('bot') && !node.classList.contains('typing')) {
            speak(node.textContent);
          }
        });
      });
    });
    observer.observe(log, { childList: true });
  }

  // ---- Speech-to-text -----------------------------------------------------
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

  // ---- Injects the two buttons next to the existing Send button ---------
  function injectButtons() {
    const sendRow = document.querySelector('#ai-screen div[style*="display:flex"][style*="gap:8px"]');
    if (!sendRow || document.getElementById('voice-mic-btn')) return; // already injected

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
