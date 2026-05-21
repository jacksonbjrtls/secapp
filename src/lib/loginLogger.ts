import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { User } from 'firebase/auth';

/**
 * Records a successful login event in Firestore.
 * Always captures the browser's exact local time string to preserve the local login context.
 */
export async function recordUserLogin(user: User, customDisplayName?: string) {
  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    const localTimeStr = new Date().toLocaleString('pt-BR');

    const logData = {
      userId: user.uid,
      email: user.email?.toLowerCase() || '',
      displayName: customDisplayName || user.displayName || user.email?.split('@')[0] || 'Usuário',
      timestamp: serverTimestamp(),
      userAgent: userAgent,
      localTimeStr: localTimeStr,
    };

    console.log('[LoginLogger] Recording successful login: ', logData.email);
    await addDoc(collection(db, 'user_login_logs'), logData);
  } catch (err) {
    console.error('[LoginLogger] Error logging user sign-in: ', err);
    // Silent fail to ensure user is not blocked from utilizing the app in case log writing fails
  }
}
