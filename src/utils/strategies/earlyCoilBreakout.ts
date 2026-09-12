import { AppSettings } from '../../types';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export function calculateEMA(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateSMA(data: number[], period: number): number[] {
  if (data.length < period) return Array(data.length).fill(0);
  const sma: number[] = Array(period - 1).fill(0);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  sma.push(sum / period);
  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period] + data[i];
    sma.push(sum / period);
  }
  return sma;
}

export function calculateATR(candles: Candle[], period: number): number[] {
  if (candles.length < 2) return candles.map(() => 0);
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return calculateSMA(tr, period);
}

export function calculateBollingerBands(closes: number[], period: number, stdDevMult: number) {
  const sma = calculateSMA(closes, period);
  const bands = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      bands.push({ mid: closes[i], upper: closes[i], lower: closes[i], width: 0 });
      continue;
    }
    
    let sumSqr = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSqr += Math.pow(closes[j] - sma[i], 2);
    }
    const stdDev = Math.sqrt(sumSqr / period);
    const mid = sma[i];
    const upper = mid + (stdDevMult * stdDev);
    const lower = mid - (stdDevMult * stdDev);
    const width = mid === 0 ? 0 : (upper - lower) / mid;
    
    bands.push({ mid, upper, lower, width });
  }
  return bands;
}

export function linregSlope(data: number[], lookback: number): number {
  if (data.length < lookback) return 0;
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  
  const recentData = data.slice(-lookback);
  const n = lookback;
  
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recentData[i];
    sumX += x;
    sumY += y;
    sumXY += (x * y);
    sumX2 += (x * x);
  }
  
  const denominator = (n * sumX2) - (sumX * sumX);
  if (denominator === 0) return 0;
  
  return ((n * sumXY) - (sumX * sumY)) / denominator;
}

export function percentileRank(value: number, arr: number[]): number {
  if (arr.length === 0) return 100;
  let count = 0;
  for (const v of arr) {
    if (v < value) count++;
    else if (v === value) count += 0.5; // Half rank for ties
  }
  return (count / arr.length) * 100;
}

export function findFractalPivotLows(lows: number[], window: number): { index: number; val: number }[] {
  const pivots = [];
  for (let i = window; i < lows.length - window; i++) {
    let isPivot = true;
    for (let j = 1; j <= window; j++) {
      if (lows[i - j] < lows[i] || lows[i + j] < lows[i]) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ index: i, val: lows[i] });
  }
  return pivots;
}

export function findFractalPivotHighs(highs: number[], window: number): { index: number; val: number }[] {
  const pivots = [];
  for (let i = window; i < highs.length - window; i++) {
    let isPivot = true;
    for (let j = 1; j <= window; j++) {
      if (highs[i - j] > highs[i] || highs[i + j] > highs[i]) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ index: i, val: highs[i] });
  }
  return pivots;
}

export interface EarlyCoilBreakoutMetrics {
  direction: 'LONG' | 'SHORT';
  score: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  atr: number;
  reason: string;
  compressionHigh?: number;
  compressionLow?: number;
}

export function evaluateEarlyCoilBreakout(
  candles: Candle[], 
  settings: AppSettings, 
  lookback: number = 100
): EarlyCoilBreakoutMetrics | null {
  // Need minimum candles for technical evaluation
  if (!candles || candles.length < 28) return null;
  
  const t = candles.length - 1;
  const currentCandle = candles[t];
  const prevCandle = candles[t - 1];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Adaptive lookback based on available history
  const effectiveLookback = Math.min(candles.length - 1, lookback);
  
  // Strategy Parameters
  const bbPeriod = 20;
  const bbStdDev = 2;
  const atrPeriod = 14;
  const compressionPctile = 35; // Top tier compression threshold
  const pivotWindow = 2;
  const emaFast = 5;
  const atrStopBuffer = 0.35;
  const compressionWindowSize = Math.min(24, candles.length - 5);
  
  // Indicators
  const bb = calculateBollingerBands(closes, bbPeriod, bbStdDev);
  const atrs = calculateATR(candles, atrPeriod);
  const ema5 = calculateEMA(closes, emaFast);
  
  const currentAtr = atrs[t] || (currentCandle.high - currentCandle.low) || (currentCandle.close * 0.015);
  if (currentAtr <= 0) return null;
  
  // 1. Compression Check: BB width or ATR in bottom percentile, or narrow range ratio
  const sliceStart = Math.max(0, t - effectiveLookback);
  const bbWidthsLookback = bb.slice(sliceStart, t + 1).map(b => b.width).filter(w => w > 0);
  const atrsLookback = atrs.slice(sliceStart, t + 1).filter(a => a > 0);
  
  const curBbPctile = percentileRank(bb[t].width, bbWidthsLookback);
  const curAtrPctile = percentileRank(currentAtr, atrsLookback);

  // Find range high and range low over the compression window (preceding bars)
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = t - compressionWindowSize; i < t; i++) {
    if (i < 0) continue;
    if (highs[i] > rangeHigh) rangeHigh = highs[i];
    if (lows[i] < rangeLow) rangeLow = lows[i];
  }
  if (!isFinite(rangeHigh) || !isFinite(rangeLow)) return null;
  const rangeWidth = rangeHigh - rangeLow;
  if (rangeWidth <= 0) return null;

  // Compression is active if:
  // - BB width or ATR is in bottom 35th percentile, OR
  // - The range width is tight relative to ATR (<= 5.0 * ATR)
  const isCompressed = (curBbPctile <= compressionPctile) || 
                       (curAtrPctile <= compressionPctile) || 
                       (rangeWidth <= 5.0 * currentAtr);
  if (!isCompressed) return null;

  // Volume contraction check inside the coil
  const preVolumeSlice = volumes.slice(Math.max(0, t - 8), t);
  const volSlope = linregSlope(preVolumeSlice, preVolumeSlice.length);
  const avgVol20 = volumes.slice(Math.max(0, t - 20), t).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, t));
  const recentAvgVol = preVolumeSlice.reduce((a, b) => a + b, 0) / Math.max(1, preVolumeSlice.length);
  const volumeContracted = volSlope <= 0 || recentAvgVol <= avgVol20 * 1.15;

  // Fractal pivots inside the coil
  const pivotLows = findFractalPivotLows(lows, pivotWindow);
  const recentPivotLows = pivotLows.filter(p => p.index >= t - compressionWindowSize && p.index < t);
  const pivotHighs = findFractalPivotHighs(highs, pivotWindow);
  const recentPivotHighs = pivotHighs.filter(p => p.index >= t - compressionWindowSize && p.index < t);

  // =========================================================================
  // SETUP 1: COIL APEX TRENDLINE BREAKOUT
  // Price has compressed with lower highs and higher lows into an apex.
  // The breakout bar breaks the coil boundary with confirmed expanding volume!
  // =========================================================================

  const currentVol = currentCandle.volume || 0;
  const hasBreakoutVolume = avgVol20 > 0 && currentVol >= avgVol20 * 1.25;

  // --- 1A. BULLISH COIL BREAKOUT ---
  // Either pierced descending coil trendline OR closed above coil upper boundary
  if (recentPivotHighs.length >= 2 && recentPivotLows.length >= 2) {
    const lastPivotLow = recentPivotLows[recentPivotLows.length - 1];
    const prevPivotLow = recentPivotLows[recentPivotLows.length - 2];
    
    // Coil Geometry check: Must have higher lows (or flat lows)
    const isHigherLow = lastPivotLow.val >= prevPivotLow.val * 0.998;
    
    let minSinceLastPivot = Infinity;
    for (let i = lastPivotLow.index + 1; i <= t; i++) {
      if (lows[i] < minSinceLastPivot) minSinceLastPivot = lows[i];
    }
    const higherLowIntact = minSinceLastPivot >= lastPivotLow.val * 0.998;

    const p1 = recentPivotHighs[recentPivotHighs.length - 2];
    const p2 = recentPivotHighs[recentPivotHighs.length - 1];
    
    // Coil Geometry check: Upper trendline must be descending (or flat)
    const isDescendingHigh = p2.val <= p1.val + (currentAtr * 0.1);

    const m = (p2.val - p1.val) / (p2.index - p1.index);
    const b = p1.val - (m * p1.index);
    const valAtT = m * t + b;
    const valAtTMinus1 = m * (t - 1) + b;
    
    // Trendline break requires candle close above line
    const trendlineBreak = closes[t] > valAtT && closes[t - 1] <= valAtTMinus1;
    const clearedLocalResistance = closes[t] > p2.val;
    const validBreakout = trendlineBreak || clearedLocalResistance;
    
    const candleIsBullish = currentCandle.close > currentCandle.open;
    const candleRange = currentCandle.high - currentCandle.low;
    const strongClose = candleRange > 0 && (currentCandle.close - currentCandle.low) >= candleRange * 0.70;
    const notOverextended = (currentCandle.close - currentCandle.open) <= (1.2 * currentAtr);

    // Must have contracted volume leading into the coil AND volume expansion on breakout bar
    if (isHigherLow && isDescendingHigh && higherLowIntact && validBreakout && candleIsBullish && strongClose && notOverextended && hasBreakoutVolume && volumeContracted) {
      
      // Tight logical stop: Just below the lowest low of the breakout thrust (current or previous candle)
      // This is the origin of the breakout momentum. If breached, the breakout is invalidated.
      const thrustLow = Math.min(currentCandle.low, prevCandle.low);
      const stopPrice = thrustLow - (0.15 * currentAtr);
      
      const riskAmount = currentCandle.close - stopPrice;
      
      if (riskAmount > 0 && riskAmount <= 1.2 * currentAtr) {
        // Volatility Expansion Targets: Breakouts from tight coils cause massive structural moves.
        // We use the maximum of a high R:R multiplier OR a structural measured move of the coil's width.
        const tp1 = currentCandle.close + Math.max(riskAmount * 2.0, rangeWidth * 1.0);
        const tp2 = currentCandle.close + Math.max(riskAmount * 5.0, rangeWidth * 2.5);
        const tp3 = currentCandle.close + Math.max(riskAmount * 10.0, rangeWidth * 5.0);

        let score = 86;
        if (hasBreakoutVolume) score += 5;
        if (curBbPctile <= 25) score += 4;

        return {
          direction: 'LONG',
          score: Math.min(95, score),
          sl: stopPrice,
          tp1,
          tp2,
          tp3,
          atr: currentAtr,
          compressionHigh: rangeHigh,
          compressionLow: rangeLow,
          reason: `Early Coil Breakout LONG (Apex Trendline Pierced, Confirmed Geometry, RVOL: ${(currentVol / (avgVol20 || 1)).toFixed(2)}x)`
        };
      }
    }
  }

  // --- 1B. BEARISH COIL BREAKDOWN ---
  if (recentPivotLows.length >= 2 && recentPivotHighs.length >= 2) {
    const lastPivotHigh = recentPivotHighs[recentPivotHighs.length - 1];
    const prevPivotHigh = recentPivotHighs[recentPivotHighs.length - 2];
    
    // Coil Geometry check: Must have lower highs (or flat highs)
    const isLowerHigh = lastPivotHigh.val <= prevPivotHigh.val * 1.002;
    
    let maxSinceLastPivot = -Infinity;
    for (let i = lastPivotHigh.index + 1; i <= t; i++) {
      if (highs[i] > maxSinceLastPivot) maxSinceLastPivot = highs[i];
    }
    const lowerHighIntact = maxSinceLastPivot <= lastPivotHigh.val * 1.002;

    const p1 = recentPivotLows[recentPivotLows.length - 2];
    const p2 = recentPivotLows[recentPivotLows.length - 1];
    
    // Coil Geometry check: Lower trendline must be ascending (or flat)
    const isAscendingLow = p2.val >= p1.val - (currentAtr * 0.1);

    const m = (p2.val - p1.val) / (p2.index - p1.index);
    const b = p1.val - (m * p1.index);
    const valAtT = m * t + b;
    const valAtTMinus1 = m * (t - 1) + b;
    
    const trendlineBreakShort = closes[t] < valAtT && closes[t - 1] >= valAtTMinus1;
    const clearedLocalSupport = closes[t] < p2.val;
    const validBreakoutShort = trendlineBreakShort || clearedLocalSupport;

    const candleIsBearish = currentCandle.close < currentCandle.open;
    const candleRange = currentCandle.high - currentCandle.low;
    const strongClose = candleRange > 0 && (currentCandle.high - currentCandle.close) >= candleRange * 0.70;
    const notOverextended = (currentCandle.open - currentCandle.close) <= (1.2 * currentAtr);

    if (isLowerHigh && isAscendingLow && lowerHighIntact && validBreakoutShort && candleIsBearish && strongClose && notOverextended && hasBreakoutVolume && volumeContracted) {
      // Tight logical stop: Just above the highest high of the breakout thrust (current or previous candle)
      // This is the origin of the breakout momentum. If breached, the breakout is invalidated.
      const thrustHigh = Math.max(currentCandle.high, prevCandle.high);
      const stopPrice = thrustHigh + (0.15 * currentAtr);
      
      const riskAmount = stopPrice - currentCandle.close;

      if (riskAmount > 0 && riskAmount <= 1.2 * currentAtr) {
        // Volatility Expansion Targets: Breakdowns from tight coils cause massive structural moves (waterfalls).
        // We use the maximum of a high R:R multiplier OR a structural measured move of the coil's width.
        const tp1 = currentCandle.close - Math.max(riskAmount * 2.0, rangeWidth * 1.0);
        const tp2 = currentCandle.close - Math.max(riskAmount * 5.0, rangeWidth * 2.5);
        const tp3 = currentCandle.close - Math.max(riskAmount * 10.0, rangeWidth * 5.0);

        let score = 86;
        if (hasBreakoutVolume) score += 5;
        if (curBbPctile <= 25) score += 4;

        return {
          direction: 'SHORT',
          score: Math.min(95, score),
          sl: stopPrice,
          tp1,
          tp2,
          tp3,
          atr: currentAtr,
          compressionHigh: rangeHigh,
          compressionLow: rangeLow,
          reason: `Early Coil Breakout SHORT (Apex Trendline Pierced, Confirmed Geometry, RVOL: ${(currentVol / (avgVol20 || 1)).toFixed(2)}x)`
        };
      }
    }
  }

  // =========================================================================
  // SETUP 2: DECISIVE COIL BOUNDARY BREAKOUT (With Volume Surge)
  // When price breaks clean out of the entire coiling range
  // =========================================================================
  if (hasBreakoutVolume && volumeContracted) {
    const isBullBreakout = currentCandle.close > rangeHigh && (currentCandle.close - rangeHigh) <= 0.40 * currentAtr && currentCandle.close > currentCandle.open;
    const isBearBreakout = currentCandle.close < rangeLow && (rangeLow - currentCandle.close) <= 0.40 * currentAtr && currentCandle.close < currentCandle.open;

    if (isBullBreakout) {
      // Logical Stop: Below the origin of the breakout thrust, or just below the broken boundary
      const thrustLow = Math.min(currentCandle.low, prevCandle.low);
      const stopPrice = Math.max(thrustLow - (0.15 * currentAtr), rangeHigh - (0.25 * rangeWidth));
      
      const riskAmount = currentCandle.close - stopPrice;
      if (riskAmount > 0 && riskAmount <= 1.2 * currentAtr) {
        return {
          direction: 'LONG',
          score: 90,
          sl: stopPrice,
          tp1: currentCandle.close + Math.max(riskAmount * 2.0, rangeWidth * 1.0),
          tp2: currentCandle.close + Math.max(riskAmount * 5.0, rangeWidth * 2.5),
          tp3: currentCandle.close + Math.max(riskAmount * 10.0, rangeWidth * 5.0),
          atr: currentAtr,
          compressionHigh: rangeHigh,
          compressionLow: rangeLow,
          reason: `Early Coil Breakout LONG (Decisive Squeeze Expansion, RVOL: ${(currentVol / (avgVol20 || 1)).toFixed(2)}x)`
        };
      }
    } else if (isBearBreakout) {
      // Logical Stop: Above the origin of the breakout thrust, or just above the broken boundary
      const thrustHigh = Math.max(currentCandle.high, prevCandle.high);
      const stopPrice = Math.min(thrustHigh + (0.15 * currentAtr), rangeLow + (0.25 * rangeWidth));
      
      const riskAmount = stopPrice - currentCandle.close;
      if (riskAmount > 0 && riskAmount <= 1.2 * currentAtr) {
        return {
          direction: 'SHORT',
          score: 90,
          sl: stopPrice,
          tp1: currentCandle.close - Math.max(riskAmount * 2.0, rangeWidth * 1.0),
          tp2: currentCandle.close - Math.max(riskAmount * 5.0, rangeWidth * 2.5),
          tp3: currentCandle.close - Math.max(riskAmount * 10.0, rangeWidth * 5.0),
          atr: currentAtr,
          compressionHigh: rangeHigh,
          compressionLow: rangeLow,
          reason: `Early Coil Breakout SHORT (Decisive Squeeze Expansion, RVOL: ${(currentVol / (avgVol20 || 1)).toFixed(2)}x)`
        };
      }
    }
  }

  // Stand aside if no confirmed coil breakout
  return null;
}
