const fs = require('fs');
fs.appendFileSync('data/scan_logs.jsonl', JSON.stringify({timestamp: new Date().toISOString(), symbol: 'BTCUSDT', direction: 'NEUTRAL', passed_gates: false, reject_reason: 'Failed Climax Setup', entry_price: 64500, sl: 0, tp1: 0, score: 0, strategy_version: 'v2.1_closed_candles'}) + '\n');
