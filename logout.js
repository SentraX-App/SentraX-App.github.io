import { auth } from "./firebase.js";

import {
signOut
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const button = document.getElementById("logoutBtn");


if(button){

button.onclick = async()=>{

try{

await signOut(auth);

localStorage.clear();
sessionStorage.clear();

window.location.href = "auth.html";

}

catch(error){

alert(error.message);

}

};

}
