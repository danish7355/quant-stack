import { db } from './server/firebase.js';
import { collection, query, getDocs } from 'firebase/firestore';

async function run() {
  const q = query(collection(db, 'positions'));
  const snap = await getDocs(q);
  const items = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'MAGMAUSDT' || data.symbol === 'SNXXUSDT') {
      items.push(data);
    }
  });
  items.sort((a,b) => new Date(a.time_open).getTime() - new Date(b.time_open).getTime());
  items.forEach(d => {
    console.log(`[${d.time_open}] ${d.symbol} | Dir: ${d.direction} | entry: ${d.entry_price} | sl: ${d.sl} | tp1: ${d.tp1} | exit_reason: ${d.exit_reason}`);
  });
  process.exit(0);
}
run();
