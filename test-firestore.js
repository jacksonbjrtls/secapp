import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

// Helper to decrypt legacy/GCM values
const decryptValueNode = (value) => {
  if (!value) return '';
  const str = String(value).trim();

  if (str.startsWith('__ENC_GCM__')) {
    try {
      const secret = process.env.VITE_ENCRYPTION_KEY || 'EldoradoSSTSecureKey2026';
      const rawPayload = str.substring(11);
      const combined = Buffer.from(rawPayload, 'base64');
      if (combined.length < 12) return str;
      const iv = combined.subarray(0, 12);
      const ciphertextAndAuthTag = combined.subarray(12);
      if (ciphertextAndAuthTag.length < 16) return str;
      const ciphertext = ciphertextAndAuthTag.subarray(0, ciphertextAndAuthTag.length - 16);
      const authTag = ciphertextAndAuthTag.subarray(ciphertextAndAuthTag.length - 16);

      const tryDecrypt = (secretKey) => {
        const keyHash = crypto.createHash('sha256').update(secretKey).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      };

      try {
        return tryDecrypt(secret);
      } catch (err) {
        if (secret !== 'EldoradoSSTSecureKey2026') {
          try {
            return tryDecrypt('EldoradoSSTSecureKey2026');
          } catch (fallbackErr) {}
        }
        throw err;
      }
    } catch (error) {
      return str;
    }
  }

  if (str.startsWith('__ENC__')) {
    try {
      const payloadRaw = str.substring(7);
      const payload = Buffer.from(payloadRaw, 'base64').toString('utf8');
      const colonIndex = payload.indexOf(':');
      if (colonIndex === -1) return str;
      const salt = payload.substring(0, colonIndex);
      const encryptedBase64 = payload.substring(colonIndex + 1);
      const encryptedData = Buffer.from(encryptedBase64, 'base64').toString('binary');

      const rc4Decrypt = (key, input) => {
        const s = new Uint8Array(256);
        for (let i = 0; i < 256; i++) s[i] = i;
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
          output += String.fromCharCode(input.charCodeAt(k) ^ keystreamByte);
        }
        return output;
      };

      const tryDecryptWithKey = (k) => {
        const saltedKey = k + salt;
        return rc4Decrypt(saltedKey, encryptedData);
      };

      const envKey = process.env.VITE_ENCRYPTION_KEY;
      let decrypted = '';
      const isGarbage = (sVal) => {
        if (!sVal) return true;
        const allowedRegex = /^[a-zA-Z0-9\s@\.\-_'’áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]+$/;
        return !allowedRegex.test(sVal);
      };

      if (envKey) decrypted = tryDecryptWithKey(envKey);
      if (!envKey || isGarbage(decrypted)) {
        const fallbackDecrypted = tryDecryptWithKey('EldoradoSSTSecureKey2026');
        if (!isGarbage(fallbackDecrypted)) {
          decrypted = fallbackDecrypted;
        } else if (!decrypted) {
          decrypted = fallbackDecrypted;
        }
      }
      return decrypted || str;
    } catch (err) {
      return str;
    }
  }

  return str;
};

async function run() {
  console.log("=== FIRESTORE DIAGNOSTIC START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId;

  console.log("Config Project ID:", projectId);
  console.log("Config Database ID:", databaseId);

  try {
    initializeApp({ projectId });
    const db = getFirestore(undefined, databaseId);
    console.log("Admin SDK initialized. Attempting to list collections...");
    
    const collections = await db.listCollections();
    console.log("Successfully fetched collections list:", collections.map(c => c.id));

    console.log("\nAttempting to query 'users' collection...");
    const usersSnap = await db.collection('users').limit(10).get();
    console.log(`Successfully fetched ${usersSnap.size} user documents.`);

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const rawEmail = data.email;
      const decryptedEmail = decryptValueNode(rawEmail);
      console.log(`Document ID: ${doc.id}`);
      console.log(`  Raw Email: ${rawEmail}`);
      console.log(`  Decrypted Email: ${decryptedEmail}`);
      console.log(`  EmailHash: ${data.emailHash}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Role: ${data.role}`);
    }
  } catch (error) {
    console.error("DIAGNOSTIC ERROR ENCOUNTERED:", error);
  }
  console.log("=== FIRESTORE DIAGNOSTIC END ===");
}

run();
