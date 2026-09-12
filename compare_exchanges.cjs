const fs = require('fs');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

(async () => {
    const logs = JSON.parse(fs.readFileSync('trade_logs.json', 'utf8')).filter(l => l.strategy === 'DELTA_CLIMAX' || l.symbol === 'FILUSDT').slice(0, 20);
    console.log(`Checking Binance vs Delta Exchange for ${logs.length} trades...`);
    
    for (const trade of logs) {
        const endTime = new Date(trade.time_open).getTime();
        const startTime = endTime - (1000 * 60 * 15 * 5); // 5 candles before
        
        // Fetch Binance
        const binanceUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=15m&limit=10&endTime=${endTime}`;
        const binanceData = await fetchJson(binanceUrl);
        
        // Fetch Delta
        // Delta API format: start and end are typically seconds? Let's use seconds or millis? The example had 1685618835 which is 10 digits (seconds).
        const startSec = Math.floor(startTime / 1000);
        const endSec = Math.floor(endTime / 1000);
        const deltaUrl = `https://api.delta.exchange/v2/history/candles?resolution=15m&symbol=${trade.symbol}&start=${startSec}&end=${endSec}`;
        let deltaData = await fetchJson(deltaUrl);
        
        if (!binanceData || binanceData.length === 0) continue;
        
        let c2Binance = binanceData[binanceData.length - 2];
        let c2B_Open = parseFloat(c2Binance[1]);
        let c2B_High = parseFloat(c2Binance[2]);
        let c2B_Low = parseFloat(c2Binance[3]);
        let c2B_Close = parseFloat(c2Binance[4]);
        
        let c2Delta = null;
        if (deltaData && deltaData.result && deltaData.result.length > 0) {
            // Delta returns descending order usually, but let's check timestamp. Let's just find the one closest to c2Binance[0]
            const bTime = parseInt(c2Binance[0]) / 1000;
            c2Delta = deltaData.result.find(c => c.time === bTime);
        }
        
        if (!c2Delta) {
            console.log(`[${trade.symbol}] Skipped Delta Comparison (Not listed or no data on Delta)`);
            continue;
        }
        
        let c2D_Open = parseFloat(c2Delta.open);
        let c2D_High = parseFloat(c2Delta.high);
        let c2D_Low = parseFloat(c2Delta.low);
        let c2D_Close = parseFloat(c2Delta.close);
        
        const diffClose = Math.abs(c2B_Close - c2D_Close) / c2B_Close * 100;
        
        // Check if one would pass rejection wick and other wouldn't
        const getWick = (o,h,l,c) => {
            const tot = h - l;
            if (tot===0) return 0;
            const top = Math.max(o, c);
            const bot = Math.min(o, c);
            return c < o ? (h - top) / tot : (bot - l) / tot;
        };
        
        const bWick = getWick(c2B_Open, c2B_High, c2B_Low, c2B_Close);
        const dWick = getWick(c2D_Open, c2D_High, c2D_Low, c2D_Close);
        
        console.log(`[${trade.symbol}] ${trade.time_open}`);
        console.log(`  Binance: O:${c2B_Open} H:${c2B_High} L:${c2B_Low} C:${c2B_Close} | WickRatio: ${bWick.toFixed(2)}`);
        console.log(`  Delta:   O:${c2D_Open} H:${c2D_High} L:${c2D_Low} C:${c2D_Close} | WickRatio: ${dWick.toFixed(2)}`);
        
        let flagged = false;
        if (diffClose > 0.15) {
            console.log(`  => FLAGGED: Close diff is ${diffClose.toFixed(3)}% (>0.15%)`);
            flagged = true;
        }
        if ((bWick >= 0.4 && dWick < 0.4) || (bWick < 0.4 && dWick >= 0.4)) {
            console.log(`  => FLAGGED: Gate difference! Binance wick: ${bWick.toFixed(2)}, Delta wick: ${dWick.toFixed(2)}`);
            flagged = true;
        }
        if (!flagged) {
            console.log(`  => OK: Charts closely match.`);
        }
    }
})();
