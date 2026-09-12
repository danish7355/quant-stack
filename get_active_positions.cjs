const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  "projectId": "gen-lang-client-0285806294",
  "apiKey": "AIzaSyADTAJQt_04VUOOE0RqSJ7nOvWPKye-o-0",
  "authDomain": "gen-lang-client-0285806294.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-cryptofuturestra-68b53805-cb78-46c6-9f94-fdaab6351fe6");

async function run() {
    console.log("=== ACTIVE POSITIONS ===");
    const posSnapshot = await getDocs(collection(db, 'positions'));
    posSnapshot.forEach(doc => {
        const p = doc.data();
        console.log(JSON.stringify(p, null, 2));
    });
    process.exit(0);
}
run().catch(console.error);
