import fs from 'fs';
import path from 'path';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

async function run() {
  console.log("=== SEARCHING FOR JULIO START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  try {
    const snap = await getDocs(collection(db, "users"));
    console.log(`Searching through ${snap.size} documents...\n`);
    
    let found = false;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const rawEmail = String(data.email || "");
      const docId = doc.id;
      
      if (docId.toLowerCase().includes("julio") || rawEmail.toLowerCase().includes("julio")) {
        console.log(`MATCH FOUND:`);
        console.log(`  Document ID: "${docId}"`);
        console.log(`  Raw Email in Firestore: "${rawEmail}"`);
        console.log(`  EmailHash: "${data.emailHash || ''}"`);
        console.log(`  Role: "${data.role || ''}"`);
        console.log(`  Status: "${data.status || ''}"`);
        found = true;
      }
    });

    if (!found) {
      console.log("No user matching 'julio' was found in the database!");
    }
  } catch (err) {
    console.error("Error matching julio:", err);
  }
  console.log("=== SEARCHING FOR JULIO END ===");
}

run();
