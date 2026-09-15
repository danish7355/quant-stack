const fs = require('fs');

let logs = [];
try {
  logs = JSON.parse(fs.readFileSync('trade_logs.json', 'utf8')).filter(l => l.strategy === 'DELTA_CLIMAX' || l.symbol === 'FILUSDT').slice(0, 20);
} catch (e) {
  console.log("No trade_logs.json found, skipping.");
  process.exit(0);
}

console.log("=== RISK DISTRIBUTION WITH CAPS & LIQUIDATION (Last 20 Trades) ===\n");
console.log("Min Stop Distance Filter: 0.5% | Max Notional Cap: $50k (5x Account)\n");

for (const trade of logs) {
    const entryPrice = parseFloat(trade.entry_price);
    if (!entryPrice || entryPrice <= 0) continue;
    
    // Estimate original SL from logs
    let sl = trade.exit_reason === 'SL' ? parseFloat(trade.close_price) : (trade.direction === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02);
    let actualSl = trade.direction === 'LONG' ? Math.min(sl, entryPrice * 0.999) : Math.max(sl, entryPrice * 1.001);
    
    const rawRiskDistance = Math.abs(entryPrice - actualSl);
    const rawRiskPct = rawRiskDistance / entryPrice;
    
    // Old Math
    const oldPositionSize = 1500;
    
    // Uncapped New Math
    const uncappedPosSize = 100 / rawRiskPct;
    
    // Capped New Math
    const effectiveRiskPct = Math.max(rawRiskPct, 0.005); // 0.5% floor
    let cappedPosSize = 100 / effectiveRiskPct;
    cappedPosSize = Math.min(cappedPosSize, 50000); // 50k max notional cap
    
    const actualLossRisk = cappedPosSize * rawRiskPct; // What the actual dollar loss is on the raw SL hit
    
    // Liquidation Price calculation (Assuming 20x cross/isolated on the position margin)
    // Margin used = cappedPosSize / 20. Liq is roughly at maintenance margin (assumed 0.4%)
    // Simplified: Liq distance = ~ 5% (1/20) from entry.
    const liqDistancePct = 0.045; // 4.5% safe room
    const liqPrice = trade.direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
    
    console.log(`[${trade.symbol}] ${trade.direction} | Raw Risk: ${(rawRiskPct * 100).toFixed(2)}% | SL: $${actualSl.toFixed(4)}`);
    console.log(`  Uncapped Pos: $${uncappedPosSize.toFixed(2)} -> Capped Pos: $${cappedPosSize.toFixed(2)} (Actual $ Risk: $${actualLossRisk.toFixed(2)})`);
    console.log(`  Liq Price (20x): $${liqPrice.toFixed(4)} | Dist to SL: ${(Math.abs(liqPrice - actualSl)/entryPrice * 100).toFixed(2)}% clearance\n`);
}
