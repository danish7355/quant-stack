import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import fs from 'fs';

// Suppress internal Firestore gRPC disconnect warnings
setLogLevel('error');

// Read config from file or environment variables
const configPath = './firebase-applet-config.json';
let config: any = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error("Failed to parse firebase-applet-config.json", e);
  }
} else if (process.env.FIREBASE_CONFIG) {
  try {
    config = JSON.parse(process.env.FIREBASE_CONFIG);
  } catch (e) {
    console.error("Failed to parse process.env.FIREBASE_CONFIG", e);
  }
} else if (process.env.FIREBASE_PROJECT_ID) {
  config = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDummyKeyForPublicFirestore",
    appId: process.env.FIREBASE_APP_ID || "1:12345:web:abcdef",
    firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID
  };
}

// Map the custom database ID if provided
if (config.firestoreDatabaseId) {
  config.databaseURL = `https://${config.projectId}.firebaseio.com`;
}

const app = !getApps().length ? initializeApp(config) : getApp();

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, config.firestoreDatabaseId);

export { db };
