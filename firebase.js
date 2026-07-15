// Sentra-X Firebase Configuration
// Firebase Modular SDK


import { initializeApp } from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


import { 
getAuth,
setPersistence,
browserLocalPersistence
} from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {
getFirestore
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



// Your Firebase Configuration

const firebaseConfig = {

apiKey: "AIzaSyCHeWvZzGZVa79m2JvvpkX5Xlvmj8vpdPc",

authDomain: "sentra-x.firebaseapp.com",

projectId: "sentra-x",

storageBucket: "sentra-x.firebasestorage.app",

messagingSenderId: "5654480364",

appId: "1:5654480364:web:bd6dbe766a1c46edb66cc9"

};



// Initialize Firebase

const app = initializeApp(firebaseConfig);



// Authentication

const auth = getAuth(app);


// Keep users signed in after refresh

const auth = getAuth(app);

await setPersistence(auth, browserLocalPersistence);

console.log("Firebase persistence enabled");
.catch((error)=>{

console.error(
"Persistence error:",
error
);

});



// Database

const db = getFirestore(app);



// Export

export { auth, db };
