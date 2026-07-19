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

  window.signUp = function() {
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) { console.error('Sentra-X: auth form elements missing from page.'); return; }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.textContent = '';

    if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(function() { console.log('Sentra-X: sign up successful.'); })
      .catch(function(err) {
        console.error('Sentra-X sign up error:', err.code, err.message);
        errorEl.textContent = err.message;
      });
  };

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
      });
    } else {
      console.log('Sentra-X: auth state -> logged out');
      window.showAuthScreen();
      const onboarding = document.getElementById('onboarding-overlay');
      if (onboarding) onboarding.style.display = 'none';
    }
  });
})();
