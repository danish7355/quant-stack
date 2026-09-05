import { AppSettings } from '../../types';

export interface PullbackSignal {
    direction: 'LONG' | 'SHORT';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    reason?: string;
    signalTime?: number;
}

function calcEma(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calcAtr(high: number[], low: number[], close: number[], period: number): number[] {
    const tr = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
        const hl = high[i] - low[i];
        const hc = Math.abs(high[i] - close[i - 1]);
        const lc = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(hl, hc, lc));
    }

    const atr = [tr.slice(0, period).reduce((a, b) => a + b) / period];
    for (let i = period; i < tr.length; i++) {
        atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
    }
    return Array(period - 1).fill(atr[0]).concat(atr);
}

export function evaluateTrendPullback(candles: any[], currentPrice: number, settings: AppSettings): PullbackSignal | null {
    if (candles.length < 50) return null;

    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const volume = candles.map(c => c.volume || 0);

    const ema9 = calcEma(close, 9);
    const ema21 = calcEma(close, 21);
    const ema50 = calcEma(close, 50);
    const atr = calcAtr(high, low, close, 14);

    const lastIdx = close.length - 1;
    const currentAtr = atr[lastIdx];
    
    const avgVol20 = volume.slice(Math.max(0, lastIdx - 20), lastIdx).reduce((a, b) => a + b, 0) / 20;
    
    // Check trend alignment
    const isUptrend = ema21[lastIdx] > ema50[lastIdx] && ema50[lastIdx] > ema50[lastIdx - 10];
    const isDowntrend = ema21[lastIdx] < ema50[lastIdx] && ema50[lastIdx] < ema50[lastIdx - 10];

    if (!isUptrend && !isDowntrend) return null;

    // Filter out extreme volatility spikes (e.g. illiquid pump-and-dump spikes with ATR > 3.5% of price)
    if (currentAtr / currentPrice > 0.035) {
        return null;
    }

    // Look for pullback to value area (between EMA9 and EMA21/50)
    const currentHigh = high[lastIdx];
    const currentLow = low[lastIdx];
    const currentClose = close[lastIdx];
    const currentOpen = candles[lastIdx].open;
    const prevLow = low[lastIdx - 1];
    const prevHigh = high[lastIdx - 1];

    let direction: 'LONG' | 'SHORT' | null = null;
    let score = 0;
    let reason = '';
    let sl = 0;

    if (isUptrend) {
        // Price must have pulled back to EMA21 or EMA50
        const touchedEMA = currentLow <= ema21[lastIdx] || prevLow <= ema21[lastIdx - 1];
        if (!touchedEMA) return null;
        
        // Filter 1: Volume Exhaustion (Effort vs Result)
        // If the drop into the EMA was driven by massive structural selling volume (full bodied red candles)
        const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
        const prevBody = Math.abs(close[lastIdx - 1] - candles[lastIdx - 1].open);
        const prevRange = high[lastIdx - 1] - low[lastIdx - 1];
        const isPrevBearish = close[lastIdx - 1] < candles[lastIdx - 1].open;
        
        if (isPrevBearish && prevVolRatio > 2.0 && prevBody > prevRange * 0.7) {
            return null; // Heavy institutional selling dump, abort trade (Reversal)
        }

        // Filter 2: Market Structure (Change of Character / ChoCh)
        // Ensure we haven't broken the major swing low of the recent uptrend
        const recentLows = low.slice(Math.max(0, lastIdx - 20), lastIdx - 2);
        if (recentLows.length > 0) {
            const lowestRecent = Math.min(...recentLows);
            if (currentLow < lowestRecent * 0.998) { 
                return null; // Structure broken, lower low printed (Reversal)
            }
        }

        // Setup like climax: strong rejection wick at the EMA
        const range = currentHigh - currentLow;
        const body = Math.abs(currentClose - currentOpen);
        const lowerWick = Math.min(currentOpen, currentClose) - currentLow;
        
        const isRejection = lowerWick > body * 1.5 && lowerWick > range * 0.4; // Strong wick
        const isBullishEngulfing = currentClose > currentOpen && currentClose > candles[lastIdx - 1].open && currentOpen < candles[lastIdx - 1].close;

        if (isRejection || isBullishEngulfing) {
            // Ensure trend structure isn't broken (close must be above EMA50)
            if (currentClose < ema50[lastIdx]) return null;

            direction = 'LONG';
            score = isRejection ? 85 : 80;
            reason = isRejection ? 'Trend Pullback + Rejection Wick at EMA' : 'Trend Pullback + Bullish Engulfing at EMA';
            
            // SL below the swing low (the wick) with 1.5 ATR buffer to avoid liquidity sweeps (stop hunts)
            const localLow = Math.min(currentLow, prevLow, low[lastIdx - 2] || currentLow);
            sl = localLow - (currentAtr * 1.5); 
            
            // Prevent SL from being too close (hard min 0.75% away)
            if ((currentPrice - sl) / currentPrice < 0.0075) {
                sl = currentPrice * (1 - 0.0075);
            }
            // Cap maximum SL distance at 3.5% to protect capital on 5x leverage (max 17.5% margin loss)
            if ((currentPrice - sl) / currentPrice > 0.035) {
                sl = currentPrice * (1 - 0.035);
            }
        }
    } else if (isDowntrend) {
        // Price must have pulled back to EMA21 or EMA50
        const touchedEMA = currentHigh >= ema21[lastIdx] || prevHigh >= ema21[lastIdx - 1];
        if (!touchedEMA) return null;
        
        // Filter 1: Volume Exhaustion (Effort vs Result)
        // If the rally into the EMA was driven by massive structural buying volume (full bodied green candles)
        const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
        const prevBody = Math.abs(close[lastIdx - 1] - candles[lastIdx - 1].open);
        const prevRange = high[lastIdx - 1] - low[lastIdx - 1];
        const isPrevBullish = close[lastIdx - 1] > candles[lastIdx - 1].open;
        
        if (isPrevBullish && prevVolRatio > 2.0 && prevBody > prevRange * 0.7) {
            return null; // Heavy institutional buying pump, abort trade (Reversal)
        }

        // Filter 2: Market Structure (Change of Character / ChoCh)
        // Ensure we haven't broken the major swing high of the recent downtrend
        const recentHighs = high.slice(Math.max(0, lastIdx - 20), lastIdx - 2);
        if (recentHighs.length > 0) {
            const highestRecent = Math.max(...recentHighs);
            if (currentHigh > highestRecent * 1.002) { 
                return null; // Structure broken, higher high printed (Reversal)
            }
        }

        // Setup like climax: strong rejection wick at the EMA
        const range = currentHigh - currentLow;
        const body = Math.abs(currentClose - currentOpen);
        const upperWick = currentHigh - Math.max(currentOpen, currentClose);
        
        const isRejection = upperWick > body * 1.5 && upperWick > range * 0.4;
        const isBearishEngulfing = currentClose < currentOpen && currentClose < candles[lastIdx - 1].open && currentOpen > candles[lastIdx - 1].close;

        if (isRejection || isBearishEngulfing) {
            // Ensure trend structure isn't broken (close must be below EMA50)
            if (currentClose > ema50[lastIdx]) return null;

            direction = 'SHORT';
            score = isRejection ? 85 : 80;
            reason = isRejection ? 'Trend Pullback + Rejection Wick at EMA' : 'Trend Pullback + Bearish Engulfing at EMA';
            
            // SL above the swing high with 1.5 ATR buffer to avoid liquidity sweeps (stop hunts)
            const localHigh = Math.max(currentHigh, prevHigh, high[lastIdx - 2] || currentHigh);
            sl = localHigh + (currentAtr * 1.5);
            
            // Prevent SL from being too close (hard min 0.75% away)
            if ((sl - currentPrice) / currentPrice < 0.0075) {
                sl = currentPrice * (1 + 0.0075);
            }
            // Cap maximum SL distance at 3.5% to protect capital on 5x leverage (max 17.5% margin loss)
            if ((sl - currentPrice) / currentPrice > 0.035) {
                sl = currentPrice * (1 + 0.035);
            }
        }
    }

    if (!direction) return null;

    // Calculate TP based on ATR (e.g. 1.5 to 2.5 risk reward)
    const risk = Math.abs(currentPrice - sl);
    const tp1 = direction === 'LONG' ? currentPrice + (risk * 1.5) : currentPrice - (risk * 1.5);
    const tp2 = direction === 'LONG' ? currentPrice + (risk * 2.5) : currentPrice - (risk * 2.5);
    const tp3 = direction === 'LONG' ? currentPrice + (risk * 4.0) : currentPrice - (risk * 4.0);

    return {
        direction,
        score,
        atr: currentAtr,
        sl,
        tp1,
        tp2,
        tp3,
        reason,
        signalTime: candles[lastIdx].time
    };
}
