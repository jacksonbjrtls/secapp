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

      const keysToTry = [
        process.env.VITE_ENCRYPTION_KEY,
        'Js29082011@',
        'EldoradoSSTSecureKey2026',
        'EldoradoMaster@2026'
      ].filter(Boolean);

      for (const k of keysToTry) {
        try {
          const res = tryDecrypt(k);
          if (res) {
            console.log(`[Diagnostic] Decrypted successfully using key: "${k}"`);
            return res;
          }
        } catch (err) {
          // ignore
        }
      }
      return str;
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
  console.log("=== CLIENT LISTING START ===");
  const firebaseConfig = {
    apiKey: "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA",
    authDomain: "gen-lang-client-0972067932.firebaseapp.com",
    projectId: "gen-lang-client-0972067932",
    storageBucket: "gen-lang-client-0972067932.firebasestorage.app",
    messagingSenderId: "328642603761",
    appId: "1:328642603761:web:62d4a334ccd5524ba71750",
  };
  const firestoreDatabaseId = "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firestoreDatabaseId);

  try {
    const snap = await getDocs(collection(db, "users"));
    console.log(`Found ${snap.size} user documents!\n`);
    
    snap.docs.forEach((doc, index) => {
      const data = doc.data();
      const rawEmail = data.email || "";
      const rawDisplayName = data.displayName || "";
      const emailHash = data.emailHash || "";
      const role = data.role || "";
      const status = data.status || "";

      const decryptedEmail = decryptValueNode(rawEmail);
      const decryptedName = decryptValueNode(rawDisplayName);

      console.log(`[User #${index + 1}]`);
      console.log(`  Document ID: "${doc.id}"`);
      console.log(`  Decrypted Email: "${decryptedEmail}"`);
      console.log(`  Decrypted Name: "${decryptedName}"`);
      console.log(`  EmailHash: "${emailHash}"`);
      console.log(`  Role: "${role}"`);
      console.log(`  Status: "${status}"`);
      console.log(`  Raw Email: "${rawEmail}"`);
      console.log("------------------------------------------");
    });
  } catch (err) {
    console.error("Error fetching users:", err);
  }
  console.log("=== CLIENT LISTING END ===");
}

run();
