/**
 * Cryptographic Utility for Eldorado SST App
 * Supports secure, performant, asynchronous encryption and decryption of sensitive fields (PII).
 * Uses robust AES-256-GCM based on the native Web Crypto API (window.crypto.subtle).
 * Ensures data is encrypted before being stored in Firestore, and decrypted on read.
 * 
 * Progressive encryption feature:
 * - If a string starts with '__ENC_GCM__', it is decrypted using AES-256-GCM.
 * - If a string starts with '__ENC__', it is decrypted using legacy RC4 (backward compatibility).
 * - Otherwise, it is returned as-is.
 */

// Helper to convert Uint8Array to Base64
const arrayToBase64 = (arr: Uint8Array): string => {
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
};

// Helper to convert Base64 to Uint8Array
const base64ToArray = (str: string): Uint8Array => {
  const binary = atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Legacy RC4 decrypter for backward compatibility fallback
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

const legacyBase64ToUtf8 = (str: string): string => {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c: string) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
};

const decryptLegacyRc4 = (value: string): string => {
  try {
    const payloadRaw = value.substring(7); // Remove '__ENC__'
    const payload = legacyBase64ToUtf8(payloadRaw);
    
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return value;
    
    const salt = payload.substring(0, colonIndex);
    const encryptedBase64 = payload.substring(colonIndex + 1);
    
    const encryptedData = legacyBase64ToUtf8(encryptedBase64);
    
    const tryDecryptWithKey = (k: string): string => {
      const saltedKey = k + salt;
      return legacyRc4(saltedKey, encryptedData);
    };

    const envKey = (import.meta as any).env?.VITE_ENCRYPTION_KEY;
    let decrypted = '';

    // Helper to check if a string contains garbage chars
    const isGarbage = (str: string): boolean => {
      if (!str) return true;
      // Standard allowed characters in human names and emails (including Portuguese accents, @, dot, space, common punctuation)
      const allowedRegex = /^[a-zA-Z0-9\s@\.\-_'’áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]+$/;
      return !allowedRegex.test(str);
    };

    if (envKey) {
      decrypted = tryDecryptWithKey(envKey);
    }

    if (!envKey || isGarbage(decrypted)) {
      const fallbackDecrypted = tryDecryptWithKey('EldoradoSSTSecureKey2026');
      if (!isGarbage(fallbackDecrypted)) {
        decrypted = fallbackDecrypted;
      } else if (!decrypted) {
        decrypted = fallbackDecrypted;
      }
    }
    
    return decrypted || value;
  } catch (error) {
    console.error('[Crypto] Legacy Decryption error:', error);
    return value;
  }
};

let cachedCryptoKey: CryptoKey | null = null;

const getCryptoKey = async (): Promise<CryptoKey> => {
  if (cachedCryptoKey) return cachedCryptoKey;

  const secret = (import.meta as any).env?.VITE_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CRITICAL: A variável de ambiente VITE_ENCRYPTION_KEY não está definida no front-end!');
  }

  const keyBuffer = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
  
  cachedCryptoKey = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  return cachedCryptoKey;
};

/**
 * Encrypt a sensitive text value using AES-256-GCM
 */
export const encryptValue = async (value: string | null | undefined): Promise<string> => {
  if (!value) return '';
  const str = String(value).trim();
  
  // Already encrypted with GCM
  if (str.startsWith('__ENC_GCM__')) return str;
  // If it's legacy RC4, keep it as is or decrypt and re-encrypt? Let's treat it as plain text if we want to encrypt it.
  // Actually, if it starts with __ENC__, it's encrypted. Let's return it so we don't double-encrypt.
  if (str.startsWith('__ENC__')) return str; 

  try {
    const cryptoKey = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Standard 12 bytes IV for GCM
    const encodedValue = new TextEncoder().encode(str);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encodedValue
    );

    const ciphertext = new Uint8Array(ciphertextBuffer);
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);

    return `__ENC_GCM__${arrayToBase64(combined)}`;
  } catch (error) {
    console.error('[Crypto] AES-GCM Encryption error:', error);
    throw error; // Let it throw so the user knows if VITE_ENCRYPTION_KEY is missing/invalid
  }
};

/**
 * Decrypt an encrypted value (supports AES-256-GCM and fallback to legacy RC4)
 */
export const decryptValue = async (value: string | null | undefined): Promise<string> => {
  if (!value) return '';
  const str = String(value).trim();

  // 1. Decrypt AES-GCM
  if (str.startsWith('__ENC_GCM__')) {
    try {
      const cryptoKey = await getCryptoKey();
      const rawPayload = str.substring(11); // Remove '__ENC_GCM__'
      const combined = base64ToArray(rawPayload);

      if (combined.length < 12) {
        throw new Error('Payload criptografado corrompido (tamanho insuficiente para IV)');
      }

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      console.error('[Crypto] AES-GCM Decryption error:', error);
      return str; // Return original value as fallback
    }
  }

  // 2. Fallback to legacy RC4 decryption
  if (str.startsWith('__ENC__')) {
    return decryptLegacyRc4(str);
  }

  // 3. Not encrypted, return as-is
  return str;
};

/**
 * Deterministic hash for email field searching
 * Allows querying encrypted emails in Firestore without exposing the email itself in plaintext.
 */
export const hashEmailForSearch = (email: string | null | undefined): string => {
  if (!email) return '';
  const cleanEmail = email.toLowerCase().trim();
  
  // Simple FNV-1a hash algorithm (32-bit) converted to hex
  let hash = 2166136261;
  for (let i = 0; i < cleanEmail.length; i++) {
    hash ^= cleanEmail.charCodeAt(i);
    // Multiply by FNV prime 16777619, handling 32-bit integer overflow in JS
    hash = Math.imul(hash, 16777619);
  }
  return 'hash_' + (hash >>> 0).toString(16);
};
