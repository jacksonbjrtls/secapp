import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function test() {
  const serviceAccountEmail = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL || "";
  let extractedProject = "";
  if (serviceAccountEmail.includes("@")) {
    const domain = serviceAccountEmail.split("@")[1];
    extractedProject = domain.split(".")[0];
  }

  const projectsToTest = [
    extractedProject,
    "secapp-project-123",
    "gen-lang-client-0972067932",
  ].filter(Boolean);

  const databaseIdsToTest = [
    "ai-studio-secapp-0394a074-0ded-48a0-9733-51828b2a3a52",
    "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52",
    "(default)",
  ];

  console.log("Service Account:", serviceAccountEmail);
  console.log("Extracted Project:", extractedProject);

  for (const proj of projectsToTest) {
    for (const dbId of databaseIdsToTest) {
      console.log(`\nTesting Project: "${proj}", Database: "${dbId}"...`);
      try {
        // Clean up previous app if initialized
        const apps = getApps();
        for (const app of apps) {
          await deleteApp(app);
        }

        const app = initializeApp({ projectId: proj });
        const db = getFirestore(app, dbId === "(default)" ? undefined : dbId);
        
        // Try simple fetch
        const snapshot = await db.collection("users").limit(1).get();
        console.log(`✅ SUCCESS! Found ${snapshot.size} users.`);
        return; // Found a working configuration!
      } catch (err: any) {
        console.log(`❌ FAILED: ${err.message}`);
      }
    }
  }
}

test();
