import fs from 'fs';
import path from 'path';
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function run() {
  console.log("=== AUTH DIAGNOSTIC START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const projectId = firebaseConfig.projectId;

  try {
    initializeApp({ projectId });
    console.log("Admin SDK initialized. Attempting to get user by email...");
    const user = await getAuth().getUserByEmail("jacksonbjr@gmail.com");
    console.log("Success! Found user:", user.uid, user.email);
  } catch (error) {
    console.error("DIAGNOSTIC ERROR:", error);
  }
  console.log("=== AUTH DIAGNOSTIC END ===");
}

run();
