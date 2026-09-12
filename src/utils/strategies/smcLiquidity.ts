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

// Swing point detection helper
function findSwings(candles: any[], leftBars = 5, rightBars = 2) {
    const swingHighs = [];
    const swingLows = [];
    
    for (let i = leftBars; i < candles.length - rightBars; i++) {
        let isHigh = true;
        let isLow = true;
        
        for (let j = i - leftBars; j <= i + rightBars; j++) {
            if (i === j) continue;
            if (candles[j].high > candles[i].high) isHigh = false;
            if (candles[j].low < candles[i].low) isLow = false;
        }
        
        if (isHigh) swingHighs.push({ index: i, price: candles[i].high });
        if (isLow) swingLows.push({ index: i, price: candles[i].low });
    }
    return { swingHighs, swingLows };
}

export function evaluateSmc(klines: any[], htfCandles: any[], currentPrice: number): SmcSignal | null {
    if (!klines || klines.length < 30) return null;

    // Use the main timeframe candles (klines) to detect recent swing points and sweeps
    const completedKlines = klines.slice(0, -1);
    if (completedKlines.length < 30) return null;

    // Average volume over the last 20 candles
    const vol20Avg = completedKlines.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;

    // Detect swings on the current timeframe to establish local structure
    const { swingHighs, swingLows } = findSwings(completedKlines, 5, 2);

    // We can also use HTF candles (e.g. 1H) for major liquidity levels
    const completedHtf = htfCandles && htfCandles.length > 1 ? htfCandles.slice(0, -1) : [];
    const majorHigh = completedHtf.length > 0 ? Math.max(...completedHtf.map(c => c.high)) : -1;
    const majorLow = completedHtf.length > 0 ? Math.min(...completedHtf.map(c => c.low)) : Infinity;

    // Scan the last 15 candles for a sweep event
    const recentKlines = completedKlines.slice(-15);
    const recentStartIndex = completedKlines.length - 15;

    for (let i = 0; i < recentKlines.length - 2; i++) {
        const candleIndex = recentStartIndex + i;
        const sweepCandle = recentKlines[i];
        
        // Find the nearest swing high before this candle
        const pastHighs = swingHighs.filter(h => h.index < candleIndex);
        const targetHigh = pastHighs.length > 0 ? pastHighs[pastHighs.length - 1].price : majorHigh;
        
        // Find the nearest swing low before this candle
        const pastLows = swingLows.filter(l => l.index < candleIndex);
        const targetLow = pastLows.length > 0 ? pastLows[pastLows.length - 1].price : majorLow;

        const isVolumeSpike = sweepCandle.volume >= (vol20Avg * 1.5);

        // --- BEARISH LSR (Sweep High) ---
        if (targetHigh > 0 && sweepCandle.high > targetHigh && sweepCandle.close < targetHigh) {
            // Swept buy-side liquidity, rejected back into range
            // Look for Market Structure Shift (MSS) -> breaking a prior minor low
            // The minor low could be the lowest point between the target high and the sweep, or just the low of the candle prior to the sweep.
            const priorLow = completedKlines[candleIndex - 1].low;
            const triggerLow = Math.min(sweepCandle.low, priorLow);
            
            let mssIndex = -1;
            for (let j = i + 1; j < recentKlines.length; j++) {
                if (recentKlines[j].close < triggerLow) {
                    mssIndex = j;
                    break;
                }
            }

            if (mssIndex !== -1) {
                // Bearish CHoCH confirmed. Look for a bearish FVG in the displacement leg.
                for (let f = mssIndex - 1; f <= mssIndex; f++) {
                    if (f >= 0 && f + 2 < recentKlines.length) {
                        const c1 = recentKlines[f];
                        const c3 = recentKlines[f + 2];
                        if (c1.low > c3.high) {
                            // Bearish FVG found
                            const entryZoneMin = c3.high;
                            const entryZoneMax = c1.low;
                            const range = sweepCandle.high - sweepCandle.low;
                            const slBuffer = range * 0.15; // Small ATR/range buffer
                            const sl = sweepCandle.high + slBuffer; 
                            
                            const risk = sl - entryZoneMin;
                            const tp1 = entryZoneMin - (risk * 2);

                            return {
                                direction: 'SHORT',
                                score: 95,
                                sl,
                                tp1,
                                entryZoneMin,
                                entryZoneMax,
                                reason: `Bearish LSR: Swept High, CHoCH, Bearish FVG. Vol Spike: ${isVolumeSpike ? 'Yes' : 'No'}`,
                                signalTime: sweepCandle.time
                            };
                        }
                    }
                }
            }
        }

        // --- BULLISH LSR (Sweep Low) ---
        if (targetLow !== Infinity && sweepCandle.low < targetLow && sweepCandle.close > targetLow) {
            // Swept sell-side liquidity, rejected back into range
            const priorHigh = completedKlines[candleIndex - 1].high;
            const triggerHigh = Math.max(sweepCandle.high, priorHigh);
            
            let mssIndex = -1;
            for (let j = i + 1; j < recentKlines.length; j++) {
                if (recentKlines[j].close > triggerHigh) {
                    mssIndex = j;
                    break;
                }
            }

            if (mssIndex !== -1) {
                // Bullish CHoCH confirmed. Look for a bullish FVG.
                for (let f = mssIndex - 1; f <= mssIndex; f++) {
                    if (f >= 0 && f + 2 < recentKlines.length) {
                        const c1 = recentKlines[f];
                        const c3 = recentKlines[f + 2];
                        if (c1.high < c3.low) {
                            // Bullish FVG found
                            const entryZoneMax = c3.low;
                            const entryZoneMin = c1.high;
                            const range = sweepCandle.high - sweepCandle.low;
                            const slBuffer = range * 0.15;
                            const sl = sweepCandle.low - slBuffer; 
                            
                            const risk = entryZoneMax - sl;
                            const tp1 = entryZoneMax + (risk * 2);

                            return {
                                direction: 'LONG',
                                score: 95,
                                sl,
                                tp1,
                                entryZoneMin,
                                entryZoneMax,
                                reason: `Bullish LSR: Swept Low, CHoCH, Bullish FVG. Vol Spike: ${isVolumeSpike ? 'Yes' : 'No'}`,
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

