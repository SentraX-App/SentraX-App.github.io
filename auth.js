import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =========================
// SIGN UP
// =========================

const signupForm = document.getElementById("signupForm");

if (signupForm) {

  signupForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (password !== confirm) {
      alert("Passwords do not match");
      return;
    }

    try {

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      await updateProfile(user, {
        displayName: name
      });

      await setDoc(
        doc(db, "users", user.uid),
        {
          name: name,
          email: email,
          onboardingComplete: false,
          created: new Date(),
          healthScore: 0,
          medications: [],
          vitals: []
        }
      );

      // Clear old local data
      localStorage.clear();
      sessionStorage.clear();

      alert("Account created successfully!");

      window.location.replace("index.html");

    } catch (error) {

      alert(error.message);

    }

  });

}



// =========================
// LOGIN
// =========================

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

      // Clear previous user's cached data
      localStorage.clear();
      sessionStorage.clear();

      window.location.replace("index.html");

    } catch (error) {

      alert(error.message);

    }

  });

}



// =========================
// PASSWORD RESET
// =========================

const forgot = document.getElementById("forgotPassword");

if (forgot) {

  forgot.onclick = async () => {

    const email = prompt("Enter your email address");

    if (!email) return;

    try {

      await sendPasswordResetEmail(auth, email);

      alert("Password reset email sent.");

    } catch (error) {

      alert(error.message);

    }

  };

}



// =========================
// AUTH STATE
// =========================

onAuthStateChanged(auth, (user) => {

  if (user) {

    console.log("Logged in:", user.email);

  } else {

    console.log("No user logged in");

  }

});
