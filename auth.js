// Sentra-X auth.js — handles login, signup, logout, and loading saved data from Firestore.
// Expects: firebase (compat SDK) already initialized in index.html before this file loads.
// Expects HTML elements: #auth-overlay, #auth-email, #auth-password, #auth-error,
// #onboarding-overlay. Expects script.js to define window.refreshAllUI (optional).

(function() {
  if (typeof firebase === 'undefined') {
    console.error('Sentra-X: firebase SDK not found. Check that the Firebase <script> tags in index.html load before auth.js.');
    return;
  }

  window.showAuthScreen = function() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
    updateBioSetupLoginButton();
  };

  window.hideAuthScreen = function() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
  };

  // Tracks whether the shared login/signup screen is currently in "log in"
  // or "sign up" mode, so the consent checkbox only ever shows when someone
  // is actually creating an account — never during an ordinary login.
  let authMode = 'login';

  window.toggleAuthMode = function() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    const heading = document.getElementById('auth-heading');
    const subheading = document.getElementById('auth-subheading');
    const consentRow = document.getElementById('auth-consent-row');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchBtn = document.querySelector('#auth-overlay .switch');
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
    if (authMode === 'signup') {
      if (heading) heading.textContent = 'Create Account';
      if (subheading) subheading.textContent = 'Set up your Sentra-X account.';
      if (consentRow) consentRow.style.display = 'flex';
      if (submitBtn) submitBtn.textContent = 'Sign Up';
      if (switchBtn) switchBtn.textContent = 'Already have an account? Log In';
    } else {
      if (heading) heading.textContent = 'Welcome Back';
      if (subheading) subheading.textContent = 'Log in or create your Sentra-X account.';
      if (consentRow) consentRow.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Log In';
      if (switchBtn) switchBtn.textContent = "Don't have an account? Sign Up";
    }
  };

  window.submitAuth = function() {
    if (authMode === 'signup') { window.signUp(); } else { window.logIn(); }
  };

  // Shared across every sign-in path below (password, biometric, PIN) —
  // all four ultimately need a real network call to Firebase to finish,
  // even PIN unlock's local decryption step. Checking upfront gives a
  // clear, specific reason instead of Firebase's generic network-error
  // message, which doesn't tell someone offline what's actually wrong.
  function requireOnlineOrExplain(errorEl) {
    if (navigator.onLine) return true;
    if (errorEl) errorEl.textContent = "You're offline — connect to the internet to log in.";
    return false;
  }

  window.signUp = function() {
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) { console.error('Sentra-X: auth form elements missing from page.'); return; }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';
    if (!requireOnlineOrExplain(errorEl)) return;

    if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }
    const consentEl = document.getElementById('auth-consent');
    if (consentEl && !consentEl.checked) { errorEl.textContent = 'Please agree to the Privacy Policy to create an account.'; return; }
    // Captured synchronously, before the async call — signInWithEmailAndPassword's
    // promise and Firebase's onAuthStateChanged listener don't have a
    // guaranteed order relative to each other, so waiting for the promise
    // to resolve to set this risks onAuthStateChanged (and the quick-unlock
    // prompt it can trigger) firing first and finding nothing here yet.
    window.__lastAuthEmail = email;
    window.__lastAuthPassword = password;
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(function() {
        console.log('Sentra-X: sign up successful.');
      })
      .catch(function(err) {
        console.error('Sentra-X sign up error:', err.code, err.message);
        errorEl.textContent = err.message;
        window.__lastAuthEmail = null;
        window.__lastAuthPassword = null;
      });
  };

  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

  // ======================================================================
  // Quick Unlock — fingerprint/face (WebAuthn) and PIN, as two independent
  // shortcuts on top of ordinary email/password login. Neither ever
  // replaces it; persistence stays NONE (a shared family device still
  // requires re-authenticating each time), this just makes that required
  // re-authentication faster on a device someone actually owns.
  // ======================================================================

  // REPLACE THIS after deploying the WebAuthn worker (src/worker.js in this
  // same repo) — same origin, no separate URL to manage once deployed.
  const WEBAUTHN_WORKER_URL = '/api/webauthn';

  function base64urlToBuffer(base64url) {
    // Tolerant decoder: ignores whitespace and any existing '=' padding, accepts
    // both base64 and base64url. (The old one blindly appended '=' and let
    // atob() throw on anything unexpected — the cause of the enrollment error.)
    const clean = String(base64url).replace(/\s+/g, '').replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (clean.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(clean)) throw new Error('invalid base64 value');
    const padded = clean + '=='.slice(0, (4 - (clean.length % 4)) % 4);
    const binary = atob(padded);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer.buffer;
  }
  function bufferToBase64url(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // --- Fingerprint / Face Unlock (WebAuthn) ------------------------------
  function biometricSupported() {
    // More than just "does the API exist" — confirms the phone actually
    // has a usable platform authenticator right now. On Android that
    // includes fingerprint, face unlock, AND a PIN/pattern/password screen
    // lock — WebAuthn doesn't require biometric hardware specifically, any
    // secure screen lock the phone already has qualifies. Only a phone
    // with NO screen lock at all fails this — for that person, the in-app
    // PIN below is the option that still works.
    if (typeof window.PublicKeyCredential === 'undefined') return Promise.resolve(false);
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return Promise.resolve(false);
    return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function() { return false; });
  }

  function doEnableBiometricLogin(user) {
    const errorEl = document.getElementById('quick-unlock-enroll-error');
    let capturedStateToken = null;
    fetch(WEBAUTHN_WORKER_URL + '/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, email: user.email })
    })
      .then(function(res) { return res.json(); })
      .then(function(options) {
        if (options.error || !options.challenge) {
          throw new Error(options.error || 'The server did not return valid registration options.');
        }
        capturedStateToken = options.stateToken;
        try { options.challenge = base64urlToBuffer(options.challenge); }
        catch (_e) { throw new Error('the server sent an invalid challenge — please try again'); }
        // user.id: normally base64url; if the server ever sends it as plain
        // text instead, use its raw bytes rather than failing.
        try { options.user.id = base64urlToBuffer(options.user.id); }
        catch (_e) { options.user.id = new TextEncoder().encode(String(options.user.id)).buffer; }
        // excludeCredentials only prevents duplicate enrollment — skip any entry
        // that can't be decoded instead of aborting the whole setup.
        options.excludeCredentials = (options.excludeCredentials || []).map(function(c) {
          try { return Object.assign({}, c, { id: base64urlToBuffer(c.id) }); } catch (_e) { return null; }
        }).filter(Boolean);
        return navigator.credentials.create({ publicKey: options });
      })
      .then(function(credential) {
        const payload = {
          uid: user.uid,
          stateToken: capturedStateToken,
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: bufferToBase64url(credential.response.attestationObject),
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON)
          }
        };
        return fetch(WEBAUTHN_WORKER_URL + '/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        if (!result.verified) throw new Error(result.error || 'Verification failed.');
        localStorage.setItem('biometricEnrolledOnThisDevice', 'true');
        window.dismissQuickUnlockEnroll();
      })
      .catch(function(err) {
        console.error('Sentra-X biometric enrollment error:', err && err.message);
        let reason = err && err.message ? err.message : 'unknown error';
        if (err && err.name === 'NotAllowedError') reason = 'the fingerprint/face prompt was cancelled or timed out';
        const msg = "Couldn't set up fingerprint/face unlock: " + reason + "\n\nYou can still log in with your password or PIN as usual.";
        // Writing to errorEl alone was the real bug — that element lives
        // inside an overlay that's hidden when this runs from the homepage
        // card or Settings, so the error was being written somewhere
        // invisible. This is why it looked like "nothing happens": a real
        // error WAS occurring, silently. alert() guarantees it's seen
        // regardless of which screen triggered enrollment.
        if (errorEl) errorEl.textContent = msg;
        alert(msg);
      });
  }

  window.enableBiometricLogin = function() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    doEnableBiometricLogin(user);
  };

  window.tryBiometricLogin = function() {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
    if (!requireOnlineOrExplain(errorEl)) return;
    if (typeof window.PublicKeyCredential === 'undefined') { if (errorEl) errorEl.textContent = "Fingerprint/face unlock isn't supported on this device or browser."; return; }

    let capturedStateToken = null;
    fetch(WEBAUTHN_WORKER_URL + '/login-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(function(res) { return res.json(); })
      .then(function(options) {
        if (options.error || !options.challenge) {
          throw new Error(options.error || 'The server did not return valid login options.');
        }
        capturedStateToken = options.stateToken;
        options.challenge = base64urlToBuffer(options.challenge);
        return navigator.credentials.get({ publicKey: options });
      })
      .then(function(credential) {
        const payload = {
          stateToken: capturedStateToken,
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            authenticatorData: bufferToBase64url(credential.response.authenticatorData),
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            signature: bufferToBase64url(credential.response.signature),
            userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null
          }
        };
        return fetch(WEBAUTHN_WORKER_URL + '/login-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        if (!result.token) throw new Error(result.error || 'Verification failed.');
        return firebase.auth().signInWithCustomToken(result.token);
      })
      .catch(function(err) {
        console.error('Sentra-X biometric login error:', err && err.message);
        if (errorEl) errorEl.textContent = "Fingerprint login didn't work — please log in with your email and password instead.";
      });
  };

  // --- PIN Unlock ---------------------------------------------------------
  // Genuinely different security shape from fingerprint, and it's
  // important to be honest about that rather than dress it up as
  // equivalent: a 4-digit PIN has far fewer possible combinations than a
  // biometric match, so this is a convenience layer appropriate for a
  // personal device, not a strong security boundary. What it IS built
  // properly: the PIN is never stored anywhere, on this device or any
  // server. Instead it derives an encryption key (PBKDF2, 250,000
  // iterations, random salt) used to encrypt the account's email/password
  // into a local-only "vault". A wrong PIN doesn't get compared against
  // anything — it just derives the wrong key, and AES-GCM's built-in
  // integrity check makes decryption fail outright. Everything here stays
  // on-device; the Worker/backend is never involved in PIN unlock at all.
  async function deriveKeyFromPin(pin, saltBytes) {
    const pinKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: 250000, hash: 'SHA-256' },
      pinKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function setupPinUnlock(pin, email, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPin(pin, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify({ email: email, password: password }));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
    localStorage.setItem('pinVaultV1', JSON.stringify({
      salt: bufferToBase64url(salt.buffer),
      iv: bufferToBase64url(iv.buffer),
      data: bufferToBase64url(ciphertext)
    }));
    localStorage.setItem('pinEnrolledOnThisDevice', 'true');
  }

  async function unlockWithPin(pin) {
    const vaultRaw = localStorage.getItem('pinVaultV1');
    if (!vaultRaw) throw new Error('No PIN set up on this device.');
    const vault = JSON.parse(vaultRaw);
    const salt = new Uint8Array(base64urlToBuffer(vault.salt));
    const iv = new Uint8Array(base64urlToBuffer(vault.iv));
    const key = await deriveKeyFromPin(pin, salt);
    const ciphertext = base64urlToBuffer(vault.data);
    // Throws here — via AES-GCM's authentication tag — if the PIN (and so
    // the derived key) is wrong. That failure IS the "wrong PIN" check;
    // there's no separate comparison to bypass.
    const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    const creds = JSON.parse(new TextDecoder().decode(plaintextBuf));
    return firebase.auth().signInWithEmailAndPassword(creds.email, creds.password);
  }

  // PIN entry-screen state machine — shared between first-time setup
  // (two steps: enter, then confirm) and everyday unlock (one step).
  let pinScreenMode = null; // 'setup-enter' | 'setup-confirm' | 'unlock'
  let pinBuffer = '';
  let pinFirstEntry = '';
  let pinFailedAttempts = 0;

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('pin-dot-' + i);
      if (dot) dot.classList.toggle('filled', i < pinBuffer.length);
    }
  }
  function shakePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('pin-dot-' + i);
      if (dot) {
        dot.classList.add('error-shake');
        setTimeout(function() { dot.classList.remove('error-shake'); }, 400);
      }
    }
  }

  window.openPinSetup = function() {
    pinScreenMode = 'setup-enter';
    pinBuffer = '';
    pinFirstEntry = '';
    document.getElementById('pin-screen-title').textContent = 'Create a PIN';
    document.getElementById('pin-screen-subtitle').textContent = 'Choose a 4-digit PIN for this device';
    document.getElementById('pin-screen-error').textContent = '';
    document.getElementById('pin-screen-cancel').textContent = 'Cancel';
    updatePinDots();
    document.getElementById('pin-screen-overlay').style.display = 'flex';
  };

  window.openPinUnlock = function() {
    if (!requireOnlineOrExplain(document.getElementById('auth-error'))) return;
    pinScreenMode = 'unlock';
    pinBuffer = '';
    document.getElementById('pin-screen-title').textContent = 'Enter Your PIN';
    document.getElementById('pin-screen-subtitle').textContent = 'Quick unlock for this device';
    document.getElementById('pin-screen-error').textContent = '';
    document.getElementById('pin-screen-cancel').textContent = 'Use email & password instead';
    updatePinDots();
    document.getElementById('pin-screen-overlay').style.display = 'flex';
  };

  window.cancelPinScreen = function() {
    document.getElementById('pin-screen-overlay').style.display = 'none';
    pinScreenMode = null;
    pinBuffer = '';
    pinFirstEntry = '';
  };

  window.pinKeyBackspace = function() {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  };

  window.pinKeyPress = function(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    updatePinDots();
    if (pinBuffer.length === 4) handlePinComplete();
  };

  function handlePinComplete() {
    const errorEl = document.getElementById('pin-screen-error');
    if (pinScreenMode === 'setup-enter') {
      pinFirstEntry = pinBuffer;
      pinBuffer = '';
      pinScreenMode = 'setup-confirm';
      document.getElementById('pin-screen-title').textContent = 'Confirm Your PIN';
      document.getElementById('pin-screen-subtitle').textContent = 'Enter it once more';
      setTimeout(updatePinDots, 120);
      return;
    }
    if (pinScreenMode === 'setup-confirm') {
      if (pinBuffer !== pinFirstEntry) {
        if (errorEl) errorEl.textContent = "PINs didn't match — try again.";
        shakePinDots();
        pinScreenMode = 'setup-enter';
        pinBuffer = '';
        pinFirstEntry = '';
        document.getElementById('pin-screen-title').textContent = 'Create a PIN';
        document.getElementById('pin-screen-subtitle').textContent = 'Choose a 4-digit PIN for this device';
        setTimeout(updatePinDots, 400);
        return;
      }
      const finalPin = pinBuffer;
      setupPinUnlock(finalPin, window.__lastAuthEmail, window.__lastAuthPassword)
        .then(function() {
          window.cancelPinScreen();
          window.dismissQuickUnlockEnroll();
        })
        .catch(function(err) {
          console.error('Sentra-X PIN setup error:', err && err.message);
          if (errorEl) errorEl.textContent = "Couldn't set up your PIN — please try again.";
          pinBuffer = '';
          updatePinDots();
        });
      return;
    }
    if (pinScreenMode === 'unlock') {
      if (pinFailedAttempts >= 5) {
        if (errorEl) errorEl.textContent = 'Too many attempts — please use email & password.';
        pinBuffer = '';
        updatePinDots();
        return;
      }
      const attemptedPin = pinBuffer;
      unlockWithPin(attemptedPin)
        .then(function() {
          window.cancelPinScreen();
          pinFailedAttempts = 0;
        })
        .catch(function(err) {
          console.error('Sentra-X PIN unlock failed:', err && err.message);
          pinFailedAttempts++;
          if (errorEl) {
            errorEl.textContent = pinFailedAttempts >= 5
              ? 'Too many attempts — please use email & password.'
              : 'Incorrect PIN — try again.';
          }
          shakePinDots();
          pinBuffer = '';
          setTimeout(updatePinDots, 400);
        });
    }
  }

  // Reachable anytime from the More menu — unlike the one-time post-login
  // prompt (which, once dismissed, never offers again), this always works.
  // Biometric setup needs no password (uses the live Firebase session
  // directly); PIN setup does need it, since the PIN encrypts a copy of
  // it — if this isn't right after a fresh login, that plaintext password
  // may no longer be held in memory, so it's re-confirmed here instead.
  window.openQuickUnlockSettings = function() {
    const user = firebase.auth().currentUser;
    if (!user) { alert('Please log in first.'); return; }
    const bioEnrolled = localStorage.getItem('biometricEnrolledOnThisDevice') === 'true';
    const pinEnrolled = localStorage.getItem('pinEnrolledOnThisDevice') === 'true';

    biometricSupported().then(function (supported) {
      if (bioEnrolled && pinEnrolled) {
        alert('Fingerprint/Face and PIN unlock are both already set up on this device.');
        return;
      }
      if (!bioEnrolled && supported) {
        if (confirm('Set up fingerprint/face unlock on this device now?')) {
          doEnableBiometricLogin(user);
          return;
        }
      }
      if (!pinEnrolled) {
        if (confirm((bioEnrolled ? '' : (supported ? '' : 'Fingerprint/face isn\u2019t supported on this device. ')) + 'Set up a 4-digit PIN unlock instead? You\u2019ll need to confirm your password first.')) {
          const pw = prompt('Enter your password to confirm:');
          if (!pw) return;
          firebase.auth().signInWithEmailAndPassword(user.email, pw)
            .then(function () {
              window.__lastAuthEmail = user.email;
              window.__lastAuthPassword = pw;
              window.openPinSetup();
            })
            .catch(function () {
              alert('Incorrect password \u2014 please try again from the More menu.');
            });
          return;
        }
      }
      if (bioEnrolled && !pinEnrolled) {
        alert('Fingerprint/Face unlock is already set up on this device.');
      }
    });
  };

  // --- Unified enrollment prompt ------------------------------------------
  function updateHomeQuickUnlockCard() {
    const card = document.getElementById('quickunlock-home-card');
    if (!card) return;
    const alreadyHasOne = localStorage.getItem('biometricEnrolledOnThisDevice') === 'true' || localStorage.getItem('pinEnrolledOnThisDevice') === 'true';
    card.style.display = alreadyHasOne ? 'none' : 'block';
  }

  window.dismissQuickUnlockEnroll = function() {
    localStorage.setItem('quickUnlockEnrollDismissed', 'true');
    const el = document.getElementById('quick-unlock-enroll-overlay');
    if (el) el.style.display = 'none';
    updateHomeQuickUnlockCard();
    // Credentials only ever needed transiently, to offer/complete PIN
    // setup right after a real login — cleared the moment that's done or
    // declined, regardless of which option (or neither) was chosen.
    window.__lastAuthEmail = null;
    window.__lastAuthPassword = null;
  };

  function maybeOfferQuickUnlockEnroll() {
    // Set when the person tapped "Use Fingerprint / Face Unlock" on the login
    // page — overrides an earlier "Not now" so they actually get the prompt.
    const forced = window.__wantBiometricSetup === true;
    const bioEnrolled = localStorage.getItem('biometricEnrolledOnThisDevice') === 'true';
    const alreadyHasOne = bioEnrolled || localStorage.getItem('pinEnrolledOnThisDevice') === 'true';
    if (forced) {
      if (bioEnrolled) { window.__wantBiometricSetup = false; return; }
    } else if (alreadyHasOne || localStorage.getItem('quickUnlockEnrollDismissed') === 'true') {
      return;
    }
    if (!window.__lastAuthEmail || !window.__lastAuthPassword) return; // e.g. a session restored without a fresh password entry
    window.__wantBiometricSetup = false;
    biometricSupported().then(function(supported) {
      const bioOption = document.getElementById('quick-unlock-biometric-option');
      if (bioOption) bioOption.style.display = supported ? 'block' : 'none';
      const overlay = document.getElementById('quick-unlock-enroll-overlay');
      if (overlay) overlay.style.display = 'flex';
    });
  }

  // Login-page shortcut for devices that support fingerprint/face but haven't
  // enrolled yet. Also keeps the existing "Log In with ..." buttons in sync
  // when the login screen is shown again after a logout (visibility only —
  // it never auto-launches a prompt).
  function updateBioSetupLoginButton() {
    const bioEnrolled = localStorage.getItem('biometricEnrolledOnThisDevice') === 'true';
    const pinEnrolled = localStorage.getItem('pinEnrolledOnThisDevice') === 'true';
    const bioBtn = document.getElementById('auth-biometric-btn');
    if (bioBtn) bioBtn.style.display = bioEnrolled ? 'block' : 'none';
    const pinBtn = document.getElementById('auth-pin-btn');
    if (pinBtn) pinBtn.style.display = pinEnrolled ? 'block' : 'none';
    const setupBtn = document.getElementById('auth-biometric-setup-btn');
    const hint = document.getElementById('auth-bio-setup-hint');
    if (hint && !window.__wantBiometricSetup) hint.style.display = 'none';
    if (!setupBtn) return;
    setupBtn.style.display = 'none';
    if (bioEnrolled) return;
    biometricSupported().then(function(supported) {
      if (localStorage.getItem('biometricEnrolledOnThisDevice') === 'true') return;
      setupBtn.style.display = supported ? 'block' : 'none';
    });
  }

  window.startBiometricSetupFromLogin = function() {
    window.__wantBiometricSetup = true;
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
    const emailEl = document.getElementById('auth-email');
    const pwEl = document.getElementById('auth-password');
    // Details already typed in? Just log in — the setup prompt follows.
    if (emailEl && pwEl && emailEl.value.trim() && pwEl.value) {
      window.submitAuth();
      return;
    }
    const hint = document.getElementById('auth-bio-setup-hint');
    if (hint) {
      hint.textContent = "Log in once below with your email and password \u2014 we'll set up fingerprint/face unlock right after.";
      hint.style.display = 'block';
    }
    if (emailEl && !emailEl.value.trim()) emailEl.focus(); else if (pwEl) pwEl.focus();
  };

  // Show whichever quick-unlock button(s) this device has already set up,
  // on the login screen, before anyone has logged in yet. Also auto-launches
  // the fingerprint prompt immediately when it's enrolled and the device
  // supports it — the password screen is skipped entirely in that case,
  // only appearing as a fallback if biometric fails, is declined, or this
  // device genuinely can't do it. PIN gets the same treatment if that's
  // what's enrolled instead.
  function updateAuthScreenQuickUnlockButtons() {
    const bioBtn = document.getElementById('auth-biometric-btn');
    const bioEnrolled = localStorage.getItem('biometricEnrolledOnThisDevice') === 'true';
    if (bioBtn) bioBtn.style.display = bioEnrolled ? 'block' : 'none';
    const pinBtn = document.getElementById('auth-pin-btn');
    const pinEnrolled = localStorage.getItem('pinEnrolledOnThisDevice') === 'true';
    if (pinBtn) pinBtn.style.display = pinEnrolled ? 'block' : 'none';

    if (bioEnrolled) {
      biometricSupported().then(function (supported) {
        if (supported) {
          window.tryBiometricLogin();
        } else if (pinEnrolled) {
          window.openPinUnlock();
        }
      });
    } else if (pinEnrolled) {
      window.openPinUnlock();
    }
  }
  // document.addEventListener('DOMContentLoaded', ...) alone was the bug —
  // if auth.js finishes loading after that event already fired (common
  // depending on script placement/caching), the listener never runs at all,
  // which is why this appeared to "work once then stop." Checking
  // readyState first makes this run reliably regardless of timing.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthScreenQuickUnlockButtons);
    document.addEventListener('DOMContentLoaded', updateBioSetupLoginButton);
  } else {
    updateAuthScreenQuickUnlockButtons();
    updateBioSetupLoginButton();
  }
  // ======================================================================
  // end Quick Unlock
  // ======================================================================

  window.logIn = function() {
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) { console.error('Sentra-X: auth form elements missing from page.'); return; }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';
    if (!requireOnlineOrExplain(errorEl)) return;

    if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }

    // Captured synchronously, before the async call — see identical note
    // in signUp() above for why this can't wait for the promise to resolve.
    window.__lastAuthEmail = email;
    window.__lastAuthPassword = password;
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(function() {
        console.log('Sentra-X: log in successful.');
      })
      .catch(function(err) {
        console.error('Sentra-X log in error:', err.code, err.message);
        errorEl.textContent = err.message;
        window.__lastAuthEmail = null;
        window.__lastAuthPassword = null;
      });
  };

  window.logOut = function() {
    firebase.auth().signOut()
      .then(function() { console.log('Sentra-X: logged out.'); })
      .catch(function(err) { console.error('Sentra-X log out error:', err.message); });
  };

  window.loadFromFirestore = function(uid) {
    return firebase.firestore().collection('users').doc(uid).get().then(function(doc) {
      if (doc.exists) {
        const data = doc.data();
        if (data.userName) localStorage.setItem('userName', data.userName);
        if (data.userCondition) localStorage.setItem('userCondition', data.userCondition);
        if (data.meds) localStorage.setItem('meds', JSON.stringify(data.meds));
        if (data.medLogs) localStorage.setItem('medLogs', JSON.stringify(data.medLogs));
        if (data.vitals) localStorage.setItem('vitals', JSON.stringify(data.vitals));
        if (data.waterLogs) localStorage.setItem('waterLogs', JSON.stringify(data.waterLogs));
        if (data.streak) localStorage.setItem('streak', data.streak);
        if (data.lastActive) localStorage.setItem('lastActive', data.lastActive);
        if (data.cgName) localStorage.setItem('cgName', data.cgName);
        if (data.cgPhone) localStorage.setItem('cgPhone', data.cgPhone);
        if (data.cgEmail) localStorage.setItem('cgEmail', data.cgEmail);
        if (data.medHistory) localStorage.setItem('medHistory', JSON.stringify(data.medHistory));
        if (data.passport) localStorage.setItem('passport', JSON.stringify(data.passport));
        if (data.passportPhoto) localStorage.setItem('passportPhoto', data.passportPhoto);
        if (data.maternalData) localStorage.setItem('maternalData', JSON.stringify(data.maternalData));
        if (data.maternalLog) localStorage.setItem('maternalLog', JSON.stringify(data.maternalLog));
        if (data.quickSleep) localStorage.setItem('quick_sleep', JSON.stringify(data.quickSleep));
        if (data.quickActivity) localStorage.setItem('quick_activity', JSON.stringify(data.quickActivity));
        if (data.quickMood) localStorage.setItem('quick_mood', JSON.stringify(data.quickMood));
        console.log('Sentra-X: Firestore data loaded for user', uid);
      } else {
        console.log('Sentra-X: no Firestore document yet for user', uid, '(normal for a brand new account)');
      }
    }).catch(function(err) {
      console.error('Sentra-X Firestore load failed:', err.message);
    });
  };

  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      console.log('Sentra-X: auth state -> logged in as', user.email);
      window.hideAuthScreen();

      // Check whether this account is a linked caregiver before loading the
      // normal patient flow. Existing patients simply won't have this doc,
      // so this adds one extra read and falls through unchanged for them.
      firebase.firestore().collection('caregiverLinks').doc(user.uid).get().then(function(linkDoc) {
        if (linkDoc.exists) {
          const patientUid = linkDoc.data().patientUid;
          if (typeof window.showCaregiverMode === 'function') window.showCaregiverMode(patientUid);
          return;
        }
        loadPatientFlow();
      }).catch(function(err) {
        console.error('Sentra-X: caregiver link check failed:', err.message);
        // Fail safe: a Firestore hiccup here should never lock a real
        // patient out of their own app — fall through to normal flow.
        loadPatientFlow();
      });

      function loadPatientFlow() {
        window.loadFromFirestore(user.uid).then(function() {
          const onboarding = document.getElementById('onboarding-overlay');
          if (onboarding) {
            onboarding.style.display = localStorage.getItem('userName') ? 'none' : 'flex';
          }
          if (typeof window.refreshAllUI === 'function') {
            window.refreshAllUI();
          } else {
            console.warn('Sentra-X: refreshAllUI() not found — check that script.js loaded before auth.js.');
          }
          // Re-sync the push subscription now that auth is actually
          // confirmed. The old call for this lived at the top level of
          // script.js, which runs the instant that file is parsed —
          // before auth.js has even attached this listener, let alone
          // before Firebase has restored the session. That meant
          // firebase.auth().currentUser was guaranteed null every time,
          // so syncToFirestore() inside ensurePushSubscription() silently
          // no-opped on every single run — pushSubscription never once
          // reached Firestore. Calling it here, after auth is confirmed,
          // is what actually lets it save.
          if (typeof window.ensurePushSubscription === 'function') {
            window.ensurePushSubscription();
          }
          maybeOfferQuickUnlockEnroll();
          updateHomeQuickUnlockCard();
        });
      }
    } else {
      console.log('Sentra-X: auth state -> logged out');
      if (typeof window.hideCaregiverMode === 'function') window.hideCaregiverMode();
      window.showAuthScreen();
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding) onboarding.style.display = 'none';
    }
  });
})();
