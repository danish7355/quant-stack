const fs = require('fs');
const logs = JSON.parse(fs.readFileSync('trade_logs.json', 'utf8')).filter(l => l.strategy === 'DELTA_CLIMAX' || l.symbol === 'FILUSDT').slice(0, 20);

(async () => {
  for (const trade of logs) {
    try {
      // Fetch exact klines around the trade time
      const endTime = new Date(trade.time_open).getTime();
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=15m&limit=10&endTime=${endTime}`);
      const data = await res.json();
      if (!data || data.length < 3) continue;
      
      const c2 = data[data.length - 2];
      const c3 = data[data.length - 1]; // The candle trade was opened in
      
      const c2High = parseFloat(c2[2]);
      const c2Low = parseFloat(c2[3]);
      const c2Close = parseFloat(c2[4]);
      
      const c3Open = parseFloat(c3[1]);
      
      // Calculate true ATR roughly for c2
      let trSum = 0;
      for (let i = Math.max(1, data.length - 15); i < data.length - 1; i++) {
         const h = parseFloat(data[i][2]);
         const l = parseFloat(data[i][3]);
         const pc = parseFloat(data[i-1][4]);
         trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      }
      const atr = trSum / 14 || (c2High - c2Low);
      
      const gap = Math.abs(c3Open - c2Close);
      const gapAtr = gap / atr;
      
      const entryGap = Math.abs(trade.entry_price - c2Close);
      
      console.log(`[${trade.symbol}] ${trade.direction}`);
      console.log(`  c2 Close: ${c2Close.toFixed(4)} | c3 Open: ${c3Open.toFixed(4)} | Gap: ${gap.toFixed(4)} (${gapAtr.toFixed(2)}x ATR)`);
      console.log(`  Actual Entry: ${trade.entry_price} | Entry Gap from c2 Close: ${entryGap.toFixed(4)}`);
      
      // Recompute SL math
      let sl;
      if (trade.direction === 'SHORT') {
         sl = Math.max(c2High, parseFloat(data[data.length-3][2])) + (atr * 0.2);
         const riskPrice = Math.abs(sl - trade.entry_price);
         console.log(`  Old Risk from c2 Close: ${Math.abs(sl - c2Close).toFixed(4)} | New Risk from Entry: ${riskPrice.toFixed(4)} (${(riskPrice/atr).toFixed(2)}x ATR)`);
      } else {
         sl = Math.min(c2Low, parseFloat(data[data.length-3][3])) - (atr * 0.2);
         const riskPrice = Math.abs(trade.entry_price - sl);
         console.log(`  Old Risk from c2 Close: ${Math.abs(c2Close - sl).toFixed(4)} | New Risk from Entry: ${riskPrice.toFixed(4)} (${(riskPrice/atr).toFixed(2)}x ATR)`);
      }
    } catch(e) {}
  }
})();
