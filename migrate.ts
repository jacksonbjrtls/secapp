import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// 1. Setup Firebase Admin Config
let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error("Erro ao ler firebase-applet-config.json:", err);
  }
}

const projectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error("❌ ERRO CRÍTICO: FIREBASE_PROJECT_ID não foi definido!");
  process.exit(1);
}

const encryptionKey = process.env.VITE_ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("❌ ERRO CRÍTICO: VITE_ENCRYPTION_KEY não está configurada no seu arquivo .env!");
  process.exit(1);
}

// Initialize Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: projectId,
  });
}

const db = getFirestore(undefined, firebaseConfig.firestoreDatabaseId || "(default)");

// 2. Cryptographic helpers
const legacyRc4 = (key: string, input: string): string => {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
  let i = 0;
  j = 0;
  let output = '';
  for (let k = 0; k < input.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    const keystreamByte = s[(s[i] + s[j]) % 256];
    const cipherByte = input.charCodeAt(k) ^ keystreamByte;
    output += String.fromCharCode(cipherByte);
  }
  return output;
};

const decryptLegacyRc4 = (value: string, key: string): string => {
  try {
    const payloadRaw = value.substring(7); // Remove '__ENC__'
    const payload = Buffer.from(payloadRaw, 'base64').toString('utf8');
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return value;
    const salt = payload.substring(0, colonIndex);
    const encryptedBase64 = payload.substring(colonIndex + 1);
    const saltedKey = key + salt;
    const encryptedData = Buffer.from(encryptedBase64, 'base64').toString('utf8');
    return legacyRc4(saltedKey, encryptedData);
  } catch (error) {
    console.error('Erro de decodificação RC4 legada:', error);
    return value;
  }
};

const encryptAESGCM = (value: string, secretKey: string): string => {
  try {
    const iv = crypto.randomBytes(12); // Standard 12-byte IV for AES-GCM
    const hashedKey = crypto.createHash("sha256").update(secretKey).digest();
    
    const cipher = crypto.createCipheriv("aes-256-gcm", hashedKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16-byte authentication tag
    
    const combined = Buffer.concat([iv, encrypted, tag]);
    return `__ENC_GCM__${combined.toString("base64")}`;
  } catch (error) {
    console.error("Erro na criptografia AES-GCM:", error);
    throw error;
  }
};

// 3. Collection Migration Processors
async function migrateCollection(collectionName: string, fields: string[]) {
  console.log(`\n📦 Iniciando migração para a coleção: "${collectionName}"...`);
  const snapshot = await db.collection(collectionName).get();
  
  if (snapshot.empty) {
    console.log(`ℹ️ Coleção "${collectionName}" vazia. Nenhum registro para migrar.`);
    return;
  }

  console.log(`Encontrados ${snapshot.size} documentos na coleção "${collectionName}". Analisando campos: [${fields.join(", ")}]`);
  
  let migratedCount = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let updated = false;
    const updates: Record<string, any> = {};

    for (const field of fields) {
      const val = data[field];
      if (val && typeof val === "string" && val.startsWith("__ENC__") && !val.startsWith("__ENC_GCM__")) {
        // Decrypt legacy RC4
        const plaintext = decryptLegacyRc4(val, encryptionKey!);
        // Encrypt robust AES-GCM
        const encryptedNew = encryptAESGCM(plaintext, encryptionKey!);
        updates[field] = encryptedNew;
        updated = true;
      }
    }

    if (updated) {
      batch.update(doc.ref, updates);
      migratedCount++;
      batchSize++;

      if (batchSize >= 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
        console.log(`💾 Lote commitado. Total migrado até agora nesta coleção: ${migratedCount}`);
      }
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  console.log(`✅ Coleção "${collectionName}" migrada! Documentos modificados: ${migratedCount}/${snapshot.size}`);
}

// 4. Main script execution
async function runMigration() {
  console.log("🚀 ==================================================================== 🚀");
  console.log("🚀 INICIANDO SCRIPT DE MIGRAÇÃO DE CRIPTOGRAFIA (RC4 -> AES-256-GCM) 🚀");
  console.log("🚀 ==================================================================== 🚀");
  
  try {
    // Migrate users collection
    await migrateCollection("users", ["email", "displayName"]);

    // Migrate dds_signatures collection
    await migrateCollection("dds_signatures", ["userName"]);

    // Migrate quality_checklist_submissions collection
    await migrateCollection("quality_checklist_submissions", ["userName"]);

    // Migrate quality_checklist_omissions collection
    await migrateCollection("quality_checklist_omissions", ["userName"]);

    console.log("\n🎉 ==================================================================== 🎉");
    console.log("🎉 MIGRAÇÃO DE SEGURANÇA E CRIPTOGRAFIA CONCLUÍDA COM SUCESSO! 🎉");
    console.log("🎉 ==================================================================== 🎉");
  } catch (error) {
    console.error("❌ Ocorreu um erro catastrófico durante a migração:", error);
    process.exit(1);
  }
}

runMigration();
