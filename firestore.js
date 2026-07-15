import { db } from "./firebase.js";

import {
doc,
getDoc,
setDoc,
updateDoc,
arrayUnion
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth } from "./firebase.js";


// Get current user document

function getUserRef(){

const user = auth.currentUser;

if(!user) return null;

return doc(db,"users",user.uid);

}



// Save health data

export async function saveHealthData(data){

const ref = getUserRef();

if(!ref) return;


await setDoc(
ref,
data,
{
merge:true
}
);

}



// Load health data

export async function loadHealthData(){

const ref = getUserRef();

if(!ref) return null;


const snapshot = await getDoc(ref);


if(snapshot.exists()){

return snapshot.data();

}


return null;

}



// Add blood pressure reading

export async function saveVital(vital){

const ref=getUserRef();

if(!ref)return;


await updateDoc(
ref,
{

vitals:
arrayUnion(vital)

}

);

}



// Save medication list

export async function saveMedications(meds){

await saveHealthData({

medications:meds

});

}



// Save caregiver

export async function saveCaregiverData(data){

await saveHealthData({

caregiver:data

});

}
