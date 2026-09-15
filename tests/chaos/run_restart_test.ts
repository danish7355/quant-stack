import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log("=== PHASE 5: RESTART-SURVIVAL TEST (PERSISTENCE LAYER) ===\n");

// Write a script that inserts a record and loops until killed
const writerScript = `
import { getDb } from './server/db.js';
async function run() {
  const db = getDb();
  
  // Clean up any old tests
  db.prepare("DELETE FROM positions WHERE id = 'TEST-SIGKILL'").run();

  // Insert the test position
  db.prepare(
    "INSERT INTO positions (id, symbol, status) VALUES (?, ?, ?)"
  ).run('TEST-SIGKILL', 'BTCUSDT', 'OPEN');
  
  console.log('[Writer Process] Inserted position TEST-SIGKILL and flushed to disk.');
  
  // Keep process alive so we can SIGKILL it from the parent
  setInterval(() => {}, 1000);
}
run();
`;

// Write a script that reads the records
const readerScript = `
import { getDb } from './server/db.js';
async function run() {
  const db = getDb();
  const positions = db.prepare("SELECT * FROM positions WHERE id = 'TEST-SIGKILL'").all();
  console.log('[Reader Process] Positions found after process restart: ' + positions.length);
  if (positions.length === 0) {
    console.error('❌ CRITICAL FAILURE: Database failed to persist data across process hard-kill.');
    process.exit(1);
  } else {
    console.log('✅ PASS: Data survived process SIGKILL.');
  }
}
run();
`;

fs.writeFileSync('writer.ts', writerScript);
fs.writeFileSync('reader.ts', readerScript);

console.log("Starting Writer Process...");
const writer = spawn(process.execPath, ['--import', 'tsx', 'writer.ts'], { stdio: 'pipe' });

let writerReady = false;

writer.stdout.on('data', (data) => {
  const out = data.toString();
  process.stdout.write(out);
  
  if (out.includes('flushed to disk')) {
    setTimeout(() => {
      console.log("\\n*** 🔪 SENDING SIGKILL TO WRITER PROCESS 🔪 ***");
      writer.kill('SIGKILL');
    }, 500);
  }
});

writer.on('close', (code, signal) => {
  console.log(`[Writer Process] Terminated with signal: ${signal}`);
  
  console.log("\\nStarting Reader Process (Simulating Backend Restart)...");
  const reader = spawnSync(process.execPath, ['--import', 'tsx', 'reader.ts'], { encoding: 'utf8', stdio: 'inherit' });
  
  // Cleanup
  fs.unlinkSync('writer.ts');
  fs.unlinkSync('reader.ts');
});

