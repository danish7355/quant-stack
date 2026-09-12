import { db } from './server/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

async function run() {
  const docRef = doc(db, 'settings', 'bot_config');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("No settings found");
  }
  process.exit(0);
}
run();
