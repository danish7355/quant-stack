// src/utils/strategies/strictGapPullback/indicators.ts
// ─────────────────────────────────────────────────────────────────────────────
// Low-level indicator functions used by all gates.
// All functions are pure and deterministic (no side-effects).
// ─────────────────────────────────────────────────────────────────────────────
import { Candle } from "./types";

/** Exponential Moving Average */
export function ema(data: number[], period: number): number[] {
  if (!data.length) return [];
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/** Simple Moving Average */
export function sma(data: number[], period: number): number[] {
  return data.map((_, i) =>
    i < period - 1
      ? NaN
      : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

/** Wilder-smoothed ATR(14) */
export function atr(candles: Candle[], period = 14): number[] {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = candles[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  });
  const result: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      result.push(tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    } else {
      result.push((result[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return result;
}

/** Slope of a series: last value minus value N bars ago, normalised by price */
export function slope(series: number[], lookback = 5): number {
  const last = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 1 - lookback)];
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return 0;
  return (last - prev) / prev;
}

/** Returns true if the series shows a clear upward slope */
export function isRising(series: number[], lookback = 5, minSlope = 0): boolean {
  return slope(series, lookback) > minSlope;
}

/** Returns true if the series shows a clear downward slope */
export function isFalling(series: number[], lookback = 5, minSlope = 0): boolean {
  return slope(series, lookback) < -minSlope;
}

/** 
 * Check higher-high / higher-low structure over the last N pivot pairs. 
 * Uses swings (local extremes), not bar-by-bar comparison.
 */
export function isHHHL(candles: Candle[], lookback = 20): boolean {
  const highs = candles.slice(-lookback).map(c => c.high);
  const lows = candles.slice(-lookback).map(c => c.low);
  const mid = Math.floor(highs.length / 2);
  const firstHalfHigh = Math.max(...highs.slice(0, mid));
  const secondHalfHigh = Math.max(...highs.slice(mid));
  const firstHalfLow = Math.min(...lows.slice(0, mid));
  const secondHalfLow = Math.min(...lows.slice(mid));
  return secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow;
}

/** Lower-low / lower-high structure */
export function isLHLL(candles: Candle[], lookback = 20): boolean {
  const highs = candles.slice(-lookback).map(c => c.high);
  const lows = candles.slice(-lookback).map(c => c.low);
  const mid = Math.floor(highs.length / 2);
  const firstHalfHigh = Math.max(...highs.slice(0, mid));
  const secondHalfHigh = Math.max(...highs.slice(mid));
  const firstHalfLow = Math.min(...lows.slice(0, mid));
  const secondHalfLow = Math.min(...lows.slice(mid));
  return secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow;
}

/**
 * Detect an abnormal candle (range > mult × ATR).
 * Checks only the last `window` candles.
 */
export function hasAbnormalCandle(candles: Candle[], atrSeries: number[], mult = 2.0, window = 3): boolean {
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - window); i--) {
    const range = candles[i].high - candles[i].low;
    const a = atrSeries[i];
    if (a > 0 && range > mult * a) return true;
  }
  return false;
}

/** Volume SMA */
export function volumeSma(candles: Candle[], period = 20): number[] {
  return sma(candles.map(c => c.volume), period);
}

/** 
 * Nearest resistance: highest high in lookback excluding the last `exclude` bars.
 * Used to find the next meaningful obstacle for longs.
 */
export function nearestResistance(candles: Candle[], exclude = 5, lookback = 50): number {
  const pool = candles.slice(Math.max(0, candles.length - lookback), candles.length - exclude);
  return pool.length ? Math.max(...pool.map(c => c.high)) : Infinity;
}

/** Nearest support (lowest low in lookback) for shorts */
export function nearestSupport(candles: Candle[], exclude = 5, lookback = 50): number {
  const pool = candles.slice(Math.max(0, candles.length - lookback), candles.length - exclude);
  return pool.length ? Math.min(...pool.map(c => c.low)) : 0;
}

/** Swing low over a look-back window (lowest low) */
export function swingLow(candles: Candle[], endIdx: number, lookback = 10): number {
  const start = Math.max(0, endIdx - lookback);
  let low = Infinity;
  for (let i = start; i <= endIdx; i++) {
    if (candles[i].low < low) low = candles[i].low;
  }
  return low;
}

/** Swing high over a look-back window */
export function swingHigh(candles: Candle[], endIdx: number, lookback = 10): number {
  const start = Math.max(0, endIdx - lookback);
  let high = -Infinity;
  for (let i = start; i <= endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
  }
  return high;
}
