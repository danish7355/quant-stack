const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  "projectId": "gen-lang-client-0285806294",
  "apiKey": "AIzaSyADTAJQt_04VUOOE0RqSJ7nOvWPKye-o-0",
  "authDomain": "gen-lang-client-0285806294.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-cryptofuturestra-68b53805-cb78-46c6-9f94-fdaab6351fe6");

async function run() {
    const docSnap = await getDoc(doc(db, 'settings', 'bot_config'));
    if (docSnap.exists()) {
        console.log("Settings:", docSnap.data());
    } else {
        console.log("No settings found");
    }
    process.exit(0);
}
run().catch(console.error);
