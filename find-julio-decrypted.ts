import fs from 'fs';
import path from 'path';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import crypto from "crypto";

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
  console.log("=== DECRYPTED SEARCH FOR JULIO START ===");
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  try {
    const snap = await getDocs(collection(db, "users"));
    console.log(`Searching through ${snap.size} documents with decryption...\n`);
    
    let found = false;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const rawEmail = String(data.email || "");
      const decryptedEmail = decryptValueNode(rawEmail);
      const docId = doc.id;
      
      if (docId.toLowerCase().includes("julio") || decryptedEmail.toLowerCase().includes("julio")) {
        console.log(`MATCH FOUND:`);
        console.log(`  Document ID: "${docId}"`);
        console.log(`  Decrypted Email: "${decryptedEmail}"`);
        console.log(`  EmailHash: "${data.emailHash || ''}"`);
        console.log(`  Role: "${data.role || ''}"`);
        console.log(`  Status: "${data.status || ''}"`);
        console.log(`  Raw Email in DB: "${rawEmail}"`);
        console.log("------------------------------------------");
        found = true;
      }
    });

    if (!found) {
      console.log("No user matching 'julio' was found after decrypting all emails!");
    }
  } catch (err) {
    console.error("Error matching julio:", err);
  }
  console.log("=== DECRYPTED SEARCH FOR JULIO END ===");
}

run();
