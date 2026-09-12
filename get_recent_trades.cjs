const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, orderBy, limit } = require('firebase/firestore');

const firebaseConfig = {
    projectId: "ai-studio-cryptofuturestra-68b53805-cb78-46c6-9f94-fdaab6351fe6",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
    console.log("=== ACTIVE POSITIONS ===");
    const posSnapshot = await getDocs(collection(db, 'positions'));
    posSnapshot.forEach(doc => {
        const p = doc.data();
        console.log(`[${p.symbol}] ${p.direction} | Entry: ${p.entry_price} | SL: ${p.sl} | Time: ${p.time_open}`);
    });

    console.log("\n=== RECENT CLOSED TRADES (from trade_logs) ===");
    const logsQuery = query(collection(db, 'trade_logs'), orderBy('time_open', 'desc'), limit(15));
    const logsSnapshot = await getDocs(logsQuery);
    logsSnapshot.forEach(doc => {
        const l = doc.data();
        console.log(`[${l.symbol}] ${l.direction} | Entry: ${l.entry_price} -> Exit: ${l.close_price} | Reason: ${l.exit_reason} | Time: ${l.time_open}`);
    });
    process.exit(0);
}
run().catch(console.error);
