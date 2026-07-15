import { auth } from "./firebase.js";

import {
onAuthStateChanged
} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


onAuthStateChanged(auth, (user)=>{

    console.log("Auth check:", user);

    if(!user){

        window.location.href = "auth.html";

    } else {

        console.log("User logged in:", user.email);

    }

});
