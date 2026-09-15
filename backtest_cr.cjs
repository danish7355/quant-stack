const fs = require('fs');
const https = require('https');

async function fetchKlines(symbol, interval, limit) {
  return new Promise((resolve, reject) => {
    https.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const klines = JSON.parse(data).map(k => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
          }));
          resolve(klines);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
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

    // simple EMAs
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
    let maxDrawdown = 0;
    let peakR = 0;
    let currentR = 0;
    
    const settings = {
        crMinClimaxRangeRatio: 1.5,
        crMinOverextensionAtr: 1.5,
        crMinAtrVsAverage: 1.2,
        crMinRejectionWickRatio: 0.4,
        crClimaxLookback: 25,
        tp1AtrMultiple: 1.5,
        slAtrMultiple: 0.2
    };

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
            c3 = calcIndicators(klines, i); // live candle equivalent open
        } else {
            c1 = calcIndicators(klines, i - 1);
            c2 = calcIndicators(klines, i); // live candle acting as c2
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
            (c1.range >= settings.crMinClimaxRangeRatio * c1.atr || (c1.close - c1.emaFast) >= settings.crMinOverextensionAtr * c1.atr) &&
            (c1.volume >= c1.avgVolume * 2.5 || c1.atr >= settings.crMinAtrVsAverage * c1.atrAvg) &&
            c2.close < c2.open &&
            (c2.close < c1.open || getRejectionWick(c2) >= settings.crMinRejectionWickRatio) &&
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
                    if (klines[k].high >= stop) {
                        exitR = -1; break;
                    }
                    if (klines[k].low <= entry - (risk * 1.5)) {
                        exitR = 1.5; break;
                    }
                }
                if (exitR > 0) wins++;
                currentR += exitR;
                if (currentR > peakR) peakR = currentR;
                const dd = peakR - currentR;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }
        }
        
        // LONG Logic
        if (
            c1.close < c1.open &&
            c1.close < c1.emaBaseline &&
            c1.low <= lowestLow * 1.005 &&
            (c1.range >= settings.crMinClimaxRangeRatio * c1.atr || (c1.emaFast - c1.close) >= settings.crMinOverextensionAtr * c1.atr) &&
            (c1.volume >= c1.avgVolume * 2.5 || c1.atr >= settings.crMinAtrVsAverage * c1.atrAvg) &&
            c2.close > c2.open &&
            (c2.close > c1.open || getRejectionWick(c2) >= settings.crMinRejectionWickRatio) &&
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
                    if (klines[k].low <= stop) {
                        exitR = -1; break;
                    }
                    if (klines[k].high >= entry + (risk * 1.5)) {
                        exitR = 1.5; break;
                    }
                }
                if (exitR > 0) wins++;
                currentR += exitR;
                if (currentR > peakR) peakR = currentR;
                const dd = peakR - currentR;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }
        }
    }
    
    return { signals, passes, wins, winRate: passes > 0 ? (wins/passes*100).toFixed(2) : 0, avgR: passes > 0 ? (currentR/passes).toFixed(2) : 0, totalR: currentR.toFixed(2), maxDrawdown: maxDrawdown.toFixed(2) };
}

(async () => {
    try {
        const klines = await fetchKlines('SOLUSDT', '15m', 1500);
        console.log(`Historical Backtest on ${klines.length} 15m candles (FILUSDT)`);
        
        const oldLogic = runSim(klines, false);
        console.log(`\nOLD LOGIC (Live c2 Wick)`);
        console.log(`Signals: ${oldLogic.signals} | Passed Gates: ${oldLogic.passes}`);
        console.log(`Wins: ${oldLogic.wins} | Win Rate: ${oldLogic.winRate}%`);
        console.log(`Avg R: ${oldLogic.avgR} | Total R: ${oldLogic.totalR} | Max DD: ${oldLogic.maxDrawdown}`);
        
        const newLogic = runSim(klines, true);
        console.log(`\nNEW LOGIC (Closed c1/c2, c3 Open Entry)`);
        console.log(`Signals: ${newLogic.signals} | Passed Gates: ${newLogic.passes}`);
        console.log(`Wins: ${newLogic.wins} | Win Rate: ${newLogic.winRate}%`);
        console.log(`Avg R: ${newLogic.avgR} | Total R: ${newLogic.totalR} | Max DD: ${newLogic.maxDrawdown}`);
        
    } catch(e) { console.error(e); }
})();
