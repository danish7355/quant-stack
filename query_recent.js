import { db } from './server/firebase.js';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';

async function run() {
  let q = query(collection(db, 'trade_logs'), orderBy('time_close', 'desc'), limit(10));
  let snap = await getDocs(q);
  console.log('--- RECENT CLOSED TRADES ---');
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`[${data.time_close}] ${data.symbol} | Dir: ${data.direction} | strat: ${data.strategy} | reason: ${data.exit_reason} | pnl: ${data.profit?.toFixed(2)} (${data.pct_return?.toFixed(2)}%)`);
  });
  process.exit(0);
}
run();
