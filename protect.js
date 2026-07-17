import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

onAuthStateChanged(auth, (user) => {

  if (!user) {
    window.location.replace("auth.html");
    return;
  }

  console.log("Authenticated:", user.email);

});
