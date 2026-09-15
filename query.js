import { db } from './server/firebase.js';
import { collection, query, getDocs } from 'firebase/firestore';

async function run() {
  const q = query(collection(db, 'positions'));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'MAGMAUSDT' || data.symbol === 'SNXXUSDT' || data.symbol === 'MAGMA' || data.symbol === 'SNXX') {
      console.log(`${data.symbol} | ${data.status} | exit: ${data.exit_reason}`);
    }
  });
  process.exit(0);
}
run();
