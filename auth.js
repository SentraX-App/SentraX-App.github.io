import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =====================
// SIGN UP
// =====================

const signupForm = document.getElementById("signupForm");

if (signupForm) {

  signupForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (password !== confirm) {
      alert("Passwords do not match.");
      return;
    }

    try {

      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(cred.user, {
        displayName: name
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email,
        onboardingComplete: false,
        medications: [],
        vitals: [],
        caregiver: {},
        waterLogs: {},
        created: new Date()
      });

      window.location.replace("index.html");

    } catch (err) {

      alert(err.message);

    }

  });

}


// =====================
// LOGIN
// =====================

const loginForm = document.getElementById("loginForm");

if (loginForm) {

  loginForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      window.location.replace("index.html");

    } catch (err) {

      alert(err.message);

    }

  });

}


// =====================
// RESET PASSWORD
// =====================

const forgot = document.getElementById("forgotPassword");

if (forgot) {

  forgot.onclick = async () => {

    const email = prompt("Enter your email");

    if (!email) return;

    try {

      await sendPasswordResetEmail(auth, email);

      alert("Password reset email sent.");

    } catch (err) {

      alert(err.message);

    }

  };

}
