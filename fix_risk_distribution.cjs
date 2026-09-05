const fs = require('fs');

const logs = JSON.parse(fs.readFileSync('trade_logs.json', 'utf8')).filter(l => l.strategy === 'DELTA_CLIMAX' || l.symbol === 'FILUSDT').slice(0, 20);

console.log("=== RISK DISTRIBUTION RECALCULATION (Last 20 Trades) ===");
console.log("Fixed Sizing (OLD) vs Dynamic Risk Sizing (NEW)\n");

for (const trade of logs) {
    const entryPrice = trade.entry_price;
    // Estimate ATR from the trade record or roughly
    // Since we don't have it directly in the trade log, we use the gap from earlier
    const sl = trade.exit_reason === 'SL' ? trade.close_price : (trade.direction === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02); // Fallback estimate
    const actualSl = trade.direction === 'LONG' ? Math.min(sl, entryPrice * 0.999) : Math.max(sl, entryPrice * 1.001); // Just to have a non-zero risk
    const riskDistance = Math.abs(entryPrice - actualSl);
    const riskPct = riskDistance / entryPrice;
    
    // OLD Sizing: Fixed $300 margin * 5x leverage = $1500 position
    const oldPositionSize = 1500;
    const oldDollarRisk = oldPositionSize * riskPct;
    
    // NEW Sizing: Target 1% Account Risk ($100 on $10,000 account)
    const targetRisk = 100;
    const newPositionSize = targetRisk / riskPct;
    
    console.log(`[${trade.symbol}] ${trade.direction} | Risk: ${(riskPct * 100).toFixed(2)}% | OLD Loss Risk: $${oldDollarRisk.toFixed(2)} -> NEW Loss Risk: $${targetRisk.toFixed(2)} (Pos Size: $${newPositionSize.toFixed(2)})`);
}
