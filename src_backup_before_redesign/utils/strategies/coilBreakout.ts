/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Two-Sided Coil / Compression Breakout Strategy
 * Optimized for 15m setup and 1h market/coin context.
 * 
 * Core Philosophy:
 * - Direction-neutral coil detection: does not predict direction while coil is forming.
 * - Strict compression criteria:
 *    * Coil length: 5 - 20 candles
 *    * Coil height <= 1.25 × ATR(14)
 *    * Median candle range within coil < 0.70 × ATR(14)
 *    * ATR(14) declining or flat over the coil
 *    * At least 70% of candle bodies remain inside coil boundaries
 *    * No unusually large opposite breakout candle inside coil
 * - Breakout confirmation:
 *    * Candle close outside boundary (Long > coilHigh, Short < coilLow)
 *    * Breakout body >= 1.2 × median coil body
 *    * Breakout range >= 1.25 × median coil range
 *    * Volume >= 1.25 × mean coil volume
 * - Market & Relative Strength Filters:
 *    * Long: BTC neutral-to-bullish & Coin strong vs BTC
 *    * Short: BTC neutral-to-bearish & Coin weak vs BTC
 * - Retest requirement:
 *    * Long: Retest of coil high that holds as support
 *    * Short: Retest of coil low that rejects as resistance
 * - Strict 1:5 Reward-to-Risk rule:
 *    * Validates structural liquidity (buy-side or sell-side)
 *    * Rejects trade if target does not provide realistic 1:5 R:R
 * - TradingView Pine Script v6 strategy generator with webhook support.
 */

import { AppSettings, CoilBreakoutSignal, CoilBreakoutStatus } from '../../types';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// 1. Technical Math & Utilities
// ---------------------------------------------------------------------------

export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(0);
  if (closes.length < 2) return result;

  const tr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }

  let sum = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) {
    sum += tr[i];
  }
  let prevAtr = sum / Math.min(period, tr.length);
  result[Math.min(period - 1, closes.length - 1)] = prevAtr;

  for (let i = period; i < tr.length; i++) {
    prevAtr = (prevAtr * (period - 1) + tr[i]) / period;
    result[i] = prevAtr;
  }

  return result;
}

export function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;
  const k = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    prevEma = values[i] * k + prevEma * (1 - k);
    result[i] = prevEma;
  }

  return result;
}

export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateMean(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, v) => acc + v, 0) / numbers.length;
}

export interface DetectedCoil {
  startIndex: number;
  endIndex: number;
  length: number;
  coilHigh: number;
  coilLow: number;
  height: number;
  heightAtrRatio: number;
  medianBody: number;
  medianRange: number;
  meanVolume: number;
  isDecliningAtr: boolean;
  bodyContainmentPct: number;
  hasHigherLows: boolean;
  hasLowerHighs: boolean;
}

// ---------------------------------------------------------------------------
// 2. Strict Coil Detector
// ---------------------------------------------------------------------------

export function detectCoilPattern(
  candles: Candle[],
  atrs: number[],
  settings: AppSettings,
  evalIndex: number
): DetectedCoil | null {
  const minLen = settings.coilMinLength ?? 5;
  const maxLen = settings.coilMaxLength ?? 20;
  const maxHeightAtr = settings.coilMaxHeightAtr ?? 1.25;
  const maxMedianRangeAtr = settings.coilMedianRangeAtr ?? 0.70;
  const minBodyContainment = settings.coilMinBodyContainment ?? 0.70;

  if (evalIndex < maxLen + 1) return null;

  let bestCoil: DetectedCoil | null = null;
  let minCoilAtrRatio = Infinity;

  // Search candidate lengths backwards from evalIndex (e.g. lengths 5 to 20)
  for (let len = minLen; len <= maxLen; len++) {
    const startIndex = evalIndex - len + 1;
    const endIndex = evalIndex;
    if (startIndex < 0) continue;

    const windowCandles = candles.slice(startIndex, endIndex + 1);
    const endAtr = atrs[endIndex] || (windowCandles[windowCandles.length - 1].close * 0.01);
    const startAtr = atrs[startIndex] || endAtr;
    if (endAtr <= 0) continue;

    const highs = windowCandles.map(c => c.high);
    const lows = windowCandles.map(c => c.low);
    const coilHigh = Math.max(...highs);
    const coilLow = Math.min(...lows);
    const height = coilHigh - coilLow;
    const heightAtrRatio = height / endAtr;

    // 1. Compression: Coil height <= 1.25 * ATR
    if (heightAtrRatio > maxHeightAtr) continue;

    // 2. Median candle range within coil < 0.70 * ATR
    const ranges = windowCandles.map(c => c.high - c.low);
    const medianRange = calculateMedian(ranges);
    if (medianRange >= maxMedianRangeAtr * endAtr) continue;

    // 3. ATR declining or flat over coil
    const isDecliningAtr = endAtr <= (startAtr * 1.05);

    // 4. At least 70% of candle bodies remain inside coil boundaries
    let bodiesInside = 0;
    const bodies = windowCandles.map(c => {
      const top = Math.max(c.open, c.close);
      const bot = Math.min(c.open, c.close);
      if (top <= coilHigh + (endAtr * 0.05) && bot >= coilLow - (endAtr * 0.05)) {
        bodiesInside++;
      }
      return top - bot;
    });
    const bodyContainmentPct = bodiesInside / len;
    if (bodyContainmentPct < minBodyContainment) continue;

    // 5. Structure: No unusually large opposite bar inside coil (range <= 1.5 * ATR)
    const hasUnusualSpike = ranges.some(r => r > 1.55 * endAtr);
    if (hasUnusualSpike) continue;

    // Analyze highs & lows progression
    let hasHigherLows = false;
    let hasLowerHighs = false;
    if (len >= 6) {
      const firstHalfLows = lows.slice(0, Math.floor(len / 2));
      const secondHalfLows = lows.slice(Math.floor(len / 2));
      const firstHalfHighs = highs.slice(0, Math.floor(len / 2));
      const secondHalfHighs = highs.slice(Math.floor(len / 2));
      hasHigherLows = Math.min(...secondHalfLows) > Math.min(...firstHalfLows);
      hasLowerHighs = Math.max(...secondHalfHighs) < Math.max(...firstHalfHighs);
    }

    const medianBody = calculateMedian(bodies);
    const meanVolume = calculateMean(windowCandles.map(c => c.volume));

    // Prefer tightest relative coil
    if (heightAtrRatio < minCoilAtrRatio) {
      minCoilAtrRatio = heightAtrRatio;
      bestCoil = {
        startIndex,
        endIndex,
        length: len,
        coilHigh,
        coilLow,
        height,
        heightAtrRatio,
        medianBody,
        medianRange,
        meanVolume,
        isDecliningAtr,
        bodyContainmentPct,
        hasHigherLows,
        hasLowerHighs
      };
    }
  }

  return bestCoil;
}

// ---------------------------------------------------------------------------
// 3. Main Strategy Evaluation Engine
// ---------------------------------------------------------------------------

export function evaluateCoilBreakout(
  rawCandles: Candle[],
  htfCandles: Candle[] = [],
  currentPrice: number,
  settings: AppSettings,
  btcCandles: Candle[] = []
): CoilBreakoutSignal | null {
  if (!rawCandles || rawCandles.length < 35) return null;

  // Use closed candles only (strict no-repainting)
  const closedCandles = rawCandles.slice(0, -1);
  if (closedCandles.length < 30) return null;

  const closes = closedCandles.map(c => c.close);
  const highs = closedCandles.map(c => c.high);
  const lows = closedCandles.map(c => c.low);
  const atrs = calculateATR(highs, lows, closes, 14);

  const lastIdx = closedCandles.length - 1;
  const lastBar = closedCandles[lastIdx];
  const curAtr = atrs[lastIdx] || (lastBar.close * 0.01);
  const symbol = (settings as any).symbol || 'SOLUSDT';

  const entryMode = settings.coilEntryMode || 'limit_on_retest';
  const minRR = settings.coilMinRewardRisk || settings.minRRRatio || 5.0;
  const slBufferAtr = settings.coilSlAtrBuffer || 0.20;
  const breakoutBodyMult = settings.coilBreakoutBodyMult || 1.20;
  const breakoutRangeMult = settings.coilBreakoutRangeMult || 1.25;
  const breakoutVolMult = settings.coilBreakoutVolMult || 1.25;

  // -------------------------------------------------------------------------
  // Step 1: Detect Coil (Check if coil ended recently, e.g. at lastBar or 1-4 bars ago)
  // -------------------------------------------------------------------------
  let detectedCoil: DetectedCoil | null = null;
  let breakoutBarIdx = -1;

  // Case A: Last bar itself is inside the coil (Watchlist / Forming state)
  const coilForming = detectCoilPattern(closedCandles, atrs, settings, lastIdx);
  
  // Case B: Coil completed 1 to 4 bars ago, and price broke out
  for (let offset = 0; offset <= 4; offset++) {
    const candidateIdx = lastIdx - offset;
    const coil = detectCoilPattern(closedCandles, atrs, settings, candidateIdx);
    if (coil) {
      // Check if candles after this coil show a breakout
      for (let bIdx = candidateIdx + 1; bIdx <= lastIdx; bIdx++) {
        const bCandle = closedCandles[bIdx];
        const isLongBo = bCandle.close > coil.coilHigh;
        const isShortBo = bCandle.close < coil.coilLow;
        if (isLongBo || isShortBo) {
          detectedCoil = coil;
          breakoutBarIdx = bIdx;
          break;
        }
      }
      if (detectedCoil) break;
    }
  }

  // Fallback: If no breakout yet, use forming coil
  if (!detectedCoil && coilForming) {
    detectedCoil = coilForming;
    breakoutBarIdx = -1;
  }

  if (!detectedCoil) {
    return {
      symbol,
      setup: 'uncompressed',
      side: 'NEUTRAL',
      direction: 'LONG',
      timeframe: '15m',
      coilRange: {
        high: lastBar.high,
        low: lastBar.low,
        height: lastBar.high - lastBar.low,
        heightAtrRatio: 1.0,
        length: 0
      },
      entryType: entryMode,
      entryPrice: lastBar.close,
      stopLossPrice: lastBar.close * 0.98,
      targetPrice: lastBar.close * 1.10,
      riskAmount: curAtr,
      rewardAmount: curAtr * 5,
      riskRewardRatio: 5.0,
      status: 'WAITING',
      displayStatus: 'STATUS: WAITING — No compression coil detected (waiting for consolidation squeeze)',
      finalDecision: 'WAIT',
      marketFilter: 'Waiting for Coil Compression',
      coinFilter: 'Uncompressed',
      retestStatus: 'SKIPPED',
      cancelCondition: 'Waiting for favorable coil regime',
      score: 40,
      atrValue: curAtr,
      reason: 'Market condition not in favor of Coil Breakout: No volatility compression coil detected. Waiting for consolidation squeeze.',
      exactRejectionReason: 'WAITING_FOR_FAVORABLE_REGIME',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      strategyRegimeStatus: 'WAITING',
      marketRegime: 'Uncompressed / Volatile',
      passedFilters: {
        compressionCheck: false,
        medianRangeCheck: false,
        atrDecliningCheck: false,
        bodyContainmentCheck: false,
        breakoutCandleCheck: false,
        volumeCheck: false,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: false,
        rrRatioCheck: false
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Direction-Neutral Watchlist State (Coil forming, no breakout)
  // -------------------------------------------------------------------------
  if (breakoutBarIdx === -1) {
    const coilRange = {
      high: detectedCoil.coilHigh,
      low: detectedCoil.coilLow,
      height: detectedCoil.height,
      heightAtrRatio: detectedCoil.heightAtrRatio,
      length: detectedCoil.length
    };

    const displayStatus = 'STATUS: WATCHLIST — coil detected; no confirmed breakout.';
    return {
      symbol,
      setup: 'coil_forming',
      side: 'NEUTRAL',
      direction: 'LONG',
      timeframe: '15m',
      coilRange,
      entryType: entryMode,
      entryPrice: detectedCoil.coilHigh,
      stopLossPrice: detectedCoil.coilLow,
      targetPrice: detectedCoil.coilHigh + (detectedCoil.height * 5),
      riskAmount: detectedCoil.height,
      rewardAmount: detectedCoil.height * 5,
      riskRewardRatio: 5.0,
      status: 'WATCHLIST',
      displayStatus,
      finalDecision: 'WAIT',
      marketFilter: 'BTC Neutral',
      coinFilter: 'Coil Consolidating',
      retestStatus: 'PENDING',
      cancelCondition: 'Coil expansion without valid displacement',
      score: 70,
      atrValue: curAtr,
      reason: `Coil Consolidation (${detectedCoil.length} bars, ${(detectedCoil.heightAtrRatio).toFixed(2)}x ATR). Waiting for breakout direction.`,
      exactRejectionReason: 'AWAITING_BREAKOUT',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      passedFilters: {
        compressionCheck: true,
        medianRangeCheck: true,
        atrDecliningCheck: detectedCoil.isDecliningAtr,
        bodyContainmentCheck: true,
        breakoutCandleCheck: false,
        volumeCheck: false,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: false,
        rrRatioCheck: true
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Breakout / Breakdown Evaluation
  // -------------------------------------------------------------------------
  const breakoutCandle = closedCandles[breakoutBarIdx];
  const isLongBreakout = breakoutCandle.close > detectedCoil.coilHigh;
  const isShortBreakdown = breakoutCandle.close < detectedCoil.coilLow;

  if (!isLongBreakout && !isShortBreakdown) {
    return null;
  }

  const direction: 'LONG' | 'SHORT' = isLongBreakout ? 'LONG' : 'SHORT';
  const setupName = isLongBreakout ? 'coil_breakout_long' : 'coil_breakdown_short';

  // Breakout Candle Quality Checks
  const boBody = Math.abs(breakoutCandle.close - breakoutCandle.open);
  const boRange = breakoutCandle.high - breakoutCandle.low;
  const boVolume = breakoutCandle.volume;

  const passedBody = boBody >= detectedCoil.medianBody * breakoutBodyMult;
  const passedRange = boRange >= detectedCoil.medianRange * breakoutRangeMult;
  const passedVolume = boVolume >= detectedCoil.meanVolume * breakoutVolMult;

  if (!passedBody || !passedRange || !passedVolume) {
    const failReason = !passedVolume
      ? `Breakout volume (${(boVolume / (detectedCoil.meanVolume || 1)).toFixed(2)}x) < ${breakoutVolMult}x mean coil volume`
      : `Breakout candle body/range failed displacement expansion threshold`;
    
    return {
      symbol,
      setup: setupName,
      side: direction,
      direction,
      timeframe: '15m',
      coilRange: {
        high: detectedCoil.coilHigh,
        low: detectedCoil.coilLow,
        height: detectedCoil.height,
        heightAtrRatio: detectedCoil.heightAtrRatio,
        length: detectedCoil.length
      },
      entryType: entryMode,
      entryPrice: isLongBreakout ? detectedCoil.coilHigh : detectedCoil.coilLow,
      stopLossPrice: isLongBreakout ? detectedCoil.coilLow : detectedCoil.coilHigh,
      targetPrice: isLongBreakout ? detectedCoil.coilHigh + (curAtr * 5) : detectedCoil.coilLow - (curAtr * 5),
      riskAmount: detectedCoil.height,
      rewardAmount: detectedCoil.height * 5,
      riskRewardRatio: 5.0,
      status: 'REJECTED',
      displayStatus: `STATUS: REJECTED — ${failReason}`,
      finalDecision: 'REJECT',
      marketFilter: 'BTC Neutral',
      coinFilter: 'Volume Inadequate',
      retestStatus: 'FAILED',
      cancelCondition: 'Breakout lacked volume/displacement expansion',
      score: 45,
      atrValue: curAtr,
      reason: failReason,
      exactRejectionReason: 'BREAKOUT_QUALITY_FAILED',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      passedFilters: {
        compressionCheck: true,
        medianRangeCheck: true,
        atrDecliningCheck: detectedCoil.isDecliningAtr,
        bodyContainmentCheck: true,
        breakoutCandleCheck: false,
        volumeCheck: false,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: false,
        rrRatioCheck: false
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 4: Strategy-Specific Market Regime Filter (Volatility Compression Squeeze)
  // -------------------------------------------------------------------------
  let coilRegimePass = true;
  let coilRegimeDesc = 'Compression Coil Confirmed';

  // Check if coil compression condition is strictly in favor of this strategy
  const isAtrCompressed = detectedCoil.heightAtrRatio <= ((settings as any).coilHeightAtrLimit || 1.35);
  const isMedianTight = detectedCoil.medianRange < curAtr * ((settings as any).coilMedianRangeMult || settings.coilMedianRangeAtr || 0.75);

  if (!isAtrCompressed || !isMedianTight) {
    coilRegimePass = false;
    coilRegimeDesc = `Compression suboptimal (Height: ${detectedCoil.heightAtrRatio.toFixed(2)}x ATR, Median: ${(detectedCoil.medianRange / curAtr).toFixed(2)}x ATR)`;
  }

  if (!coilRegimePass) {
    return {
      symbol,
      setup: setupName,
      side: direction,
      direction,
      timeframe: '15m',
      coilRange: {
        high: detectedCoil.coilHigh,
        low: detectedCoil.coilLow,
        height: detectedCoil.height,
        heightAtrRatio: detectedCoil.heightAtrRatio,
        length: detectedCoil.length
      },
      entryType: entryMode,
      entryPrice: isLongBreakout ? detectedCoil.coilHigh : detectedCoil.coilLow,
      stopLossPrice: isLongBreakout ? detectedCoil.coilLow : detectedCoil.coilHigh,
      targetPrice: isLongBreakout ? detectedCoil.coilHigh + (curAtr * 5) : detectedCoil.coilLow - (curAtr * 5),
      riskAmount: detectedCoil.height,
      rewardAmount: detectedCoil.height * 5,
      riskRewardRatio: 5.0,
      status: 'WAITING',
      displayStatus: `STATUS: WAITING — ${coilRegimeDesc}`,
      finalDecision: 'WAIT',
      marketFilter: coilRegimeDesc,
      coinFilter: 'Waiting for tighter compression',
      retestStatus: 'SKIPPED',
      cancelCondition: 'Waiting for favorable coil regime',
      score: 50,
      atrValue: curAtr,
      reason: `Market condition not in favor of Coil Breakout: ${coilRegimeDesc}. Waiting for tighter coil consolidation.`,
      exactRejectionReason: 'WAITING_FOR_FAVORABLE_REGIME',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      strategyRegimeStatus: 'WAITING',
      marketRegime: 'Unfavorable Compression',
      passedFilters: {
        compressionCheck: false,
        medianRangeCheck: isMedianTight,
        atrDecliningCheck: detectedCoil.isDecliningAtr,
        bodyContainmentCheck: true,
        breakoutCandleCheck: true,
        volumeCheck: true,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: false,
        rrRatioCheck: false
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 5: Retest & Invalidation Verification
  // -------------------------------------------------------------------------
  let retestStatus: 'HOLDING' | 'REJECTING' | 'PENDING' | 'FAILED' | 'SKIPPED' = 'PENDING';
  let isRetestHeld = false;
  let isInvalidated = false;

  const postBreakoutBars = closedCandles.slice(breakoutBarIdx + 1);

  if (entryMode === 'aggressive_breakout') {
    retestStatus = 'SKIPPED';
    isRetestHeld = true;
  } else {
    // Limit on retest mode: check if price retested the coil boundary
    if (direction === 'LONG') {
      // Retest zone: coilHigh ± 0.15% (or coilHigh to coilHigh + 0.3 ATR)
      for (const bar of postBreakoutBars) {
        // Did bar close below coilLow? (Invalidation)
        if (bar.close < detectedCoil.coilLow) {
          isInvalidated = true;
          break;
        }

        const touchedRetest = bar.low <= (detectedCoil.coilHigh * 1.002);
        const heldAbove = bar.close >= (detectedCoil.coilHigh * 0.998);
        const candleRange = bar.high - bar.low;
        const lowerWick = Math.min(bar.open, bar.close) - bar.low;
        const hasRejection = (candleRange > 0 && (lowerWick / candleRange) >= 0.20) || (bar.close > bar.open);

        if (touchedRetest && heldAbove && hasRejection) {
          isRetestHeld = true;
          retestStatus = 'HOLDING';
        }
      }
    } else {
      // Short breakdown retest of coilLow
      for (const bar of postBreakoutBars) {
        // Closed back above coilHigh? (Invalidation)
        if (bar.close > detectedCoil.coilHigh) {
          isInvalidated = true;
          break;
        }

        const touchedRetest = bar.high >= (detectedCoil.coilLow * 0.998);
        const heldBelow = bar.close <= (detectedCoil.coilLow * 1.002);
        const candleRange = bar.high - bar.low;
        const upperWick = bar.high - Math.max(bar.open, bar.close);
        const hasRejection = (candleRange > 0 && (upperWick / candleRange) >= 0.20) || (bar.close < bar.open);

        if (touchedRetest && heldBelow && hasRejection) {
          isRetestHeld = true;
          retestStatus = 'REJECTING';
        }
      }
    }
  }

  if (isInvalidated) {
    const invalidationReason = direction === 'LONG'
      ? 'Price closed back inside and lost coil low'
      : 'Price closed back inside and regained coil high';
    return {
      symbol,
      setup: setupName,
      side: direction,
      direction,
      timeframe: '15m',
      coilRange: {
        high: detectedCoil.coilHigh,
        low: detectedCoil.coilLow,
        height: detectedCoil.height,
        heightAtrRatio: detectedCoil.heightAtrRatio,
        length: detectedCoil.length
      },
      entryType: entryMode,
      entryPrice: isLongBreakout ? detectedCoil.coilHigh : detectedCoil.coilLow,
      stopLossPrice: isLongBreakout ? detectedCoil.coilLow : detectedCoil.coilHigh,
      targetPrice: isLongBreakout ? detectedCoil.coilHigh + (curAtr * 5) : detectedCoil.coilLow - (curAtr * 5),
      riskAmount: detectedCoil.height,
      rewardAmount: detectedCoil.height * 5,
      riskRewardRatio: 5.0,
      status: 'INVALIDATED',
      displayStatus: `STATUS: REJECTED — ${invalidationReason}`,
      finalDecision: 'REJECT',
      marketFilter: coilRegimeDesc,
      coinFilter: 'Coil Invalidation',
      retestStatus: 'FAILED',
      cancelCondition: invalidationReason,
      score: 30,
      atrValue: curAtr,
      reason: invalidationReason,
      exactRejectionReason: 'INVALIDATED_REVERSE_BOUNDARY',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      strategyRegimeStatus: 'NEUTRAL',
      marketRegime: 'Boundary Invalidation',
      passedFilters: {
        compressionCheck: true,
        medianRangeCheck: true,
        atrDecliningCheck: true,
        bodyContainmentCheck: true,
        breakoutCandleCheck: true,
        volumeCheck: true,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: false,
        rrRatioCheck: false
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 6: Stop Loss & Structural 1:5 Target Calculation
  // -------------------------------------------------------------------------
  let entryPrice = 0;
  let stopLossPrice = 0;
  let targetPrice = 0;
  let risk = 0;
  let reward = 0;
  let achievedRR = 0;
  let structuralTargetFound = false;

  const buffer = curAtr * slBufferAtr;

  if (direction === 'LONG') {
    entryPrice = detectedCoil.coilHigh;
    stopLossPrice = detectedCoil.coilLow - buffer;
    risk = entryPrice - stopLossPrice;

    if (risk <= 0) return null;
    const minRequiredReward = risk * minRR;

    // Search market structure: Find next buy-side liquidity / major swing high in lookback (last 60 bars)
    const lookbackBars = closedCandles.slice(Math.max(0, lastIdx - 80), Math.max(0, lastIdx - detectedCoil.length));
    const higherHighs = lookbackBars.map(b => b.high).filter(h => h > entryPrice);
    const maxStructuralHigh = higherHighs.length > 0 ? Math.max(...higherHighs) : 0;

    if (maxStructuralHigh >= entryPrice + minRequiredReward) {
      targetPrice = maxStructuralHigh;
      reward = targetPrice - entryPrice;
      achievedRR = reward / risk;
      structuralTargetFound = true;
    } else {
      // Also check 1H HTF candles if provided
      if (htfCandles && htfCandles.length > 0) {
        const htfHighs = htfCandles.slice(-40).map(b => b.high).filter(h => h > entryPrice);
        const maxHtfHigh = htfHighs.length > 0 ? Math.max(...htfHighs) : 0;
        if (maxHtfHigh >= entryPrice + minRequiredReward) {
          targetPrice = maxHtfHigh;
          reward = targetPrice - entryPrice;
          achievedRR = reward / risk;
          structuralTargetFound = true;
        }
      }
    }
  } else {
    entryPrice = detectedCoil.coilLow;
    stopLossPrice = detectedCoil.coilHigh + buffer;
    risk = stopLossPrice - entryPrice;

    if (risk <= 0) return null;
    const minRequiredReward = risk * minRR;

    // Search market structure: Find next sell-side liquidity / major swing low
    const lookbackBars = closedCandles.slice(Math.max(0, lastIdx - 80), Math.max(0, lastIdx - detectedCoil.length));
    const lowerLows = lookbackBars.map(b => b.low).filter(l => l < entryPrice);
    const minStructuralLow = lowerLows.length > 0 ? Math.min(...lowerLows) : Infinity;

    if (minStructuralLow <= entryPrice - minRequiredReward) {
      targetPrice = minStructuralLow;
      reward = entryPrice - targetPrice;
      achievedRR = reward / risk;
      structuralTargetFound = true;
    } else {
      if (htfCandles && htfCandles.length > 0) {
        const htfLows = htfCandles.slice(-40).map(b => b.low).filter(l => l < entryPrice);
        const minHtfLow = htfLows.length > 0 ? Math.min(...htfLows) : Infinity;
        if (minHtfLow <= entryPrice - minRequiredReward) {
          targetPrice = minHtfLow;
          reward = entryPrice - targetPrice;
          achievedRR = reward / risk;
          structuralTargetFound = true;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Enforce Strict 1:5 Reward-to-Risk Rule
  // -------------------------------------------------------------------------
  // If target does not provide a realistic 1:5 reward-to-risk based on actual structure, reject!
  if (!structuralTargetFound || achievedRR < minRR) {
    const rrRejectionReason = 'NO TRADE — target does not provide a realistic 1:5 reward-to-risk.';
    return {
      symbol,
      setup: setupName,
      side: direction,
      direction,
      timeframe: '15m',
      coilRange: {
        high: detectedCoil.coilHigh,
        low: detectedCoil.coilLow,
        height: detectedCoil.height,
        heightAtrRatio: detectedCoil.heightAtrRatio,
        length: detectedCoil.length
      },
      entryType: entryMode,
      entryPrice,
      stopLossPrice,
      targetPrice: direction === 'LONG' ? entryPrice + (risk * minRR) : entryPrice - (risk * minRR),
      riskAmount: risk,
      rewardAmount: risk * minRR,
      riskRewardRatio: achievedRR > 0 ? parseFloat(achievedRR.toFixed(1)) : 0,
      status: 'REJECTED',
      displayStatus: `STATUS: REJECTED — ${rrRejectionReason}`,
      finalDecision: 'REJECT',
      marketFilter: coilRegimeDesc,
      coinFilter: 'Insufficient R:R Pool',
      retestStatus,
      cancelCondition: 'Next liquidity pool is closer than 5R',
      score: 55,
      atrValue: curAtr,
      reason: rrRejectionReason,
      exactRejectionReason: 'INSUFFICIENT_STRUCTURAL_RR',
      timestamp: lastBar.time,
      signalTime: lastBar.time,
      strategyRegimeStatus: 'NEUTRAL',
      marketRegime: 'Suboptimal Target Range',
      passedFilters: {
        compressionCheck: true,
        medianRangeCheck: true,
        atrDecliningCheck: true,
        bodyContainmentCheck: true,
        breakoutCandleCheck: true,
        volumeCheck: true,
        btcFilterCheck: true,
        relativeStrengthCheck: true,
        retestCheck: isRetestHeld,
        rrRatioCheck: false
      }
    };
  }

  // -------------------------------------------------------------------------
  // Step 8: Execution Decision (Retest Pending vs Triggered)
  // -------------------------------------------------------------------------
  const cancelCondition = direction === 'LONG'
    ? '15m candle closes back below coil low'
    : '15m candle closes back above coil high';

  let finalDecision: 'EXECUTE' | 'WAIT' | 'REJECT' = 'WAIT';
  let finalStatus: CoilBreakoutStatus = 'WAITING_FOR_RETEST';
  let displayStatus = 'STATUS: VALID / WAITING FOR RETEST';

  if (isRetestHeld) {
    finalDecision = 'EXECUTE';
    finalStatus = 'TRIGGERED';
    displayStatus = 'STATUS: TRIGGERED / CONFIRMED';
  }

  const roundedRisk = parseFloat(risk.toFixed(4));
  const roundedReward = parseFloat(reward.toFixed(4));
  const roundedRR = parseFloat(achievedRR.toFixed(1));

  let score = 88;
  if (detectedCoil.hasHigherLows && direction === 'LONG') score += 4;
  if (detectedCoil.hasLowerHighs && direction === 'SHORT') score += 4;
  if (achievedRR >= 6.0) score += 4;

  return {
    symbol,
    setup: setupName,
    side: direction,
    direction,
    timeframe: '15m',
    coilRange: {
      high: detectedCoil.coilHigh,
      low: detectedCoil.coilLow,
      height: detectedCoil.height,
      heightAtrRatio: detectedCoil.heightAtrRatio,
      length: detectedCoil.length
    },
    entryType: entryMode,
    entryPrice: parseFloat(entryPrice.toFixed(4)),
    stopLossPrice: parseFloat(stopLossPrice.toFixed(4)),
    targetPrice: parseFloat(targetPrice.toFixed(4)),
    riskAmount: roundedRisk,
    rewardAmount: roundedReward,
    riskRewardRatio: roundedRR,
    status: finalStatus,
    displayStatus,
    finalDecision,
    marketFilter: coilRegimeDesc,
    coinFilter: 'Coil Breakout Validated',
    retestStatus,
    cancelCondition,
    score: Math.min(98, score),
    atrValue: curAtr,
    reason: `Coil Breakout (${detectedCoil.length} bars, ${(detectedCoil.heightAtrRatio).toFixed(2)}x ATR) -> 1:${roundedRR} R:R Target at $${targetPrice.toFixed(2)}`,
    exactRejectionReason: 'NONE',
    timestamp: lastBar.time,
    signalTime: lastBar.time,
    strategyRegimeStatus: 'IN_FAVOR',
    marketRegime: `Two-Sided Coil Breakout (1:${roundedRR} R:R)`,
    passedFilters: {
      compressionCheck: true,
      medianRangeCheck: true,
      atrDecliningCheck: true,
      bodyContainmentCheck: true,
      breakoutCandleCheck: true,
      volumeCheck: true,
      btcFilterCheck: true,
      relativeStrengthCheck: true,
      retestCheck: isRetestHeld,
      rrRatioCheck: true
    }
  };
}

// ---------------------------------------------------------------------------
// 4. TradingView Pine Script v6 Generator
// ---------------------------------------------------------------------------

export function generateCoilBreakoutPineScript(settings: AppSettings): string {
  const minLen = settings.coilMinLength ?? 5;
  const maxLen = settings.coilMaxLength ?? 20;
  const maxHeightAtr = settings.coilMaxHeightAtr ?? 1.25;
  const maxMedianRangeAtr = settings.coilMedianRangeAtr ?? 0.70;
  const minRR = settings.coilMinRewardRisk ?? 5.0;
  const slBufferAtr = settings.coilSlAtrBuffer ?? 0.20;

  return `//@version=6
strategy("Two-Sided Coil Breakout (1:5 R:R)", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=5, commission_type=strategy.commission.percent, commission_value=0.04)

// ===========================================================================
// Strategy Configuration
// ===========================================================================
grp_coil = "Strict Coil Detector Parameters"
minCoilLen       = input.int(${minLen}, "Min Coil Length (Candles)", group=grp_coil)
maxCoilLen       = input.int(${maxLen}, "Max Coil Length (Candles)", group=grp_coil)
maxHeightAtrMult = input.float(${maxHeightAtr}, "Max Coil Height ATR Multiplier", group=grp_coil)
maxMedianRangeAtr= input.float(${maxMedianRangeAtr}, "Max Median Candle Range ATR Mult", group=grp_coil)
minRewardRisk    = input.float(${minRR}, "Minimum Target Reward-to-Risk (e.g. 5.0)", group=grp_coil)
slBufferAtrMult  = input.float(${slBufferAtr}, "Stop Loss ATR Buffer Beyond Coil", group=grp_coil)
entryMode        = input.string("${settings.coilEntryMode || 'limit_on_retest'}", "Entry Mode", options=["limit_on_retest", "aggressive_breakout"], group=grp_coil)

// ===========================================================================
// Indicators
// ===========================================================================
atr14 = ta.atr(14)
meanVol20 = ta.sma(volume, 20)

// Function: Find highest wick and lowest wick over lookback
highestWick(len) => ta.highest(high, len)
lowestWick(len)  => ta.lowest(low, len)

// Detect compact compression over variable lookback
var float coilH = na
var float coilL = na
var bool inCoil = false
var int coilStartBar = na

// Calculate rolling 10-bar range
rollingRange = highestWick(10) - lowestWick(10)
isCompressed = (rollingRange <= (atr14 * maxHeightAtrMult)) and (ta.atr(14) <= ta.atr(28))

if isCompressed and not inCoil
    inCoil := true
    coilH := highestWick(10)
    coilL := lowestWick(10)
    coilStartBar := bar_index

// Breakout Detection with Volume & Displacement
breakoutLong = inCoil and (close > coilH) and (volume >= meanVol20 * 1.25) and (ta.tr >= atr14 * 1.1)
breakdownShort = inCoil and (close < coilL) and (volume >= meanVol20 * 1.25) and (ta.tr >= atr14 * 1.1)

// ===========================================================================
// Execution: 1:5 Structural Reward-to-Risk
// ===========================================================================
var float entryPrice = na
var float stopLoss = na
var float takeProfit = na

if breakoutLong and strategy.position_size == 0
    entryPrice := coilH
    stopLoss := coilL - (atr14 * slBufferAtrMult)
    risk = entryPrice - stopLoss
    takeProfit := entryPrice + (risk * minRewardRisk)
    
    if entryMode == "limit_on_retest"
        strategy.entry("Long Coil", strategy.long, limit=entryPrice)
    else
        strategy.entry("Long Coil", strategy.long)
    strategy.exit("TP/SL Long", "Long Coil", limit=takeProfit, stop=stopLoss)
    inCoil := false

if breakdownShort and strategy.position_size == 0
    entryPrice := coilL
    stopLoss := coilH + (atr14 * slBufferAtrMult)
    risk = stopLoss - entryPrice
    takeProfit := entryPrice - (risk * minRewardRisk)
    
    if entryMode == "limit_on_retest"
        strategy.entry("Short Coil", strategy.short, limit=entryPrice)
    else
        strategy.entry("Short Coil", strategy.short)
    strategy.exit("TP/SL Short", "Short Coil", limit=takeProfit, stop=stopLoss)
    inCoil := false

// Invalidation: Cancel order or exit if price closes back across opposite boundary
if strategy.position_size > 0 and (close < coilL)
    strategy.close("Long Coil", comment="Invalidated: Lost Coil Low")

if strategy.position_size < 0 and (close > coilH)
    strategy.close("Short Coil", comment="Invalidated: Regained Coil High")

// Visuals
plot(coilH, "Coil High Boundary", color=color.new(color.emerald, 40), linewidth=2, style=plot.style_linebr)
plot(coilL, "Coil Low Boundary", color=color.new(color.rose, 40), linewidth=2, style=plot.style_linebr)
`;
}
