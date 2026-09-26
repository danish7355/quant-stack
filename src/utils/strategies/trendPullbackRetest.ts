// src/utils/strategies/trendPullbackRetest.ts
// ─────────────────────────────────────────────────────────────────────────────
// TREND PULLBACK RETEST STRATEGY (TREND_PULLBACK_RETEST)
//
// Strategy ID : TREND_PULLBACK_RETEST
// Settings prefix : tpr*
//
// Logic flow (state machine — ALL stages must be reached in order):
//   NO_SETUP → TREND_DETECTED → PULLBACK_DETECTED → RETEST_DETECTED
//            → CONFIRMATION → ENTRY
//   Any invalidation → INVALIDATED → NO_SETUP (after cooldown)
//
// A simple EMA touch does NOT trigger entry. All 5 stages must be confirmed.
// Operates on CLOSED candles only (no repainting).
// ─────────────────────────────────────────────────────────────────────────────

import { calculateEMA, calculateATR, calculateADX, calculateRSI } from '../indicators.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TprStateName =
  | 'NO_SETUP'
  | 'TREND_DETECTED'
  | 'PULLBACK_DETECTED'
  | 'RETEST_DETECTED'
  | 'CONFIRMATION'
  | 'ENTRY'
  | 'IN_POSITION'
  | 'EXIT'
  | 'INVALIDATED';

export type TprDirection = 'LONG' | 'SHORT';

export interface TprConfig {
  // EMA periods
  emaFast?: number;            // default 20
  emaSlow?: number;            // default 50
  emaHtf?: number;             // default 200 (optional HTF EMA)
  // Indicators
  atrPeriod?: number;          // default 14
  adxPeriod?: number;          // default 14
  rsiPeriod?: number;          // default 14
  // Trend quality
  minAdx?: number;             // default 20
  minTrendScore?: number;      // default 5 (out of 6)
  // Pullback rules
  maxPullbackAtr?: number;     // default 1.5 (max pullback depth in ATR units)
  maxPullbackCandles?: number; // default 10 (setup timeout for pullback phase)
  // Retest rules
  retestToleranceAtr?: number; // default 0.20 (how close to EMA counts as a retest)
  // Confirmation
  minConfBodyRatio?: number;   // default 0.40 (confirmation candle body ≥ 40% range)
  // Chase filter
  maxChaseAtr?: number;        // default 0.75 (reject if price too far from EMA after conf)
  // Extreme candle filter
  maxConfCandleAtr?: number;   // default 2.0 (reject confirmation candle if range > 2 ATR)
  // EMA separation filter
  minEmaGapAtrRatio?: number;  // default 0.20 (EMA_GAP/ATR ≥ 0.20)
  // SL / TP
  slAtrMultiple?: number;      // default 1.5
  rrRatio?: number;            // default 2.0
  // Trailing stop
  trailingEnabled?: boolean;   // default true
  breakevenEnabled?: boolean;  // default true
  // Cooldown
  cooldownCandles?: number;    // default 5 (after exit or invalidation)
  setupTimeout?: number;       // default 10 (candles to wait in any pending state)
  // Misc
  allowLongs?: boolean;
  allowShorts?: boolean;
  debugMode?: boolean;
}

export interface TprSignal {
  direction: TprDirection;
  state: TprStateName;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3?: number;
  setupScore: number;       // 0–100
  trendScore: number;       // 0–6 (raw 6-point trend quality)
  atr: number;
  candleTime: number;
  reason: string;
  rejectionReason: string | null;
  // Debug metrics
  metrics: {
    emaFast: number;
    emaSlow: number;
    emaHtf?: number;
    adx: number;
    plusDI: number;
    minusDI: number;
    rsi: number;
    pullbackDepthAtr: number;
    retestDistanceAtr: number;
    confBodyRatio: number;
    confCandleRangeAtr: number;
    emaSeparationAtr: number;
    chaseDistanceAtr: number;
  };
}

// State machine internal state (per-symbol, stateless call pattern)
export interface TprState {
  phase: TprStateName;
  direction: TprDirection | null;
  trendScore: number;
  pullbackStartBar: number;   // bar index when pullback started
  retestBar: number;          // bar index when retest detected
  cooldownLeft: number;
  setupCandleCount: number;   // how many candles spent in current non-entry phase
  lastEntryPrice: number | null;
  lastSl: number | null;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TPR_CONFIG: Required<TprConfig> = {
  emaFast: 20,
  emaSlow: 50,
  emaHtf: 200,
  atrPeriod: 14,
  adxPeriod: 14,
  rsiPeriod: 14,
  minAdx: 20,
  minTrendScore: 5,
  maxPullbackAtr: 1.5,
  maxPullbackCandles: 10,
  retestToleranceAtr: 0.20,
  minConfBodyRatio: 0.40,
  maxChaseAtr: 0.75,
  maxConfCandleAtr: 2.0,
  minEmaGapAtrRatio: 0.20,
  slAtrMultiple: 1.5,
  rrRatio: 2.0,
  trailingEnabled: true,
  breakevenEnabled: true,
  cooldownCandles: 5,
  setupTimeout: 10,
  allowLongs: true,
  allowShorts: true,
  debugMode: false,
};

// ─── Helper: EMA calculation ──────────────────────────────────────────────────

function calcEmaLast(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const series = calculateEMA(closes, period);
  return series[series.length - 1] ?? closes[closes.length - 1];
}

// ─── Helper: ATR calculation ──────────────────────────────────────────────────

function calcAtrLast(candles: any[], period: number): number {
  if (candles.length < period + 1) {
    const range = candles[candles.length - 1]?.high - candles[candles.length - 1]?.low;
    return Math.max(range || 0, 0.001);
  }
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);
  const closes = candles.map((c: any) => c.close);
  const series = calculateATR(highs, lows, closes, period);
  return series[series.length - 1] ?? (candles[candles.length - 1].high - candles[candles.length - 1].low);
}

// ─── Helper: ADX last values ──────────────────────────────────────────────────

function calcAdxLast(candles: any[], period: number): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period * 2 + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);
  const closes = candles.map((c: any) => c.close);
  const result = calculateADX(highs, lows, closes, period);
  return {
    adx: result.adx[result.adx.length - 1] ?? 0,
    plusDI: result.plusDI[result.plusDI.length - 1] ?? 0,
    minusDI: result.minusDI[result.minusDI.length - 1] ?? 0,
  };
}

// ─── Helper: RSI last value ───────────────────────────────────────────────────

function calcRsiLast(closes: number[], period: number): number {
  if (closes.length < period + 2) return 50;
  const series = calculateRSI(closes, period);
  return series[series.length - 1] ?? 50;
}

// ─── Helper: Candle body ratio (body / range) ─────────────────────────────────

function bodyRatio(candle: any): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

// ─── Helper: Is bullish candle ────────────────────────────────────────────────

function isBullish(candle: any): boolean {
  return candle.close > candle.open;
}

// ─── 6-Point Trend Quality Score ─────────────────────────────────────────────
//
// +1 each for:
//   1. EMA fast above EMA slow (LONG) / below (SHORT)
//   2. Price above EMA slow (LONG) / below (SHORT)
//   3. ADX >= minAdx
//   4. DI alignment: +DI > -DI (LONG) or -DI > +DI (SHORT)
//   5. Price above EMA HTF (LONG) / below (SHORT)
//   6. EMA separation (emaSlow - emaFast) / ATR >= minEmaGapAtrRatio confirms trending

export function calcTrendScore(
  direction: TprDirection,
  emaFast: number,
  emaSlow: number,
  emaHtf: number | null,
  price: number,
  adx: number,
  plusDI: number,
  minusDI: number,
  atr: number,
  minAdx: number,
  minEmaGapAtrRatio: number
): number {
  let score = 0;

  if (direction === 'LONG') {
    if (emaFast > emaSlow) score++;
    if (price > emaSlow) score++;
    if (adx >= minAdx) score++;
    if (plusDI > minusDI) score++;
    if (emaHtf !== null && price > emaHtf) score++;
  } else {
    if (emaFast < emaSlow) score++;
    if (price < emaSlow) score++;
    if (adx >= minAdx) score++;
    if (minusDI > plusDI) score++;
    if (emaHtf !== null && price < emaHtf) score++;
  }

  // EMA separation filter
  const emaGap = Math.abs(emaSlow - emaFast);
  if (atr > 0 && emaGap / atr >= minEmaGapAtrRatio) score++;

  return score;
}

// ─── Main Stateless Evaluator ─────────────────────────────────────────────────
//
// candles: CLOSED candles only (last candle must be closed, NOT the current forming one)
//          Call with klines.slice(0, -1) in the scanner loop.
// prevState: The per-symbol mutable state from the previous call.
//            Pass a fresh createTprState() for the first call.
// config: Strategy settings (merged with defaults internally).
//
// Returns:
//   - TprSignal if an entry signal is ready
//   - null otherwise (also mutates prevState in place for state tracking)
//
// IMPORTANT: This function mutates prevState in place.
// ─────────────────────────────────────────────────────────────────────────────

export function createTprState(): TprState {
  return {
    phase: 'NO_SETUP',
    direction: null,
    trendScore: 0,
    pullbackStartBar: -1,
    retestBar: -1,
    cooldownLeft: 0,
    setupCandleCount: 0,
    lastEntryPrice: null,
    lastSl: null,
  };
}

export function evaluateTrendPullbackRetest(
  candles: any[],
  config: TprConfig = {},
  prevState: TprState,
  symbol = 'UNKNOWN'
): TprSignal | null {
  const cfg: Required<TprConfig> = { ...DEFAULT_TPR_CONFIG, ...config };

  // Need at minimum: emaSlow + atrPeriod + some room
  const minLen = Math.max(cfg.emaSlow, cfg.emaHtf > 0 ? cfg.emaHtf : 0, cfg.atrPeriod * 2) + 10;
  if (!candles || candles.length < minLen) return null;

  const n = candles.length;
  const lastIdx = n - 1;
  const last = candles[lastIdx];
  const closes = candles.map((c: any) => c.close);
  const currentPrice = last.close;
  const candleTime = last.time ?? Date.now();

  // ── Indicators ──────────────────────────────────────────────────────────────
  const atr = calcAtrLast(candles, cfg.atrPeriod);
  const emaFast = calcEmaLast(closes, cfg.emaFast);
  const emaSlow = calcEmaLast(closes, cfg.emaSlow);
  const emaHtf = cfg.emaHtf > 0 ? calcEmaLast(closes, cfg.emaHtf) : null;
  const { adx, plusDI, minusDI } = calcAdxLast(candles, cfg.adxPeriod);
  const rsi = calcRsiLast(closes, cfg.rsiPeriod);

  // ── Cooldown ─────────────────────────────────────────────────────────────────
  if (prevState.cooldownLeft > 0) {
    prevState.cooldownLeft--;
    if (cfg.debugMode) {
      console.log(`[TPR][${symbol}] COOLDOWN remaining: ${prevState.cooldownLeft}`);
    }
    return null;
  }

  // ── Sideways filter (mandatory — TRENDING regime only) ───────────────────────
  const isTrending = adx >= cfg.minAdx;

  // ── Build common metrics (for debug / signal output) ─────────────────────────
  const emaSeparationAtr = atr > 0 ? Math.abs(emaSlow - emaFast) / atr : 0;
  const metricsTemplate = {
    emaFast,
    emaSlow,
    emaHtf: emaHtf ?? undefined,
    adx,
    plusDI,
    minusDI,
    rsi,
    pullbackDepthAtr: 0,
    retestDistanceAtr: 0,
    confBodyRatio: 0,
    confCandleRangeAtr: 0,
    emaSeparationAtr,
    chaseDistanceAtr: 0,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE MACHINE
  // ─────────────────────────────────────────────────────────────────────────────

  // ── RESET after ENTRY / EXIT / INVALIDATED (after cooldown) ──────────────────
  if (
    prevState.phase === 'ENTRY' ||
    prevState.phase === 'IN_POSITION' ||
    prevState.phase === 'EXIT' ||
    prevState.phase === 'INVALIDATED'
  ) {
    prevState.phase = 'NO_SETUP';
    prevState.direction = null;
    prevState.trendScore = 0;
    prevState.pullbackStartBar = -1;
    prevState.retestBar = -1;
    prevState.setupCandleCount = 0;
    prevState.cooldownLeft = cfg.cooldownCandles;
    return null;
  }

  // ── NO_SETUP → TREND_DETECTED ─────────────────────────────────────────────────
  if (prevState.phase === 'NO_SETUP') {
    if (!isTrending) return null;

    // Try LONG
    if (cfg.allowLongs) {
      const score = calcTrendScore('LONG', emaFast, emaSlow, emaHtf, currentPrice, adx, plusDI, minusDI, atr, cfg.minAdx, cfg.minEmaGapAtrRatio);
      if (score >= cfg.minTrendScore) {
        prevState.phase = 'TREND_DETECTED';
        prevState.direction = 'LONG';
        prevState.trendScore = score;
        prevState.setupCandleCount = 0;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] → TREND_DETECTED LONG score=${score}/6`);
        return null; // Move to next candle
      }
    }

    // Try SHORT
    if (cfg.allowShorts) {
      const score = calcTrendScore('SHORT', emaFast, emaSlow, emaHtf, currentPrice, adx, plusDI, minusDI, atr, cfg.minAdx, cfg.minEmaGapAtrRatio);
      if (score >= cfg.minTrendScore) {
        prevState.phase = 'TREND_DETECTED';
        prevState.direction = 'SHORT';
        prevState.trendScore = score;
        prevState.setupCandleCount = 0;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] → TREND_DETECTED SHORT score=${score}/6`);
        return null;
      }
    }

    return null;
  }

  // ── TREND_DETECTED → PULLBACK_DETECTED ───────────────────────────────────────
  if (prevState.phase === 'TREND_DETECTED') {
    const dir = prevState.direction!;
    prevState.setupCandleCount++;

    // Timeout guard
    if (prevState.setupCandleCount > cfg.setupTimeout) {
      if (cfg.debugMode) console.log(`[TPR][${symbol}] TREND_DETECTED timed out after ${prevState.setupCandleCount} candles`);
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      return null;
    }

    // Trend invalidation: trend reversed sharply
    if (dir === 'LONG' && currentPrice < emaSlow - atr) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] TREND_DETECTED LONG invalidated — price broke below emaSlow - 1ATR`);
      return null;
    }
    if (dir === 'SHORT' && currentPrice > emaSlow + atr) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] TREND_DETECTED SHORT invalidated — price broke above emaSlow + 1ATR`);
      return null;
    }

    // Pullback condition: price has pulled back toward emaFast
    const distToEmaFast = Math.abs(currentPrice - emaFast);
    const isNearEmaFast = distToEmaFast <= cfg.maxPullbackAtr * atr;

    if (dir === 'LONG' && currentPrice < emaFast + atr * cfg.maxPullbackAtr && currentPrice > emaSlow - atr * 0.5) {
      prevState.phase = 'PULLBACK_DETECTED';
      prevState.pullbackStartBar = lastIdx;
      prevState.setupCandleCount = 0;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] → PULLBACK_DETECTED LONG (price ${currentPrice.toFixed(4)} near emaFast ${emaFast.toFixed(4)})`);
      return null;
    }
    if (dir === 'SHORT' && currentPrice > emaFast - atr * cfg.maxPullbackAtr && currentPrice < emaSlow + atr * 0.5) {
      prevState.phase = 'PULLBACK_DETECTED';
      prevState.pullbackStartBar = lastIdx;
      prevState.setupCandleCount = 0;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] → PULLBACK_DETECTED SHORT (price ${currentPrice.toFixed(4)} near emaFast ${emaFast.toFixed(4)})`);
      return null;
    }

    // Still waiting for pullback — check if trend is still intact
    const trendScore = calcTrendScore(dir, emaFast, emaSlow, emaHtf, currentPrice, adx, plusDI, minusDI, atr, cfg.minAdx, cfg.minEmaGapAtrRatio);
    if (trendScore < cfg.minTrendScore - 1) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] TREND_DETECTED invalidated — trend score dropped to ${trendScore}`);
    }

    return null;
  }

  // ── PULLBACK_DETECTED → RETEST_DETECTED ───────────────────────────────────────
  if (prevState.phase === 'PULLBACK_DETECTED') {
    const dir = prevState.direction!;
    prevState.setupCandleCount++;

    // Timeout
    if (prevState.setupCandleCount > cfg.maxPullbackCandles) {
      if (cfg.debugMode) console.log(`[TPR][${symbol}] PULLBACK_DETECTED timed out`);
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      return null;
    }

    // Fake retest filter — price closes strongly AGAINST trend
    if (dir === 'LONG') {
      // Close well below emaFast without recovering → pullback turning into reversal
      if (last.close < emaSlow - atr * 0.5 && bodyRatio(last) > 0.60 && !isBullish(last)) {
        prevState.phase = 'INVALIDATED';
        prevState.cooldownLeft = cfg.cooldownCandles;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] PULLBACK LONG invalidated — strong bear close through emaSlow`);
        return null;
      }
    } else {
      if (last.close > emaSlow + atr * 0.5 && bodyRatio(last) > 0.60 && isBullish(last)) {
        prevState.phase = 'INVALIDATED';
        prevState.cooldownLeft = cfg.cooldownCandles;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] PULLBACK SHORT invalidated — strong bull close through emaSlow`);
        return null;
      }
    }

    // Pullback depth check — not too deep
    const pullbackDepth = dir === 'LONG'
      ? emaFast - currentPrice
      : currentPrice - emaFast;
    const pullbackDepthAtr = atr > 0 ? pullbackDepth / atr : 0;

    if (pullbackDepthAtr > cfg.maxPullbackAtr * 1.5) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] PULLBACK too deep (${pullbackDepthAtr.toFixed(2)} ATR)`);
      return null;
    }

    // Retest condition: price approaches emaFast within tolerance
    const distToEmaFast = Math.abs(currentPrice - emaFast);
    const retestDistanceAtr = atr > 0 ? distToEmaFast / atr : 0;

    const inRetestZone = retestDistanceAtr <= cfg.retestToleranceAtr;

    if (inRetestZone) {
      prevState.phase = 'RETEST_DETECTED';
      prevState.retestBar = lastIdx;
      prevState.setupCandleCount = 0;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] → RETEST_DETECTED dist=${retestDistanceAtr.toFixed(3)} ATR`);
    }

    return null;
  }

  // ── RETEST_DETECTED → CONFIRMATION ────────────────────────────────────────────
  if (prevState.phase === 'RETEST_DETECTED') {
    const dir = prevState.direction!;
    prevState.setupCandleCount++;

    // Timeout
    if (prevState.setupCandleCount > cfg.setupTimeout) {
      if (cfg.debugMode) console.log(`[TPR][${symbol}] RETEST_DETECTED timed out`);
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      return null;
    }

    // Fake retest filter — closed strongly against trend = invalidate
    if (dir === 'LONG' && !isBullish(last) && bodyRatio(last) > 0.55 && last.close < emaFast - atr * 0.3) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] RETEST LONG faked — strong bear close below emaFast`);
      return null;
    }
    if (dir === 'SHORT' && isBullish(last) && bodyRatio(last) > 0.55 && last.close > emaFast + atr * 0.3) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] RETEST SHORT faked — strong bull close above emaFast`);
      return null;
    }

    // Confirmation: candle closes in trend direction with body ≥ 40% of range
    const confBodyRatio = bodyRatio(last);
    const confCandleRange = last.high - last.low;
    const confCandleRangeAtr = atr > 0 ? confCandleRange / atr : 0;

    const confirmedLong = dir === 'LONG' && isBullish(last) && confBodyRatio >= cfg.minConfBodyRatio && last.close > emaFast;
    const confirmedShort = dir === 'SHORT' && !isBullish(last) && confBodyRatio >= cfg.minConfBodyRatio && last.close < emaFast;

    if (confirmedLong || confirmedShort) {
      // ── Extreme candle filter ──────────────────────────────────────────────
      if (confCandleRangeAtr > cfg.maxConfCandleAtr) {
        prevState.phase = 'INVALIDATED';
        prevState.cooldownLeft = cfg.cooldownCandles;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] CONFIRMATION rejected — extreme candle ${confCandleRangeAtr.toFixed(2)} ATR`);
        return null;
      }

      // ── EMA separation filter ──────────────────────────────────────────────
      if (emaSeparationAtr < cfg.minEmaGapAtrRatio) {
        prevState.phase = 'INVALIDATED';
        prevState.cooldownLeft = cfg.cooldownCandles;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] CONFIRMATION rejected — EMA separation too small (${emaSeparationAtr.toFixed(3)})`);
        return null;
      }

      // ── Chase filter ───────────────────────────────────────────────────────
      const distFromEmaFastAtr = atr > 0 ? Math.abs(currentPrice - emaFast) / atr : 0;
      if (distFromEmaFastAtr > cfg.maxChaseAtr) {
        prevState.phase = 'INVALIDATED';
        prevState.cooldownLeft = cfg.cooldownCandles;
        if (cfg.debugMode) console.log(`[TPR][${symbol}] CONFIRMATION rejected — chase filter (${distFromEmaFastAtr.toFixed(2)} ATR from emaFast)`);
        return null;
      }

      prevState.phase = 'CONFIRMATION';
      prevState.setupCandleCount = 0;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] → CONFIRMATION ${dir} body=${confBodyRatio.toFixed(2)}`);
    }

    return null;
  }

  // ── CONFIRMATION → ENTRY (signal generated on the NEXT bar open) ───────────────
  if (prevState.phase === 'CONFIRMATION') {
    const dir = prevState.direction!;

    // Re-check basic conditions on this bar
    const trendScore = calcTrendScore(dir, emaFast, emaSlow, emaHtf, currentPrice, adx, plusDI, minusDI, atr, cfg.minAdx, cfg.minEmaGapAtrRatio);
    if (trendScore < cfg.minTrendScore - 1) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] CONFIRMATION invalidated at entry bar — trend dropped`);
      return null;
    }

    // ── Chase filter: reject entry if price chased too far from EMA ─────────────
    const distFromEmaFastAtr = atr > 0 ? Math.abs(currentPrice - emaFast) / atr : 0;
    if (distFromEmaFastAtr > cfg.maxChaseAtr) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      if (cfg.debugMode) console.log(`[TPR][${symbol}] ENTRY rejected — chase filter (${distFromEmaFastAtr.toFixed(2)} ATR from emaFast)`);
      return null;
    }

    // ── Calculate SL ──────────────────────────────────────────────────────────
    // LONG: SL = emaFast - slAtrMultiple * atr (below emaFast)
    // SHORT: SL = emaFast + slAtrMultiple * atr (above emaFast)
    const entry = currentPrice;
    let sl: number;
    if (dir === 'LONG') {
      sl = emaFast - cfg.slAtrMultiple * atr;
      // Ensure SL is below entry
      sl = Math.min(sl, entry - atr * 0.5);
    } else {
      sl = emaFast + cfg.slAtrMultiple * atr;
      // Ensure SL is above entry
      sl = Math.max(sl, entry + atr * 0.5);
    }

    const riskPerUnit = Math.abs(entry - sl);
    if (riskPerUnit <= 0) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      return null;
    }

    // ── TP levels ─────────────────────────────────────────────────────────────
    const tp1 = dir === 'LONG' ? entry + riskPerUnit * 1.0 : entry - riskPerUnit * 1.0;
    const tp2 = dir === 'LONG' ? entry + riskPerUnit * cfg.rrRatio : entry - riskPerUnit * cfg.rrRatio;
    const tp3 = dir === 'LONG' ? entry + riskPerUnit * (cfg.rrRatio * 1.5) : entry - riskPerUnit * (cfg.rrRatio * 1.5);

    // ── RR check ─────────────────────────────────────────────────────────────
    const rr2 = Math.abs(tp2 - entry) / riskPerUnit;
    if (rr2 < cfg.rrRatio * 0.95) {
      prevState.phase = 'INVALIDATED';
      prevState.cooldownLeft = cfg.cooldownCandles;
      return null;
    }

    // ── Setup score (0–100) ───────────────────────────────────────────────────
    const rawTrendScore = calcTrendScore(dir, emaFast, emaSlow, emaHtf, currentPrice, adx, plusDI, minusDI, atr, cfg.minAdx, cfg.minEmaGapAtrRatio);
    const adxBonus = Math.min(20, (adx - cfg.minAdx) * 1.0);
    const rrBonus = Math.min(10, (rr2 - 1.5) * 5);
    const setupScore = Math.min(100, Math.max(0, Math.round(
      (rawTrendScore / 6) * 55 + adxBonus + rrBonus + 15
    )));

    prevState.phase = 'ENTRY';
    prevState.lastEntryPrice = entry;
    prevState.lastSl = sl;

    const confCandleRange = last.high - last.low;
    const confCandleRangeAtr = atr > 0 ? confCandleRange / atr : 0;
    const retestDistanceAtr = atr > 0 ? Math.abs(last.close - emaFast) / atr : 0;

    const signal: TprSignal = {
      direction: dir,
      state: 'ENTRY',
      entryPrice: entry,
      sl,
      tp1,
      tp2,
      tp3,
      setupScore,
      trendScore: rawTrendScore,
      atr,
      candleTime,
      reason: `Trend Pullback Retest (${dir}) — ${rawTrendScore}/6 trend score, ADX ${adx.toFixed(1)}, EMA sep ${emaSeparationAtr.toFixed(2)} ATR`,
      rejectionReason: null,
      metrics: {
        emaFast,
        emaSlow,
        emaHtf: emaHtf ?? undefined,
        adx,
        plusDI,
        minusDI,
        rsi,
        pullbackDepthAtr: 0,
        retestDistanceAtr,
        confBodyRatio: bodyRatio(last),
        confCandleRangeAtr,
        emaSeparationAtr,
        chaseDistanceAtr: distFromEmaFastAtr,
      },
    };

    if (cfg.debugMode) {
      console.log(`[TPR][${symbol}] ✅ ENTRY SIGNAL ${dir} entry=${entry.toFixed(4)} sl=${sl.toFixed(4)} tp2=${tp2.toFixed(4)} score=${setupScore}`);
    }

    return signal;
  }

  return null;
}

// ─── Stateless single-call evaluator (for backtesting) ───────────────────────
//
// Runs the strategy bar-by-bar over a candle array and returns all signals.
// Strictly closed-candle: evaluates candles[0..i-1] for each i.

export function backtestTrendPullbackRetest(
  candles: any[],
  config: TprConfig = {}
): { signals: TprSignal[]; tradeCount: number; winRate: number | null } {
  const cfg: Required<TprConfig> = { ...DEFAULT_TPR_CONFIG, ...config };
  const state = createTprState();
  const signals: TprSignal[] = [];

  for (let i = cfg.emaSlow + cfg.atrPeriod + 10; i < candles.length; i++) {
    // Only evaluate on closed candles — pass slice [0..i] (i is inclusive, closed)
    const closedSlice = candles.slice(0, i + 1);
    const sig = evaluateTrendPullbackRetest(closedSlice, cfg, state, 'BACKTEST');
    if (sig && sig.rejectionReason === null) {
      signals.push(sig);
    }
  }

  return {
    signals,
    tradeCount: signals.length,
    winRate: null, // Requires tick-level simulation for P&L
  };
}
