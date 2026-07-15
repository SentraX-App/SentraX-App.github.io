import { auth, db } from "./firebase.js";

import {

createUserWithEmailAndPassword,

signInWithEmailAndPassword,

sendPasswordResetEmail,

onAuthStateChanged

}

from

"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

doc,

setDoc

}

from

"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



// SIGN UP

const signupForm = document.getElementById("signupForm");


if(signupForm){

signupForm.addEventListener("submit", async(e)=>{

e.preventDefault();


const name =
document.getElementById("signupName").value;


const email =
document.getElementById("signupEmail").value;


const password =
document.getElementById("signupPassword").value;


const confirm =
document.getElementById("confirmPassword").value;



if(password !== confirm){

alert("Passwords do not match");

return;

}


try{


const userCredential =
await createUserWithEmailAndPassword(
auth,
email,
password
);


const user =
userCredential.user;



await setDoc(
doc(db,"users",user.uid),
{

name:name,

email:email,

created:
new Date(),

healthScore:0,

medications:[],

vitals:[]

}

);



alert("Welcome to Sentra-X!");

window.location.href="index.html";


}

catch(error){

alert(error.message);

}


});

}





// LOGIN

const loginForm =
document.getElementById("loginForm");


if(loginForm){

loginForm.addEventListener("submit",async(e)=>{

e.preventDefault();


const email =
document.getElementById("loginEmail").value;


const password =
document.getElementById("loginPassword").value;



try{


await signInWithEmailAndPassword(

auth,

email,

password

);



window.location.href="index.html";


}

catch(error){

alert(error.message);

}


});

}





// PASSWORD RESET


const forgot =
document.getElementById("forgotPassword");


if(forgot){

forgot.onclick = async()=>{


const email =
prompt(
"Enter your email address"
);


if(email){

await sendPasswordResetEmail(
auth,
email
);


alert(
"Password reset email sent"
);


}


};


}



// CHECK LOGIN STATE


onAuthStateChanged(auth,(user)=>{


if(user){

console.log(
"Logged in:",
user.email
);

}


});
