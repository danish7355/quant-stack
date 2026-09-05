const fs = require('fs');

const dummyLog = {
    timestamp: new Date().toISOString(),
    symbol: "CYSUSDT",
    direction: "SHORT",
    passed_gates: true,
    reject_reason: null,
    entry_price: 0.9216,
    sl: 0.9516,
    tp1: 0.8766,
    tp2: 0.8316,
    tp3: 0.7716,
    score: 95,
    exit_price: 0.8316,
    exit_reason: "TP2",
    realized_r: 3.0,
    strategy_version: "v2.1_closed_candles"
};

console.log(JSON.stringify(dummyLog, null, 2));
