const fs = require('fs');
let logs = [];
try {
  logs = JSON.parse(fs.readFileSync('trade_logs.json', 'utf8')).filter(l => l.symbol === 'CYSUSDT');
} catch(e) {}

if (logs.length > 0) {
  const trade = logs[0];
  console.log(`CYSUSDT Trade Entry Found: ${trade.entry_price}`);
  console.log(`Logged SL: ${trade.sl}`); // wait, our old trade logs didn't save SL inside trade_logs.json until the fix
} else {
  console.log("CYSUSDT not found in local JSON.");
}

// Let's directly check the formula logic from AutoTrader
