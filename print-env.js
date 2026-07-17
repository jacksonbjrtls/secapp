import dotenv from 'dotenv';
dotenv.config();

console.log("=== ENVIRONMENT VARIABLES ===");
for (const key of Object.keys(process.env)) {
  if (key.includes("FIREBASE") || key.includes("GOOGLE") || key.includes("GCP") || key.includes("KEY") || key.includes("SECRET") || key.includes("AUTH")) {
    console.log(`${key}: ${process.env[key]}`);
  }
}
console.log("=============================");
