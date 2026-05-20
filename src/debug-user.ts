
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from './lib/firebase';

async function checkUser(email: string) {
  console.log(`Checking for user: ${email}`);
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log('No user found in Firestore with this email.');
  } else {
    console.log(`Found ${snapshot.size} users with this email in Firestore.`);
    snapshot.forEach(d => {
      console.log(`ID: ${d.id}, Data:`, d.data());
    });
  }
}

// Usage: call this from a component or temporary page to debug.
