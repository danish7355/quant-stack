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
    if (candles.length < 35) return null;

    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const open = candles.map(c => c.open);
    const volume = candles.map(c => c.volume || 0);

    const ema21 = calcEma(close, 21);
    const ema50 = calcEma(close, 50);
    const atr = calcAtr(high, low, close, 14);

    const lastIdx = close.length - 1;
    const currentAtr = atr[lastIdx] || (high[lastIdx] - low[lastIdx]) || (currentPrice * 0.015);
    
    const avgVol20 = volume.slice(Math.max(0, lastIdx - 20), lastIdx).reduce((a, b) => a + b, 0) / 20;
    
    // Pure Trend Setup: Enforce genuine directional trend and eliminate flat chop
    const emaDistance = Math.abs(ema21[lastIdx] - ema50[lastIdx]);
    const isUptrend = ema21[lastIdx] > ema50[lastIdx] && emaDistance >= (0.25 * currentAtr) && ema21[lastIdx] > ema21[lastIdx - 3];
    const isDowntrend = ema21[lastIdx] < ema50[lastIdx] && emaDistance >= (0.25 * currentAtr) && ema21[lastIdx] < ema21[lastIdx - 3];

    if (!isUptrend && !isDowntrend) return null; // Flat or choppy market - stand aside!

    // Filter out illiquid pump-and-dump spikes (ATR > 4% of price)
    if (currentAtr / currentPrice > 0.04) return null;

    const currentHigh = high[lastIdx];
    const currentLow = low[lastIdx];
    const currentClose = close[lastIdx];
    const currentOpen = open[lastIdx];
    const prevLow = low[lastIdx - 1];
    const prevHigh = high[lastIdx - 1];
    const prevClose = close[lastIdx - 1];
    const prevOpen = open[lastIdx - 1];

    let direction: 'LONG' | 'SHORT' | null = null;
    let score = 0;
    let reason = '';
    let sl = 0;

    // Volume of the pullback wave (candles leading into value area)
    const pullbackVolSlice = volume.slice(Math.max(0, lastIdx - 4), lastIdx);
    const avgPullbackVol = pullbackVolSlice.length ? pullbackVolSlice.reduce((a, b) => a + b, 0) / pullbackVolSlice.length : avgVol20;
    const currentVol = volume[lastIdx];

    // ==========================================
    // LONG PULLBACK EVALUATION
    // ==========================================
    if (isUptrend) {
        // Setup: Price pulled back into dynamic value area (near EMA21 or EMA50)
        const touchedValue = (currentLow <= ema21[lastIdx] * 1.004) || (prevLow <= ema21[lastIdx - 1] * 1.004);
        if (!touchedValue) return null;

        // Volume Filter: Pullback should not be an institutional panic dump
        const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
        const prevBody = Math.abs(prevClose - prevOpen);
        const prevRange = prevHigh - prevLow;
        if (prevClose < prevOpen && prevVolRatio > 2.2 && prevBody > prevRange * 0.75) {
            return null; // Heavy institutional dump, skip trade
        }

        // Trigger: Rejection wick at value level OR Bullish Engulfing
        const range = currentHigh - currentLow;
        const body = Math.abs(currentClose - currentOpen);
        const lowerWick = Math.min(currentOpen, currentClose) - currentLow;
        
        const isRejection = lowerWick > body * 1.2 && lowerWick >= range * 0.38;
        const isBullishEngulfing = currentClose > currentOpen && currentClose > prevHigh && prevClose < prevOpen && body >= range * 0.40;

        if (isRejection || isBullishEngulfing) {
            // Quality Volume Confirmation:
            // Volume is expanding on the bounce (buyers defending value area) OR pullback volume was dried up
            const volumeConfirmed = (currentVol >= avgPullbackVol * 1.05) || (avgPullbackVol <= avgVol20 * 0.95);
            if (!volumeConfirmed) return null;

            direction = 'LONG';
            score = 86;
            if (isRejection) score += 4;
            if (currentVol > avgVol20 * 1.2) score += 5;

            reason = isRejection ? 'Trend Pullback: Clean Rejection Wick at Value + Vol Defense' : 'Trend Pullback: Bullish Engulfing at Value + Vol Expansion';

            // Tight, Logical Stop Loss: Just below the rejection wick (+0.25 ATR buffer)
            const localLow = Math.min(currentLow, prevLow);
            sl = localLow - (currentAtr * 0.30);

            // Anti-chasing: If price has already rocketed > 1.2 ATR away from the low, reject
            if ((currentPrice - localLow) > currentAtr * 1.2) {
                return null;
            }
        }
    } 
    // ==========================================
    // SHORT PULLBACK EVALUATION
    // ==========================================
    else if (isDowntrend) {
        // Setup: Price rallied into dynamic value area (near EMA21 or EMA50)
        const touchedValue = (currentHigh >= ema21[lastIdx] * 0.996) || (prevHigh >= ema21[lastIdx - 1] * 0.996);
        if (!touchedValue) return null;

        // Volume Filter: Rally should not be an aggressive institutional pump
        const prevVolRatio = volume[lastIdx - 1] / (avgVol20 || 1);
        const prevBody = Math.abs(prevClose - prevOpen);
        const prevRange = prevHigh - prevLow;
        if (prevClose > prevOpen && prevVolRatio > 2.2 && prevBody > prevRange * 0.75) {
            return null; // Heavy institutional pump, skip trade
        }

        // Trigger: Rejection wick at value level OR Bearish Engulfing
        const range = currentHigh - currentLow;
        const body = Math.abs(currentClose - currentOpen);
        const upperWick = currentHigh - Math.max(currentOpen, currentClose);
        
        const isRejection = upperWick > body * 1.2 && upperWick >= range * 0.38;
        const isBearishEngulfing = currentClose < currentOpen && currentClose < prevLow && prevClose > prevOpen && body >= range * 0.40;

        if (isRejection || isBearishEngulfing) {
            // Quality Volume Confirmation
            const volumeConfirmed = (currentVol >= avgPullbackVol * 1.05) || (avgPullbackVol <= avgVol20 * 0.95);
            if (!volumeConfirmed) return null;

            direction = 'SHORT';
            score = 86;
            if (isRejection) score += 4;
            if (currentVol > avgVol20 * 1.2) score += 5;

            reason = isRejection ? 'Trend Pullback: Clean Upper Rejection Wick at Value + Vol Resistance' : 'Trend Pullback: Bearish Engulfing at Value + Vol Expansion';

            // Tight, Logical Stop Loss: Just above the rejection wick (+0.30 ATR buffer)
            const localHigh = Math.max(currentHigh, prevHigh);
            sl = localHigh + (currentAtr * 0.30);

            // Anti-chasing: If price has already dumped > 1.2 ATR away from the high, reject
            if ((localHigh - currentPrice) > currentAtr * 1.2) {
                return null;
            }
        }
    }

    if (!direction || sl <= 0) return null;

    const risk = Math.abs(currentPrice - sl);
    if (risk <= 0) return null;

    // Enforce Minimum Reward-to-Risk >= 1.5 to TP1
    const tp1 = direction === 'LONG' ? currentPrice + (risk * 1.5) : currentPrice - (risk * 1.5);
    const tp2 = direction === 'LONG' ? currentPrice + (risk * 2.5) : currentPrice - (risk * 2.5);
    const tp3 = direction === 'LONG' ? currentPrice + (risk * 4.0) : currentPrice - (risk * 4.0);

    return {
        direction,
        score: Math.min(99, score),
        atr: currentAtr,
        sl,
        tp1,
        tp2,
        tp3,
        reason,
        signalTime: candles[lastIdx].time
    };
}
