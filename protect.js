import { auth } from "./firebase.js";

import {
onAuthStateChanged
} from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


onAuthStateChanged(auth, (user)=>{

if(user){

console.log("Authenticated:", user.email);

}else{

console.log("No user found");

window.location.href="auth.html";

}

});
