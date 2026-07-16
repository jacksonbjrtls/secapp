import fs from 'fs';
import path from 'path';

function calculateHash(email) {
  let hash = 2166136261;
  const emailLower = email.toLowerCase().trim();
  for (let i = 0; i < emailLower.length; i++) {
    hash ^= emailLower.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'hash_' + (hash >>> 0).toString(16);
}

async function run() {
  console.log("=== REST HASH TEST START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const databaseId = firebaseConfig.firestoreDatabaseId;

  const email = "julio.arsenio@eldoradobrasil.com.br";
  const hash = calculateHash(email);

  console.log(`Email: ${email} -> Hash: ${hash}`);

  const candidates = [
    email,
    hash,
    hash.toUpperCase(),
    email.toUpperCase()
  ];

  for (const docId of candidates) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${docId}?key=${apiKey}`;
    console.log(`Checking Doc ID: "${docId}"...`);
    try {
      const res = await fetch(url);
      console.log(`  Status Code: ${res.status}`);
      if (res.status === 200) {
        const data = await res.json();
        console.log(`  🎉 SUCCESS! Found document content:`, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error(`  Error checking "${docId}":`, err);
    }
  }

  console.log("=== REST HASH TEST END ===");
}

run();
