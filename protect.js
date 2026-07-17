import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

onAuthStateChanged(auth, (user) => {

  // Already on login page?
  if (window.location.pathname.includes("auth.html")) {
    return;
  }

  // Not logged in
  if (!user) {
    window.location.replace("auth.html");
    return;
  }

  console.log("Authenticated:", user.email);

});
