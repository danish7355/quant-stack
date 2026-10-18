/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Liquidity Sweep Reversal (LSR) Strategy
 * 
 * High-probability reversal engine designed for crypto futures:
 * 1. Meaningful Liquidity Level Identification (Swing Highs/Lows, Equal Highs/Lows, Range Boundaries)
 * 2. True Sweep vs. Genuine Breakout Differentiation
 * 3. Sweep Depth & Rejection Analysis
 * 4. MANDATORY Reclaim of Liquidity Level (Anti-fake breakout)
 * 5. Micro-Structure Shift (MSS) Confirmation for tight invalidation
 * 6. Early Entry Optimization (No lagging indicators like RSI/MACD crossovers)
 * 7. Market Regime (BTC reference) & Coin-Specific Regime Filtering
 * 8. Structural Stop Loss (beyond sweep extreme) & Opposing Liquidity Target
 * 9. Anti-Chasing & Slippage Protection
 * 10. 10-State Setup State Machine (STATE 0 to 10) & Rigorous A+/A/B Grading
 */

import {
  AppSettings,
  LiquiditySweepReversalSignal,
  LsrMarketRegime,
  LsrCoinRegime,
  LsrTrendStrength,
  LsrLiquidityType,
  LsrSweepDepthClass,
  LsrSetupGrade,
  LsrStateMachineState,
  LsrCandleConfirmationType
} from '../../types';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiquidityLevel {
  price: number;
  type: LsrLiquidityType;
  qualityScore: number; // 0 to 5
  touches: number;
  barIndex: number;
  description: string;
  significance: 'MAJOR' | 'HIGH' | 'MEDIUM' | 'MINOR';
  prominenceAtr: number;
  isImportant: boolean;
}

/**
 * Calculates Simple ATR over N periods
 */
export function calculateAtr(candles: Candle[], period: number = 14): number {
  if (!candles || candles.length < period + 1) return 0;
  let trSum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Calculates 20-period Simple Moving Average of Volume
 */
export function calculateVolumeSma(candles: Candle[], period: number = 20): number {
  if (!candles || candles.length < period) return 0;
  let sum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    sum += candles[i].volume;
  }
  return sum / period;
}

/**
 * Classifies the Broad Crypto Market Regime using BTC or broad benchmark candles
 */
export function classifyLsrMarketRegime(benchmarkCandles: Candle[]): {
  regime: LsrMarketRegime;
  score: number; // 0 to 100 bullishness
  reason: string;
} {
  if (!benchmarkCandles || benchmarkCandles.length < 30) {
    return { regime: 'RANGE_NEUTRAL', score: 50, reason: 'Insufficient benchmark history' };
  }

  const len = benchmarkCandles.length;
  const last = benchmarkCandles[len - 1];
  const c10Ago = benchmarkCandles[len - 10];
  const c30Ago = benchmarkCandles[len - 30];

  const pct10 = ((last.close - c10Ago.close) / c10Ago.close) * 100;
  const pct30 = ((last.close - c30Ago.close) / c30Ago.close) * 100;

  // Measure volatility & range expansion
  const atr = calculateAtr(benchmarkCandles, 14);
  const atrPct = (atr / last.close) * 100;

  // High volatility / panic condition
  if (atrPct > 3.0 || Math.abs(pct10) > 6.0) {
    return {
      regime: 'HIGH_VOLATILITY',
      score: 50,
      reason: `BTC high volatility shock (ATR: ${atrPct.toFixed(2)}%, 10-bar move: ${pct10.toFixed(2)}%)`
    };
  }

  if (pct30 > 4.5 && pct10 > 1.2) {
    return { regime: 'STRONG_BULLISH', score: 85, reason: 'BTC sustained multi-day expansion & higher highs' };
  } else if (pct30 > 1.5 || pct10 > 0.8) {
    return { regime: 'BULLISH', score: 70, reason: 'BTC constructive bullish market structure' };
  } else if (pct30 < -4.5 && pct10 < -1.2) {
    return { regime: 'STRONG_BEARISH', score: 15, reason: 'BTC severe market sell-off & lower lows' };
  } else if (pct30 < -1.5 || pct10 < -0.8) {
    return { regime: 'BEARISH', score: 30, reason: 'BTC bearish distribution structure' };
  } else if (Math.abs(pct30) < 1.5 && Math.abs(pct10) < 0.8) {
    return { regime: 'RANGE_NEUTRAL', score: 50, reason: 'BTC balanced consolidation / neutral regime' };
  }

  return { regime: 'TRANSITIONING', score: 50, reason: 'BTC mixed momentum regime' };
}

/**
 * Classifies Coin-Specific Regime & Trend Strength independently
 */
export function classifyLsrCoinRegime(candles: Candle[]): {
  coinRegime: LsrCoinRegime;
  trendStrength: LsrTrendStrength;
  recentRangeHigh: number;
  recentRangeLow: number;
  rangeMidpoint: number;
  atr: number;
} {
  const len = candles.length;
  const atr = calculateAtr(candles, 14) || 1;
  const lookback = Math.min(len, 40);

  let highest = -Infinity;
  let lowest = Infinity;
  for (let i = len - lookback; i < len; i++) {
    if (candles[i].high > highest) highest = candles[i].high;
    if (candles[i].low < lowest) lowest = candles[i].low;
  }

  const rangeHeight = highest - lowest;
  const rangeMidpoint = (highest + lowest) / 2;

  // Trend detection over last 20 bars
  const cLast = candles[len - 1].close;
  const c20Ago = candles[Math.max(0, len - 20)].close;
  const priceChangePct = ((cLast - c20Ago) / c20Ago) * 100;
  const changeInAtr = (cLast - c20Ago) / atr;

  let trendStrength: LsrTrendStrength = 'MODERATE';
  if (Math.abs(changeInAtr) >= 6) {
    trendStrength = 'EXTREME';
  } else if (Math.abs(changeInAtr) >= 3.5) {
    trendStrength = 'STRONG';
  } else if (Math.abs(changeInAtr) >= 1.5) {
    trendStrength = 'MODERATE';
  } else {
    trendStrength = 'WEAK';
  }

  let coinRegime: LsrCoinRegime = 'RANGE';
  if (priceChangePct > 4.5 && changeInAtr > 3.0) {
    coinRegime = 'STRONG_TREND_UP';
  } else if (priceChangePct > 1.5 && changeInAtr > 1.2) {
    coinRegime = 'TREND_UP';
  } else if (priceChangePct < -4.5 && changeInAtr < -3.0) {
    coinRegime = 'STRONG_TREND_DOWN';
  } else if (priceChangePct < -1.5 && changeInAtr < -1.2) {
    coinRegime = 'TREND_DOWN';
  } else {
    coinRegime = 'RANGE';
  }

  return {
    coinRegime,
    trendStrength,
    recentRangeHigh: highest,
    recentRangeLow: lowest,
    rangeMidpoint,
    atr
  };
}

/**
 * Identifies structurally meaningful & high-significance institutional liquidity levels:
 * - Major Range High & Range Low (Absolute extremes of structural consolidation)
 * - Equal Highs (Double/Triple Tops) & Equal Lows (Double/Triple Bottoms) with clustered resting stops
 * - Prominent Multi-bar Structural Swings with significant displacement/clearance (>= 0.50 ATR)
 * 
 * Filters out minor 1-2 bar intraday chop to ensure the strategy only reacts to
 * high-probability institutional liquidity sweeps!
 */
export function identifyLiquidityLevels(
  candles: Candle[],
  lookback: number = 50,
  settings?: AppSettings
): { downsideLiquidity: LiquidityLevel[]; upsideLiquidity: LiquidityLevel[] } {
  let downsideLiquidity: LiquidityLevel[] = [];
  let upsideLiquidity: LiquidityLevel[] = [];

  const len = candles.length;
  if (len < 20) return { downsideLiquidity, upsideLiquidity };

  const effectiveLookback = Math.max(lookback, 45);
  const startIdx = Math.max(5, len - effectiveLookback);
  const atr = calculateAtr(candles, 14) || 1;
  const eqTol = atr * 0.22; // 0.22 ATR tolerance for equal highs/lows
  const minProminenceAtr = settings?.lsrMinSwingProminenceAtr ?? 0.50; // Minimum clearance away from pivot
  const focusImportant = settings?.lsrFocusImportantLevels !== false; // Default true!

  // 1. Identify Prominent Structural Pivots (Minimum 3-bar left and 3-bar right fractal with depth check)
  const rawPivotHighs: { price: number; idx: number; prominenceAtr: number }[] = [];
  const rawPivotLows: { price: number; idx: number; prominenceAtr: number }[] = [];

  for (let i = startIdx; i < len - 3; i++) {
    const cur = candles[i];
    
    // Check Pivot High (must be highest among 3 bars left and 3 bars right)
    const isPivotHigh = (
      cur.high > candles[i - 1].high &&
      cur.high > candles[i - 2].high &&
      cur.high >= candles[i - 3].high &&
      cur.high >= candles[i + 1].high &&
      cur.high >= candles[i + 2].high &&
      cur.high >= candles[i + 3].high
    );

    if (isPivotHigh) {
      const surroundingMax = Math.max(
        candles[i - 2].high,
        candles[i - 1].high,
        candles[i + 1].high,
        candles[i + 2].high
      );
      const prominence = cur.high - surroundingMax;
      const prominenceAtr = prominence / atr;
      rawPivotHighs.push({ price: cur.high, idx: i, prominenceAtr });
    }

    // Check Pivot Low (must be lowest among 3 bars left and 3 bars right)
    const isPivotLow = (
      cur.low < candles[i - 1].low &&
      cur.low < candles[i - 2].low &&
      cur.low <= candles[i - 3].low &&
      cur.low <= candles[i + 1].low &&
      cur.low <= candles[i + 2].low &&
      cur.low <= candles[i + 3].low
    );

    if (isPivotLow) {
      const surroundingMin = Math.min(
        candles[i - 2].low,
        candles[i - 1].low,
        candles[i + 1].low,
        candles[i + 2].low
      );
      const prominence = surroundingMin - cur.low;
      const prominenceAtr = prominence / atr;
      rawPivotLows.push({ price: cur.low, idx: i, prominenceAtr });
    }
  }

  // 2. Identify Equal Lows / Clustered Support Liquidity (Highest Institutional Value)
  const processedLowIdxs = new Set<number>();
  for (let i = 0; i < rawPivotLows.length; i++) {
    if (processedLowIdxs.has(i)) continue;
    const p1 = rawPivotLows[i];
    let touches = 1;
    let avgPrice = p1.price;
    let maxProminence = p1.prominenceAtr;
    let latestIdx = p1.idx;

    for (let j = i + 1; j < rawPivotLows.length; j++) {
      if (processedLowIdxs.has(j)) continue;
      const p2 = rawPivotLows[j];
      if (Math.abs(p1.price - p2.price) <= eqTol) {
        touches++;
        avgPrice = (avgPrice * (touches - 1) + p2.price) / touches;
        if (p2.prominenceAtr > maxProminence) maxProminence = p2.prominenceAtr;
        if (p2.idx > latestIdx) latestIdx = p2.idx;
        processedLowIdxs.add(j);
      }
    }
    processedLowIdxs.add(i);

    let quality = 3;
    let type: LsrLiquidityType = 'SWING_LOW';
    let significance: 'MAJOR' | 'HIGH' | 'MEDIUM' | 'MINOR' = 'MEDIUM';
    let isImportant = true;

    if (touches >= 3) {
      quality = 5;
      type = 'EQUAL_LOWS';
      significance = 'MAJOR';
      isImportant = true;
    } else if (touches === 2) {
      quality = 4;
      type = 'EQUAL_LOWS';
      significance = 'HIGH';
      isImportant = true;
    } else if (maxProminence >= 0.85) {
      quality = 4;
      type = 'SWING_LOW';
      significance = 'HIGH';
      isImportant = true;
    } else if (maxProminence >= minProminenceAtr) {
      quality = 3;
      type = 'SWING_LOW';
      significance = 'MEDIUM';
      isImportant = true;
    } else {
      quality = 2;
      type = 'SWING_LOW';
      significance = 'MINOR';
      isImportant = false;
    }

    if (!focusImportant || isImportant) {
      downsideLiquidity.push({
        price: avgPrice,
        type,
        qualityScore: quality,
        touches,
        barIndex: latestIdx,
        description: touches > 1 
          ? `Equal Lows (${touches} touches - Key Support Liquidity)` 
          : `Major Structural Swing Low (${(maxProminence).toFixed(2)}x ATR Prominence)`,
        significance,
        prominenceAtr: maxProminence,
        isImportant
      });
    }
  }

  // 3. Identify Equal Highs / Clustered Resistance Liquidity
  const processedHighIdxs = new Set<number>();
  for (let i = 0; i < rawPivotHighs.length; i++) {
    if (processedHighIdxs.has(i)) continue;
    const p1 = rawPivotHighs[i];
    let touches = 1;
    let avgPrice = p1.price;
    let maxProminence = p1.prominenceAtr;
    let latestIdx = p1.idx;

    for (let j = i + 1; j < rawPivotHighs.length; j++) {
      if (processedHighIdxs.has(j)) continue;
      const p2 = rawPivotHighs[j];
      if (Math.abs(p1.price - p2.price) <= eqTol) {
        touches++;
        avgPrice = (avgPrice * (touches - 1) + p2.price) / touches;
        if (p2.prominenceAtr > maxProminence) maxProminence = p2.prominenceAtr;
        if (p2.idx > latestIdx) latestIdx = p2.idx;
        processedHighIdxs.add(j);
      }
    }
    processedHighIdxs.add(i);

    let quality = 3;
    let type: LsrLiquidityType = 'SWING_HIGH';
    let significance: 'MAJOR' | 'HIGH' | 'MEDIUM' | 'MINOR' = 'MEDIUM';
    let isImportant = true;

    if (touches >= 3) {
      quality = 5;
      type = 'EQUAL_HIGHS';
      significance = 'MAJOR';
      isImportant = true;
    } else if (touches === 2) {
      quality = 4;
      type = 'EQUAL_HIGHS';
      significance = 'HIGH';
      isImportant = true;
    } else if (maxProminence >= 0.85) {
      quality = 4;
      type = 'SWING_HIGH';
      significance = 'HIGH';
      isImportant = true;
    } else if (maxProminence >= minProminenceAtr) {
      quality = 3;
      type = 'SWING_HIGH';
      significance = 'MEDIUM';
      isImportant = true;
    } else {
      quality = 2;
      type = 'SWING_HIGH';
      significance = 'MINOR';
      isImportant = false;
    }

    if (!focusImportant || isImportant) {
      upsideLiquidity.push({
        price: avgPrice,
        type,
        qualityScore: quality,
        touches,
        barIndex: latestIdx,
        description: touches > 1 
          ? `Equal Highs (${touches} touches - Key Resistance Liquidity)` 
          : `Major Structural Swing High (${(maxProminence).toFixed(2)}x ATR Prominence)`,
        significance,
        prominenceAtr: maxProminence,
        isImportant
      });
    }
  }

  // 4. Add Major Range Boundaries (Range High & Range Low)
  let lowestLow = Infinity;
  let lowestLowIdx = len - 1;
  let highestHigh = -Infinity;
  let highestHighIdx = len - 1;

  for (let i = startIdx; i < len - 2; i++) {
    if (candles[i].low < lowestLow) {
      lowestLow = candles[i].low;
      lowestLowIdx = i;
    }
    if (candles[i].high > highestHigh) {
      highestHigh = candles[i].high;
      highestHighIdx = i;
    }
  }

  if (lowestLow !== Infinity) {
    const existingRangeLow = downsideLiquidity.find(l => Math.abs(l.price - lowestLow) <= eqTol);
    if (existingRangeLow) {
      existingRangeLow.qualityScore = 5;
      existingRangeLow.significance = 'MAJOR';
      existingRangeLow.isImportant = true;
      existingRangeLow.description = `Major Structural Range Low (Touches: ${existingRangeLow.touches})`;
    } else {
      downsideLiquidity.push({
        price: lowestLow,
        type: 'RANGE_LOW',
        qualityScore: 5,
        touches: 1,
        barIndex: lowestLowIdx,
        description: 'Major Structural Range Low (Key Macro Boundary)',
        significance: 'MAJOR',
        prominenceAtr: 1.5,
        isImportant: true
      });
    }
  }

  if (highestHigh !== -Infinity) {
    const existingRangeHigh = upsideLiquidity.find(l => Math.abs(l.price - highestHigh) <= eqTol);
    if (existingRangeHigh) {
      existingRangeHigh.qualityScore = 5;
      existingRangeHigh.significance = 'MAJOR';
      existingRangeHigh.isImportant = true;
      existingRangeHigh.description = `Major Structural Range High (Touches: ${existingRangeHigh.touches})`;
    } else {
      upsideLiquidity.push({
        price: highestHigh,
        type: 'RANGE_HIGH',
        qualityScore: 5,
        touches: 1,
        barIndex: highestHighIdx,
        description: 'Major Structural Range High (Key Macro Boundary)',
        significance: 'MAJOR',
        prominenceAtr: 1.5,
        isImportant: true
      });
    }
  }

  // Sort by Quality and Touches descending so the highest significance levels are evaluated first
  downsideLiquidity.sort((a, b) => b.qualityScore - a.qualityScore || b.touches - a.touches);
  upsideLiquidity.sort((a, b) => b.qualityScore - a.qualityScore || b.touches - a.touches);

  return { downsideLiquidity, upsideLiquidity };
}

export interface LsrCandleConfirmationResult {
  detected: boolean;
  setupType: LsrCandleConfirmationType;
  candleIndex: number;
  reason: string;
  wickRatio: number;
  bodyRatio: number;
}

/**
 * Detects whether the circled or similar reversal candlestick setup has occurred
 * after a liquidity sweep is triggered:
 * 1. Bullish Hammer / Pin Bar (Long) or Bearish Shooting Star / Pin Bar (Short)
 * 2. Bullish Engulfing (Long) or Bearish Engulfing (Short)
 * 3. Retest & Higher Low Hold (Long) or Retest & Lower High Hold (Short) - the exact circled multi-candle pattern
 * 4. Two-Bar Reversal / Piercing Line
 */
export function detectLsrCandleConfirmation(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  liqPrice: number,
  sweepBarIdx: number,
  sweepExtreme: number,
  reclaimBarIdx: number,
  atr: number,
  minWickPct: number = 0.35
): LsrCandleConfirmationResult {
  const len = candles.length;
  if (!candles || len < 2 || sweepBarIdx < 0 || sweepBarIdx >= len) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: -1,
      reason: 'Insufficient candle data for confirmation check',
      wickRatio: 0,
      bodyRatio: 0
    };
  }

  // Scan candles from sweepBarIdx up to the latest candle (last 1-5 candles)
  const startIdx = Math.max(sweepBarIdx, len - 5);

  for (let i = len - 1; i >= startIdx; i--) {
    const cur = candles[i];
    const prev = candles[i - 1] || cur;
    const range = cur.high - cur.low || (cur.close * 0.001);
    const body = Math.abs(cur.close - cur.open);
    const bodyRatio = body / range;

    if (direction === 'LONG') {
      const lowerWick = Math.min(cur.open, cur.close) - cur.low;
      const upperWick = cur.high - Math.max(cur.open, cur.close);
      const lowerWickRatio = lowerWick / range;

      // 1. Bullish Pin Bar / Hammer (Rejection Candle)
      const isHammer = (
        lowerWickRatio >= minWickPct &&
        upperWick <= range * 0.35 &&
        cur.close >= cur.low + (range * 0.45) &&
        cur.close >= liqPrice * 0.998 &&
        cur.low >= sweepExtreme
      );

      if (isHammer) {
        return {
          detected: true,
          setupType: 'PIN_BAR_HAMMER',
          candleIndex: i,
          reason: `Bullish Hammer / Pin Bar confirmed on candle #${i} (${(lowerWickRatio * 100).toFixed(1)}% lower rejection wick, holding above sweep low $${sweepExtreme.toFixed(2)})`,
          wickRatio: lowerWickRatio,
          bodyRatio
        };
      }

      // 2. Bullish Engulfing / Decisive Green Reclaim Bar
      const isBullishEngulfing = (
        cur.close > cur.open &&
        bodyRatio >= 0.38 &&
        cur.close > liqPrice &&
        (cur.close >= prev.open || cur.close >= prev.high * 0.999) &&
        (prev.close <= prev.open || lowerWickRatio >= 0.25)
      );

      if (isBullishEngulfing) {
        return {
          detected: true,
          setupType: 'BULLISH_ENGULFING',
          candleIndex: i,
          reason: `Bullish Engulfing Reclaim confirmed on candle #${i} (strong expansion closing at $${cur.close.toFixed(2)} above swept level $${liqPrice.toFixed(2)})`,
          wickRatio: lowerWickRatio,
          bodyRatio
        };
      }

      // 3. Retest & Higher Low / Rejection Hold (The exact circled setup from screenshot!)
      if (i > sweepBarIdx && reclaimBarIdx !== -1 && i >= reclaimBarIdx) {
        const isHigherLow = cur.low > sweepExtreme + (0.01 * atr);
        const touchesNearLevel = cur.low <= liqPrice + (0.45 * atr);
        const holdsRejection = (lowerWickRatio >= 0.20 || (cur.close > cur.open && cur.close >= liqPrice && bodyRatio >= 0.25));

        if (isHigherLow && (touchesNearLevel || i > reclaimBarIdx) && holdsRejection) {
          return {
            detected: true,
            setupType: 'RETEST_HIGHER_LOW',
            candleIndex: i,
            reason: `Retest & Higher Low Hold confirmed on candle #${i} (low $${cur.low.toFixed(2)} held strictly above sweep extreme $${sweepExtreme.toFixed(2)}, rejection bounce above support)`,
            wickRatio: lowerWickRatio,
            bodyRatio
          };
        }
      }

      // 4. Two-Bar Piercing Line Reversal
      const isPiercing = (
        prev.close < prev.open &&
        cur.close > cur.open &&
        cur.close > (prev.open + prev.close) / 2 &&
        cur.close >= liqPrice * 0.999
      );

      if (isPiercing) {
        return {
          detected: true,
          setupType: 'TWO_BAR_REVERSAL',
          candleIndex: i,
          reason: `Two-Bar Piercing Reversal confirmed on candle #${i} (bullish piercing through $${liqPrice.toFixed(2)} with buyers regaining control)`,
          wickRatio: lowerWickRatio,
          bodyRatio
        };
      }
    } else {
      // SHORT
      const upperWick = cur.high - Math.max(cur.open, cur.close);
      const lowerWick = Math.min(cur.open, cur.close) - cur.low;
      const upperWickRatio = upperWick / range;

      // 1. Bearish Shooting Star / Pin Bar (Rejection Candle)
      const isShootingStar = (
        upperWickRatio >= minWickPct &&
        lowerWick <= range * 0.35 &&
        cur.close <= cur.high - (range * 0.45) &&
        cur.close <= liqPrice * 1.002 &&
        cur.high <= sweepExtreme
      );

      if (isShootingStar) {
        return {
          detected: true,
          setupType: 'PIN_BAR_HAMMER',
          candleIndex: i,
          reason: `Bearish Shooting Star / Pin Bar confirmed on candle #${i} (${(upperWickRatio * 100).toFixed(1)}% upper rejection wick, holding below sweep high $${sweepExtreme.toFixed(2)})`,
          wickRatio: upperWickRatio,
          bodyRatio
        };
      }

      // 2. Bearish Engulfing / Decisive Red Reclaim Bar
      const isBearishEngulfing = (
        cur.close < cur.open &&
        bodyRatio >= 0.38 &&
        cur.close < liqPrice &&
        (cur.close <= prev.open || cur.close <= prev.low * 1.001) &&
        (prev.close >= prev.open || upperWickRatio >= 0.25)
      );

      if (isBearishEngulfing) {
        return {
          detected: true,
          setupType: 'BEARISH_ENGULFING',
          candleIndex: i,
          reason: `Bearish Engulfing Reclaim confirmed on candle #${i} (strong distribution closing at $${cur.close.toFixed(2)} below swept level $${liqPrice.toFixed(2)})`,
          wickRatio: upperWickRatio,
          bodyRatio
        };
      }

      // 3. Retest & Lower High / Rejection Hold
      if (i > sweepBarIdx && reclaimBarIdx !== -1 && i >= reclaimBarIdx) {
        const isLowerHigh = cur.high < sweepExtreme - (0.01 * atr);
        const touchesNearLevel = cur.high >= liqPrice - (0.45 * atr);
        const holdsRejection = (upperWickRatio >= 0.20 || (cur.close < cur.open && cur.close <= liqPrice && bodyRatio >= 0.25));

        if (isLowerHigh && (touchesNearLevel || i > reclaimBarIdx) && holdsRejection) {
          return {
            detected: true,
            setupType: 'RETEST_LOWER_HIGH',
            candleIndex: i,
            reason: `Retest & Lower High Hold confirmed on candle #${i} (high $${cur.high.toFixed(2)} held strictly below sweep extreme $${sweepExtreme.toFixed(2)}, rejection below resistance)`,
            wickRatio: upperWickRatio,
            bodyRatio
          };
        }
      }

      // 4. Two-Bar Dark Cloud Cover Reversal
      const isDarkCloud = (
        prev.close > prev.open &&
        cur.close < cur.open &&
        cur.close < (prev.open + prev.close) / 2 &&
        cur.close <= liqPrice * 1.001
      );

      if (isDarkCloud) {
        return {
          detected: true,
          setupType: 'TWO_BAR_REVERSAL',
          candleIndex: i,
          reason: `Two-Bar Dark Cloud Cover confirmed on candle #${i} (bearish rejection through $${liqPrice.toFixed(2)} with sellers regaining control)`,
          wickRatio: upperWickRatio,
          bodyRatio
        };
      }
    }
  }

  return {
    detected: false,
    setupType: 'NONE',
    candleIndex: -1,
    reason: `Waiting for reversal candle confirmation (Hammer, Pin Bar, Engulfing, or Retest Hold) after LSR sweep at $${liqPrice.toFixed(2)}`,
    wickRatio: 0,
    bodyRatio: 0
  };
}

/**
 * Main Evaluation Engine: LIQUIDITY SWEEP REVERSAL (LSR)
 */
export function evaluateLiquiditySweepReversal(
  rawCandles: Candle[],
  rawBtcCandles: Candle[] = [],
  currentPrice: number,
  settings: AppSettings
): LiquiditySweepReversalSignal | null {
  if (!rawCandles || rawCandles.length < 36 || !currentPrice || currentPrice <= 0) {
    return null;
  }

  // Enforce strict no-repainting: evaluate ONLY on confirmed, closed candles
  const candles = rawCandles.slice(0, -1);
  const btcCandles = rawBtcCandles && rawBtcCandles.length > 1 ? rawBtcCandles.slice(0, -1) : rawBtcCandles;
  const len = candles.length;
  if (len < 35) return null;

  const lastCandle = candles[len - 1];
  const prevCandle = candles[len - 2];
  const timeframe = settings.lsrExecutionTimeframe || settings.timeframe || '15m';
  const atr = calculateAtr(candles, 14) || (currentPrice * 0.005);
  const volSma = calculateVolumeSma(candles, 20) || 1;

  // 1. Regime Classifications
  const marketRegimeData = classifyLsrMarketRegime(btcCandles.length > 0 ? btcCandles : candles);
  const coinRegimeData = classifyLsrCoinRegime(candles);

  const marketRegime = marketRegimeData.regime;
  const coinRegime = coinRegimeData.coinRegime;
  const trendStrength = coinRegimeData.trendStrength;

  // 2. Location Check (Middle of Range Exclusion)
  const rangeHeight = coinRegimeData.recentRangeHigh - coinRegimeData.recentRangeLow;
  const distFromMidpointPct = rangeHeight > 0
    ? (Math.abs(currentPrice - coinRegimeData.rangeMidpoint) / rangeHeight) * 100
    : 50;

  // If price is dead in the middle 25% of the range, reject low-quality chop
  const isMiddleOfRange = distFromMidpointPct < 15 && coinRegime === 'RANGE';

  // 3. Identify Liquidity Levels
  const focusImportant = settings.lsrFocusImportantLevels !== false; // Default true: Focus exclusively on high-significance levels
  const lookback = settings.lsrStructureLookback || (focusImportant ? 50 : 35);
  const { downsideLiquidity, upsideLiquidity } = identifyLiquidityLevels(candles, lookback, settings);

  // User Configurable Parameters
  const minRequiredRR = settings.lsrMinRewardRisk || settings.minRRRatio || 2.0;
  const maxReclaimCandles = settings.lsrMaxReclaimCandles || 4;
  const maxSweepDepthAtr = settings.lsrMaxSweepDepthAtr || 1.8;
  const slBufferAtr = settings.lsrSlBufferAtr || 0.15;
  const minLiqScore = settings.lsrMinLiquidityScore || (focusImportant ? 3 : 2);
  const allowGradeB = settings.lsrAllowGradeB || false;

  // We test both Bullish Sweep (LONG) and Bearish Sweep (SHORT)
  let bestSignal: LiquiditySweepReversalSignal | null = null;
  let highestQualityScore = -1;

  // ==============================================================
  // EVALUATE BULLISH LIQUIDITY SWEEP REVERSAL (LONG)
  // ==============================================================
  for (const liq of downsideLiquidity) {
    if (focusImportant && (!liq.isImportant || liq.qualityScore < minLiqScore)) continue;
    if (liq.qualityScore < minLiqScore) continue;

    // Check if a recent candle (within last 1 to 5 bars) swept below this level
    let sweepBarIdx = -1;
    let sweepExtreme = Infinity;
    for (let i = Math.max(liq.barIndex + 1, len - 6); i < len; i++) {
      if (candles[i].low < liq.price) {
        sweepBarIdx = i;
        if (candles[i].low < sweepExtreme) {
          sweepExtreme = candles[i].low;
        }
      }
    }

    if (sweepBarIdx === -1) continue; // No sweep occurred

    const sweepCandle = candles[sweepBarIdx];
    const sweepDepth = liq.price - sweepExtreme;
    const sweepDepthPct = (sweepDepth / liq.price) * 100;
    const sweepDepthInAtr = sweepDepth / atr;

    // Sweep Depth Classification
    let sweepDepthClass: LsrSweepDepthClass = 'NORMAL_SWEEP';
    if (sweepDepthInAtr < 0.20) {
      sweepDepthClass = 'MICRO_SWEEP';
    } else if (sweepDepthInAtr <= 1.25) {
      sweepDepthClass = 'NORMAL_SWEEP';
    } else if (sweepDepthInAtr <= maxSweepDepthAtr) {
      sweepDepthClass = 'DEEP_SWEEP';
    } else {
      sweepDepthClass = 'EXCESSIVE_SWEEP';
    }

    // Hard Rule: Reject excessive sweep (> maxSweepDepthAtr or > 2.5%)
    if (sweepDepthClass === 'EXCESSIVE_SWEEP' || sweepDepthPct > 2.5) {
      continue;
    }

    // Hard Rule: Distinguish True Sweep vs Breakout / Continuation
    // If 3+ candles closed below liquidity and continue downward, it's a breakout, not a sweep
    let candlesClosedBelow = 0;
    for (let i = sweepBarIdx; i < len; i++) {
      if (candles[i].close < liq.price) {
        candlesClosedBelow++;
      }
    }
    if (candlesClosedBelow >= 3 && lastCandle.close < liq.price) {
      // Genuine breakdown in progress
      continue;
    }

    // Rejection Quality Check: lower wick on sweep candle or immediate rejection bar
    const sweepBarRange = sweepCandle.high - sweepCandle.low || 0.0001;
    const sweepLowerWick = Math.min(sweepCandle.open, sweepCandle.close) - sweepCandle.low;
    const sweepWickRatio = sweepLowerWick / sweepBarRange;
    const rejectionDetected = sweepWickRatio >= 0.30 || lastCandle.close > liq.price;
    const rejectionQuality: 'STRONG' | 'MODERATE' | 'WEAK' =
      sweepWickRatio >= 0.45 ? 'STRONG' : (sweepWickRatio >= 0.25 ? 'MODERATE' : 'WEAK');

    // MANDATORY RECLAIM: Price must close back above liquidity level
    let reclaimConfirmed = false;
    let reclaimBarIdx = -1;
    let reclaimPrice = 0;

    for (let i = sweepBarIdx; i < len; i++) {
      if (candles[i].close > liq.price) {
        reclaimConfirmed = true;
        reclaimBarIdx = i;
        reclaimPrice = candles[i].close;
        break;
      }
    }

    if (!reclaimConfirmed) continue; // Hard requirement: MUST reclaim!

    const barsToReclaim = reclaimBarIdx - sweepBarIdx;
    if (barsToReclaim > maxReclaimCandles) continue; // Reclaim took too long

    const reclaimSpeed: 'FAST' | 'MODERATE' | 'SLOW' =
      barsToReclaim <= 1 ? 'FAST' : (barsToReclaim <= 3 ? 'MODERATE' : 'SLOW');

    // Micro-Structure Shift Confirmation (Break of minor lower high formed prior to / during sweep)
    let microBreakLevel = liq.price;
    for (let i = Math.max(0, sweepBarIdx - 2); i <= sweepBarIdx; i++) {
      if (candles[i].high > microBreakLevel) {
        microBreakLevel = candles[i].high;
      }
    }

    const microStructureShift = lastCandle.close >= microBreakLevel || currentPrice >= microBreakLevel || (lastCandle.close > liq.price && prevCandle.close > liq.price);

    // Volume Analysis
    const sweepVolRatio = sweepCandle.volume / volSma;
    const lastVolRatio = lastCandle.volume / volSma;
    const volumeCondition: 'SUPPORTIVE' | 'NEUTRAL' | 'UNSUPPORTIVE' =
      sweepVolRatio >= 1.25 || (lastVolRatio >= 1.1 && lastCandle.close > lastCandle.open)
        ? 'SUPPORTIVE'
        : (sweepVolRatio < 0.65 ? 'UNSUPPORTIVE' : 'NEUTRAL');

    // Structural Stop Loss: Below sweep extreme + small ATR buffer
    const stopLossPrice = sweepExtreme - (slBufferAtr * atr);
    const stopDistance = currentPrice - stopLossPrice;
    const stopDistancePct = (stopDistance / currentPrice) * 100;

    // Target Calculation: Opposing liquidity (nearest swing high / range high)
    let opposingTarget = coinRegimeData.recentRangeHigh;
    let opposingType = 'Range High';
    for (const opp of upsideLiquidity) {
      if (opp.price > currentPrice && opp.price <= opposingTarget) {
        opposingTarget = opp.price;
        opposingType = opp.description;
      }
    }

    // Target must offer structural distance
    const targetDistance = opposingTarget - currentPrice;
    const targetDistancePct = (targetDistance / currentPrice) * 100;
    const riskRewardRatio = stopDistance > 0 ? targetDistance / stopDistance : 0;

    // Anti-Chasing: If current price moved > 0.60 * ATR beyond reclaim price or > 35% to target
    const distFromReclaim = currentPrice - reclaimPrice;
    const entryChased = distFromReclaim > (0.65 * atr) || (targetDistance > 0 && (distFromReclaim / targetDistance) > 0.35);

    // Market Alignment Analysis
    let marketAlignment: 'FAVORABLE' | 'NEUTRAL' | 'COUNTER_TREND' | 'OPPOSING' = 'NEUTRAL';
    let marketAlignmentScore = 50;

    if (marketRegime === 'STRONG_BULLISH' || marketRegime === 'BULLISH') {
      marketAlignment = 'FAVORABLE';
      marketAlignmentScore = 85;
    } else if (marketRegime === 'RANGE_NEUTRAL') {
      marketAlignment = 'NEUTRAL';
      marketAlignmentScore = 65;
    } else if (marketRegime === 'BEARISH') {
      marketAlignment = 'COUNTER_TREND';
      marketAlignmentScore = 40;
    } else {
      marketAlignment = 'OPPOSING';
      marketAlignmentScore = 20;
    }

    // Circled Reversal Candlestick Setup Detection (Hammer / Pin Bar / Engulfing / Retest Higher Low)
    const requireCandleConf = settings.lsrRequireCandleConfirmation !== false; // default true
    const minWickPct = (settings.lsrMinRejectionWickPct || 35) / 100;
    const candleConf = detectLsrCandleConfirmation(
      candles,
      'LONG',
      liq.price,
      sweepBarIdx,
      sweepExtreme,
      reclaimBarIdx,
      atr,
      minWickPct
    );

    // Coin Regime Compatibility Check
    const isCounterTrend = coinRegime === 'STRONG_TREND_DOWN' && trendStrength === 'EXTREME';
    // Reject counter-trend long in extreme dump unless major liquidity score (>= 4) and strong rejection
    if (isCounterTrend && (liq.qualityScore < 4 || rejectionQuality === 'WEAK')) {
      continue;
    }

    // Setup Grading
    let grade: LsrSetupGrade = 'B';
    let score = 65;

    if (
      liq.qualityScore >= 4 &&
      reclaimSpeed === 'FAST' &&
      rejectionQuality === 'STRONG' &&
      microStructureShift &&
      riskRewardRatio >= 2.5 &&
      marketAlignment !== 'OPPOSING' &&
      !isMiddleOfRange &&
      !entryChased
    ) {
      grade = 'A+';
      score = 95;
    } else if (
      liq.qualityScore >= 3 &&
      reclaimSpeed !== 'SLOW' &&
      riskRewardRatio >= minRequiredRR &&
      !entryChased &&
      !isMiddleOfRange
    ) {
      grade = 'A';
      score = 82;
    } else if (riskRewardRatio >= 1.5 && !entryChased) {
      grade = 'B';
      score = 70;
    } else {
      grade = 'NO_TRADE';
      score = 40;
    }

    // Hard Decision Gate
    let finalDecision: 'EXECUTE' | 'READY' | 'WAIT' | 'REJECT' = 'REJECT';
    let rejectionReason: string | null = null;
    let exactRejectionReason: string | null = null;

    if (isMiddleOfRange) {
      finalDecision = 'REJECT';
      rejectionReason = 'Setup located in middle of range (low quality)';
      exactRejectionReason = 'MIDDLE_OF_RANGE';
    } else if (entryChased) {
      finalDecision = 'REJECT';
      rejectionReason = 'Price moved too far from reclaim level; chasing prohibited';
      exactRejectionReason = 'ENTRY_MOVED_TOO_FAR';
    } else if (riskRewardRatio < minRequiredRR) {
      finalDecision = 'REJECT';
      rejectionReason = `Insufficient structural R:R (${riskRewardRatio.toFixed(2)} < required ${minRequiredRR})`;
      exactRejectionReason = 'INSUFFICIENT_RR';
    } else if (marketRegime === 'HIGH_VOLATILITY') {
      finalDecision = 'REJECT';
      rejectionReason = 'Market volatility abnormal / BTC market shock';
      exactRejectionReason = 'BTC_MARKET_SHOCK';
    } else if (grade === 'NO_TRADE' || (grade === 'B' && !allowGradeB)) {
      finalDecision = 'WAIT';
      rejectionReason = 'Grade B setup waiting for Grade A/A+ confluence';
      exactRejectionReason = 'SETUP_GRADE_BELOW_THRESHOLD';
    } else if (requireCandleConf && !candleConf.detected) {
      // User requirement: "after trigger lsr wait for this circled or similar setup then execute"
      finalDecision = 'WAIT';
      rejectionReason = `LSR Triggered ($${liq.price.toFixed(2)} swept): Waiting for circled reversal candlestick setup (Hammer / Pin Bar / Engulfing / Retest Hold)`;
      exactRejectionReason = 'WAITING_FOR_CANDLE_CONFIRMATION';
    } else if (microStructureShift && reclaimConfirmed && (!requireCandleConf || candleConf.detected)) {
      finalDecision = 'EXECUTE';
    } else {
      finalDecision = 'READY';
    }

    const stateNumber = finalDecision === 'EXECUTE' ? 7 : (reclaimConfirmed ? 5 : 4);
    const state: LsrStateMachineState =
      finalDecision === 'EXECUTE'
        ? 'STATE_7_ENTRY'
        : (microStructureShift ? 'STATE_5_MICRO_STRUCTURE_CONFIRMATION' : 'STATE_4_RECLAIM_DETECTED');

    const setupId = `LSR_LONG_${lastCandle.time}_${liq.price.toFixed(2)}`;
    const explanation = `LONG — ${lastCandle.time} | Level: [${liq.significance}] ${liq.description} ($${liq.price.toFixed(4)}) | Quality: ${liq.qualityScore}/5 (${liq.touches} touch${liq.touches > 1 ? 'es' : ''}) | Sweep: ${sweepDepthPct.toFixed(2)}% below level | Reclaim: Confirmed (${reclaimSpeed}) | Reversal Setup: ${candleConf.detected ? candleConf.setupType : 'WAITING'} (${candleConf.reason}) | Micro-structure: Bullish shift | Market: ${marketRegime} | Coin: ${coinRegime} | Volume: ${volumeCondition} | R:R: ${riskRewardRatio.toFixed(2)} | Target: $${opposingTarget.toFixed(4)} | SL: $${stopLossPrice.toFixed(4)}`;

    const signal: LiquiditySweepReversalSignal = {
      symbol: '',
      direction: 'LONG',
      setupId,
      timeframe,
      state,
      stateNumber,
      grade,
      finalDecision,
      status: finalDecision === 'EXECUTE' ? 'TRIGGERED' : (exactRejectionReason === 'WAITING_FOR_CANDLE_CONFIRMATION' ? 'ARMED' : (finalDecision === 'READY' ? 'ARMED' : 'WAITING')),
      score,
      marketRegime,
      coinRegime,
      trendStrength,
      marketAlignment,
      marketAlignmentScore,
      liquidityLevel: liq.price,
      liquidityType: liq.type,
      liquidityQualityScore: liq.qualityScore,
      liquidityTouches: liq.touches,
      liquiditySignificance: liq.significance,
      isImportantLevel: liq.isImportant,
      sweepDetected: true,
      sweepPrice: sweepCandle.low,
      sweepExtremePrice: sweepExtreme,
      sweepDepth,
      sweepDepthPct,
      sweepDepthClass,
      sweepCandleTime: sweepCandle.time,
      rejectionDetected,
      rejectionQuality,
      reclaimConfirmed,
      reclaimPrice,
      reclaimCandleIndex: reclaimBarIdx,
      reclaimSpeed,
      microStructureShift,
      microStructureType: 'BULLISH',
      microBreakLevel,
      volumeCondition,
      volumeSpikeRatio: sweepVolRatio,
      entryPrice: currentPrice,
      stopLossPrice,
      targetPrice: opposingTarget,
      stopDistancePct,
      targetDistancePct,
      riskRewardRatio,
      minRequiredRR,
      entryChased,
      rejectionReason,
      exactRejectionReason,
      structuredExplanation: explanation,
      explanation,
      timestamp: Date.now(),
      signalTime: lastCandle.time,
      tp1: opposingTarget,
      tp2: opposingTarget + (opposingTarget - currentPrice) * 0.5,
      tp3: opposingTarget + (opposingTarget - currentPrice) * 1.0,
      atrValue: atr,
      opposingLiquidityPrice: opposingTarget,
      opposingLiquidityType: opposingType,
      strategyRegimeStatus: marketAlignment === 'FAVORABLE' ? 'IN_FAVOR' : (marketAlignment === 'NEUTRAL' ? 'NEUTRAL' : 'WAITING'),
      candleConfirmationDetected: candleConf.detected,
      candleConfirmationSetup: candleConf.setupType,
      candleConfirmationReason: candleConf.reason
    };

    if (score > highestQualityScore) {
      highestQualityScore = score;
      bestSignal = signal;
    }
  }

  // ==============================================================
  // EVALUATE BEARISH LIQUIDITY SWEEP REVERSAL (SHORT)
  // ==============================================================
  for (const liq of upsideLiquidity) {
    if (focusImportant && (!liq.isImportant || liq.qualityScore < minLiqScore)) continue;
    if (liq.qualityScore < minLiqScore) continue;

    // Check if a recent candle (within last 1 to 5 bars) swept above this level
    let sweepBarIdx = -1;
    let sweepExtreme = -Infinity;
    for (let i = Math.max(liq.barIndex + 1, len - 6); i < len; i++) {
      if (candles[i].high > liq.price) {
        sweepBarIdx = i;
        if (candles[i].high > sweepExtreme) {
          sweepExtreme = candles[i].high;
        }
      }
    }

    if (sweepBarIdx === -1) continue;

    const sweepCandle = candles[sweepBarIdx];
    const sweepDepth = sweepExtreme - liq.price;
    const sweepDepthPct = (sweepDepth / liq.price) * 100;
    const sweepDepthInAtr = sweepDepth / atr;

    // Sweep Depth Classification
    let sweepDepthClass: LsrSweepDepthClass = 'NORMAL_SWEEP';
    if (sweepDepthInAtr < 0.20) {
      sweepDepthClass = 'MICRO_SWEEP';
    } else if (sweepDepthInAtr <= 1.25) {
      sweepDepthClass = 'NORMAL_SWEEP';
    } else if (sweepDepthInAtr <= maxSweepDepthAtr) {
      sweepDepthClass = 'DEEP_SWEEP';
    } else {
      sweepDepthClass = 'EXCESSIVE_SWEEP';
    }

    // Hard Rule: Reject excessive sweep (> maxSweepDepthAtr or > 2.5%)
    if (sweepDepthClass === 'EXCESSIVE_SWEEP' || sweepDepthPct > 2.5) {
      continue;
    }

    // Hard Rule: Distinguish True Sweep vs Breakout / Continuation
    let candlesClosedAbove = 0;
    for (let i = sweepBarIdx; i < len; i++) {
      if (candles[i].close > liq.price) {
        candlesClosedAbove++;
      }
    }
    if (candlesClosedAbove >= 3 && lastCandle.close > liq.price) {
      continue; // Genuine breakout in progress
    }

    // Rejection Quality Check: upper wick on sweep candle or immediate rejection bar
    const sweepBarRange = sweepCandle.high - sweepCandle.low || 0.0001;
    const sweepUpperWick = sweepCandle.high - Math.max(sweepCandle.open, sweepCandle.close);
    const sweepWickRatio = sweepUpperWick / sweepBarRange;
    const rejectionDetected = sweepWickRatio >= 0.30 || lastCandle.close < liq.price;
    const rejectionQuality: 'STRONG' | 'MODERATE' | 'WEAK' =
      sweepWickRatio >= 0.45 ? 'STRONG' : (sweepWickRatio >= 0.25 ? 'MODERATE' : 'WEAK');

    // MANDATORY RECLAIM: Price must close back below liquidity level
    let reclaimConfirmed = false;
    let reclaimBarIdx = -1;
    let reclaimPrice = 0;

    for (let i = sweepBarIdx; i < len; i++) {
      if (candles[i].close < liq.price) {
        reclaimConfirmed = true;
        reclaimBarIdx = i;
        reclaimPrice = candles[i].close;
        break;
      }
    }

    if (!reclaimConfirmed) continue; // Hard requirement: MUST reclaim!

    const barsToReclaim = reclaimBarIdx - sweepBarIdx;
    if (barsToReclaim > maxReclaimCandles) continue;

    const reclaimSpeed: 'FAST' | 'MODERATE' | 'SLOW' =
      barsToReclaim <= 1 ? 'FAST' : (barsToReclaim <= 3 ? 'MODERATE' : 'SLOW');

    // Micro-Structure Shift Confirmation (Break of minor higher low formed prior to / during sweep)
    let microBreakLevel = liq.price;
    for (let i = Math.max(0, sweepBarIdx - 2); i <= sweepBarIdx; i++) {
      if (candles[i].low < microBreakLevel) {
        microBreakLevel = candles[i].low;
      }
    }

    const microStructureShift = lastCandle.close <= microBreakLevel || currentPrice <= microBreakLevel || (lastCandle.close < liq.price && prevCandle.close < liq.price);

    // Volume Analysis
    const sweepVolRatio = sweepCandle.volume / volSma;
    const lastVolRatio = lastCandle.volume / volSma;
    const volumeCondition: 'SUPPORTIVE' | 'NEUTRAL' | 'UNSUPPORTIVE' =
      sweepVolRatio >= 1.25 || (lastVolRatio >= 1.1 && lastCandle.close < lastCandle.open)
        ? 'SUPPORTIVE'
        : (sweepVolRatio < 0.65 ? 'UNSUPPORTIVE' : 'NEUTRAL');

    // Structural Stop Loss: Above sweep extreme + small ATR buffer
    const stopLossPrice = sweepExtreme + (slBufferAtr * atr);
    const stopDistance = stopLossPrice - currentPrice;
    const stopDistancePct = (stopDistance / currentPrice) * 100;

    // Target Calculation: Opposing downside liquidity (nearest swing low / range low)
    let opposingTarget = coinRegimeData.recentRangeLow;
    let opposingType = 'Range Low';
    for (const opp of downsideLiquidity) {
      if (opp.price < currentPrice && opp.price >= opposingTarget) {
        opposingTarget = opp.price;
        opposingType = opp.description;
      }
    }

    const targetDistance = currentPrice - opposingTarget;
    const targetDistancePct = (targetDistance / currentPrice) * 100;
    const riskRewardRatio = stopDistance > 0 ? targetDistance / stopDistance : 0;

    // Anti-Chasing: If current price moved > 0.65 * ATR beyond reclaim price or > 35% to target
    const distFromReclaim = reclaimPrice - currentPrice;
    const entryChased = distFromReclaim > (0.65 * atr) || (targetDistance > 0 && (distFromReclaim / targetDistance) > 0.35);

    // Market Alignment Analysis
    let marketAlignment: 'FAVORABLE' | 'NEUTRAL' | 'COUNTER_TREND' | 'OPPOSING' = 'NEUTRAL';
    let marketAlignmentScore = 50;

    if (marketRegime === 'STRONG_BEARISH' || marketRegime === 'BEARISH') {
      marketAlignment = 'FAVORABLE';
      marketAlignmentScore = 85;
    } else if (marketRegime === 'RANGE_NEUTRAL') {
      marketAlignment = 'NEUTRAL';
      marketAlignmentScore = 65;
    } else if (marketRegime === 'BULLISH') {
      marketAlignment = 'COUNTER_TREND';
      marketAlignmentScore = 40;
    } else {
      marketAlignment = 'OPPOSING';
      marketAlignmentScore = 20;
    }

    // Circled Reversal Candlestick Setup Detection (Shooting Star / Pin Bar / Engulfing / Retest Lower High)
    const requireCandleConf = settings.lsrRequireCandleConfirmation !== false; // default true
    const minWickPct = (settings.lsrMinRejectionWickPct || 35) / 100;
    const candleConf = detectLsrCandleConfirmation(
      candles,
      'SHORT',
      liq.price,
      sweepBarIdx,
      sweepExtreme,
      reclaimBarIdx,
      atr,
      minWickPct
    );

    // Coin Regime Compatibility Check
    const isCounterTrend = coinRegime === 'STRONG_TREND_UP' && trendStrength === 'EXTREME';
    if (isCounterTrend && (liq.qualityScore < 4 || rejectionQuality === 'WEAK')) {
      continue;
    }

    // Setup Grading
    let grade: LsrSetupGrade = 'B';
    let score = 65;

    if (
      liq.qualityScore >= 4 &&
      reclaimSpeed === 'FAST' &&
      rejectionQuality === 'STRONG' &&
      microStructureShift &&
      riskRewardRatio >= 2.5 &&
      marketAlignment !== 'OPPOSING' &&
      !isMiddleOfRange &&
      !entryChased
    ) {
      grade = 'A+';
      score = 95;
    } else if (
      liq.qualityScore >= 3 &&
      reclaimSpeed !== 'SLOW' &&
      riskRewardRatio >= minRequiredRR &&
      !entryChased &&
      !isMiddleOfRange
    ) {
      grade = 'A';
      score = 82;
    } else if (riskRewardRatio >= 1.5 && !entryChased) {
      grade = 'B';
      score = 70;
    } else {
      grade = 'NO_TRADE';
      score = 40;
    }

    // Hard Decision Gate
    let finalDecision: 'EXECUTE' | 'READY' | 'WAIT' | 'REJECT' = 'REJECT';
    let rejectionReason: string | null = null;
    let exactRejectionReason: string | null = null;

    if (isMiddleOfRange) {
      finalDecision = 'REJECT';
      rejectionReason = 'Setup located in middle of range (low quality)';
      exactRejectionReason = 'MIDDLE_OF_RANGE';
    } else if (entryChased) {
      finalDecision = 'REJECT';
      rejectionReason = 'Price moved too far from reclaim level; chasing prohibited';
      exactRejectionReason = 'ENTRY_MOVED_TOO_FAR';
    } else if (riskRewardRatio < minRequiredRR) {
      finalDecision = 'REJECT';
      rejectionReason = `Insufficient structural R:R (${riskRewardRatio.toFixed(2)} < required ${minRequiredRR})`;
      exactRejectionReason = 'INSUFFICIENT_RR';
    } else if (marketRegime === 'HIGH_VOLATILITY') {
      finalDecision = 'REJECT';
      rejectionReason = 'Market volatility abnormal / BTC market shock';
      exactRejectionReason = 'BTC_MARKET_SHOCK';
    } else if (grade === 'NO_TRADE' || (grade === 'B' && !allowGradeB)) {
      finalDecision = 'WAIT';
      rejectionReason = 'Grade B setup waiting for Grade A/A+ confluence';
      exactRejectionReason = 'SETUP_GRADE_BELOW_THRESHOLD';
    } else if (requireCandleConf && !candleConf.detected) {
      // User requirement: "after trigger lsr wait for this circled or similar setup then execute"
      finalDecision = 'WAIT';
      rejectionReason = `LSR Triggered ($${liq.price.toFixed(2)} swept): Waiting for circled reversal candlestick setup (Shooting Star / Pin Bar / Engulfing / Retest Hold)`;
      exactRejectionReason = 'WAITING_FOR_CANDLE_CONFIRMATION';
    } else if (microStructureShift && reclaimConfirmed && (!requireCandleConf || candleConf.detected)) {
      finalDecision = 'EXECUTE';
    } else {
      finalDecision = 'READY';
    }

    const stateNumber = finalDecision === 'EXECUTE' ? 7 : (reclaimConfirmed ? 5 : 4);
    const state: LsrStateMachineState =
      finalDecision === 'EXECUTE'
        ? 'STATE_7_ENTRY'
        : (microStructureShift ? 'STATE_5_MICRO_STRUCTURE_CONFIRMATION' : 'STATE_4_RECLAIM_DETECTED');

    const setupId = `LSR_SHORT_${lastCandle.time}_${liq.price.toFixed(2)}`;
    const explanation = `SHORT — ${lastCandle.time} | Level: [${liq.significance}] ${liq.description} ($${liq.price.toFixed(4)}) | Quality: ${liq.qualityScore}/5 (${liq.touches} touch${liq.touches > 1 ? 'es' : ''}) | Sweep: ${sweepDepthPct.toFixed(2)}% above level | Reclaim: Confirmed (${reclaimSpeed}) | Reversal Setup: ${candleConf.detected ? candleConf.setupType : 'WAITING'} (${candleConf.reason}) | Micro-structure: Bearish shift | Market: ${marketRegime} | Coin: ${coinRegime} | Volume: ${volumeCondition} | R:R: ${riskRewardRatio.toFixed(2)} | Target: $${opposingTarget.toFixed(4)} | SL: $${stopLossPrice.toFixed(4)}`;

    const signal: LiquiditySweepReversalSignal = {
      symbol: '',
      direction: 'SHORT',
      setupId,
      timeframe,
      state,
      stateNumber,
      grade,
      finalDecision,
      status: finalDecision === 'EXECUTE' ? 'TRIGGERED' : (exactRejectionReason === 'WAITING_FOR_CANDLE_CONFIRMATION' ? 'ARMED' : (finalDecision === 'READY' ? 'ARMED' : 'WAITING')),
      score,
      marketRegime,
      coinRegime,
      trendStrength,
      marketAlignment,
      marketAlignmentScore,
      liquidityLevel: liq.price,
      liquidityType: liq.type,
      liquidityQualityScore: liq.qualityScore,
      liquidityTouches: liq.touches,
      liquiditySignificance: liq.significance,
      isImportantLevel: liq.isImportant,
      sweepDetected: true,
      sweepPrice: sweepCandle.high,
      sweepExtremePrice: sweepExtreme,
      sweepDepth,
      sweepDepthPct,
      sweepDepthClass,
      sweepCandleTime: sweepCandle.time,
      rejectionDetected,
      rejectionQuality,
      reclaimConfirmed,
      reclaimPrice,
      reclaimCandleIndex: reclaimBarIdx,
      reclaimSpeed,
      microStructureShift,
      microStructureType: 'BEARISH',
      microBreakLevel,
      volumeCondition,
      volumeSpikeRatio: sweepVolRatio,
      entryPrice: currentPrice,
      stopLossPrice,
      targetPrice: opposingTarget,
      stopDistancePct,
      targetDistancePct,
      riskRewardRatio,
      minRequiredRR,
      entryChased,
      rejectionReason,
      exactRejectionReason,
      structuredExplanation: explanation,
      explanation,
      timestamp: Date.now(),
      signalTime: lastCandle.time,
      tp1: opposingTarget,
      tp2: opposingTarget - (currentPrice - opposingTarget) * 0.5,
      tp3: opposingTarget - (currentPrice - opposingTarget) * 1.0,
      atrValue: atr,
      opposingLiquidityPrice: opposingTarget,
      opposingLiquidityType: opposingType,
      strategyRegimeStatus: marketAlignment === 'FAVORABLE' ? 'IN_FAVOR' : (marketAlignment === 'NEUTRAL' ? 'NEUTRAL' : 'WAITING'),
      candleConfirmationDetected: candleConf.detected,
      candleConfirmationSetup: candleConf.setupType,
      candleConfirmationReason: candleConf.reason
    };

    if (score > highestQualityScore) {
      highestQualityScore = score;
      bestSignal = signal;
    }
  }

  return bestSignal;
}

/**
 * Generates an institutional Pine Script v6 strategy script for TradingView
 */
export function generateLsrPineScript(settings: AppSettings): string {
  const minRR = settings.lsrMinRewardRisk || 2.0;
  const slBuffer = settings.lsrSlBufferAtr || 0.15;
  const maxReclaim = settings.lsrMaxReclaimCandles || 4;

  return `//@version=6
strategy("Liquidity Sweep Reversal (LSR) [Institutional]", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.04)

// -------------------------------------------------------------
// INPUTS & PARAMETERS
// -------------------------------------------------------------
pivotLookback      = input.int(15, "Pivot Lookback Window", minval=5, maxval=50)
minRRRatio         = input.float(${minRR}, "Minimum Structural R:R", minval=1.5, step=0.1)
slBufferAtr        = input.float(${slBuffer}, "Stop Loss ATR Buffer", minval=0.05, step=0.05)
maxReclaimBars     = input.int(${maxReclaim}, "Max Reclaim Candles", minval=1, maxval=8)
eqToleranceAtr     = input.float(0.22, "Equal Highs/Lows ATR Tolerance", minval=0.05, step=0.05)
focusImportant     = input.bool(true, "Focus on Important Levels Only (High Significance)")
minProminenceAtr   = input.float(0.50, "Min Swing Prominence (ATR)", minval=0.2, step=0.1)

// -------------------------------------------------------------
// ATR & VOLATILITY
// -------------------------------------------------------------
atrVal = ta.atr(14)
volSma = ta.sma(volume, 20)

// -------------------------------------------------------------
// STRUCTURAL LIQUIDITY DETECTION (Important Levels Filter)
// -------------------------------------------------------------
ph = ta.pivothigh(high, pivotLookback, pivotLookback)
pl = ta.pivotlow(low, pivotLookback, pivotLookback)

var float lastSwingHigh = na
var float lastSwingLow = na
var int lastHighBar = na
var int lastLowBar = na

// Prominence filter to eliminate minor chop:
validPl = not na(pl) and (not focusImportant or (ta.highest(high, pivotLookback) - pl >= minProminenceAtr * atrVal))
validPh = not na(ph) and (not focusImportant or (ph - ta.lowest(low, pivotLookback) >= minProminenceAtr * atrVal))

if validPh
    lastSwingHigh := ph
    lastHighBar := bar_index[pivotLookback]

if validPl
    lastSwingLow := pl
    lastLowBar := bar_index[pivotLookback]

// -------------------------------------------------------------
// SWEEP, REJECTION & RECLAIM LOGIC
// -------------------------------------------------------------
// Bullish Sweep of Downside Liquidity
sweepLow = not na(lastSwingLow) and low < lastSwingLow and low[1] >= lastSwingLow
reclaimLow = not na(lastSwingLow) and close > lastSwingLow and close[1] <= lastSwingLow

// Bearish Sweep of Upside Liquidity
sweepHigh = not na(lastSwingHigh) and high > lastSwingHigh and high[1] <= lastSwingHigh
reclaimHigh = not na(lastSwingHigh) and close < lastSwingHigh and close[1] >= lastSwingHigh

// Micro-Structure Shift (MSS)
var float sweepExtremeLow = na
var float sweepExtremeHigh = na

if sweepLow
    sweepExtremeLow := low
else if not na(sweepExtremeLow) and close > lastSwingLow
    // Holding reclaim

if sweepHigh
    sweepExtremeHigh := high
else if not na(sweepExtremeHigh) and close < lastSwingHigh
    // Holding reclaim

// -------------------------------------------------------------
// CIRCLED REVERSAL CANDLESTICK CONFIRMATION
// (Wait for circled setup: Hammer/Pin Bar, Engulfing, or Retest Hold)
// -------------------------------------------------------------
candleRange = high - low
lowerWick   = math.min(open, close) - low
upperWick   = high - math.max(open, close)
bodySize    = math.abs(close - open)

// Bullish Reversal: Hammer / Pin Bar, Engulfing, or Retest & Higher Low Hold
isHammer           = candleRange > 0 and (lowerWick / candleRange >= 0.35) and (close >= low + 0.45 * candleRange)
isBullishEngulfing = close > open and (close > open[1] or close > high[1]) and (bodySize / math.max(candleRange, 0.0001) >= 0.38)
isRetestHoldLong   = not na(sweepExtremeLow) and low > sweepExtremeLow and (low <= lastSwingLow + 0.45 * atrVal) and (close >= open or (lowerWick / math.max(candleRange, 0.0001) >= 0.25))
bullishConfirmation = isHammer or isBullishEngulfing or isRetestHoldLong

// Bearish Reversal: Shooting Star / Pin Bar, Engulfing, or Retest & Lower High Hold
isShootingStar     = candleRange > 0 and (upperWick / candleRange >= 0.35) and (close <= high - 0.45 * candleRange)
isBearishEngulfing = close < open and (close < open[1] or close < low[1]) and (bodySize / math.max(candleRange, 0.0001) >= 0.38)
isRetestHoldShort  = not na(sweepExtremeHigh) and high < sweepExtremeHigh and (high >= lastSwingHigh - 0.45 * atrVal) and (close <= open or (upperWick / math.max(candleRange, 0.0001) >= 0.25))
bearishConfirmation = isShootingStar or isBearishEngulfing or isRetestHoldShort

// Long Conditions (Wait for Circled Reversal Confirmation Setup)
validLong = (reclaimLow or (close > lastSwingLow and not na(sweepExtremeLow))) and bullishConfirmation and not na(sweepExtremeLow) and (lastSwingHigh - close) / math.max(close - (sweepExtremeLow - slBufferAtr * atrVal), 0.0001) >= minRRRatio

// Short Conditions (Wait for Circled Reversal Confirmation Setup)
validShort = (reclaimHigh or (close < lastSwingHigh and not na(sweepExtremeHigh))) and bearishConfirmation and not na(sweepExtremeHigh) and (close - lastSwingLow) / math.max((sweepExtremeHigh + slBufferAtr * atrVal) - close, 0.0001) >= minRRRatio

// -------------------------------------------------------------
// EXECUTION & VISUALIZATION
// -------------------------------------------------------------
if validLong and strategy.position_size == 0
    float sl = sweepExtremeLow - (slBufferAtr * atrVal)
    float tp = lastSwingHigh
    strategy.entry("LSR_LONG", strategy.long)
    strategy.exit("Exit_Long", "LSR_LONG", stop=sl, limit=tp)
    sweepExtremeLow := na

if validShort and strategy.position_size == 0
    float sl = sweepExtremeHigh + (slBufferAtr * atrVal)
    float tp = lastSwingLow
    strategy.entry("LSR_SHORT", strategy.short)
    strategy.exit("Exit_Short", "LSR_SHORT", stop=sl, limit=tp)
    sweepExtremeHigh := na

plot(lastSwingHigh, "Liquidity High", color=color.new(color.red, 30), style=plot.style_linebr, linewidth=2)
plot(lastSwingLow, "Liquidity Low", color=color.new(color.green, 30), style=plot.style_linebr, linewidth=2)
`;
}
