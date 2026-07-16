import { db, auth } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function getUserRef() {

  const user = auth.currentUser;

  if (!user) {
    throw new Error("User not logged in.");
  }

  return doc(db, "users", user.uid);

}

// Save any user data
export async function saveHealthData(data) {

  const ref = getUserRef();

  await setDoc(ref, data, {
    merge: true
  });

}

// Load user document
export async function loadHealthData() {

  const ref = getUserRef();

  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data();
  }

  return {};

}

// Save one vital
export async function saveVital(vital) {

  const ref = getUserRef();

  await updateDoc(ref, {
    vitals: arrayUnion(vital)
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
