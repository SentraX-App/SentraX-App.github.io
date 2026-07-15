import { auth } from "./firebase.js";

import {
onAuthStateChanged
} from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


onAuthStateChanged(auth, (user)=>{

if(user){

console.log("User logged in:", user.email);

}else{

window.location.href="auth.html";

}

});
