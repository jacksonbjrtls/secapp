import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { User } from 'firebase/auth';
import { decryptValue } from './crypto';

/**
 * Records a successful login event in Firestore.
 * Always captures the browser's exact local time string to preserve the local login context.
 */
export async function recordUserLogin(user: User, customDisplayName?: string) {
  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    const localTimeStr = new Date().toLocaleString('pt-BR');

    let rawDisplayName = customDisplayName || user.displayName || user.email?.split('@')[0] || 'Usuário';
    let rawEmail = user.email?.toLowerCase() || '';

    // Decrypt if value was passed encrypted
    const decryptedName = await decryptValue(rawDisplayName);
    const decryptedEmail = await decryptValue(rawEmail);

    const logData = {
      userId: user.uid,
      email: decryptedEmail || rawEmail,
      displayName: decryptedName || rawDisplayName,
      timestamp: serverTimestamp(),
      userAgent: userAgent,
      localTimeStr: localTimeStr,
    };

    console.log('[LoginLogger] Recording successful login: ', logData.email);
    await addDoc(collection(db, 'user_login_logs'), logData);

    // Increment user access count in Firestore
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        accessCount: increment(1),
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch {
      // Ignore if user document is being created
    }
  } catch (err) {
    console.error('[LoginLogger] Error logging user sign-in: ', err);
    // Silent fail to ensure user is not blocked from utilizing the app in case log writing fails
  }
}
