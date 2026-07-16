import { db, auth } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}


async function getUserRef() {

  const user = auth.currentUser || await getCurrentUser();

  if (!user) {
    throw new Error("User not logged in.");
  }

  return doc(db, "users", user.uid);
}


// Save any user data
export async function saveHealthData(data) {

  const ref = await getUserRef();

  await setDoc(ref, data, {
    merge: true
  });

}


// Load user document
export async function loadHealthData() {

  const ref = await getUserRef();

  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data();
  }

  return {};

}


// Save one vital
export async function saveVital(vital) {

  const ref = await getUserRef();

  try {

  await updateDoc(ref, {
    vitals: arrayUnion(vital)
  });

} catch {

  await setDoc(ref, {
    vitals: [vital]
  }, {
    merge: true
  });

  }


// Save medications
export async function saveMedications(medications) {

  await saveHealthData({
    medications
  });

}


// Save caregiver
export async function saveCaregiverData(caregiver) {

  await saveHealthData({
    caregiver
  });

}
// Save everything at once
export async function syncHealthData(data) {

  const ref = await getUserRef();

  await setDoc(ref, data, {
    merge: true
  });

}
