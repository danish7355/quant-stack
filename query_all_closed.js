import { db } from './server/firebase.js';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';

async function run() {
  let q = query(collection(db, 'trade_logs'), orderBy('time_close', 'desc'), limit(15));
  let snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.profit < 0) {
      console.log(`[${data.time_close}] ${data.symbol} | Dir: ${data.direction} | strat: ${data.strategy} | pnl: ${data.profit?.toFixed(2)} | reason: ${data.exit_reason}`);
    }
  });
  process.exit(0);
}
run();
