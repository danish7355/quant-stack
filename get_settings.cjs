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
    const s = await getDocs(collection(db, 'bot_settings'));
    s.forEach(doc => {
        console.log(doc.id, "=>", doc.data());
    });
    process.exit(0);
}
run().catch(console.error);
