import { db } from './server/firebase.js';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';

async function run() {
  let q = query(collection(db, 'trade_logs'));
  let snap = await getDocs(q);
  console.log('--- TRADE LOGS for ENAUSDT ---');
  let enaTrades = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (data.symbol === 'ENAUSDT') {
      enaTrades.push(data);
    }
  });
  enaTrades.sort((a,b) => new Date(b.time_close || b.time_open || 0).getTime() - new Date(a.time_close || a.time_open || 0).getTime());
  enaTrades.forEach(d => {
    console.log(`[${d.time_close || d.time_open}] Dir: ${d.direction} | strat: ${d.strategy} | entry: ${d.entry_price} | sl: ${d.sl} | reason: ${d.exit_reason} | pnl: ${d.profit?.toFixed(2)}`);
  });
  process.exit(0);
}
run();
