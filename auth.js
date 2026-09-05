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

  window.signUp = function() {
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) { console.error('Sentra-X: auth form elements missing from page.'); return; }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';

    if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }
const consentEl = document.getElementById('auth-consent');
    if (consentEl && !consentEl.checked) { errorEl.textContent = 'Please agree to the Privacy Policy to create an account.'; return; }
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(function() { console.log('Sentra-X: sign up successful.'); })
      .catch(function(err) {
        console.error('Sentra-X sign up error:', err.code, err.message);
        errorEl.textContent = err.message;
      });
  };

  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

  window.logIn = function() {
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) { console.error('Sentra-X: auth form elements missing from page.'); return; }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';

    if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }

    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(function() { console.log('Sentra-X: log in successful.'); })
      .catch(function(err) {
        console.error('Sentra-X log in error:', err.code, err.message);
        errorEl.textContent = err.message;
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
