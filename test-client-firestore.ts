import fs from 'fs';
import path from 'path';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, limit } from "firebase/firestore";

async function run() {
  console.log("=== CLIENT FIRESTORE TEST START ===");
  const firebaseConfig = {
    apiKey: "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA",
    authDomain: "gen-lang-client-0972067932.firebaseapp.com",
    projectId: "gen-lang-client-0972067932",
    storageBucket: "gen-lang-client-0972067932.firebasestorage.app",
    messagingSenderId: "328642603761",
    appId: "1:328642603761:web:62d4a334ccd5524ba71750",
  };
  const firestoreDatabaseId = "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app, firestoreDatabaseId);

  const testEmails = [
    'jacksonbjr@gmail.com',
    'jackson.junior@eldoradobrasil.com.br',
    'jackson.junior@eldoradobrasil.com'
  ];

  const testPasswords = ['Mudarsenha123', 'Mudar@123'];

  let signedIn = false;
  for (const email of testEmails) {
    for (const password of testPasswords) {
      console.log(`Trying to sign in with: ${email} / ${password}...`);
      try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log(`🎉 SIGN IN SUCCESSFUL for ${email}!`);
        signedIn = true;
        break;
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
      }
    }
    if (signedIn) break;
  }

  if (!signedIn) {
    console.error("Could not sign in with any master account credentials.");
    return;
  }

  try {
    console.log("Attempting to list users collection from client-side...");
    const snap = await getDocs(collection(db, "users"));
    console.log(`Found ${snap.size} user documents!`);
    
    snap.docs.forEach(doc => {
      console.log(`Doc ID: "${doc.id}" ->`, doc.data());
    });
  } catch (err) {
    console.error("Error reading users:", err);
  }

  console.log("=== CLIENT FIRESTORE TEST END ===");
}

run();
