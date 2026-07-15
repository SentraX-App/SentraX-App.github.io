import { auth, db } from "./firebase.js";

import {
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
doc,
getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


onAuthStateChanged(auth, async (user)=>{

if(!user){

window.location.href="auth.html";
return;

}


// Check user profile

const userRef = doc(db, "users", user.uid);

const userSnap = await getDoc(userRef);


if(!userSnap.exists()){

// New user
// Allow onboarding page

localStorage.removeItem("userName");

document.body.style.display = "block";

}else{

// Existing user
// Load profile

const data = userSnap.data();

localStorage.setItem("userName", data.name || "");

localStorage.setItem("userCondition", data.condition || "");

}

});
