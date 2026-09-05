const https = require('https');

async function fetchKlinesDeep(symbol, interval, totalLimit) {
  let allKlines = [];
  let endTime = Date.now();
  
  while (allKlines.length < totalLimit) {
    const limit = Math.min(1000, totalLimit - allKlines.length);
    const data = await new Promise((resolve, reject) => {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&endTime=${endTime}`;
      https.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { resolve([]); }
        });
      }).on('error', reject);
    });
    
    if (!data || data.length === 0) break;
    
    const klines = data.map(k => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
    
    allKlines = [...klines, ...allKlines];
    endTime = data[0][0] - 1; // End time for next batch is the first candle's start time - 1ms
  }
  
  // Sort by time just in case
  allKlines.sort((a,b) => a.time - b.time);
  return allKlines;
}

function calcIndicators(klines, i) {
    if (i < 14) return null;
    let trSum = 0;
    for (let j = i - 14; j < i; j++) {
        const h = klines[j].high;
        const l = klines[j].low;
        const pc = klines[j-1].close;
        trSum += Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    }
    const atr = trSum / 14 || (klines[i].high - klines[i].low);

    let trSumAvg = 0;
    for (let j = Math.max(1, i - 14 - 50); j < i - 14; j++) {
        const h = klines[j].high;
        const l = klines[j].low;
        const pc = klines[j-1].close;
        trSumAvg += Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    }
    const atrAvg = (trSumAvg / 50) || atr;

    let vSum = 0;
    for (let j = i - 20; j < i; j++) { vSum += klines[j].volume; }
    const avgVolume = vSum / 20;

    const calcEma = (period, endIdx) => {
        if (endIdx < period) return klines[endIdx].close;
        const k = 2 / (period + 1);
        let ema = klines[endIdx - period].close;
        for (let j = endIdx - period + 1; j <= endIdx; j++) {
            ema = klines[j].close * k + ema * (1 - k);
        }
        return ema;
    };
    
    return {
        open: klines[i].open, high: klines[i].high, low: klines[i].low, close: klines[i].close,
        volume: klines[i].volume,
        range: klines[i].high - klines[i].low,
        atr, atrAvg, avgVolume,
        emaFast: calcEma(9, i),
        emaBaseline: calcEma(21, i)
    };
}

function runSim(klines, useNewLogic) {
    let signals = 0;
    let passes = 0;
    let wins = 0;
    let totalR = 0;
    
    const getRejectionWick = (c) => {
        const tot = c.high - c.low;
        if (tot === 0) return 0;
        const top = Math.max(c.open, c.close);
        const bot = Math.min(c.open, c.close);
        return c.close < c.open ? (c.high - top) / tot : (bot - c.low) / tot;
    };

    for (let i = 100; i < klines.length - 10; i++) {
        let c1, c2, c3;
        
        if (useNewLogic) {
            c1 = calcIndicators(klines, i - 2);
            c2 = calcIndicators(klines, i - 1);
            c3 = calcIndicators(klines, i); 
        } else {
            c1 = calcIndicators(klines, i - 1);
            c2 = calcIndicators(klines, i); 
            c3 = c2; 
        }

        if (!c1 || !c2 || !c3) continue;

        let highestHigh = 0;
        let lowestLow = Infinity;
        for (let j = i - 25; j < i; j++) {
            if (klines[j].high > highestHigh) highestHigh = klines[j].high;
            if (klines[j].low < lowestLow) lowestLow = klines[j].low;
        }

        // SHORT Logic
        if (
            c1.close > c1.open &&
            c1.close > c1.emaBaseline &&
            c1.high >= highestHigh * 0.995 &&
            (c1.range >= 1.5 * c1.atr || (c1.close - c1.emaFast) >= 1.5 * c1.atr) &&
            (c1.volume >= c1.avgVolume * 2.5 || c1.atr >= 1.2 * c1.atrAvg) &&
            c2.close < c2.open &&
            (c2.close < c1.open || getRejectionWick(c2) >= 0.4) &&
            c2.high >= c1.high * 0.998
        ) {
            signals++;
            const entry = useNewLogic ? c3.open : c2.close;
            const stop = Math.max(c1.high, c2.high) + (c2.atr * 0.2);
            const risk = stop - entry;
            if (risk > 0) {
                passes++;
                let exitR = 0;
                for (let k = i + 1; k < klines.length; k++) {
                    if (klines[k].high >= stop) { exitR = -1; break; }
                    if (klines[k].low <= entry - (risk * 1.5)) { exitR = 1.5; break; }
                }
                if (exitR > 0) wins++;
                totalR += exitR;
            }
        }
        
        // LONG Logic
        if (
            c1.close < c1.open &&
            c1.close < c1.emaBaseline &&
            c1.low <= lowestLow * 1.005 &&
            (c1.range >= 1.5 * c1.atr || (c1.emaFast - c1.close) >= 1.5 * c1.atr) &&
            (c1.volume >= c1.avgVolume * 2.5 || c1.atr >= 1.2 * c1.atrAvg) &&
            c2.close > c2.open &&
            (c2.close > c1.open || getRejectionWick(c2) >= 0.4) &&
            c2.low <= c1.low * 1.002
        ) {
            signals++;
            const entry = useNewLogic ? c3.open : c2.close;
            const stop = Math.min(c1.low, c2.low) - (c2.atr * 0.2);
            const risk = entry - stop;
            if (risk > 0) {
                passes++;
                let exitR = 0;
                for (let k = i + 1; k < klines.length; k++) {
                    if (klines[k].low <= stop) { exitR = -1; break; }
                    if (klines[k].high >= entry + (risk * 1.5)) { exitR = 1.5; break; }
                }
                if (exitR > 0) wins++;
                totalR += exitR;
            }
        }
    }
    
    return { signals, wins, winRate: passes > 0 ? (wins/passes*100).toFixed(2) : 0, totalR: totalR.toFixed(2) };
}

(async () => {
    try {
        console.log("Fetching 10,000 candles (~3 months) for FILUSDT...");
        const klinesFIL = await fetchKlinesDeep('FILUSDT', '15m', 10000);
        console.log(`Historical Backtest on ${klinesFIL.length} 15m candles (FILUSDT)`);
        
        const oldLogicFIL = runSim(klinesFIL, false);
        console.log(`  OLD LOGIC: Signals: ${oldLogicFIL.signals} | Wins: ${oldLogicFIL.wins} | Win Rate: ${oldLogicFIL.winRate}% | Total R: ${oldLogicFIL.totalR}`);
        
        const newLogicFIL = runSim(klinesFIL, true);
        console.log(`  NEW LOGIC: Signals: ${newLogicFIL.signals} | Wins: ${newLogicFIL.wins} | Win Rate: ${newLogicFIL.winRate}% | Total R: ${newLogicFIL.totalR}`);
        
        console.log("\nFetching 10,000 candles (~3 months) for SOLUSDT...");
        const klinesSOL = await fetchKlinesDeep('SOLUSDT', '15m', 10000);
        console.log(`Historical Backtest on ${klinesSOL.length} 15m candles (SOLUSDT)`);
        
        const oldLogicSOL = runSim(klinesSOL, false);
        console.log(`  OLD LOGIC: Signals: ${oldLogicSOL.signals} | Wins: ${oldLogicSOL.wins} | Win Rate: ${oldLogicSOL.winRate}% | Total R: ${oldLogicSOL.totalR}`);
        
        const newLogicSOL = runSim(klinesSOL, true);
        console.log(`  NEW LOGIC: Signals: ${newLogicSOL.signals} | Wins: ${newLogicSOL.wins} | Win Rate: ${newLogicSOL.winRate}% | Total R: ${newLogicSOL.totalR}`);

    } catch(e) { console.error(e); }
})();
