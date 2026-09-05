export interface SmcSignal {
    direction: 'LONG' | 'SHORT';
    score: number;
    sl: number;
    tp1: number;
    entryZoneMin: number;
    entryZoneMax: number;
    reason: string;
    signalTime: number;
}

export function evaluateSmc(klines15m: any[], klines1h: any[], currentPrice: number): SmcSignal | null {
    if (!klines15m || klines15m.length < 20 || !klines1h || klines1h.length < 24) return null;

    // 1. Calculate Liquidity Pools (Rolling 24h High/Low from 1H candles)
    // Exclude the very last 1h candle as it's currently forming
    const htfLookback = klines1h.slice(-25, -1);
    const pdh = Math.max(...htfLookback.map(k => k.high)); // Previous Daily High
    const pdl = Math.min(...htfLookback.map(k => k.low));  // Previous Daily Low

    // 2. Scan the recent 15m candles (e.g. last 10) for a Sweep + MSS + FVG
    // We scan up to the second-to-last candle (the last one is forming)
    const recentKlines = klines15m.slice(-15, -1);
    
    // Look for Bearish setup (Sweep of PDH -> MSS down -> Bearish FVG)
    for (let i = 0; i < recentKlines.length - 2; i++) {
        const sweepCandle = recentKlines[i];
        
        // --- BEARISH SETUP (Sweep PDH) ---
        if (sweepCandle.high > pdh && sweepCandle.close < pdh) {
            // It swept the high but closed below it.
            // Look for MSS in the next 1-3 candles.
            // For a bearish MSS, we need a candle to close below the low of the candle *before* the sweep, or below the sweep's low.
            const triggerLow = Math.min(sweepCandle.low, recentKlines[Math.max(0, i-1)].low);
            
            let mssIndex = -1;
            for (let j = i + 1; j < Math.min(recentKlines.length, i + 4); j++) {
                if (recentKlines[j].close < triggerLow) {
                    mssIndex = j;
                    break;
                }
            }

            if (mssIndex !== -1) {
                // MSS found. Now look for a Bearish FVG formed during or immediately after the MSS.
                // A bearish FVG: Candle 1 Low > Candle 3 High.
                // We check the 3-candle sequence ending at mssIndex, or mssIndex + 1.
                for (let f = mssIndex - 1; f <= mssIndex; f++) {
                    if (f >= 0 && f + 2 < recentKlines.length) {
                        const c1 = recentKlines[f];
                        const c3 = recentKlines[f + 2];
                        if (c1.low > c3.high) {
                            // Bearish FVG detected!
                            const entryZoneMin = c3.high;
                            const entryZoneMax = c1.low;
                            const sl = sweepCandle.high * 1.001; // 0.1% buffer
                            const risk = sl - entryZoneMin;
                            const tp1 = entryZoneMin - (risk * 2);

                            return {
                                direction: 'SHORT',
                                score: 95,
                                sl,
                                tp1,
                                entryZoneMin,
                                entryZoneMax,
                                reason: 'Bearish SMC Liquidity Sweep (PDH) + MSS + FVG',
                                signalTime: sweepCandle.time
                            };
                        }
                    }
                }
            }
        }

        // --- BULLISH SETUP (Sweep PDL) ---
        if (sweepCandle.low < pdl && sweepCandle.close > pdl) {
            // Swept the low but closed above it.
            const triggerHigh = Math.max(sweepCandle.high, recentKlines[Math.max(0, i-1)].high);
            
            let mssIndex = -1;
            for (let j = i + 1; j < Math.min(recentKlines.length, i + 4); j++) {
                if (recentKlines[j].close > triggerHigh) {
                    mssIndex = j;
                    break;
                }
            }

            if (mssIndex !== -1) {
                for (let f = mssIndex - 1; f <= mssIndex; f++) {
                    if (f >= 0 && f + 2 < recentKlines.length) {
                        const c1 = recentKlines[f];
                        const c3 = recentKlines[f + 2];
                        if (c1.high < c3.low) {
                            // Bullish FVG detected!
                            const entryZoneMax = c3.low;
                            const entryZoneMin = c1.high;
                            const sl = sweepCandle.low * 0.999; // 0.1% buffer
                            const risk = entryZoneMax - sl;
                            const tp1 = entryZoneMax + (risk * 2);

                            return {
                                direction: 'LONG',
                                score: 95,
                                sl,
                                tp1,
                                entryZoneMin,
                                entryZoneMax,
                                reason: 'Bullish SMC Liquidity Sweep (PDL) + MSS + FVG',
                                signalTime: sweepCandle.time
                            };
                        }
                    }
                }
            }
        }
    }

    return null;
}
