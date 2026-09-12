import { db } from './server/firebase.js';
import { collection, query, getDocs } from 'firebase/firestore';

async function run() {
  const q = query(collection(db, 'trade_logs'));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'MAGMAUSDT' || data.symbol === 'SNXXUSDT') {
      console.log(`[${data.time_close || data.time}] ${data.symbol} | reason: ${data.exit_reason || data.reason}`);
    }
  });
  process.exit(0);
}
run();
