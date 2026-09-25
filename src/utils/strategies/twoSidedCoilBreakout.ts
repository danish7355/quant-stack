/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, Timeframe } from '../../types';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface CoilDetectionResult {
  isCoil: boolean;
  coilStartIndex: number;
  coilEndIndex: number;
  coilLength: number; // 5 to 20 candles
  coilHigh: number;   // highest wick
  coilLow: number;    // lowest wick
  coilHeight: number; // coilHigh - coilLow
  medianCandleRange: number;
  medianCandleBody: number;
  meanCoilVolume: number;
  atrAtCoil: number;
  atrRatio: number;   // coilHeight / atr
  isAtrDecliningOrFlat: boolean;
  bodiesInsideRatio: number; // >= 0.70
  structureValid: boolean;   // no bar > 1.5 ATR
  higherLowsPreference: boolean;
  lowerHighsPreference: boolean;
  rejectionReason?: string;
}

export interface BreakoutQualityResult {
  isBreakout: boolean;
  direction: 'LONG' | 'SHORT' | null;
  breakoutCandle: Candle;
  breakoutIndex: number;
  bodyRatio: number;
  rangeRatio: number;
  volumeRatio: number;
  isValidQuality: boolean;
  rejectionReason?: string;
}

export interface RetestResult {
  hasRetest: boolean;
  retestHeld: boolean;
  retestLow?: number;
  retestHigh?: number;
  retestPrice?: number;
  isInvalidated: boolean;
  status: 'PENDING_RETEST' | 'RETEST_HELD' | 'INVALIDATED';
  details: string;
}

export interface TwoSidedCoilSignal {
  symbol: string;
  setup: 'Coil breakout' | 'Coil breakdown';
  side: 'LONG' | 'SHORT';
  timeframe: string;
  coilRange: {
    high: number;
    low: number;
    height: number;
  };
  entry: number;
  stop: number;
  target: number;
  risk: number;
  reward: number;
  rrRatio: number;
  marketFilter: string;
  coinFilter: string;
  status: 'VALID / WAITING FOR RETEST' | 'VALID / BREAKOUT CONFIRMED' | 'WATCHLIST — coil detected; no confirmed breakout' | string;
  rejectionReason?: string;
  formattedOutput: string;
  score: number;
  coil: CoilDetectionResult;
}

export interface CoilStrategyOptions {
  symbol?: string;
  timeframe?: string;
  minCoilLength?: number;
  maxCoilLength?: number;
  maxCoilHeightAtrMult?: number;
  maxMedianRangeAtrMult?: number;
  minBodiesInsideRatio?: number;
  atrPeriod?: number;
  minRrRatio?: number; // Default 5.0 (1:5)
  atrBufferMult?: number; // Buffer below coil low / above coil high
  aggressiveBreakoutMode?: boolean; // If true, enter on breakout close without waiting for retest
  btcTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  btcReturn?: number;
}

/**
 * Calculates Wilder's Smoothing Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (!candles || candles.length === 0) return [];
  if (candles.length < period) return candles.map(c => c.high - c.low);

  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[0].high - candles[0].low);
    } else {
      const h = candles[i].high;
      const l = candles[i].low;
      const pc = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
  }

  const atr: number[] = new Array(period - 1).fill(tr[0]);
  const initialAtr = tr.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  atr.push(initialAtr);

  for (let i = period; i < tr.length; i++) {
    const prevAtr = atr[atr.length - 1];
    const currentAtr = (prevAtr * (period - 1) + tr[i]) / period;
    atr.push(currentAtr);
  }

  return atr;
}

/**
 * Utility: Compute median of number array
 */
export function calculateMedian(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Strict Coil Detector
 * Identifies compact consolidation where price volatility contracts before expansion.
 */
export function detectStrictCoil(
  candles: Candle[],
  endIndex: number,
  atrSeries: number[],
  options: CoilStrategyOptions = {}
): CoilDetectionResult | null {
  const minLen = options.minCoilLength ?? 5;
  const maxLen = options.maxCoilLength ?? 20;
  const maxCoilHeightAtrMult = options.maxCoilHeightAtrMult ?? 1.25;
  const maxMedianRangeAtrMult = options.maxMedianRangeAtrMult ?? 0.70;
  const minBodiesInsideRatio = options.minBodiesInsideRatio ?? 0.70;

  if (endIndex < minLen || endIndex >= candles.length) return null;

  let bestCoil: CoilDetectionResult | null = null;

  // Search candidate coil lengths from minLen up to maxLen
  for (let len = minLen; len <= maxLen; len++) {
    const startIndex = endIndex - len + 1;
    if (startIndex < 0) break;

    const slice = candles.slice(startIndex, endIndex + 1);
    const coilHigh = Math.max(...slice.map(c => c.high));
    const coilLow = Math.min(...slice.map(c => c.low));
    const coilHeight = coilHigh - coilLow;

    const currentAtr = atrSeries[endIndex] || (coilHigh - coilLow) || 1;
    const startAtr = atrSeries[startIndex] || currentAtr;

    // 1. Compression Height Check: Coil height <= 1.25 * ATR(14)
    const atrRatio = currentAtr > 0 ? coilHeight / currentAtr : 999;
    if (atrRatio > maxCoilHeightAtrMult) {
      continue;
    }

    // 2. Median candle range within coil < 0.70 * ATR(14)
    const candleRanges = slice.map(c => c.high - c.low);
    const medianRange = calculateMedian(candleRanges);
    if (medianRange >= maxMedianRangeAtrMult * currentAtr) {
      continue;
    }

    // 3. ATR declining or flat over the coil: ATR_end <= ATR_start * 1.05
    const isAtrDecliningOrFlat = currentAtr <= startAtr * 1.05;
    if (!isAtrDecliningOrFlat) {
      continue;
    }

    // 4. At least 70% of candle bodies remain inside coil boundaries
    let bodiesInsideCount = 0;
    for (const c of slice) {
      const bodyTop = Math.max(c.open, c.close);
      const bodyBottom = Math.min(c.open, c.close);
      if (bodyTop <= coilHigh + 0.000001 && bodyBottom >= coilLow - 0.000001) {
        bodiesInsideCount++;
      }
    }
    const bodiesInsideRatio = bodiesInsideCount / slice.length;
    if (bodiesInsideRatio < minBodiesInsideRatio) {
      continue;
    }

    // 5. Structure: No unusually large opposite breakout candle inside coil (no bar > 1.5 * ATR)
    const maxBarRange = Math.max(...candleRanges);
    const structureValid = maxBarRange <= 1.5 * currentAtr;
    if (!structureValid) {
      continue;
    }

    // Calculate metrics
    const candleBodies = slice.map(c => Math.abs(c.close - c.open));
    const medianBody = calculateMedian(candleBodies);
    const meanVolume = slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;

    // Directional preferences (higher lows for bullish, lower highs for bearish)
    let higherLowsCount = 0;
    let lowerHighsCount = 0;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i].low >= slice[i - 1].low) higherLowsCount++;
      if (slice[i].high <= slice[i - 1].high) lowerHighsCount++;
    }
    const higherLowsPreference = higherLowsCount >= slice.length * 0.5;
    const lowerHighsPreference = lowerHighsCount >= slice.length * 0.5;

    const candidateCoil: CoilDetectionResult = {
      isCoil: true,
      coilStartIndex: startIndex,
      coilEndIndex: endIndex,
      coilLength: len,
      coilHigh,
      coilLow,
      coilHeight,
      medianCandleRange: medianRange,
      medianCandleBody: medianBody,
      meanCoilVolume: meanVolume,
      atrAtCoil: currentAtr,
      atrRatio,
      isAtrDecliningOrFlat,
      bodiesInsideRatio,
      structureValid,
      higherLowsPreference,
      lowerHighsPreference
    };

    // Prefer the most compressed coil (lowest atrRatio)
    if (!bestCoil || candidateCoil.atrRatio < bestCoil.atrRatio) {
      bestCoil = candidateCoil;
    }
  }

  return bestCoil;
}

/**
 * Breakout Quality Evaluator
 * Verifies strong close outside coil boundaries with body, range, and volume expansion.
 */
export function evaluateBreakoutQuality(
  candle: Candle,
  candleIndex: number,
  coil: CoilDetectionResult
): BreakoutQualityResult {
  const isAbove = candle.close > coil.coilHigh;
  const isBelow = candle.close < coil.coilLow;

  if (!isAbove && !isBelow) {
    return {
      isBreakout: false,
      direction: null,
      breakoutCandle: candle,
      breakoutIndex: candleIndex,
      bodyRatio: 0,
      rangeRatio: 0,
      volumeRatio: 0,
      isValidQuality: false,
      rejectionReason: 'Candle closed inside coil boundaries'
    };
  }

  const direction: 'LONG' | 'SHORT' = isAbove ? 'LONG' : 'SHORT';
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;

  const bodyRatio = coil.medianCandleBody > 0 ? body / coil.medianCandleBody : 1.5;
  const rangeRatio = coil.medianCandleRange > 0 ? range / coil.medianCandleRange : 1.5;
  const volumeRatio = coil.meanCoilVolume > 0 ? candle.volume / coil.meanCoilVolume : 1.5;

  // Criteria:
  // Breakout body >= 1.2 * median coil candle body
  // Breakout range >= 1.25 * median coil candle range
  // Volume >= 1.25 * mean coil volume
  const bodyValid = bodyRatio >= 1.20;
  const rangeValid = rangeRatio >= 1.25;
  const volumeValid = volumeRatio >= 1.25;

  const isValidQuality = bodyValid && rangeValid && volumeValid;

  let rejectionReason: string | undefined;
  if (!isValidQuality) {
    const reasons: string[] = [];
    if (!bodyValid) reasons.push(`body expansion insufficient (${bodyRatio.toFixed(2)}x < 1.2x)`);
    if (!rangeValid) reasons.push(`range expansion insufficient (${rangeRatio.toFixed(2)}x < 1.25x)`);
    if (!volumeValid) reasons.push(`volume expansion insufficient (${volumeRatio.toFixed(2)}x < 1.25x)`);
    rejectionReason = reasons.join(', ');
  }

  return {
    isBreakout: true,
    direction,
    breakoutCandle: candle,
    breakoutIndex: candleIndex,
    bodyRatio,
    rangeRatio,
    volumeRatio,
    isValidQuality,
    rejectionReason
  };
}

/**
 * Retest Evaluator
 * Verifies that retest holds at coil boundary without losing the opposite boundary.
 */
export function evaluateRetest(
  candles: Candle[],
  breakoutIndex: number,
  coil: CoilDetectionResult,
  direction: 'LONG' | 'SHORT',
  atr: number
): RetestResult {
  // If no subsequent candles, retest is pending
  if (breakoutIndex >= candles.length - 1) {
    return {
      hasRetest: false,
      retestHeld: false,
      isInvalidated: false,
      status: 'PENDING_RETEST',
      details: 'Breakout candle closed; waiting for retest of coil boundary'
    };
  }

  const postBreakoutCandles = candles.slice(breakoutIndex + 1);
  const atrBuffer = 0.25 * atr;

  if (direction === 'LONG') {
    let retestTouched = false;
    let minLow = Infinity;

    for (let i = 0; i < postBreakoutCandles.length; i++) {
      const c = postBreakoutCandles[i];
      minLow = Math.min(minLow, c.low);

      // Invalidation check: Price closes back inside and loses coil low
      if (c.close < coil.coilLow) {
        return {
          hasRetest: true,
          retestHeld: false,
          isInvalidated: true,
          status: 'INVALIDATED',
          details: 'Price closed back inside coil and lost coil low'
        };
      }

      // Retest touch: low pulls back to near coil high
      if (c.low <= coil.coilHigh + atrBuffer && c.low >= coil.coilLow) {
        retestTouched = true;
        // Retest must hold above coil high and print bullish rejection (close > coilHigh)
        if (c.close > coil.coilHigh) {
          return {
            hasRetest: true,
            retestHeld: true,
            retestLow: minLow,
            retestPrice: c.close,
            isInvalidated: false,
            status: 'RETEST_HELD',
            details: 'Retest held above coil high with bullish rejection'
          };
        }
      }
    }

    if (retestTouched) {
      return {
        hasRetest: true,
        retestHeld: false,
        retestLow: minLow,
        isInvalidated: false,
        status: 'PENDING_RETEST',
        details: 'Retest in progress near coil high; awaiting bullish confirmation'
      };
    }

    return {
      hasRetest: false,
      retestHeld: false,
      isInvalidated: false,
      status: 'PENDING_RETEST',
      details: 'Extended breakout; retest pending'
    };
  } else {
    // SHORT direction
    let retestTouched = false;
    let maxHigh = -Infinity;

    for (let i = 0; i < postBreakoutCandles.length; i++) {
      const c = postBreakoutCandles[i];
      maxHigh = Math.max(maxHigh, c.high);

      // Invalidation check: Price closes back inside and regains coil high
      if (c.close > coil.coilHigh) {
        return {
          hasRetest: true,
          retestHeld: false,
          isInvalidated: true,
          status: 'INVALIDATED',
          details: 'Price closed back inside coil and regained coil high'
        };
      }

      // Retest touch: high pulls back to near coil low
      if (c.high >= coil.coilLow - atrBuffer && c.high <= coil.coilHigh) {
        retestTouched = true;
        // Retest must reject below coil low and print bearish rejection (close < coilLow)
        if (c.close < coil.coilLow) {
          return {
            hasRetest: true,
            retestHeld: true,
            retestHigh: maxHigh,
            retestPrice: c.close,
            isInvalidated: false,
            status: 'RETEST_HELD',
            details: 'Retest rejected below coil low with bearish continuation'
          };
        }
      }
    }

    if (retestTouched) {
      return {
        hasRetest: true,
        retestHeld: false,
        retestHigh: maxHigh,
        isInvalidated: false,
        status: 'PENDING_RETEST',
        details: 'Retest in progress near coil low; awaiting bearish confirmation'
      };
    }

    return {
      hasRetest: false,
      retestHeld: false,
      isInvalidated: false,
      status: 'PENDING_RETEST',
      details: 'Extended breakdown; retest pending'
    };
  }
}

/**
 * Structural Target Finder
 * Scans prior market structure (historical swing highs / lows) strictly preceding the coil
 * to identify authentic buy-side liquidity / resistance (LONG) or sell-side liquidity / support (SHORT).
 */
export function findStructuralTarget(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  entry: number,
  coilStartIndex: number,
  lookback: number = 80
): number | null {
  const historyStart = Math.max(0, coilStartIndex - lookback);
  const priorCandles = candles.slice(historyStart, coilStartIndex);
  if (priorCandles.length < 5) return null;

  if (direction === 'LONG') {
    // Look for swing highs above entry
    const swingHighs: number[] = [];
    for (let i = 2; i < priorCandles.length - 2; i++) {
      const c = priorCandles[i];
      if (
        c.high > priorCandles[i - 1].high &&
        c.high > priorCandles[i - 2].high &&
        c.high > priorCandles[i + 1].high &&
        c.high > priorCandles[i + 2].high &&
        c.high > entry
      ) {
        swingHighs.push(c.high);
      }
    }

    // Also include overall prior high if above entry
    const maxPriorHigh = Math.max(...priorCandles.map(c => c.high));
    if (maxPriorHigh > entry && !swingHighs.includes(maxPriorHigh)) {
      swingHighs.push(maxPriorHigh);
    }

    if (swingHighs.length === 0) return null;
    // Return closest structural resistance level above entry
    swingHighs.sort((a, b) => a - b);
    return swingHighs[0];
  } else {
    // SHORT: Look for swing lows below entry
    const swingLows: number[] = [];
    for (let i = 2; i < priorCandles.length - 2; i++) {
      const c = priorCandles[i];
      if (
        c.low < priorCandles[i - 1].low &&
        c.low < priorCandles[i - 2].low &&
        c.low < priorCandles[i + 1].low &&
        c.low < priorCandles[i + 2].low &&
        c.low < entry
      ) {
        swingLows.push(c.low);
      }
    }

    const minPriorLow = Math.min(...priorCandles.map(c => c.low));
    if (minPriorLow < entry && !swingLows.includes(minPriorLow)) {
      swingLows.push(minPriorLow);
    }

    if (swingLows.length === 0) return null;
    // Return closest structural support level below entry
    swingLows.sort((a, b) => b - a);
    return swingLows[0];
  }
}

/**
 * Format exact human-readable signal output matching user's template
 */
export function formatCoilSignalOutput(params: {
  symbol: string;
  setup: 'Coil breakout' | 'Coil breakdown' | string;
  side: 'LONG' | 'SHORT';
  timeframe: string;
  coilRange: { high: number; low: number };
  entry: number;
  stop: number;
  target: number;
  risk: number;
  reward: number;
  rrRatio: number;
  marketFilter: string;
  coinFilter: string;
  status: string;
}): string {
  const rrDisplay = params.rrRatio >= 1 ? `1:${params.rrRatio.toFixed(1).replace(/\.0$/, '')}` : `${params.rrRatio.toFixed(2)}:1`;
  const coilLowStr = params.coilRange.low.toFixed(params.coilRange.low < 1 ? 5 : 2);
  const coilHighStr = params.coilRange.high.toFixed(params.coilRange.high < 1 ? 5 : 2);
  return [
    `Signal: ${params.symbol}`,
    `Setup: ${params.setup}`,
    `Timeframe: ${params.timeframe}`,
    `Coil: ${coilLowStr} - ${coilHighStr}`,
    `Entry: ${params.entry.toFixed(params.entry < 1 ? 5 : 2)}`,
    `Stop: ${params.stop.toFixed(params.stop < 1 ? 5 : 2)}`,
    `Target: ${params.target.toFixed(params.target < 1 ? 5 : 2)}`,
    `Risk: ${params.risk.toFixed(params.risk < 1 ? 5 : 2)}`,
    `Reward: ${params.reward.toFixed(params.reward < 1 ? 5 : 2)}`,
    `R:R: ${rrDisplay}`,
    `Market filter: ${params.marketFilter}`,
    `Coin filter: ${params.coinFilter}`,
    `Status: ${params.status}`
  ].join('\n');
}


/**
 * Master Two-Sided Coil Breakout Strategy Engine
 * Direction-neutral: evaluates coil first, then checks long and short breakout triggers.
 * Trade generates ONLY when structure, breakout confirmation, and 1:5 (5R) structural target qualify.
 */
export function evaluateTwoSidedCoilBreakout(
  candles: Candle[],
  btcCandles: Candle[] = [],
  options: CoilStrategyOptions = {}
): TwoSidedCoilSignal | null {
  const symbol = options.symbol || 'UNKNOWN';
  const tf = options.timeframe || '15m';
  const minRr = options.minRrRatio ?? 5.0; // Net 1:5 reward-to-risk required

  if (!candles || candles.length < 30) {
    return null;
  }

  const atrSeries = calculateATR(candles, options.atrPeriod ?? 14);
  const currentCandle = candles[candles.length - 1];
  const lastIndex = candles.length - 1;

  // 1. Detect candidate coil in preceding candles (ending at last candle or up to 5 candles back)
  let bestCoil: CoilDetectionResult | null = null;
  let breakoutCandleIdx = -1;

  // Search candidate coil endings from most recent backwards
  for (let offset = 0; offset <= 5; offset++) {
    const candidateEndIdx = lastIndex - offset - 1;
    if (candidateEndIdx < 5) continue;

    const detected = detectStrictCoil(candles, candidateEndIdx, atrSeries, options);
    if (detected) {
      // Find if any subsequent candle broke out
      for (let bIdx = candidateEndIdx + 1; bIdx <= lastIndex; bIdx++) {
        const c = candles[bIdx];
        if (c.close > detected.coilHigh || c.close < detected.coilLow) {
          bestCoil = detected;
          breakoutCandleIdx = bIdx;
          break;
        }
      }
      if (bestCoil) break;
    }
  }

  // If no broken coil found, check if a coil is currently forming (watchlist)
  if (!bestCoil) {
    const formingCoil = detectStrictCoil(candles, lastIndex, atrSeries, options);
    if (formingCoil) {
      const output = [
        `Signal: ${symbol}`,
        `Setup: Coil breakout`,
        `Timeframe: ${tf}`,
        `Coil: ${formingCoil.coilLow.toFixed(formingCoil.coilLow < 1 ? 5 : 2)} - ${formingCoil.coilHigh.toFixed(formingCoil.coilHigh < 1 ? 5 : 2)}`,
        `Status: WATCHLIST — coil detected; no confirmed breakout.`
      ].join('\n');

      return {
        symbol,
        setup: 'Coil breakout',
        side: 'LONG',
        timeframe: tf,
        coilRange: { high: formingCoil.coilHigh, low: formingCoil.coilLow, height: formingCoil.coilHeight },
        entry: formingCoil.coilHigh,
        stop: formingCoil.coilLow,
        target: formingCoil.coilHigh + formingCoil.coilHeight * 5,
        risk: formingCoil.coilHeight,
        reward: formingCoil.coilHeight * 5,
        rrRatio: 5,
        marketFilter: 'BTC Neutral',
        coinFilter: 'Evaluating',
        status: 'WATCHLIST — coil detected; no confirmed breakout.',
        formattedOutput: output,
        score: 68,
        coil: formingCoil
      };
    }
    return null;
  }

  // 2. Evaluate breakout from coil
  const breakoutCandle = candles[breakoutCandleIdx];
  const breakout = evaluateBreakoutQuality(breakoutCandle, breakoutCandleIdx, bestCoil);

  if (!breakout.isBreakout || !breakout.direction) {
    // Current candle still within coil range
    const output = [
      `Signal: ${symbol}`,
      `Setup: Coil breakout`,
      `Timeframe: ${tf}`,
      `Coil: ${bestCoil.coilLow.toFixed(bestCoil.coilLow < 1 ? 5 : 2)} - ${bestCoil.coilHigh.toFixed(bestCoil.coilHigh < 1 ? 5 : 2)}`,
      `Status: WATCHLIST — coil detected; no confirmed breakout.`
    ].join('\n');

    return {
      symbol,
      setup: 'Coil breakout',
      side: 'LONG',
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: bestCoil.coilHigh,
      stop: bestCoil.coilLow,
      target: bestCoil.coilHigh + bestCoil.coilHeight * 5,
      risk: bestCoil.coilHeight,
      reward: bestCoil.coilHeight * 5,
      rrRatio: 5,
      marketFilter: 'BTC Neutral',
      coinFilter: 'Evaluating',
      status: 'WATCHLIST — coil detected; no confirmed breakout.',
      formattedOutput: output,
      score: 70,
      coil: bestCoil
    };
  }


  const direction = breakout.direction;
  const setupName: 'Coil breakout' | 'Coil breakdown' = direction === 'LONG' ? 'Coil breakout' : 'Coil breakdown';

  // 3. Breakout Quality Filter
  if (!breakout.isValidQuality) {
    const statusStr = `STATUS: REJECTED — breakout lacks quality (${breakout.rejectionReason})`;
    const output = [
      `SYMBOL: ${symbol}`,
      `SETUP: ${setupName}`,
      `SIDE: ${direction}`,
      `TIMEFRAME: ${tf}`,
      `COIL RANGE: ${bestCoil.coilLow.toFixed(2)}–${bestCoil.coilHigh.toFixed(2)}`,
      statusStr
    ].join('\n');

    return {
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: breakoutCandle.close,
      stop: direction === 'LONG' ? bestCoil.coilLow : bestCoil.coilHigh,
      target: 0,
      risk: 0,
      reward: 0,
      rrRatio: 0,
      marketFilter: 'N/A',
      coinFilter: 'N/A',
      status: statusStr,
      rejectionReason: breakout.rejectionReason,
      formattedOutput: output,
      score: 30,
      coil: bestCoil
    };
  }

  // 4. Retest vs Aggressive Breakout Evaluation
  const atrBufferMult = options.atrBufferMult ?? 0.15;
  const currentAtr = bestCoil.atrAtCoil;
  const retest = evaluateRetest(candles, breakoutCandleIdx, bestCoil, direction, currentAtr);

  if (retest.isInvalidated) {
    const statusStr = `STATUS: REJECTED — breakout invalidated (${retest.details})`;
    return {
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: breakoutCandle.close,
      stop: direction === 'LONG' ? bestCoil.coilLow : bestCoil.coilHigh,
      target: 0,
      risk: 0,
      reward: 0,
      rrRatio: 0,
      marketFilter: 'N/A',
      coinFilter: 'N/A',
      status: statusStr,
      rejectionReason: retest.details,
      formattedOutput: statusStr,
      score: 25,
      coil: bestCoil
    };
  }

  const isAggressiveMode = options.aggressiveBreakoutMode === true;
  let entryPrice = breakoutCandle.close;
  let stopPrice = 0;
  let retestHeld = retest.retestHeld;

  if (direction === 'LONG') {
    const anchorLow = retest.retestLow !== undefined && retest.retestLow < Infinity ? retest.retestLow : bestCoil.coilLow;
    stopPrice = Math.min(anchorLow, bestCoil.coilLow) - (atrBufferMult * currentAtr);
    if (retest.retestPrice) entryPrice = retest.retestPrice;
  } else {
    const anchorHigh = retest.retestHigh !== undefined && retest.retestHigh > -Infinity ? retest.retestHigh : bestCoil.coilHigh;
    stopPrice = Math.max(anchorHigh, bestCoil.coilHigh) + (atrBufferMult * currentAtr);
    if (retest.retestPrice) entryPrice = retest.retestPrice;
  }

  const risk = Math.abs(entryPrice - stopPrice);
  if (risk <= 0 || isNaN(risk)) {
    return null;
  }

  // 5. BTC Market Filter Check
  // Long: BTC must be neutral-to-bullish
  // Short: BTC must be neutral-to-bearish
  let btcMarketFilter = 'BTC neutral-bullish';
  let btcFilterPassed = true;

  if (btcCandles && btcCandles.length >= 20) {
    const btcCloses = btcCandles.map(c => c.close);
    const btcLast = btcCloses[btcCloses.length - 1];
    const btcLookback = btcCloses[Math.max(0, btcCloses.length - 20)];
    const btcReturn = (btcLast - btcLookback) / btcLookback;

    if (direction === 'LONG') {
      if (btcReturn < -0.015) { // Down > 1.5%
        btcFilterPassed = false;
        btcMarketFilter = 'BTC strongly bearish (BLOCKED)';
      } else if (btcReturn >= 0) {
        btcMarketFilter = 'BTC bullish confirmed';
      } else {
        btcMarketFilter = 'BTC neutral-bullish';
      }
    } else {
      if (btcReturn > 0.015) { // Up > 1.5%
        btcFilterPassed = false;
        btcMarketFilter = 'BTC strongly bullish (BLOCKED)';
      } else if (btcReturn <= 0) {
        btcMarketFilter = 'BTC bearish confirmed';
      } else {
        btcMarketFilter = 'BTC neutral-bearish';
      }
    }
  }

  if (!btcFilterPassed) {
    const statusStr = `STATUS: REJECTED — market filter conflict (${btcMarketFilter})`;
    return {
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: entryPrice,
      stop: stopPrice,
      target: 0,
      risk,
      reward: 0,
      rrRatio: 0,
      marketFilter: btcMarketFilter,
      coinFilter: 'Evaluating',
      status: statusStr,
      rejectionReason: `BTC regime conflict: ${btcMarketFilter}`,
      formattedOutput: statusStr,
      score: 35,
      coil: bestCoil
    };
  }

  // 6. Coin Filter: Relative Strength vs BTC over lookback
  let coinFilter = 'Relative strength confirmed';
  let coinFilterPassed = true;

  if (btcCandles && btcCandles.length >= 20 && candles.length >= 20) {
    const coinCloses = candles.map(c => c.close);
    const coinReturn = (coinCloses[coinCloses.length - 1] - coinCloses[coinCloses.length - 20]) / coinCloses[coinCloses.length - 20];
    const btcCloses = btcCandles.map(c => c.close);
    const btcReturn = (btcCloses[btcCloses.length - 1] - btcCloses[btcCloses.length - 20]) / btcCloses[btcCloses.length - 20];

    if (direction === 'LONG') {
      if (coinReturn < btcReturn - 0.01) {
        coinFilterPassed = false;
        coinFilter = `Relative weakness vs BTC (${(coinReturn * 100).toFixed(1)}% vs ${(btcReturn * 100).toFixed(1)}%)`;
      } else {
        coinFilter = 'Relative strength confirmed';
      }
    } else {
      if (coinReturn > btcReturn + 0.01) {
        coinFilterPassed = false;
        coinFilter = `Relative strength vs BTC (${(coinReturn * 100).toFixed(1)}% vs ${(btcReturn * 100).toFixed(1)}%)`;
      } else {
        coinFilter = 'Relative weakness confirmed';
      }
    }
  }

  if (!coinFilterPassed) {
    const statusStr = `STATUS: REJECTED — coin relative strength filter (${coinFilter})`;
    return {
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: entryPrice,
      stop: stopPrice,
      target: 0,
      risk,
      reward: 0,
      rrRatio: 0,
      marketFilter: btcMarketFilter,
      coinFilter,
      status: statusStr,
      rejectionReason: coinFilter,
      formattedOutput: statusStr,
      score: 40,
      coil: bestCoil
    };
  }

  // 7. Structural Target & 1:5 Reward-to-Risk (5R) Enforcement
  // Find authentic prior structural support/resistance preceding the coil
  const structuralTarget = findStructuralTarget(candles, direction, entryPrice, bestCoil.coilStartIndex);

  // If no structural target found or target distance is less than 5R, check if market structure permits 5R
  let targetPrice = structuralTarget;
  let reward = targetPrice !== null ? Math.abs(targetPrice - entryPrice) : 0;
  let rrRatio = risk > 0 ? reward / risk : 0;

  // Strict Rule: Target must be based on actual market structure first.
  // If the next meaningful liquidity does not provide at least 1:5 (5R), output:
  // "NO TRADE — target does not provide a realistic 1:5 reward-to-risk."
  if (!structuralTarget || rrRatio < minRr) {
    const statusStr = `STATUS: REJECTED — NO TRADE: target does not provide a realistic 1:${minRr} reward-to-risk. (Structural R:R: 1:${rrRatio.toFixed(1)})`;
    const formatted = formatCoilSignalOutput({
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow },
      entry: entryPrice,
      stop: stopPrice,
      target: targetPrice || (direction === 'LONG' ? entryPrice + risk * minRr : entryPrice - risk * minRr),
      risk,
      reward,
      rrRatio,
      marketFilter: btcMarketFilter,
      coinFilter,
      status: `REJECTED — target does not provide realistic 1:${minRr} R:R`
    });

    return {
      symbol,
      setup: setupName,
      side: direction,
      timeframe: tf,
      coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
      entry: entryPrice,
      stop: stopPrice,
      target: targetPrice || 0,
      risk,
      reward,
      rrRatio,
      marketFilter: btcMarketFilter,
      coinFilter,
      status: statusStr,
      rejectionReason: `Target does not provide a realistic 1:${minRr} reward-to-risk (Structural RR: 1:${rrRatio.toFixed(1)})`,
      formattedOutput: formatted,
      score: 45,
      coil: bestCoil
    };
  }

  // 8. Determine final Valid status based on entry mode (retest held vs waiting for retest vs aggressive)
  let statusStr = 'VALID / WAITING FOR RETEST';
  let score = 88;

  if (retestHeld) {
    statusStr = 'VALID / RETEST HELD';
    score = 98;
  } else if (isAggressiveMode) {
    statusStr = 'VALID / BREAKOUT CONFIRMED';
    score = 94;
  } else {
    statusStr = 'VALID / WAITING FOR RETEST';
    score = 88;
  }

  const formattedOutput = formatCoilSignalOutput({
    symbol,
    setup: setupName,
    side: direction,
    timeframe: tf,
    coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow },
    entry: entryPrice,
    stop: stopPrice,
    target: targetPrice,
    risk,
    reward,
    rrRatio,
    marketFilter: btcMarketFilter,
    coinFilter,
    status: statusStr
  });

  return {
    symbol,
    setup: setupName,
    side: direction,
    timeframe: tf,
    coilRange: { high: bestCoil.coilHigh, low: bestCoil.coilLow, height: bestCoil.coilHeight },
    entry: entryPrice,
    stop: stopPrice,
    target: targetPrice,
    risk,
    reward,
    rrRatio,
    marketFilter: btcMarketFilter,
    coinFilter,
    status: statusStr,
    formattedOutput,
    score,
    coil: bestCoil
  };
}
