import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
console.log({
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  NODE_ENV: process.env.NODE_ENV,
  hasConfigJson: fs.existsSync('firebase-applet-config.json')
});

