import { auth, db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function userRef() {

  const user = auth.currentUser;

  if (!user) {
    throw new Error("User not authenticated");
  }

  return doc(db, "users", user.uid);

}

// Load entire user document
export async function loadHealthData() {

  const ref = await userRef();

  const snap = await getDoc(ref);

  return snap.exists() ? snap.data() : {};

}

// Save any fields
export async function saveHealthData(data) {

  const ref = await userRef();

  await setDoc(ref, data, {
    merge: true
  });

}

// Save one BP reading
export async function saveVital(vital) {

  const ref = await userRef();

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

}

// Save medications
export async function saveMedications(medications) {

  await saveHealthData({
    medications
  });

}

// Save caregiver
export async function saveCaregiver(caregiver) {

  await saveHealthData({
    caregiver
  });

}

// Save water
export async function saveWaterLogs(waterLogs) {

  await saveHealthData({
    waterLogs
  });

}
