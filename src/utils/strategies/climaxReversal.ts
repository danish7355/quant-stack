import { AppSettings } from '../../types';

export interface CRSignal {
    status: 'confirmed' | 'pending' | 'rejected';
    reason?: string;
    direction?: 'LONG' | 'SHORT';
    entry?: number;
    stop?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    riskPerUnit?: number;
    atr?: number;
    candleTime?: number;
}

function calcEma(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calcSma(data: number[], period: number): number[] {
    const sma = new Array(data.length).fill(0);
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j];
        }
        sma[i] = sum / period;
    }
    return sma;
}

function enrichCandles(candles: any[], settings: AppSettings) {
    const close = candles.map(c => c.close);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const volume = candles.map(c => c.volume || 0);
    const emaBaseline = calcEma(close, settings.crEmaBaseline);
    const emaFast = calcEma(close, 5);
    const emaMtf = calcEma(close, 200); // represents 1H EMA 50 on 15m

    
    const tr = [high[0] - low[0]];
    for(let i = 1; i < candles.length; i++) {
        const hl = high[i] - low[i];
        const hpc = Math.abs(high[i] - close[i - 1]);
        const lpc = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(hl, hpc, lpc));
    }
    
    const atr = calcSma(tr, settings.crAtrPeriod);
    const atrAvg = calcSma(atr, settings.crAtrAveragePeriod);
    
    const range = candles.map(c => c.high - c.low);
    const avgRange = calcSma(range, settings.crClimaxLookback);
    
    const avgVolume = calcSma(volume, settings.crClimaxLookback);
    
    return candles.map((c, i) => ({
        ...c,
        volume: volume[i],
        avgVolume: avgVolume[i],
        emaBaseline: emaBaseline[i],
        emaFast: emaFast[i],
        atr: atr[i],
        atrAvg: atrAvg[i],
        range: range[i],
        avgRange: avgRange[i]
    }));
}

function isClimaxCandle(row: any, settings: AppSettings) {
    if (settings.disabledGates?.['CR_climaxRange'] || settings.disabledGates?.['cr_climaxRange']) return true;
    if (row.volume && row.avgVolume && row.volume >= row.avgVolume * 2.5) return true; // Auto-bypass if volume is insanely high
    if (!row.avgRange) return false;
    return row.range >= settings.crMinClimaxRangeRatio * row.avgRange;
}

function isOverextended(row: any, direction: 'LONG'|'SHORT', settings: AppSettings) {
    if (settings.disabledGates?.['CR_overextension'] || settings.disabledGates?.['cr_overextension']) return true;
    if (!row.atr || !row.emaBaseline) return false;
    
    // For a Bearish Climax (SHORT), price MUST be extended ABOVE the baseline (in premium territory)
    if (direction === 'SHORT') {
        const baselineDist = row.close - row.emaBaseline;
        const fastDist = row.emaFast ? row.close - row.emaFast : 0;
        return baselineDist >= settings.crMinOverextensionAtr * row.atr || fastDist >= settings.crMinOverextensionAtr * row.atr;
    }
    
    // For a Bullish Climax (LONG), price MUST be extended BELOW the baseline (in discount territory)
    if (direction === 'LONG') {
        const baselineDist = row.emaBaseline - row.close;
        const fastDist = row.emaFast ? row.emaFast - row.close : 0;
        return baselineDist >= settings.crMinOverextensionAtr * row.atr || fastDist >= settings.crMinOverextensionAtr * row.atr;
    }
    
    return false;
}

function volatilityOk(row: any, settings: AppSettings) {
    if (settings.disabledGates?.['CR_volatility'] || settings.disabledGates?.['cr_volatility']) return true;
    if (row.volume && row.avgVolume && row.volume >= row.avgVolume * 2.5) return true;
    if (!row.atrAvg) return false;
    return row.atr >= settings.crMinAtrVsAverage * row.atrAvg;
}

function rejectionRatio(row: any) {
    const totalRange = row.high - row.low;
    if (totalRange === 0) return 0.0;
    const bodyTop = Math.max(row.open, row.close);
    const bodyBottom = Math.min(row.open, row.close);
    let wick = 0;
    if (row.close < row.open) { // bearish
        wick = row.high - bodyTop;
    } else {
        wick = bodyBottom - row.low;
    }
    return wick / totalRange;
}

function swingPoints(enriched: any[], kind: 'high'|'low', window: number = 3) {
    const points: {idx: number, val: number}[] = [];
    const span = window * 2 + 1;
    for(let i = span - 1; i < enriched.length; i++) {
        const slice = enriched.slice(i - span + 1, i + 1);
        const center = slice[window];
        let isExtreme = true;
        for(let j = 0; j < slice.length; j++) {
            if (kind === 'low' && slice[j].low < center.low) isExtreme = false;
            if (kind === 'high' && slice[j].high > center.high) isExtreme = false;
        }
        if(isExtreme) {
            points.push({idx: i - window, val: kind === 'high' ? center.high : center.low});
        }
    }
    return points;
}

function nearestStructureTarget(enriched: any[], direction: 'LONG'|'SHORT', entry: number, lookback: number = 50, excludeRecent: number = 3, pivotWindow: number = 3) {
    const end = enriched.length - excludeRecent;
    const start = Math.max(0, end - lookback);
    const windowSlice = enriched.slice(start, end);
    if(windowSlice.length < pivotWindow * 2 + 1) return null;
    
    if (direction === 'LONG') {
        const swings = swingPoints(windowSlice, 'high', pivotWindow);
        const candidates = swings.filter(s => s.val > entry).map(s => s.val);
        return candidates.length > 0 ? Math.min(...candidates) : null;
    }
    const swings = swingPoints(windowSlice, 'low', pivotWindow);
    const candidates = swings.filter(s => s.val < entry).map(s => s.val);
    return candidates.length > 0 ? Math.max(...candidates) : null;
}

function buildSignal(direction: 'LONG'|'SHORT', enriched: any[], c1: any, c2: any, c3: any, stopLevel: number, settings: AppSettings): CRSignal {
    const entry = c3.close; // Enter on the live candle
    const atr = c2.atr || (c2.high - c2.low);
    const riskPerUnit = Math.abs(entry - stopLevel);

    // ANTI-CHASING GUARD: If entry is too far from stop level (already moved > 1.4 ATR), reject
    if (riskPerUnit > atr * 1.5) {
        return { status: 'rejected', reason: 'entry_too_extended' };
    }

    // Calculate POC (Point of Control) over last 100 candles
    let score = 85; // base score for confirmed reversal peak
    if (settings.useVpvrFilter) {
        const profileLookback = Math.min(100, enriched.length);
        const profileCandles = enriched.slice(enriched.length - profileLookback, enriched.length);
        let minP = Infinity, maxP = -Infinity;
        profileCandles.forEach(c => {
            if (c.low < minP) minP = c.low;
            if (c.high > maxP) maxP = c.high;
        });
        const bins = 20;
        const binSize = (maxP - minP) / bins;
        const volumeProfile = new Array(bins).fill(0);
        profileCandles.forEach(c => {
            const typPrice = (c.high + c.low + c.close) / 3;
            let binIdx = Math.floor((typPrice - minP) / binSize);
            if (binIdx >= bins) binIdx = bins - 1;
            if (binIdx < 0) binIdx = 0;
            volumeProfile[binIdx] += c.volume;
        });
        let maxVol = -1;
        let pocIdx = 0;
        volumeProfile.forEach((v, idx) => {
            if (v > maxVol) {
                maxVol = v;
                pocIdx = idx;
            }
        });
        const pocPrice = minP + pocIdx * binSize + (binSize / 2);
        const distToPoc = Math.abs(stopLevel - pocPrice) / (atr || 1);
        if (distToPoc < 1.0) {
            score = 98; // Bounced right off POC!
        } else if (distToPoc > 3.0) {
            score = 65; // Bounced in empty space
        } else {
            score = 85;
        }
    }

    const bypassStopDistance = settings.disabledGates?.['CR_stopDistance'] || settings.disabledGates?.['cr_stopDistance'];
    const bypassRewardRisk = settings.disabledGates?.['CR_rewardRisk'] || settings.disabledGates?.['cr_rewardRisk'];
    
    if (!bypassStopDistance && (!atr || riskPerUnit < settings.crMinStopDistanceAtr * atr)) {
        return { status: 'rejected', reason: 'stop_too_tight' };
    }
    
    const target = nearestStructureTarget(enriched, direction, entry);
    if (!bypassRewardRisk && target !== null) {
        const reward = Math.abs(target - entry);
        if (riskPerUnit === 0 || reward / riskPerUnit < settings.crMinRewardRisk) {
            return { status: 'rejected', reason: 'poor_reward_risk' };
        }
    }
    
    let tp1, tp2, tp3;
    const tp1R = 1.5; // Quick 1:1.5 BE trigger
    const tp2R = 3.0; // Standard 1:3 profit target
    const tp3R = 5.0; // Extended 1:5 runner
    
    if (direction === 'LONG') {
        tp1 = entry + tp1R * riskPerUnit;
        tp2 = entry + tp2R * riskPerUnit;
        tp3 = target !== null ? Math.max(entry + tp3R * riskPerUnit, target) : entry + tp3R * riskPerUnit;
    } else {
        tp1 = Math.max(0.0001, entry - tp1R * riskPerUnit);
        tp2 = Math.max(0.0001, entry - tp2R * riskPerUnit);
        tp3 = Math.max(0.0001, target !== null ? Math.min(entry - tp3R * riskPerUnit, target) : entry - tp3R * riskPerUnit);
    }
    
    return {
        status: 'confirmed',
        direction,
        entry,
        stop: stopLevel,
        tp1,
        tp2,
        tp3,
        riskPerUnit,
        atr,
        candleTime: c2.time,
        reason: 'climax_reversal_confirmed'
    };
}

export function findCRSetup(candles: any[], settings: AppSettings): CRSignal | null {
    const minHistory = Math.max(settings.crClimaxLookback, settings.crAtrAveragePeriod, settings.crEmaBaseline) + 5;
    if (candles.length < minHistory) {
        return null;
    }
    
    const enriched = enrichCandles(candles, settings);
    // c1 = Climax candle, c2 = Reversal/Rejection candle (must be fully closed!)
    const c1 = enriched[enriched.length - 3];
    const c2 = enriched[enriched.length - 2];
    // length - 1 is the live, fluctuating candle (c3). We don't evaluate criteria on the live candle!
    const c3 = enriched[enriched.length - 1];
    
    const cPrev1 = enriched[enriched.length - 4] || c1;
    const cPrev2 = enriched[enriched.length - 5] || c1;

    // WATERFALL / PARABOLIC CASCADE PROTECTION
    const dropDistance = cPrev2.high - c1.low;
    const isWaterfall = cPrev2.close < cPrev2.open && cPrev1.close < cPrev1.open && c1.close < c1.open && (dropDistance > c1.atr * 3.0);
    
    const pumpDistance = c1.high - cPrev2.low;
    const isParabolic = cPrev2.close > cPrev2.open && cPrev1.close > cPrev1.open && c1.close > c1.open && (pumpDistance > c1.atr * 3.0);

    const bypassRejectionWick = settings.disabledGates?.['CR_rejectionWick'] || settings.disabledGates?.['cr_rejectionWick'];

    // Recent Swing High / Low check to avoid shorting the floor or buying the ceiling
    const recentLows = enriched.slice(Math.max(0, enriched.length - 25), enriched.length - 2).map(c => c.low);
    const lowestRecentLow = recentLows.length > 0 ? Math.min(...recentLows) : c1.low;
    const recentHighs = enriched.slice(Math.max(0, enriched.length - 25), enriched.length - 2).map(c => c.high);
    const highestRecentHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : c1.high;

    const mtfShortOk = !settings.useMtfAlignment || (c1.emaBaseline < c1.emaMtf);
    const mtfLongOk = !settings.useMtfAlignment || (c1.emaBaseline > c1.emaMtf);

    // SHORT SETUP (Parabolic Peak Reversal -> Enter right at the top!)
    const shortParabolicPassed = !isParabolic || (c2.close < c1.close - (c1.close - c1.open) * 0.5);

    if (
        mtfShortOk &&
        c1.close > c1.open &&
        c1.close > (c1.emaBaseline || 0) && // MUST be above baseline, not deep in a downtrend
        c1.high >= highestRecentHigh * 0.995 && // MUST be at or near the peak of the recent swing
        isClimaxCandle(c1, settings) &&
        isOverextended(c1, 'SHORT', settings) &&
        volatilityOk(c1, settings) &&
        c2.close < c2.open &&
        shortParabolicPassed &&
        (bypassRejectionWick || rejectionRatio(c2) >= settings.crMinRejectionWickRatio || c2.close < c1.open) &&
        c2.high >= c1.high * 0.998 &&
        c2.close > (lowestRecentLow + c2.atr * 0.4) // Do not short directly into the floor support
    ) {
        const stopLevel = Math.max(c1.high, c2.high) + (c2.atr * 0.2); // Tight stop loss at the peak with anti-hunt buffer
        return buildSignal('SHORT', enriched, c1, c2, c3, stopLevel, settings);
    }

    // LONG SETUP (Capitulation Bottom Reversal -> Enter right at the bottom!)
    const longWaterfallPassed = !isWaterfall || (c2.close > c1.close + (c1.open - c1.close) * 0.5);

    if (
        mtfLongOk &&
        c1.close < c1.open &&
        c1.close < (c1.emaBaseline || Infinity) && // MUST be below baseline, not at the top of an uptrend
        c1.low <= lowestRecentLow * 1.005 && // MUST be at or near the bottom of the recent swing
        isClimaxCandle(c1, settings) &&
        isOverextended(c1, 'LONG', settings) &&
        volatilityOk(c1, settings) &&
        c2.close > c2.open &&
        longWaterfallPassed &&
        (bypassRejectionWick || rejectionRatio(c2) >= settings.crMinRejectionWickRatio || c2.close > c1.open) &&
        c2.low <= c1.low * 1.002 &&
        c2.close < (highestRecentHigh - c2.atr * 0.4) // Do not buy directly into the ceiling resistance
    ) {
        const stopLevel = Math.min(c1.low, c2.low) - (c2.atr * 0.2); // Tight stop loss at the trough with anti-hunt buffer
        return buildSignal('LONG', enriched, c1, c2, c3, stopLevel, settings);
    }

    return null;
}
