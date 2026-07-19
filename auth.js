function showAuthScreen() {
  document.getElementById('auth-overlay').style.display = 'flex';
}
function hideAuthScreen() {
  document.getElementById('auth-overlay').style.display = 'none';
}
function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .catch(function(err) { errorEl.textContent = err.message; });
}
function logIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = 'Please enter both email and password.'; return; }
  firebase.auth().signInWithEmailAndPassword(email, password)
    .catch(function(err) { errorEl.textContent = err.message; });
}
function logOut() {
  firebase.auth().signOut();
}

function loadFromFirestore(uid) {
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
    }
  }).catch(function(err) {
    console.error('Firestore load failed:', err);
  });
}

firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    hideAuthScreen();
    loadFromFirestore(user.uid).then(function() {
      if (localStorage.getItem('userName')) {
        document.getElementById('onboarding-overlay').style.display = 'none';
      } else {
        document.getElementById('onboarding-overlay').style.display = 'flex';
      }
      if (typeof refreshAllUI === 'function') refreshAllUI();
    });
  } else {
    showAuthScreen();
    document.getElementById('onboarding-overlay').style.display = 'none';
  }
});
