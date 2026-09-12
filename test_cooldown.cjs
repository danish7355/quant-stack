const fs = require('fs');
let code = fs.readFileSync('server/services/AutoTrader.ts', 'utf8');
code = code.replace(
  'switch(tf) {',
  'console.log(`[AutoTrader] getCooldownMs called with tf="${tf}"`); switch(tf) {'
);
fs.writeFileSync('server/services/AutoTrader.ts', code);
