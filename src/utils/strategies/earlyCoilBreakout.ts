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
  lookback: number = 20
): EarlyCoilBreakoutMetrics | null {
  // Need minimum candles for technical evaluation (e.g. 30 to cover EMAs and 20-period lookbacks)
  if (!candles || candles.length < 30) return null;
  
  const t = candles.length - 1;
  const currentCandle = candles[t];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Calculate Indicators
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const atrs = calculateATR(candles, 14);
  
  const currentAtr = atrs[t];
  if (!currentAtr || currentAtr <= 0) return null;
  
  const currentEma9 = ema9[t];
  const currentEma21 = ema21[t];
  
  // Base Range Identification (previous 20 candles)
  const rangeLookback = 20;
  const rangeSliceHighs = highs.slice(t - rangeLookback, t);
  const rangeSliceLows = lows.slice(t - rangeLookback, t);
  const rangeHigh = Math.max(...rangeSliceHighs);
  const rangeLow = Math.min(...rangeSliceLows);
  const rangeHeight = rangeHigh - rangeLow;
  
  // Volume calculation
  const avgVol20 = volumes.slice(t - rangeLookback, t).reduce((a, b) => a + b, 0) / rangeLookback;
  const currentVol = currentCandle.volume;
  
  // Strategy Filters
  const hasVolumeSurge = currentVol > 1.5 * avgVol20;
  const candleRange = currentCandle.high - currentCandle.low;
  
  if (candleRange <= 0) return null;
  
  const realBody = Math.abs(currentCandle.close - currentCandle.open);

  // --- BULLISH RANGE BREAKOUT ---
  const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
  const isBullishTrend = currentEma9 > currentEma21;
  const isBullishBreakout = currentCandle.close > rangeHigh;
  // Skip large upper-wick candles
  const noLargeUpperWick = upperWick < (candleRange * 0.4) && realBody > (candleRange * 0.5);

  if (isBullishTrend && isBullishBreakout && hasVolumeSurge && noLargeUpperWick) {
    // Stop loss: below the base low or 1.5x ATR, to invalidate the support structure
    // We want the stop to remain outside normal candle noise
    const stopLoss = Math.min(rangeLow - 0.2 * currentAtr, currentCandle.close - 1.5 * currentAtr);
    const risk = currentCandle.close - stopLoss;
    
    // Skip if risk is disproportionately small or large
    if (risk < 0.2 * currentAtr || risk > 3.5 * currentAtr) return null;

    // Staged targets: TP1 at 2R, TP2 at 3R, TP3 as a measured move runner
    const tp1 = currentCandle.close + (risk * 2.0);
    const tp2 = currentCandle.close + (risk * 3.0);
    const tp3 = currentCandle.close + Math.max(risk * 5.0, rangeHeight);

    return {
      direction: 'LONG',
      score: 92,
      sl: stopLoss,
      tp1,
      tp2,
      tp3,
      atr: currentAtr,
      compressionHigh: rangeHigh,
      compressionLow: rangeLow,
      reason: `Bullish Base Breakout (Vol: ${(currentVol / avgVol20).toFixed(1)}x, 9>21 EMA)`
    };
  }

  // --- BEARISH RANGE BREAKDOWN ---
  const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
  const isBearishTrend = currentEma9 < currentEma21;
  const isBearishBreakout = currentCandle.close < rangeLow;
  // Skip large lower-wick candles
  const noLargeLowerWick = lowerWick < (candleRange * 0.4) && realBody > (candleRange * 0.5);

  if (isBearishTrend && isBearishBreakout && hasVolumeSurge && noLargeLowerWick) {
    // Stop loss: above the base high or 1.5x ATR
    const stopLoss = Math.max(rangeHigh + 0.2 * currentAtr, currentCandle.close + 1.5 * currentAtr);
    const risk = stopLoss - currentCandle.close;

    if (risk < 0.2 * currentAtr || risk > 3.5 * currentAtr) return null;

    const tp1 = currentCandle.close - (risk * 2.0);
    const tp2 = currentCandle.close - (risk * 3.0);
    const tp3 = currentCandle.close - Math.max(risk * 5.0, rangeHeight);

    return {
      direction: 'SHORT',
      score: 92,
      sl: stopLoss,
      tp1,
      tp2,
      tp3,
      atr: currentAtr,
      compressionHigh: rangeHigh,
      compressionLow: rangeLow,
      reason: `Bearish Base Breakdown (Vol: ${(currentVol / avgVol20).toFixed(1)}x, 9<21 EMA)`
    };
  }

  return null;
}
