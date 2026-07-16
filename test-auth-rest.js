import fs from 'fs';
import path from 'path';

async function run() {
  console.log("=== REST AUTH TEST START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const apiKey = firebaseConfig.apiKey;

  const emailToCheck = "julio.arsenio@eldoradobrasil.com.br";
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`;

  console.log("Requesting Auth URI for:", emailToCheck);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: emailToCheck,
        continueUri: "http://localhost/"
      })
    });
    console.log("Status Code:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Fetch Error:", error);
  }
  console.log("=== REST AUTH TEST END ===");
}

run();
