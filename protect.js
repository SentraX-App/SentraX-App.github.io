import { auth } from "./firebase.js";

import {
onAuthStateChanged
} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


onAuthStateChanged(auth, (user)=>{

if(user){

console.log("Logged in:", user.email);

} else {

console.log("No logged in user");

window.location.href = "auth.html";

}

});
