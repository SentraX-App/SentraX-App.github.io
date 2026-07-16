import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let checked = false;

onAuthStateChanged(auth, (user) => {

  if (user) {

    console.log("User authenticated:", user.email);

  } else {

    if (checked) {
      window.location.replace("auth.html");
    }

  }

  checked = true;

});
