import { db } from './server/firebase.js';
import { collection, query, getDocs } from 'firebase/firestore';

async function run() {
  let q = query(collection(db, 'positions'));
  let snap = await getDocs(q);
  console.log('--- POSITIONS ---');
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'MAGMAUSDT') {
      console.log(JSON.stringify(data));
    }
  });
  
  console.log('--- TRADE LOGS ---');
  q = query(collection(db, 'trade_logs'));
  snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'MAGMAUSDT') {
      console.log(JSON.stringify(data));
    }
  });
  process.exit(0);
}
run();
