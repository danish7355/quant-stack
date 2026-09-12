import { db } from './server/firebase.js';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';

async function run() {
  const q = query(collection(db, 'positions'), limit(3));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}
run();
