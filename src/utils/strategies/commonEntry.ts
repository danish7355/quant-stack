// src/utils/strategies/commonEntry.ts

/**
 * Shared utilities for EMA‑gap style entry strategies.
 * Provides EMA calculation, swing low/high detection, risk validation
 * and a unified entry determination function.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Simple EMA calculation – identical to the one used in emaGapPullback */
export function calcEma(data: number[], period: number): number[] {
  if (!data.length) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/** Find the lowest low within a look‑back window ending at `endIdx` */
export function findSwingLow(candles: Candle[], endIdx: number, lookback: number): number {
  let low = Infinity;
  const start = Math.max(0, endIdx - lookback);
  for (let i = start; i <= endIdx; i++) {
    if (candles[i].low < low) low = candles[i].low;
  }
  return low;
}

/** Find the highest high within a look‑back window ending at `endIdx` */
export function findSwingHigh(candles: Candle[], endIdx: number, lookback: number): number {
  let high = -Infinity;
  const start = Math.max(0, endIdx - lookback);
  for (let i = start; i <= endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
  }
  return high;
}

/**
 * Determine the EMA‑gap entry parameters.
 * Returns null if risk is insufficient or negative.
 */
export interface EmaGapSettings {
  egpSlSwingLookback?: number;
  egpSlAtrBuffer?: number; // multiplier of atr
  egpTp1RMultiple?: number;
  egpTp2RMultiple?: number;
  egpTp3RMultiple?: number;
}

export interface EmaGapResult {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPerUnit: number;
}

export function determineEmaGapEntry(
  candles: Candle[],
  gapIdx: number,
  ema5: number,
  atr: number,
  direction: 'LONG' | 'SHORT',
  settings: EmaGapSettings = {}
): EmaGapResult | null {
  const slLookback = settings.egpSlSwingLookback ?? 10;
  const slBuffer = (settings.egpSlAtrBuffer ?? 0.2) * atr;
  const tp1Mult = settings.egpTp1RMultiple ?? 1.0;
  const tp2Mult = settings.egpTp2RMultiple ?? 1.5;
  const tp3Mult = settings.egpTp3RMultiple ?? 2.5;

  const gapCandle = candles[gapIdx];
  const gapMid = (Math.max(gapCandle.open, gapCandle.close) + Math.min(gapCandle.open, gapCandle.close)) / 2;

  if (direction === 'LONG') {
    const entry = Math.max(ema5, gapMid);
    const swingLow = findSwingLow(candles, gapIdx, slLookback);
    const sl = swingLow - slBuffer;
    const risk = entry - sl;
    if (risk <= 0 || risk < atr * 0.15) return null;
    return {
      entry,
      sl,
      tp1: entry + risk * tp1Mult,
      tp2: entry + risk * tp2Mult,
      tp3: entry + risk * tp3Mult,
      riskPerUnit: risk,
    };
  } else {
    const entry = Math.min(ema5, gapMid);
    const swingHigh = findSwingHigh(candles, gapIdx, slLookback);
    const sl = swingHigh + slBuffer;
    const risk = sl - entry;
    if (risk <= 0 || risk < atr * 0.15) return null;
    return {
      entry,
      sl,
      tp1: Math.max(0.0001, entry - risk * tp1Mult),
      tp2: Math.max(0.0001, entry - risk * tp2Mult),
      tp3: Math.max(0.0001, entry - risk * tp3Mult),
      riskPerUnit: risk,
    };
  }
}
