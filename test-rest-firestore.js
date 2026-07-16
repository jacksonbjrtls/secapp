import fs from 'fs';
import path from 'path';

async function run() {
  console.log("=== REST FIRESTORE TEST START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const databaseId = firebaseConfig.firestoreDatabaseId;

  // Let's test checking for julio.arsenio@eldoradobrasil.com.br
  const emailToCheck = "julio.arsenio@eldoradobrasil.com.br";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${emailToCheck}?key=${apiKey}`;

  console.log("Requesting URL:", url);

  try {
    const res = await fetch(url);
    console.log("Status Code:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Fetch Error:", error);
  }
  console.log("=== REST FIRESTORE TEST END ===");
}

run();
