import { AppSettings } from '../../types';
import { evaluateTwoSidedCoilBreakout } from './twoSidedCoilBreakout.js';

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
  if (!candles || candles.length < 30) return null;
  
  // Primary: Evaluate strict Two-Sided Coil Breakout with structural 5R target and dynamic user timeframe
  const twoSidedSig = evaluateTwoSidedCoilBreakout(
    candles as any,
    [],
    {
      timeframe: (settings as any)?.timeframe || '15m',
      minRrRatio: 5.0,
      aggressiveBreakoutMode: true
    }
  );

  if (twoSidedSig && twoSidedSig.status.startsWith('VALID')) {
    return {
      direction: twoSidedSig.side,
      score: twoSidedSig.score,
      sl: twoSidedSig.stop,
      tp1: twoSidedSig.target,
      tp2: twoSidedSig.target,
      tp3: twoSidedSig.target,
      atr: twoSidedSig.coil.atrAtCoil,
      compressionHigh: twoSidedSig.coilRange.high,
      compressionLow: twoSidedSig.coilRange.low,
      reason: `${twoSidedSig.setup} [1:${twoSidedSig.rrRatio.toFixed(1)} RR] (${twoSidedSig.status})`
    };
  }

  return null;
}

