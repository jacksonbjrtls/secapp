import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  CACHE_SIZE_UNLIMITED 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0972067932.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0972067932",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0972067932.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "328642603761",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID || "1:328642603761:web:62d4a334ccd5524ba71750",
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
}, firestoreDatabaseId);

export const auth = getAuth(app);

