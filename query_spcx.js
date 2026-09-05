import { db } from './server/firebase.js';
import { collection, query, getDocs } from 'firebase/firestore';

async function run() {
  let q = query(collection(db, 'trade_logs'));
  let snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'SPCXUSDT') {
      console.log(JSON.stringify(data, null, 2));
    }
  });
  process.exit(0);
}
run();
