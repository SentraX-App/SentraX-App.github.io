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
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    hideAuthScreen();
  } else {
    showAuthScreen();
  }
});
