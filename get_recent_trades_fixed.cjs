const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, orderBy, limit } = require('firebase/firestore');

const firebaseConfig = {
  "projectId": "gen-lang-client-0285806294",
  "appId": "1:302897307064:web:8207b99f713ab1bc7b834d",
  "apiKey": "AIzaSyADTAJQt_04VUOOE0RqSJ7nOvWPKye-o-0",
  "authDomain": "gen-lang-client-0285806294.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-cryptofuturestra-68b53805-cb78-46c6-9f94-fdaab6351fe6");

async function run() {
    console.log("=== RECENT CLOSED TRADES (from trade_logs) ===");
    const logsQuery = query(collection(db, 'trade_logs'), orderBy('time_close', 'desc'), limit(15));
    const logsSnapshot = await getDocs(logsQuery);
    logsSnapshot.forEach(doc => {
        const l = doc.data();
        console.log(`[${l.symbol}] ${l.direction} | Entry: ${l.entry_price} -> Exit: ${l.close_price} | Reason: ${l.exit_reason} | Time: ${l.time_close} (Open: ${l.time_open}) | SL: ${l.sl} | Score: ${l.score_at_entry} | Strategy: ${l.strategy}`);
    });
    process.exit(0);
}
run().catch(console.error);
