const fs = require('fs');
const readline = require('readline');

async function queryLogs(limit = 20) {
  const fileStream = fs.createReadStream('data/scan_logs.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const logs = [];
  for await (const line of rl) {
    if (line.trim()) logs.push(JSON.parse(line));
  }
  
  console.log(`\n=== RECENT SCANS (Last ${limit}) ===`);
  logs.slice(-limit).forEach(l => {
    const time = new Date(l.timestamp).toLocaleTimeString();
    if (l.passed_gates) {
       console.log(`[${time}] ${l.symbol} ✅ ${l.direction} | ${l.reject_reason} | Entry: $${l.entry_price}`);
    } else {
       console.log(`[${time}] ${l.symbol} ❌ ${l.reject_reason}`);
    }
  });
}

queryLogs();
