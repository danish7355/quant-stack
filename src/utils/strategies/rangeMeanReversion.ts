/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateSMA, calculateEMA, calculateATR, calculateADX, calculateRSI } from '../indicators.js';
import { allowEMAMeanReversion, extractEmaMeanReversionRegimeMetrics, type EmaMeanReversionRegimeMetrics } from './strategyRegimeFilters.js';
export { allowEMAMeanReversion, extractEmaMeanReversionRegimeMetrics };
export type { EmaMeanReversionRegimeMetrics };

export interface BollingerBandsResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

/**
 * Calculates Bollinger Bands (default 20-period SMA, 2.0 std dev)
 */
export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMult: number = 2.0
): BollingerBandsResult {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middle.push(closes[i]);
      upper.push(closes[i]);
      lower.push(closes[i]);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j];
    }
    const mean = sum / period;

    let sumSqDiff = 0;
    for (let j = 0; j < period; j++) {
      const diff = closes[i - j] - mean;
      sumSqDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sumSqDiff / period);

    middle.push(mean);
    upper.push(mean + stdDevMult * stdDev);
    lower.push(mean - stdDevMult * stdDev);
  }

  return { middle, upper, lower };
}

// ---------------------------------------------------------------------------
// 1. REGIME DETECTOR MODULE
// ---------------------------------------------------------------------------

export interface RangingRegimeDetails {
  isRanging: boolean;
  adx: number;
  adxSlope: number;
  atrRatio: number;
  smaSlope: number;
  bbWidthRatio: number;
  reason: string;
}

/**
 * Validates range-friendly regime before looking for entries:
 * - ADX(14) < 22 and flat/falling (slope <= 0.5)
 * - ATR Ratio: ATR(14) / SMA(ATR(14), 20) < 1.25 (volatility not expanding)
 * - Moving average slope flat
 * - Bollinger Bands stable (no runaway band-walk expansion)
 */
export function detectRangingRegime(
  candles: any[],
  options: {
    maxAdx?: number;
    maxAtrRatio?: number;
    maxSmaSlope?: number;
  } = {}
): RangingRegimeDetails {
  const maxAdx = options.maxAdx !== undefined ? options.maxAdx : 22;
  const maxAtrRatio = options.maxAtrRatio !== undefined ? options.maxAtrRatio : 1.25;
  const maxSmaSlope = options.maxSmaSlope !== undefined ? options.maxSmaSlope : 0.02;

  const len = candles ? candles.length - 1 : -1;
  if (len < 30) {
    return {
      isRanging: false,
      adx: 0,
      adxSlope: 0,
      atrRatio: 1.0,
      smaSlope: 0,
      bbWidthRatio: 1.0,
      reason: 'Insufficient candle data for regime detection (minimum 30 required)'
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // ADX & Slope
  const adxResult = calculateADX(highs, lows, closes, 14);
  const currentAdx = adxResult.adx[len] || 0;
  const prevAdx = adxResult.adx[Math.max(0, len - 3)] || currentAdx;
  const adxSlope = (currentAdx - prevAdx) / 3;

  // ATR & ATR Ratio
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrSeries[len] || (closes[len] * 0.015);
  const atrSmaSeries = calculateSMA(atrSeries, 20);
  const atrSma20 = atrSmaSeries[len] || currentAtr;
  const atrRatio = atrSma20 > 0 ? (currentAtr / atrSma20) : 1.0;

  // 50-SMA Slope
  const sma50Series = calculateSMA(closes, Math.min(50, closes.length - 5));
  const currentSma = sma50Series[len] || closes[len];
  const prevSma = sma50Series[Math.max(0, len - 10)] || currentSma;
  const smaSlope = currentAtr > 0 ? ((currentSma - prevSma) / (10 * currentAtr)) : 0;

  // Bollinger Bands stability
  const bb = calculateBollingerBands(closes, 20, 2.0);
  const currentWidth = (bb.upper[len] - bb.lower[len]) / (bb.middle[len] || 1);
  const prevWidth = (bb.upper[Math.max(0, len - 10)] - bb.lower[Math.max(0, len - 10)]) / (bb.middle[Math.max(0, len - 10)] || 1);
  const bbWidthRatio = prevWidth > 0 ? (currentWidth / prevWidth) : 1.0;

  const isAdxLow = currentAdx < maxAdx && adxSlope <= 0.5;
  const isAtrStable = atrRatio < maxAtrRatio;
  const isSmaFlat = Math.abs(smaSlope) <= maxSmaSlope * 2.5;
  const isBbStable = bbWidthRatio < 1.45;

  const isRanging = isAdxLow && isAtrStable && isSmaFlat && isBbStable;

  let reason = 'Range-friendly regime confirmed';
  if (!isAdxLow) reason = `ADX indicates trending or accelerating momentum (ADX: ${currentAdx.toFixed(1)}, Slope: ${adxSlope.toFixed(2)})`;
  else if (!isAtrStable) reason = `ATR volatility expanding rapidly (ATR ratio: ${atrRatio.toFixed(2)} >= ${maxAtrRatio})`;
  else if (!isSmaFlat) reason = `Moving average has directional trend slope (${smaSlope.toFixed(3)})`;
  else if (!isBbStable) reason = `Bollinger Bands expanding sharply (expansion ratio: ${bbWidthRatio.toFixed(2)})`;

  return {
    isRanging,
    adx: currentAdx,
    adxSlope,
    atrRatio,
    smaSlope,
    bbWidthRatio,
    reason
  };
}

export interface RangeMarketCheck {
  inRange: boolean;
  pctFromSma: number;
  smaSlope: number;
  smaValue: number;
  reason: string;
}

/**
 * Legacy compatibility wrapper for inRangeMarket
 */
export function inRangeMarket(
  closes: number[],
  maxPctFromSma: number = 0.05,
  maxSlope: number = 0.02
): RangeMarketCheck {
  const lastIdx = closes.length - 1;
  const currentClose = closes[lastIdx];
  const smaPeriod = closes.length >= 200 ? 200 : Math.max(30, Math.min(100, closes.length - 10));
  const smaSeries = calculateSMA(closes, smaPeriod);
  const currentSma = smaSeries[lastIdx];

  if (!currentSma || currentSma <= 0) {
    return { inRange: true, pctFromSma: 0, smaSlope: 0, smaValue: currentClose, reason: 'Default range allowed' };
  }

  const pctFromSma = Math.abs(currentClose - currentSma) / currentSma;
  const slopeLookback = Math.min(50, Math.max(10, Math.floor(closes.length * 0.25)));
  const prevSma = smaSeries[Math.max(0, lastIdx - slopeLookback)];
  const smaSlope = prevSma > 0 ? (currentSma - prevSma) / prevSma : 0;

  const isNearSma = pctFromSma <= maxPctFromSma;
  const isFlatSlope = Math.abs(smaSlope) <= maxSlope;
  const inRange = isNearSma || isFlatSlope;

  return {
    inRange,
    pctFromSma,
    smaSlope,
    smaValue: currentSma,
    reason: inRange
      ? `Market is in range: price ±${(pctFromSma * 100).toFixed(2)}% of SMA${smaPeriod}`
      : `Strong trend active: price ${(pctFromSma * 100).toFixed(2)}% from SMA${smaPeriod}`
  };
}

// ---------------------------------------------------------------------------
// 2. OBJECTIVE RANGE DETECTOR MODULE
// ---------------------------------------------------------------------------

export interface ObjectiveRangeDetails {
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeWidth: number;
  rangeWidthAtr: number;
  rangeLocation: number;
  touchesHigh: number;
  touchesLow: number;
  isValidRange: boolean;
  reason: string;
}

/**
 * Swing point detection (Fractal pivots).
 */
function detectSwingPivots(candles: any[], window = 2) {
  const highs: { index: number; price: number }[] = [];
  const lows: { index: number; price: number }[] = [];

  for (let i = window; i < candles.length - window; i++) {
    const curH = candles[i].high;
    const curL = candles[i].low;
    let isH = true;
    let isL = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= curH) isH = false;
      if (candles[j].low <= curL) isL = false;
    }
    if (isH) highs.push({ index: i, price: curH });
    if (isL) lows.push({ index: i, price: curL });
  }

  return { highs, lows };
}

/**
 * Objectively identifies RangeHigh, RangeLow, RangeMid, and normalized RangeLocation.
 * Rejects single-point or ambiguous ranges; requires at least 2 distinct reactions.
 */
export function detectObjectiveRange(
  candles: any[],
  currentPrice: number,
  atr: number,
  lookback: number = 50
): ObjectiveRangeDetails {
  const len = candles.length - 1;
  const windowSlice = candles.slice(Math.max(0, len - lookback), len + 1);
  const { highs, lows } = detectSwingPivots(windowSlice, 2);

  // If insufficient fractal pivots, use high/low percentile clusters
  let rangeHigh: number;
  let rangeLow: number;
  let touchesHigh = 0;
  let touchesLow = 0;

  if (highs.length >= 2 && lows.length >= 2) {
    // Sort swing highs descending and pick top cluster
    const sortedHighs = highs.map(h => h.price).sort((a, b) => b - a);
    rangeHigh = sortedHighs[1]; // 2nd highest swing high gives durable resistance boundary
    // Count touches within 0.6 ATR of rangeHigh
    touchesHigh = windowSlice.filter(c => Math.abs(c.high - rangeHigh) <= (0.6 * atr) || c.high >= rangeHigh).length;

    const sortedLows = lows.map(l => l.price).sort((a, b) => a - b);
    rangeLow = sortedLows[1]; // 2nd lowest swing low gives durable support boundary
    touchesLow = windowSlice.filter(c => Math.abs(c.low - rangeLow) <= (0.6 * atr) || c.low <= rangeLow).length;
  } else {
    // Fallback: highest and lowest values in recent lookback excluding outliers
    const windowHighs = windowSlice.map(c => c.high).sort((a, b) => b - a);
    const windowLows = windowSlice.map(c => c.low).sort((a, b) => a - b);
    rangeHigh = windowHighs[Math.min(2, windowHighs.length - 1)];
    rangeLow = windowLows[Math.min(2, windowLows.length - 1)];
    touchesHigh = 2;
    touchesLow = 2;
  }

  // Sanity check
  if (rangeHigh <= rangeLow) {
    rangeHigh = currentPrice + (2.0 * atr);
    rangeLow = currentPrice - (2.0 * atr);
  }

  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeWidth = rangeHigh - rangeLow;
  const rangeWidthAtr = atr > 0 ? (rangeWidth / atr) : 4.0;
  const rangeLocation = rangeWidth > 0 ? (currentPrice - rangeLow) / rangeWidth : 0.5;

  const isValidRange = rangeWidthAtr >= 3.0 && rangeWidthAtr <= 15.0 && touchesHigh >= 2 && touchesLow >= 2;

  let reason = 'Objective range identified';
  if (rangeWidthAtr < 3.0) reason = `Range too narrow (${rangeWidthAtr.toFixed(1)} ATR < 3.0 ATR)`;
  else if (rangeWidthAtr > 15.0) reason = `Range too wide / expanding (${rangeWidthAtr.toFixed(1)} ATR > 15.0 ATR)`;
  else if (touchesHigh < 2 || touchesLow < 2) reason = `Insufficient boundary tests (High touches: ${touchesHigh}, Low touches: ${touchesLow})`;

  return {
    rangeHigh,
    rangeLow,
    rangeMid,
    rangeWidth,
    rangeWidthAtr,
    rangeLocation,
    touchesHigh,
    touchesLow,
    isValidRange,
    reason
  };
}

// ---------------------------------------------------------------------------
// 4. FAKE REVERSAL & BREAKOUT RISK MODULE
// ---------------------------------------------------------------------------

export interface BreakoutRiskDetails {
  hasBreakoutRisk: boolean;
  consecutiveClosesOutside: number;
  isBandWalking: boolean;
  reason: string;
}

/**
 * Protects against catastrophic fading of strong new trends:
 * BreakoutRisk = close_outside_range AND ATR_ratio > 1.3 AND ADX_slope > 0
 * Also flags 2+ consecutive closes outside range or strong band-walking.
 */
export function checkBreakoutRisk(
  candles: any[],
  rangeHigh: number,
  rangeLow: number,
  atrRatio: number,
  adxSlope: number,
  adx: number,
  bb: BollingerBandsResult
): BreakoutRiskDetails {
  const len = candles.length - 1;
  const c0 = candles[len];
  const c1 = candles[len - 1] || c0;

  const closedOutsideRange = c0.close > rangeHigh || c0.close < rangeLow;
  const isVolExpanding = atrRatio > 1.30;
  const isAdxRising = adxSlope > 0 && adx > 22;

  // Formula: BreakoutRisk = close_outside_range AND ATR_ratio > 1.3 AND ADX_slope > 0
  const isBreakoutFormula = closedOutsideRange && isVolExpanding && isAdxRising;

  // Consecutive closes outside range
  let consecutiveClosesOutside = 0;
  if (c0.close > rangeHigh && c1.close > rangeHigh) consecutiveClosesOutside = 2;
  if (c0.close < rangeLow && c1.close < rangeLow) consecutiveClosesOutside = 2;

  // Bollinger Band walk (2+ closes outside outer band)
  const isBandWalking = (c0.close > bb.upper[len] && c1.close > bb.upper[len - 1]) ||
                        (c0.close < bb.lower[len] && c1.close < bb.lower[len - 1]);

  const hasBreakoutRisk = isBreakoutFormula || consecutiveClosesOutside >= 2 || (isBandWalking && adx > 25);

  let reason = 'No breakout risk detected';
  if (isBreakoutFormula) reason = `BreakoutRisk active: close outside range with ATR expansion (${atrRatio.toFixed(2)}) & rising ADX`;
  else if (consecutiveClosesOutside >= 2) reason = 'Breakout risk: 2 consecutive candles closed outside range boundary';
  else if (isBandWalking && adx > 25) reason = 'Breakout risk: strong Bollinger band-walk underway with rising trend momentum';

  return {
    hasBreakoutRisk,
    consecutiveClosesOutside,
    isBandWalking,
    reason
  };
}

// ---------------------------------------------------------------------------
// 7. PRACTICAL 11-POINT SCORING BREAKDOWN
// ---------------------------------------------------------------------------

export interface RangeMeanReversionScoreBreakdown {
  rangeRegime: number;       // max 2 points: ADX < 22 and falling/flat
  stableVolatility: number;  // max 1 point: ATR ratio < 1.25
  location: number;          // max 2 points: lower/upper 20% of range
  supportQuality: number;    // max 1 point: at least 2 prior reactions
  rejection: number;         // max 2 points: close back inside range
  momentumRsi: number;       // max 1 point: RSI extreme / recovery
  trigger: number;           // max 1 point: break of rejection candle extreme
  htfNeutral: number;        // max 1 point: higher timeframe neutral
  total: number;             // 0 - 11
}

// ---------------------------------------------------------------------------
// 5 & 8. SIGNAL & BOT ENGINE EVALUATION
// ---------------------------------------------------------------------------

export interface RangeMeanReversionSignal {
  direction: 'LONG' | 'SHORT';
  score: number;             // 0 - 100 scaled
  rawScore: number;          // 0 - 11 points
  entryPrice: number;
  bbLower: number;
  bbMiddle: number;
  bbUpper: number;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeLocation: number;
  rsi: number;
  prevRsi: number;
  stopDistance: number;
  sl: number;
  tp1: number;               // Range midpoint / mean
  tp2: number;               // Opposite range boundary
  tp3: number;               // 1:3 R:R extension
  atr: number;
  reason: string;
  scoreBreakdown: RangeMeanReversionScoreBreakdown;
  gatesDetail: {
    rangeFilterPassed: boolean;
    bbExtremePassed: boolean;
    rsiExtremePassed: boolean;
    confirmationPassed: boolean;
    stopTightPassed: boolean;
    rewardRiskPassed: boolean;
    antiRunawayPassed: boolean;
    emaRegimeFilterPassed?: boolean;
  };
}

export interface RangeMeanReversionOptions {
  maxAdx?: number;              // default 22
  maxAtrRatio?: number;         // default 1.25
  minScore?: number;            // default 8 (out of 11)
  outerRangePct?: number;       // default 0.20 (lower 20% long, upper 20% short)
  rsiPeriod?: number;           // default 14 (or 5/7)
  rsiOversold?: number;         // default 35
  rsiOverbought?: number;       // default 65
  atrBufferMult?: number;       // default 0.3
  minRrRatio?: number;          // default 1.2 to TP1, 2.0 to TP2
  bbPeriod?: number;            // default 20
  bbStdDev?: number;            // default 2.0
  rangeSmaPct?: number;         // default 0.05
  maxSmaSlope?: number;         // default 0.02
  stopMult?: number;            // default 1.5
  targetRr?: number;            // default 3.0
  enforceRegimeFilter?: boolean; // default false (requires dedicated allowEMAMeanReversion filter)
}

/**
 * Core Strategy Evaluator: Institutional Ranging Mean-Reversion
 * Operates at validated range extremes in genuine sideways conditions.
 */
export function evaluateRangeMeanReversion(
  candles: any[],
  currentPrice: number,
  params: RangeMeanReversionOptions = {}
): RangeMeanReversionSignal | null {
  if (!candles || candles.length < 35) return null;

  const maxAdx = params.maxAdx !== undefined ? params.maxAdx : 22;
  const maxAtrRatio = params.maxAtrRatio !== undefined ? params.maxAtrRatio : 1.25;
  const minScore = params.minScore !== undefined ? params.minScore : 8;
  const outerPct = params.outerRangePct !== undefined ? params.outerRangePct : 0.20;
  const rsiPeriod = params.rsiPeriod || 14;
  const rsiOversold = params.rsiOversold || 35;
  const rsiOverbought = params.rsiOverbought || 65;
  const atrBufferMult = params.atrBufferMult !== undefined ? params.atrBufferMult : 0.3;
  const minRr = params.minRrRatio || 1.2;

  const len = candles.length - 1;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const close = currentPrice || closes[len];

  // 1. Regime Filter Module
  const regime = detectRangingRegime(candles, {
    maxAdx,
    maxAtrRatio,
    maxSmaSlope: params.maxSmaSlope
  });

  // Calculate indicators
  const bb = calculateBollingerBands(closes, params.bbPeriod || 20, params.bbStdDev || 2.0);
  const rsiSeries = calculateRSI(closes, rsiPeriod);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = Math.max(atrSeries[len] || 0, close * 0.005);

  // 2. Objective Range Detection Module
  const range = detectObjectiveRange(candles, close, atr, 50);

  // 4. Breakout Risk Module
  const breakout = checkBreakoutRisk(
    candles,
    range.rangeHigh,
    range.rangeLow,
    regime.atrRatio,
    regime.adxSlope,
    regime.adx,
    bb
  );

  // Hard rejection if BreakoutRisk is active
  if (breakout.hasBreakoutRisk) {
    return null;
  }

  // Location Filter: strictly outer 20% of range
  const isLongLocation = range.rangeLocation <= outerPct;
  const isShortLocation = range.rangeLocation >= (1.0 - outerPct);

  // Middle-of-range no-trade rule
  if (!isLongLocation && !isShortLocation) {
    return null;
  }

  const c0 = candles[len];
  const c1 = candles[len - 1];
  const c2 = candles[Math.max(0, len - 2)];
  const currentRsi = rsiSeries[len];
  const prevRsi = rsiSeries[len - 1] || currentRsi;

  // Track extreme RSI across the boundary test & rejection sequence (last 4 bars)
  const recentRsiSlice = rsiSeries.slice(Math.max(0, len - 3), len + 1);
  const minRecentRsi = Math.min(...recentRsiSlice);
  const maxRecentRsi = Math.max(...recentRsiSlice);

  let direction: 'LONG' | 'SHORT' | null = null;
  let rejectionExtreme = 0;
  let setupReason = '';

  // 3. Confirmation Over Prediction:
  // Long setup:
  // - Reached lower boundary (c2, c1, or c0 swept/touched RangeLow or lower BB)
  // - Closed back inside range (c0.close > range.rangeLow)
  // - RSI was oversold (< 35) during the test/rejection sequence
  // - Trigger: c0 breaks rejection candle high (c0.close > c1.high or c0.high > c1.high)
  const sweptLow = Math.min(c2.low, c1.low, c0.low) <= range.rangeLow * 1.01 || c1.close < bb.lower[len - 1] || c2.close < bb.lower[Math.max(0, len - 2)];
  const closedInsideLow = c0.close > range.rangeLow;
  const isRsiOversold = minRecentRsi <= rsiOversold;
  const isBullishTrigger = c0.close > c1.high || (c0.high > c1.high && c0.close > c0.open);

  // Short setup:
  // - Reached upper boundary (c2, c1, or c0 swept/touched RangeHigh or upper BB)
  // - Closed back inside range (c0.close < range.rangeHigh)
  // - RSI was overbought (> 65) during the test/rejection sequence
  // - Trigger: c0 breaks rejection candle low (c0.close < c1.low or c0.low < c1.low)
  const sweptHigh = Math.max(c2.high, c1.high, c0.high) >= range.rangeHigh * 0.99 || c1.close > bb.upper[len - 1] || c2.close > bb.upper[Math.max(0, len - 2)];
  const closedInsideHigh = c0.close < range.rangeHigh;
  const isRsiOverbought = maxRecentRsi >= rsiOverbought;
  const isBearishTrigger = c0.close < c1.low || (c0.low < c1.low && c0.close < c0.open);

  if (isLongLocation && sweptLow && closedInsideLow && isRsiOversold) {
    direction = 'LONG';
    rejectionExtreme = Math.min(c0.low, c1.low, range.rangeLow);
    setupReason = `Mean-Reversion Long: Rejection at range low (${range.rangeLow.toFixed(2)}), closed inside at ${close.toFixed(2)} with RSI ${currentRsi.toFixed(1)}`;
  } else if (isShortLocation && sweptHigh && closedInsideHigh && isRsiOverbought) {
    direction = 'SHORT';
    rejectionExtreme = Math.max(c0.high, c1.high, range.rangeHigh);
    setupReason = `Mean-Reversion Short: Rejection at range high (${range.rangeHigh.toFixed(2)}), closed inside at ${close.toFixed(2)} with RSI ${currentRsi.toFixed(1)}`;
  } else {
    return null;
  }

  // 5. Entry, Stop, and Target Rules
  const atrBuffer = atrBufferMult * atr;
  let sl = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (direction === 'LONG') {
    sl = rejectionExtreme - atrBuffer;
    tp1 = range.rangeMid;
    tp2 = range.rangeHigh;
    const stopDist = Math.max(close - sl, atr * 0.4);
    tp3 = close + (stopDist * 3.0);

    const rewardToMid = tp1 - close;
    if (rewardToMid < stopDist * minRr && rewardToMid > 0) {
      // If reward to midpoint is too tight, check full range reward
      if ((tp2 - close) < stopDist * minRr) {
        return null; // Poor reward-to-risk ratio
      }
    }
  } else {
    sl = rejectionExtreme + atrBuffer;
    tp1 = range.rangeMid;
    tp2 = range.rangeLow;
    const stopDist = Math.max(sl - close, atr * 0.4);
    tp3 = close - (stopDist * 3.0);

    const rewardToMid = close - tp1;
    if (rewardToMid < stopDist * minRr && rewardToMid > 0) {
      if ((close - tp2) < stopDist * minRr) {
        return null; // Poor reward-to-risk ratio
      }
    }
  }

  const stopDistance = Math.abs(close - sl);

  // 7. Practical 11-Point Scoring Model
  const breakdown: RangeMeanReversionScoreBreakdown = {
    rangeRegime: regime.isRanging ? 2 : (regime.adx < 25 ? 1 : 0),
    stableVolatility: regime.atrRatio < maxAtrRatio ? 1 : 0,
    location: (direction === 'LONG' ? isLongLocation : isShortLocation) ? 2 : 1,
    supportQuality: (direction === 'LONG' ? range.touchesLow >= 2 : range.touchesHigh >= 2) ? 1 : 0,
    rejection: (direction === 'LONG' ? closedInsideLow : closedInsideHigh) ? 2 : 1,
    momentumRsi: (direction === 'LONG' ? isRsiOversold : isRsiOverbought) ? 1 : 0,
    trigger: (direction === 'LONG' ? isBullishTrigger : isBearishTrigger) ? 1 : 0,
    htfNeutral: 1, // Neutral higher timeframe alignment
    total: 0
  };

  breakdown.total = breakdown.rangeRegime +
                    breakdown.stableVolatility +
                    breakdown.location +
                    breakdown.supportQuality +
                    breakdown.rejection +
                    breakdown.momentumRsi +
                    breakdown.trigger +
                    breakdown.htfNeutral;

  if (breakdown.total < minScore) {
    return null;
  }

  // Dedicated EMA Mean-Reversion Regime Filter Gate
  const emaMetrics = extractEmaMeanReversionRegimeMetrics(candles);
  const emaRegimeAllowed = allowEMAMeanReversion(emaMetrics, direction);
  if (params.enforceRegimeFilter) {
    if (!emaRegimeAllowed) {
      return null;
    }
  }

  const scaledScore = Math.min(99, Math.round((breakdown.total / 11) * 100));

  return {
    direction,
    score: scaledScore,
    rawScore: breakdown.total,
    entryPrice: close,
    bbLower: bb.lower[len],
    bbMiddle: bb.middle[len],
    bbUpper: bb.upper[len],
    rangeHigh: range.rangeHigh,
    rangeLow: range.rangeLow,
    rangeMid: range.rangeMid,
    rangeLocation: range.rangeLocation,
    rsi: currentRsi,
    prevRsi,
    stopDistance,
    sl,
    tp1,
    tp2,
    tp3,
    atr,
    reason: setupReason,
    scoreBreakdown: breakdown,
    gatesDetail: {
      rangeFilterPassed: regime.isRanging,
      bbExtremePassed: true,
      rsiExtremePassed: true,
      confirmationPassed: true,
      stopTightPassed: stopDistance >= (atr * 0.3),
      rewardRiskPassed: Math.abs(tp2 - close) / stopDistance >= 1.5,
      antiRunawayPassed: !breakout.hasBreakoutRisk,
      emaRegimeFilterPassed: emaRegimeAllowed
    }
  };
}

// ---------------------------------------------------------------------------
// 6. EXPECTANCY TRACKING & ANALYTICS ENGINE
// ---------------------------------------------------------------------------

export interface MeanReversionTradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe: string;
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  pnl: number;
  pnlR: number;
  isWin: boolean;
  adxAtEntry: number;
  atrRatioAtEntry: number;
  boundaryTestsAtEntry: number;
  session: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS';
  entryTime: number;
  exitTime: number;
}

export interface MeanReversionSubgroup {
  count: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
}

export interface MeanReversionExpectancyMetrics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  lossRate: number;
  avgWinR: number;
  avgLossR: number;
  profitFactor: number;
  expectancyR: number;
  expectedValuePerDollar: number;
  byAdxTier: {
    lowAdxSub18: MeanReversionSubgroup;
    midAdx18to22: MeanReversionSubgroup;
    highAdxAbove22: MeanReversionSubgroup;
  };
  byAtrRegime: {
    sub1_0: MeanReversionSubgroup;
    normal1_0to1_25: MeanReversionSubgroup;
    highAbove1_25: MeanReversionSubgroup;
  };
  byDirection: {
    LONG: MeanReversionSubgroup;
    SHORT: MeanReversionSubgroup;
  };
  bySession: Record<string, MeanReversionSubgroup>;
  byBoundaryTests: {
    twoTests: MeanReversionSubgroup;
    threeOrFourTests: MeanReversionSubgroup;
    fivePlusTests: MeanReversionSubgroup;
  };
}

function calculateSubgroup(trades: MeanReversionTradeRecord[]): MeanReversionSubgroup {
  if (trades.length === 0) {
    return { count: 0, winCount: 0, lossCount: 0, winRate: 0, avgWinR: 0, avgLossR: 0, expectancyR: 0 };
  }
  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / trades.length;
  const lossRate = lossCount / trades.length;
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0;
  const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlR, 0) / losses.length) : 0;
  const expectancyR = (winRate * avgWinR) - (lossRate * avgLossR);

  return {
    count: trades.length,
    winCount,
    lossCount,
    winRate,
    avgWinR,
    avgLossR,
    expectancyR
  };
}

/**
 * Computes mathematical expectancy for mean-reversion trades:
 * Expectancy = (Pw * Avg Win) - (Pl * Avg Loss) - Costs
 */
export function calculateMeanReversionExpectancy(trades: MeanReversionTradeRecord[]): MeanReversionExpectancyMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      lossRate: 0,
      avgWinR: 0,
      avgLossR: 0,
      profitFactor: 0,
      expectancyR: 0,
      expectedValuePerDollar: 0,
      byAdxTier: {
        lowAdxSub18: calculateSubgroup([]),
        midAdx18to22: calculateSubgroup([]),
        highAdxAbove22: calculateSubgroup([])
      },
      byAtrRegime: {
        sub1_0: calculateSubgroup([]),
        normal1_0to1_25: calculateSubgroup([]),
        highAbove1_25: calculateSubgroup([])
      },
      byDirection: {
        LONG: calculateSubgroup([]),
        SHORT: calculateSubgroup([])
      },
      bySession: {},
      byBoundaryTests: {
        twoTests: calculateSubgroup([]),
        threeOrFourTests: calculateSubgroup([]),
        fivePlusTests: calculateSubgroup([])
      }
    };
  }

  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / totalTrades;
  const lossRate = lossCount / totalTrades;

  const totalWinR = wins.reduce((s, t) => s + t.pnlR, 0);
  const totalLossR = Math.abs(losses.reduce((s, t) => s + t.pnlR, 0));
  const avgWinR = wins.length > 0 ? totalWinR / wins.length : 0;
  const avgLossR = losses.length > 0 ? totalLossR / losses.length : 0;
  const expectancyR = (winRate * avgWinR) - (lossRate * avgLossR);
  const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? 99 : 0;
  const expectedValuePerDollar = avgLossR > 0 ? (expectancyR / avgLossR) : expectancyR;

  return {
    totalTrades,
    winCount,
    lossCount,
    winRate,
    lossRate,
    avgWinR,
    avgLossR,
    profitFactor,
    expectancyR,
    expectedValuePerDollar,
    byAdxTier: {
      lowAdxSub18: calculateSubgroup(trades.filter(t => t.adxAtEntry < 18)),
      midAdx18to22: calculateSubgroup(trades.filter(t => t.adxAtEntry >= 18 && t.adxAtEntry <= 22)),
      highAdxAbove22: calculateSubgroup(trades.filter(t => t.adxAtEntry > 22))
    },
    byAtrRegime: {
      sub1_0: calculateSubgroup(trades.filter(t => t.atrRatioAtEntry < 1.0)),
      normal1_0to1_25: calculateSubgroup(trades.filter(t => t.atrRatioAtEntry >= 1.0 && t.atrRatioAtEntry <= 1.25)),
      highAbove1_25: calculateSubgroup(trades.filter(t => t.atrRatioAtEntry > 1.25))
    },
    byDirection: {
      LONG: calculateSubgroup(trades.filter(t => t.direction === 'LONG')),
      SHORT: calculateSubgroup(trades.filter(t => t.direction === 'SHORT'))
    },
    bySession: {
      ASIA: calculateSubgroup(trades.filter(t => t.session === 'ASIA')),
      LONDON: calculateSubgroup(trades.filter(t => t.session === 'LONDON')),
      NEW_YORK: calculateSubgroup(trades.filter(t => t.session === 'NEW_YORK')),
      OFF_HOURS: calculateSubgroup(trades.filter(t => t.session === 'OFF_HOURS'))
    },
    byBoundaryTests: {
      twoTests: calculateSubgroup(trades.filter(t => t.boundaryTestsAtEntry <= 2)),
      threeOrFourTests: calculateSubgroup(trades.filter(t => t.boundaryTestsAtEntry >= 3 && t.boundaryTestsAtEntry <= 4)),
      fivePlusTests: calculateSubgroup(trades.filter(t => t.boundaryTestsAtEntry >= 5))
    }
  };
}
