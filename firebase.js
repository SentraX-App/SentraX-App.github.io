import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHeWvZzGZVa79m2JvvpkX5Xlvmj8vpdPc",
  authDomain: "sentra-x.firebaseapp.com",
  projectId: "sentra-x",
  storageBucket: "sentra-x.firebasestorage.app",
  messagingSenderId: "5654480364",
  appId: "1:5654480364:web:bd6dbe766a1c46edb66cc9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .then(() => console.log("Firebase ready"))
  .catch(console.error);

export const db = getFirestore(app);
