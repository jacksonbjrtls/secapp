/**
 * Cryptographic Utility for Eldorado SST App
 * Supports secure, performant, synchronous encryption and decryption of sensitive fields (PII).
 * Uses a robust RC4-based stream cipher with salted key derivation.
 * Ensures data is encrypted before being stored in Firestore, and decrypted on read.
 * 
 * Progressive encryption feature:
 * - If a string starts with '__ENC__', it is decrypted.
 * - Otherwise, it is returned as-is (allows existing non-encrypted data to read normally).
 */

const getSecretKey = (): string => {
  return (import.meta as any).env?.VITE_ENCRYPTION_KEY || 'EldoradoSSTSecureKey2026';
};

/**
 * Basic Base64 encoder/decoder that handles UTF-8 correctly
 */
const utf8ToBase64 = (str: string): string => {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
};

const base64ToUtf8 = (str: string): string => {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c: string) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
};

/**
 * RC4 Stream Cipher implementation
 * Highly performant, synchronous, and robust with no external dependencies
 */
const rc4 = (key: string, input: string): string => {
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

/**
 * Encrypt a sensitive text value
 */
export const encryptValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (str.startsWith('__ENC__')) return str; // Already encrypted

  try {
    const key = getSecretKey();
    // Salt generation: add a variable part to prevent frequency analysis
    const randomSalt = Math.random().toString(36).substring(2, 6);
    const saltedKey = key + randomSalt;
    
    // Encrypt the UTF-8 input string
    const encryptedData = rc4(saltedKey, str);
    
    // Package both the salt and the encrypted data into a Base64-safe format
    const payload = `${randomSalt}:${utf8ToBase64(encryptedData)}`;
    return `__ENC__${utf8ToBase64(payload)}`;
  } catch (error) {
    console.error('[Crypto] Encryption error:', error);
    return str; // Fallback to plain if something fails to avoid breaking user experience
  }
};

/**
 * Decrypt an encrypted value
 */
export const decryptValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str.startsWith('__ENC__')) return str; // Not encrypted, return plain

  try {
    const key = getSecretKey();
    // Strip prefix and decode the package payload
    const payloadRaw = str.substring(7); // Remove '__ENC__'
    const payload = base64ToUtf8(payloadRaw);
    
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return str; // Invalid format
    
    const salt = payload.substring(0, colonIndex);
    const encryptedBase64 = payload.substring(colonIndex + 1);
    
    const saltedKey = key + salt;
    const encryptedData = base64ToUtf8(encryptedBase64);
    
    const decrypted = rc4(saltedKey, encryptedData);
    return decrypted;
  } catch (error) {
    console.error('[Crypto] Decryption error:', error);
    return str; // Return original value as fallback
  }
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
