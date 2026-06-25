import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const finalConfig = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey || "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA",
  authDomain: firebaseConfig.authDomain || "gen-lang-client-0972067932.firebaseapp.com",
  projectId: firebaseConfig.projectId || "gen-lang-client-0972067932",
  storageBucket: firebaseConfig.storageBucket || "gen-lang-client-0972067932.firebasestorage.app",
  messagingSenderId: firebaseConfig.messagingSenderId || "328642603761",
  appId: firebaseConfig.appId || "1:328642603761:web:62d4a334ccd5524ba71750"
};

const app = initializeApp(finalConfig);
export const db = getFirestore(app, (finalConfig as any).firestoreDatabaseId);

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn('Firestore persistence failed-precondition');
    } else if (err.code === 'unimplemented') {
      // The current browser doesn't support all of the features needed to enable persistence
      console.warn('Firestore persistence unimplemented');
    }
  });
}

export const auth = getAuth(app);
