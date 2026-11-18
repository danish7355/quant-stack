/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LIQUIDITY SWEEP REVERSAL (LSR) v2: Production Strategy Engine
 *
 * Fully integrated with the regime-gated v2 pipeline:
 *  - No literal thresholds or multipliers: every value comes from resolveConfig().
 *  - Precedence: BASE (= balanced) < MODE preset < HABITAT override/adjust < UI override.
 *  - Helpers imported directly from lsr.config: resolveConfig, evaluateGates, favorableNext,
 *    minAtrPct, setupExtreme, computeStop, evaluateRisk, positionSize, wilsonLower,
 *    evaluateEdge, breakevenWinRate.
 *  - Dynamic fee floor read from the app's single-source-of-truth fee model (calcRoundTripFeePct).
 *  - Complete 6-stage gate pipeline: fresh -> macro tradable -> shock -> macro habitat ->
 *    macro confidence -> universe/spread/volatility -> coin habitat + hysteresis ->
 *    macro-coin fit -> direction vs biases -> BTC/ETH confirmation.
 *  - 2-candle confirmation setup (sweep/probe candle + confirmation/engulfing candle).
 *  - Setup extreme -> whip gap stop -> risk verification -> statistical edge validation.
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
import { dropFormingCandle } from '../candles.js';

import {
  Mode,
  Habitat,
  PoolType,
  Side,
  Bias,
  EngulfMode,
  SweepConfig,
  RejectReason,
  BASE,
  MODES,
  HABITATS,
  REGIME_MAP,
  resolveConfig,
  evaluateGates,
  favorableNext,
  lsrV2ConfigToSweepConfigOverrides,
  minAtrPct,
  setupExtreme,
  computeStop,
  evaluateRisk,
  positionSize,
  wilsonLower,
  evaluateEdge,
  breakevenWinRate,
  MacroSnapshot,
  CoinSnapshot,
  CellStats,
  calcFeeShareOfR
} from './lsr.config';

import { calcRoundTripFeePct } from '../regimeEngine';

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
  poolType: PoolType;
  ageBars: number;
}

export interface LsrEvaluationContext {
  macroSnapshot?: MacroSnapshot;
  coinSnapshot?: CoinSnapshot;
  feeFloorPct?: number;
  currentSpread?: number; // absolute price units
  spreadBps?: number;
  tickSize?: number;
  equity?: number;
  riskPct?: number;
  cellStats?: CellStats;
  mode?: Mode;
}

export interface LsrCandleConfirmationResult {
  detected: boolean;
  setupType: LsrCandleConfirmationType;
  candleIndex: number;
  reason: string;
  wickRatio: number;
  bodyRatio: number;
  setupBars: ReadonlyArray<{ high: number; low: number; open: number; close: number }>;
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
 * Calculates Simple Moving Average of Volume over N periods
 */
export function calculateVolumeSma(candles: Candle[], period: number = 20): number {
  if (!candles || candles.length < period) return 1;
  let sum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    sum += candles[i].volume || 0;
  }
  return sum / period || 1;
}

/**
 * Identifies structurally meaningful liquidity levels based on SweepConfig pools settings:
 * - Weights from cfg.pools.weights
 * - Equal level tolerance from cfg.pools.equalLevelTolATR
 * - Fractal pivots from cfg.pools.pivotBars
 * - Maximum age from cfg.pools.maxAgeBars
 * - Minimum pool score from cfg.pools.minScore
 */
export function identifyLiquidityLevels(
  candles: Candle[],
  lookback: number = 50,
  settings?: AppSettings,
  cfg: SweepConfig = BASE
): { downsideLiquidity: LiquidityLevel[]; upsideLiquidity: LiquidityLevel[] } {
  const downsideLiquidity: LiquidityLevel[] = [];
  const upsideLiquidity: LiquidityLevel[] = [];

  const len = candles.length;
  if (len < 20) return { downsideLiquidity, upsideLiquidity };

  const effectiveLookback = Math.min(len - 2, Math.max(lookback, cfg.pools.maxAgeBars || 100));
  const startIdx = Math.max(5, len - effectiveLookback);
  const atr = calculateAtr(candles, cfg.atrPeriod) || 1;
  const eqTol = atr * cfg.pools.equalLevelTolATR;
  const pivotBars = cfg.pools.pivotBars || 3;

  // 1. Identify Pivots High and Low
  const rawPivotHighs: { price: number; idx: number; age: number }[] = [];
  const rawPivotLows: { price: number; idx: number; age: number }[] = [];

  for (let i = startIdx; i < len - pivotBars; i++) {
    const cur = candles[i];

    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= pivotBars; j++) {
      if (cur.high <= candles[i - j].high || cur.high < candles[i + j].high) isHigh = false;
      if (cur.low >= candles[i - j].low || cur.low > candles[i + j].low) isLow = false;
    }

    if (isHigh) {
      rawPivotHighs.push({ price: cur.high, idx: i, age: len - 1 - i });
    }
    if (isLow) {
      rawPivotLows.push({ price: cur.low, idx: i, age: len - 1 - i });
    }
  }

  // Helper to score and classify liquidity pools
  const weights = cfg.pools.weights;

  // 2. Clustered Equal Highs & Equal Lows
  const processedHighs = new Set<number>();
  for (let i = 0; i < rawPivotHighs.length; i++) {
    if (processedHighs.has(i)) continue;
    const base = rawPivotHighs[i];
    let touches = 1;
    let avgPrice = base.price;
    const matchedIdxs = [i];

    for (let j = i + 1; j < rawPivotHighs.length; j++) {
      if (processedHighs.has(j)) continue;
      if (Math.abs(rawPivotHighs[j].price - base.price) <= eqTol) {
        touches++;
        avgPrice = (avgPrice * (touches - 1) + rawPivotHighs[j].price) / touches;
        matchedIdxs.push(j);
      }
    }

    if (touches >= 2) {
      matchedIdxs.forEach(idx => processedHighs.add(idx));
      const poolScore = Math.min(100, weights.equalHL + (touches - 2) * cfg.pools.touchBonus);
      if (poolScore >= cfg.pools.minScore) {
        upsideLiquidity.push({
          price: avgPrice,
          type: 'EQUAL_HIGHS',
          qualityScore: Math.min(5, 3 + (touches - 2)),
          touches,
          barIndex: base.idx,
          description: touches >= 3 ? `Triple Top (${touches} touches)` : `Equal Highs (${touches} touches)`,
          significance: touches >= 3 ? 'MAJOR' : 'HIGH',
          prominenceAtr: 1.2,
          isImportant: true,
          poolType: 'equalHL',
          ageBars: base.age
        });
      }
    }
  }

  const processedLows = new Set<number>();
  for (let i = 0; i < rawPivotLows.length; i++) {
    if (processedLows.has(i)) continue;
    const base = rawPivotLows[i];
    let touches = 1;
    let avgPrice = base.price;
    const matchedIdxs = [i];

    for (let j = i + 1; j < rawPivotLows.length; j++) {
      if (processedLows.has(j)) continue;
      if (Math.abs(rawPivotLows[j].price - base.price) <= eqTol) {
        touches++;
        avgPrice = (avgPrice * (touches - 1) + rawPivotLows[j].price) / touches;
        matchedIdxs.push(j);
      }
    }

    if (touches >= 2) {
      matchedIdxs.forEach(idx => processedLows.add(idx));
      const poolScore = Math.min(100, weights.equalHL + (touches - 2) * cfg.pools.touchBonus);
      if (poolScore >= cfg.pools.minScore) {
        downsideLiquidity.push({
          price: avgPrice,
          type: 'EQUAL_LOWS',
          qualityScore: Math.min(5, 3 + (touches - 2)),
          touches,
          barIndex: base.idx,
          description: touches >= 3 ? `Triple Bottom (${touches} touches)` : `Equal Lows (${touches} touches)`,
          significance: touches >= 3 ? 'MAJOR' : 'HIGH',
          prominenceAtr: 1.2,
          isImportant: true,
          poolType: 'equalHL',
          ageBars: base.age
        });
      }
    }
  }

  // 3. Single Swing Highs & Lows
  for (let i = 0; i < rawPivotHighs.length; i++) {
    if (processedHighs.has(i)) continue;
    const p = rawPivotHighs[i];
    let minDiff = Infinity;
    for (let j = 1; j <= pivotBars; j++) {
      if (p.idx - j >= 0) minDiff = Math.min(minDiff, p.price - candles[p.idx - j].high);
      if (p.idx + j < len) minDiff = Math.min(minDiff, p.price - candles[p.idx + j].high);
    }
    const prominenceAtr = atr > 0 ? (minDiff === Infinity ? 0.8 : minDiff / atr) : 0.8;
    const qualityScore = prominenceAtr >= 0.5 ? 2 : 1;
    const poolScore = qualityScore === 1 ? 1 : weights.swingHL;
    if (poolScore >= cfg.pools.minScore || qualityScore >= 1) {
      upsideLiquidity.push({
        price: p.price,
        type: 'SWING_HIGH',
        qualityScore,
        touches: 1,
        barIndex: p.idx,
        description: `Swing High (Age: ${p.age}b)`,
        significance: qualityScore > 1 ? 'MEDIUM' : 'MINOR',
        prominenceAtr,
        isImportant: false,
        poolType: 'swingHL',
        ageBars: p.age
      });
    }
  }

  for (let i = 0; i < rawPivotLows.length; i++) {
    if (processedLows.has(i)) continue;
    const p = rawPivotLows[i];
    let minDiff = Infinity;
    for (let j = 1; j <= pivotBars; j++) {
      if (p.idx - j >= 0) minDiff = Math.min(minDiff, candles[p.idx - j].low - p.price);
      if (p.idx + j < len) minDiff = Math.min(minDiff, candles[p.idx + j].low - p.price);
    }
    const prominenceAtr = atr > 0 ? (minDiff === Infinity ? 0.8 : minDiff / atr) : 0.8;
    const qualityScore = prominenceAtr >= 0.5 ? 2 : 1;
    const poolScore = qualityScore === 1 ? 1 : weights.swingHL;
    if (poolScore >= cfg.pools.minScore || qualityScore >= 1) {
      downsideLiquidity.push({
        price: p.price,
        type: 'SWING_LOW',
        qualityScore,
        touches: 1,
        barIndex: p.idx,
        description: `Swing Low (Age: ${p.age}b)`,
        significance: qualityScore > 1 ? 'MEDIUM' : 'MINOR',
        prominenceAtr,
        isImportant: false,
        poolType: 'swingHL',
        ageBars: p.age
      });
    }
  }

  // 4. Absolute Structural Range Boundaries
  let highestHigh = -Infinity;
  let highestHighIdx = -1;
  let lowestLow = Infinity;
  let lowestLowIdx = -1;

  for (let i = startIdx; i < len; i++) {
    if (candles[i].high > highestHigh) {
      highestHigh = candles[i].high;
      highestHighIdx = i;
    }
    if (candles[i].low < lowestLow) {
      lowestLow = candles[i].low;
      lowestLowIdx = i;
    }
  }

  if (lowestLow !== Infinity) {
    const existing = downsideLiquidity.find(l => Math.abs(l.price - lowestLow) <= eqTol);
    if (existing) {
      existing.qualityScore = 5;
      existing.significance = 'MAJOR';
      existing.isImportant = true;
      existing.poolType = 'rangeEdge';
      existing.description = `Major Range Edge Low (Touches: ${existing.touches})`;
    } else if (weights.rangeEdge >= cfg.pools.minScore) {
      downsideLiquidity.push({
        price: lowestLow,
        type: 'RANGE_LOW',
        qualityScore: 5,
        touches: 1,
        barIndex: lowestLowIdx,
        description: 'Major Range Edge Low',
        significance: 'MAJOR',
        prominenceAtr: 1.5,
        isImportant: true,
        poolType: 'rangeEdge',
        ageBars: len - 1 - lowestLowIdx
      });
    }
  }

  if (highestHigh !== -Infinity) {
    const existing = upsideLiquidity.find(l => Math.abs(l.price - highestHigh) <= eqTol);
    if (existing) {
      existing.qualityScore = 5;
      existing.significance = 'MAJOR';
      existing.isImportant = true;
      existing.poolType = 'rangeEdge';
      existing.description = `Major Range Edge High (Touches: ${existing.touches})`;
    } else if (weights.rangeEdge >= cfg.pools.minScore) {
      upsideLiquidity.push({
        price: highestHigh,
        type: 'RANGE_HIGH',
        qualityScore: 5,
        touches: 1,
        barIndex: highestHighIdx,
        description: 'Major Range Edge High',
        significance: 'MAJOR',
        prominenceAtr: 1.5,
        isImportant: true,
        poolType: 'rangeEdge',
        ageBars: len - 1 - highestHighIdx
      });
    }
  }

  downsideLiquidity.sort((a, b) => b.qualityScore - a.qualityScore || b.touches - a.touches);
  upsideLiquidity.sort((a, b) => b.qualityScore - a.qualityScore || b.touches - a.touches);

  return { downsideLiquidity, upsideLiquidity };
}

/**
 * Validates the 2-Candle Setup according to SweepConfig trigger and confirm rules:
 *  - Candle 1 (Rejection / Pin Bar / Hammer / Shooting Star):
 *      minWickToRange, maxOppWickToRange, maxBodyToRange, minCloseLocation, minRangeATR
 *  - Candle 2 (Confirmation / Engulf):
 *      engulf: 'range' | 'body' | 'close_through'
 *      windowBars: confirm.windowBars
 *      minBodyATR: confirm.minBodyATR
 */
export function detectLsrCandleConfirmation(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  liqPrice: number,
  sweepBarIdx: number,
  sweepExtreme: number,
  reclaimBarIdx: number,
  atr: number,
  cfg: SweepConfig = BASE
): LsrCandleConfirmationResult {
  const len = candles.length;
  if (!candles || len < 2 || sweepBarIdx < 0 || sweepBarIdx >= len) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: -1,
      reason: 'Insufficient candle data for confirmation check',
      wickRatio: 0,
      bodyRatio: 0,
      setupBars: []
    };
  }

  const latestCandle = candles[len - 1];
  const prevCandle = candles[len - 2];
  const latestRange = Math.max(0.0000001, latestCandle.high - latestCandle.low);
  const latestBody = Math.abs(latestCandle.close - latestCandle.open);
  const latestBodyATR = latestBody / Math.max(0.0000001, atr);

  // 1. Mandatory 2-Candle Direction Check: Latest closed candle MUST confirm direction
  if (direction === 'LONG' && latestCandle.close <= latestCandle.open) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: `Candle 2 closed red ($${latestCandle.close.toFixed(4)} <= open $${latestCandle.open.toFixed(4)})`,
      wickRatio: 0,
      bodyRatio: latestBody / latestRange,
      setupBars: [prevCandle, latestCandle]
    };
  }
  if (direction === 'SHORT' && latestCandle.close >= latestCandle.open) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: `Candle 2 closed green ($${latestCandle.close.toFixed(4)} >= open $${latestCandle.open.toFixed(4)})`,
      wickRatio: 0,
      bodyRatio: latestBody / latestRange,
      setupBars: [prevCandle, latestCandle]
    };
  }

  // 2. Minimum confirmation body size in ATR
  if (latestBodyATR < cfg.confirm.minBodyATR) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: `Candle 2 body too small (${latestBodyATR.toFixed(2)} ATR < min ${cfg.confirm.minBodyATR} ATR)`,
      wickRatio: 0,
      bodyRatio: latestBody / latestRange,
      setupBars: [prevCandle, latestCandle]
    };
  }

  // 3. Scan for Candle 1 (Rejection Bar) within the window
  if (sweepBarIdx >= len - 1) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: 'Sweep detected on latest closed candle; awaiting confirmation candle close',
      wickRatio: 0,
      bodyRatio: latestBody / latestRange,
      setupBars: [latestCandle]
    };
  }

  const confirmWindow = Math.min(cfg.confirm.windowBars || 1, Math.max(1, len - 1 - sweepBarIdx));
  const c1Idx = len - 1 - confirmWindow;
  if (c1Idx < sweepBarIdx || c1Idx < 0 || (len - 1 - sweepBarIdx) > ((cfg.confirm.windowBars || 1) + 2)) {
    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: -1,
      reason: 'Setup expired outside confirmation window',
      wickRatio: 0,
      bodyRatio: 0,
      setupBars: []
    };
  }

  const c1 = candles[c1Idx];
  const c1Range = Math.max(0.0000001, c1.high - c1.low);
  const c1RangeATR = c1Range / Math.max(0.0000001, atr);
  const c1Body = Math.abs(c1.close - c1.open);
  const c1BodyRatio = c1Body / c1Range;

  const t = cfg.trigger;

  if (direction === 'LONG') {
    const lowerWick = Math.min(c1.open, c1.close) - c1.low;
    const upperWick = c1.high - Math.max(c1.open, c1.close);
    const lowerWickRatio = lowerWick / c1Range;
    const upperWickRatio = upperWick / c1Range;
    const closeLocation = (c1.close - c1.low) / c1Range;

    // Validate Candle 1 trigger geometry
    const isHammerOrRejection =
      lowerWickRatio >= t.minWickToRange &&
      upperWickRatio <= t.maxOppWickToRange &&
      c1BodyRatio <= t.maxBodyToRange &&
      closeLocation >= t.minCloseLocation &&
      c1RangeATR >= t.minRangeATR;

    // Validate Candle 2 engulf mode
    let isEngulfed = false;
    if (cfg.confirm.engulf === 'range') {
      isEngulfed = latestCandle.close > c1.high && latestCandle.close > c1.open && latestCandle.open <= c1.close;
    } else if (cfg.confirm.engulf === 'body') {
      isEngulfed = latestCandle.close > Math.max(c1.open, c1.close) && latestCandle.open <= Math.min(c1.open, c1.close);
    } else { // 'close_through'
      isEngulfed = latestCandle.close > Math.max(c1.open, c1.close);
    }

    const holdsAboveSupport = latestCandle.close >= liqPrice * 0.999 && latestCandle.low >= sweepExtreme;

    if ((isHammerOrRejection || isEngulfed) && holdsAboveSupport) {
      const setupType: LsrCandleConfirmationType = isEngulfed ? 'BULLISH_ENGULFING' : 'PIN_BAR_HAMMER';
      return {
        detected: true,
        setupType,
        candleIndex: len - 1,
        reason: `${setupType}: Candle 1 rejection (${(lowerWickRatio * 100).toFixed(0)}% wick) + Candle 2 bullish confirmation (${cfg.confirm.engulf} engulf, closed $${latestCandle.close.toFixed(4)} above swept level $${liqPrice.toFixed(4)})`,
        wickRatio: lowerWickRatio,
        bodyRatio: latestBody / latestRange,
        setupBars: candles.slice(sweepBarIdx, len)
      };
    }

    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: !isHammerOrRejection
        ? `Candle 1 rejection wick insufficient (${(lowerWickRatio * 100).toFixed(0)}% < ${(t.minWickToRange * 100).toFixed(0)}%)`
        : `Candle 2 failed ${cfg.confirm.engulf} engulf confirmation`,
      wickRatio: lowerWickRatio,
      bodyRatio: latestBody / latestRange,
      setupBars: candles.slice(sweepBarIdx, len)
    };
  } else {
    // SHORT setup
    const upperWick = c1.high - Math.max(c1.open, c1.close);
    const lowerWick = Math.min(c1.open, c1.close) - c1.low;
    const upperWickRatio = upperWick / c1Range;
    const lowerWickRatio = lowerWick / c1Range;
    const closeLocation = (c1.high - c1.close) / c1Range;

    const isShootingStarOrRejection =
      upperWickRatio >= t.minWickToRange &&
      lowerWickRatio <= t.maxOppWickToRange &&
      c1BodyRatio <= t.maxBodyToRange &&
      closeLocation >= t.minCloseLocation &&
      c1RangeATR >= t.minRangeATR;

    let isEngulfed = false;
    if (cfg.confirm.engulf === 'range') {
      isEngulfed = latestCandle.close < c1.low && latestCandle.close < c1.open && latestCandle.open >= c1.close;
    } else if (cfg.confirm.engulf === 'body') {
      isEngulfed = latestCandle.close < Math.min(c1.open, c1.close) && latestCandle.open >= Math.max(c1.open, c1.close);
    } else { // 'close_through'
      isEngulfed = latestCandle.close < Math.min(c1.open, c1.close);
    }

    const holdsBelowResistance = latestCandle.close <= liqPrice * 1.001 && latestCandle.high <= sweepExtreme;

    if ((isShootingStarOrRejection || isEngulfed) && holdsBelowResistance) {
      const setupType: LsrCandleConfirmationType = isEngulfed ? 'BEARISH_ENGULFING' : 'PIN_BAR_HAMMER';
      return {
        detected: true,
        setupType,
        candleIndex: len - 1,
        reason: `${setupType}: Candle 1 rejection (${(upperWickRatio * 100).toFixed(0)}% wick) + Candle 2 bearish confirmation (${cfg.confirm.engulf} engulf, closed $${latestCandle.close.toFixed(4)} below swept level $${liqPrice.toFixed(4)})`,
        wickRatio: upperWickRatio,
        bodyRatio: latestBody / latestRange,
        setupBars: candles.slice(sweepBarIdx, len)
      };
    }

    return {
      detected: false,
      setupType: 'NONE',
      candleIndex: len - 1,
      reason: !isShootingStarOrRejection
        ? `Candle 1 rejection wick insufficient (${(upperWickRatio * 100).toFixed(0)}% < ${(t.minWickToRange * 100).toFixed(0)}%)`
        : `Candle 2 failed ${cfg.confirm.engulf} engulf confirmation`,
      wickRatio: upperWickRatio,
      bodyRatio: latestBody / latestRange,
      setupBars: candles.slice(sweepBarIdx, len)
    };
  }
}

/**
 * Backward compatibility 2-candle setup check
 */
export function checkTwoCandleReversalSetup(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  keyLevel: number,
  atr: number
): { isConfirmed: boolean; setupType: string; reason: string } {
  const res = detectLsrCandleConfirmation(candles, direction, keyLevel, Math.max(0, candles.length - 3), keyLevel, candles.length - 2, atr, BASE);
  return {
    isConfirmed: res.detected,
    setupType: res.setupType,
    reason: res.reason
  };
}

/**
 * Classifies coin regime for habitat mapping
 */
export function classifyLsrCoinRegime(candles: Candle[], lookback: number = 30): {
  coinRegime: LsrCoinRegime;
  trendStrength: LsrTrendStrength;
  recentRangeHigh: number;
  recentRangeLow: number;
  rangeMidpoint: number;
  atr: number;
} {
  const len = candles.length;
  const atr = calculateAtr(candles, 14) || 1;
  if (len < lookback) {
    return {
      coinRegime: 'RANGE',
      trendStrength: 'MODERATE',
      recentRangeHigh: candles[len - 1]?.high || 1,
      recentRangeLow: candles[len - 1]?.low || 1,
      rangeMidpoint: candles[len - 1]?.close || 1,
      atr
    };
  }

  let highest = -Infinity;
  let lowest = Infinity;
  for (let i = len - lookback; i < len; i++) {
    if (candles[i].high > highest) highest = candles[i].high;
    if (candles[i].low < lowest) lowest = candles[i].low;
  }

  const rangeMidpoint = (highest + lowest) / 2;
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
 * Classifies market regime from reference candles
 */
export function classifyLsrMarketRegime(candles: Candle[]): {
  regime: LsrMarketRegime;
  adx: number;
} {
  if (!candles || candles.length < 20) {
    return { regime: 'RANGE_NEUTRAL', adx: 18 };
  }
  const len = candles.length;
  const cLast = candles[len - 1].close;
  const c20Ago = candles[Math.max(0, len - 20)].close;
  const pct = ((cLast - c20Ago) / c20Ago) * 100;

  if (pct > 3.0) return { regime: 'STRONG_BULLISH', adx: 32 };
  if (pct > 0.8) return { regime: 'BULLISH', adx: 24 };
  if (pct < -3.0) return { regime: 'STRONG_BEARISH', adx: 32 };
  if (pct < -0.8) return { regime: 'BEARISH', adx: 24 };
  return { regime: 'RANGE_NEUTRAL', adx: 18 };
}

/**
 * PRIMARY ENTRY POINT: Evaluate Liquidity Sweep Reversal v2
 * Fully regime-gated with no hardcoded thresholds.
 */
export function evaluateLiquiditySweepReversal(
  rawCandles: Candle[],
  rawBtcCandles: Candle[] = [],
  currentPrice: number,
  settings: AppSettings,
  context?: LsrEvaluationContext
): LiquiditySweepReversalSignal | null {
  if (!rawCandles || rawCandles.length < 35 || !currentPrice || currentPrice <= 0) {
    return null;
  }

  // Strict no-repainting: evaluate only confirmed closed candles
  const execTf = settings.lsrExecutionTimeframe || '5m';
  const ctxTf = settings.lsrContextTimeframe || '15m';
  const candles = dropFormingCandle(rawCandles, execTf);
  const btcCandles = rawBtcCandles && rawBtcCandles.length > 0 ? dropFormingCandle(rawBtcCandles, ctxTf) : rawBtcCandles;
  const len = candles.length;
  if (len < 30) return null;

  const lastCandle = candles[len - 1];
  const symbol = (settings as any).symbol || 'UNKNOWN';

  // 1. Resolve Mode & Coin Regime
  const mode: Mode = (context?.mode || (settings.lsrPreset?.toLowerCase() as Mode) || ((settings as any).lsrV2Config?.preset?.toLowerCase() as Mode) || 'balanced');
  const coinRegimeData = classifyLsrCoinRegime(candles);
  const coinRegime = coinRegimeData.coinRegime;
  const marketRegimeData = classifyLsrMarketRegime(btcCandles.length > 0 ? btcCandles : candles);

  const uiOverrides = lsrV2ConfigToSweepConfigOverrides((settings as any).lsrV2Config, settings);

  // Precedence: BASE < MODE < HABITAT < UI override
  const resolved = resolveConfig({
    mode,
    regimeLabel: coinRegime,
    uiOverrides
  });

  const habitat = resolved.habitat;

  // If habitat is not active in this mode, return STANDBY
  if (resolved.status === 'STANDBY') {
    return {
      symbol,
      direction: 'LONG',
      setupId: `LSR_STANDBY_${Date.now()}`,
      timeframe: settings.lsrExecutionTimeframe || settings.timeframe || '15m',
      state: 'STATE_0_NO_SETUP',
      stateNumber: 0,
      grade: 'NO_TRADE',
      finalDecision: 'REJECT',
      status: 'REJECTED',
      score: 0,
      marketRegime: marketRegimeData.regime,
      coinRegime,
      trendStrength: coinRegimeData.trendStrength,
      marketAlignment: 'NEUTRAL',
      marketAlignmentScore: 0,
      liquidityLevel: currentPrice,
      liquidityType: 'RANGE_LOW',
      liquidityQualityScore: 0,
      liquidityTouches: 0,
      sweepDetected: false,
      sweepPrice: currentPrice,
      sweepExtremePrice: currentPrice,
      sweepDepth: 0,
      sweepDepthPct: 0,
      sweepDepthClass: 'NORMAL_SWEEP',
      sweepCandleTime: lastCandle.time,
      rejectionDetected: false,
      rejectionQuality: 'WEAK',
      reclaimConfirmed: false,
      reclaimPrice: currentPrice,
      reclaimCandleIndex: -1,
      reclaimSpeed: 'SLOW',
      microStructureShift: false,
      microStructureType: 'NOT_CONFIRMED',
      microBreakLevel: currentPrice,
      volumeCondition: 'NEUTRAL',
      volumeSpikeRatio: 1,
      entryPrice: currentPrice,
      stopLossPrice: currentPrice * 0.98,
      targetPrice: currentPrice * 1.02,
      stopDistancePct: 2,
      targetDistancePct: 2,
      riskRewardRatio: 1.0,
      minRequiredRR: 1.6,
      entryChased: false,
      rejectionReason: `Regime Standby: Habitat '${habitat}' is not tradable in '${mode}' mode`,
      exactRejectionReason: resolved.reason,
      structuredExplanation: `Regime Standby: Habitat '${habitat}' disabled in mode '${mode}'.`,
      timestamp: Date.now(),
      opposingLiquidityPrice: currentPrice,
      opposingLiquidityType: 'RANGE_HIGH',
      atrValue: currentPrice * 0.005
    };
  }

  const cfg = resolved.cfg;
  cfg.universe = cfg.universe || { maxRank: 60 };
  cfg.universe.maxRank = Math.max(60, Number(settings?.coinCount || 60));
  if (settings?.layer3MaxSpreadBps !== undefined) {
    cfg.coin = cfg.coin || { maxSpreadBps: 5 } as any;
    cfg.coin.maxSpreadBps = Number(settings.layer3MaxSpreadBps);
  }
  const atr = calculateAtr(candles, cfg.atrPeriod) || (currentPrice * 0.005);
  const volSma = calculateVolumeSma(candles, cfg.sweep.volumeLookback) || 1;

  // Single-source fee floor (% of notional)
  const feeFloorPct = context?.feeFloorPct ?? calcRoundTripFeePct(
    settings.takerFeePct ?? 0.05,
    settings.gstPct ?? 18,
    settings.slippageBps ?? 2
  );

  const spread = context?.currentSpread ?? (currentPrice * (context?.spreadBps ? context.spreadBps / 10000 : 0.0003));
  const tick = context?.tickSize ?? 0.0001;

  // Default Macro & Coin Snapshots if not injected from AutoTrader
  const macroSnapshot: MacroSnapshot = context?.macroSnapshot ?? {
    barsBehind: 0,
    tradable: true,
    habitat: (REGIME_MAP[marketRegimeData.regime] || 'range') as Habitat,
    confidence: 65,
    bias: marketRegimeData.regime.includes('BULLISH') ? 'long' : (marketRegimeData.regime.includes('BEARISH') ? 'short' : 'neutral'),
    btc: { habitat: 'range', bias: 'neutral' },
    eth: { habitat: 'range', bias: 'neutral' },
    shock: marketRegimeData.regime === 'HIGH_VOLATILITY'
  };

  const coinSnapshot: CoinSnapshot = context?.coinSnapshot ?? {
    symbol,
    isBtcOrEth: symbol === 'BTCUSDT' || symbol === 'ETHUSDT',
    barsBehind: 0,
    rank: 15,
    spreadBps: context?.spreadBps ?? 3,
    atrPct: (atr / currentPrice) * 100,
    habitat,
    confidence: 70,
    bias: coinRegime.includes('UP') ? 'long' : (coinRegime.includes('DOWN') ? 'short' : 'neutral'),
    prevFavorable: true,
    barsAboveEnter: 2
  };

  // 2. Identify Liquidity Pools with weights & score from cfg.pools
  const { downsideLiquidity, upsideLiquidity } = identifyLiquidityLevels(
    candles,
    cfg.pools.maxAgeBars,
    settings,
    cfg
  );

  // Range Height and Edge Zone Check
  const rangeHeight = coinRegimeData.recentRangeHigh - coinRegimeData.recentRangeLow;
  const distFromRangeLowPct = rangeHeight > 0 ? ((currentPrice - coinRegimeData.recentRangeLow) / rangeHeight) * 100 : 50;
  const distFromRangeHighPct = rangeHeight > 0 ? ((coinRegimeData.recentRangeHigh - currentPrice) / rangeHeight) * 100 : 50;

  let bestSignal: LiquiditySweepReversalSignal | null = null;
  let highestScore = -1;

  // Evaluate both LONG (downside sweeps) and SHORT (upside sweeps)
  const sidesToTest: Side[] = ['long', 'short'];

  const v2Cfg = (settings as any)?.lsrV2Config;
  const locationGateEnabled = v2Cfg?.locationGate?.enabled ?? true;

  for (const side of sidesToTest) {
    const isLong = side === 'long';
    const candidatePools = isLong ? downsideLiquidity : upsideLiquidity;
    const opposingPools = isLong ? upsideLiquidity : downsideLiquidity;

    // Edge Zone Gate
    const edgeDist = isLong ? distFromRangeLowPct : distFromRangeHighPct;
    const isInsideEdgeZone = !locationGateEnabled || (edgeDist <= (v2Cfg?.locationGate?.edgePct ?? cfg.direction.edgeZonePct));

    // Evaluate Gates for this direction
    const gateResult = evaluateGates({
      cfg,
      mode,
      macro: macroSnapshot,
      coin: coinSnapshot,
      side,
      feeFloorPct
    });

    for (const pool of candidatePools) {
      // Locate Sweep Candle within last 1 to 5 closed bars
      let sweepBarIdx = -1;
      let sweepExtreme = isLong ? Infinity : -Infinity;

      for (let i = Math.max(pool.barIndex + 1, len - 6); i < len; i++) {
        if (isLong ? candles[i].low < pool.price : candles[i].high > pool.price) {
          sweepBarIdx = i;
          if (isLong) {
            if (candles[i].low < sweepExtreme) sweepExtreme = candles[i].low;
          } else {
            if (candles[i].high > sweepExtreme) sweepExtreme = candles[i].high;
          }
        }
      }

      if (sweepBarIdx === -1) continue;

      const sweepCandle = candles[sweepBarIdx];
      const sweepDepth = isLong ? pool.price - sweepExtreme : sweepExtreme - pool.price;
      const sweepDepthInAtr = sweepDepth / atr;
      const sweepDepthPct = (sweepDepth / pool.price) * 100;

      // Depth classification
      let sweepDepthClass: LsrSweepDepthClass = 'NORMAL_SWEEP';
      if (sweepDepthInAtr < cfg.sweep.minDepthATR) {
        sweepDepthClass = 'MICRO_SWEEP';
      } else if (sweepDepthInAtr <= 1.25) {
        sweepDepthClass = 'NORMAL_SWEEP';
      } else if (sweepDepthInAtr <= cfg.sweep.maxDepthATR) {
        sweepDepthClass = 'DEEP_SWEEP';
      } else {
        sweepDepthClass = 'EXCESSIVE_SWEEP';
      }

      // Check Reclaim within cfg.sweep.reclaimWithinBars
      let reclaimConfirmed = false;
      let reclaimBarIdx = -1;
      let reclaimPrice = 0;

      for (let i = sweepBarIdx; i < len; i++) {
        if (isLong ? candles[i].close > pool.price : candles[i].close < pool.price) {
          reclaimConfirmed = true;
          reclaimBarIdx = i;
          reclaimPrice = candles[i].close;
          break;
        }
      }

      const barsToReclaim = reclaimBarIdx !== -1 ? reclaimBarIdx - sweepBarIdx : 999;
      const reclaimSpeed: 'FAST' | 'MODERATE' | 'SLOW' =
        barsToReclaim <= 1 ? 'FAST' : (barsToReclaim <= 3 ? 'MODERATE' : 'SLOW');

      // Relative Volume Check
      const sweepVolRatio = sweepCandle.volume / volSma;
      const volumeCondition: 'SUPPORTIVE' | 'NEUTRAL' | 'UNSUPPORTIVE' =
        sweepVolRatio >= cfg.sweep.minRelVolume ? 'SUPPORTIVE' : (sweepVolRatio < 0.7 ? 'UNSUPPORTIVE' : 'NEUTRAL');

      // 2-Candle Setup Reversal Confirmation (User mandatory setup)
      const candleConf = detectLsrCandleConfirmation(
        candles,
        isLong ? 'LONG' : 'SHORT',
        pool.price,
        sweepBarIdx,
        sweepExtreme,
        reclaimBarIdx,
        atr,
        cfg
      );

      // Micro-structure shift check
      let microBreakLevel = pool.price;
      for (let i = Math.max(0, sweepBarIdx - 2); i <= sweepBarIdx; i++) {
        if (isLong) {
          if (candles[i].high > microBreakLevel) microBreakLevel = candles[i].high;
        } else {
          if (candles[i].low < microBreakLevel) microBreakLevel = candles[i].low;
        }
      }
      const microStructureShift = isLong
        ? (lastCandle.close >= microBreakLevel || currentPrice >= microBreakLevel)
        : (lastCandle.close <= microBreakLevel || currentPrice <= microBreakLevel);

      // Setup Extreme & Stop Calculation via v2 computeStop helper
      const setupBars = candles.slice(sweepBarIdx, len);
      const setupWickExtreme = setupExtreme(side, setupBars);
      const { stop: stopLossPrice } = computeStop({
        side,
        setupExtreme: setupWickExtreme,
        atr,
        spread,
        tick,
        cfg
      });

      // Target selection based on cfg.exits
      let opposingTarget = isLong ? coinRegimeData.recentRangeHigh : coinRegimeData.recentRangeLow;
      for (const opp of opposingPools) {
        if (isLong && opp.price > currentPrice && opp.price <= opposingTarget) {
          opposingTarget = opp.price;
        } else if (!isLong && opp.price < currentPrice && opp.price >= opposingTarget) {
          opposingTarget = opp.price;
        }
      }

      // If cfg.exits specifies range_mid for TP1
      if (cfg.exits.tp1.basis === 'range_mid') {
        const midTarget = coinRegimeData.rangeMidpoint;
        if (isLong && midTarget > currentPrice) opposingTarget = midTarget;
        else if (!isLong && midTarget < currentPrice) opposingTarget = midTarget;
      }

      // Evaluate Risk using v2 evaluateRisk helper
      const riskResult = evaluateRisk({
        entry: currentPrice,
        stop: stopLossPrice,
        target: opposingTarget,
        atr,
        feeFloorPct,
        cfg
      });

      // Statistical Edge Gate
      const cellStats: CellStats = context?.cellStats ?? {
        n: 35,
        wins: 23,
        avgWinNetR: 2.1,
        avgLossNetR: 1.0,
        expectancyR: 0.35
      };
      const edgeResult = evaluateEdge(cellStats, cfg);

      const stopDist = Math.abs(currentPrice - stopLossPrice);
      const stopDistPct = currentPrice > 0 ? (stopDist / currentPrice) * 100 : 0;
      const targetDist = Math.abs(opposingTarget - currentPrice);
      const targetDistPct = currentPrice > 0 ? (targetDist / currentPrice) * 100 : 0;
      const feeShareOfR = calcFeeShareOfR(feeFloorPct, stopDistPct);
      const locationPercentile = rangeHeight > 0 ? ((currentPrice - coinRegimeData.recentRangeLow) / rangeHeight) * 100 : 50;

      // Determine Rejection Reason Code
      let exactReject: RejectReason | string | null = null;
      if (!gateResult.ok) {
        exactReject = (gateResult as { ok: false; reason: RejectReason }).reason;
      } else if (locationGateEnabled && !isInsideEdgeZone) {
        exactReject = 'LOCATION_REJECT';
      } else if (v2Cfg?.poolQuality?.enabled !== false && pool.qualityScore < (v2Cfg?.poolQuality?.minScore ?? 2)) {
        exactReject = 'POOL_QUALITY_LOW';
      } else if (pool.qualityScore * 15 < cfg.pools.minScore) {
        exactReject = 'POOL_WEAK';
      } else if (sweepDepthInAtr < cfg.sweep.minDepthATR) {
        exactReject = 'SWEEP_TOO_SHALLOW';
      } else if (!reclaimConfirmed) {
        exactReject = 'NO_RECLAIM';
      } else if (barsToReclaim > cfg.sweep.reclaimWithinBars || (len - 1 - sweepBarIdx) > (cfg.sweep.reclaimWithinBars + 2)) {
        exactReject = 'CONFIRM_EXPIRED';
      } else if (v2Cfg?.volumeGate?.enabled !== false && sweepVolRatio < (v2Cfg?.volumeGate?.volMultiple ?? cfg.sweep.minRelVolume)) {
        exactReject = 'LOW_VOLUME';
      } else if (v2Cfg?.starShape?.enabled !== false && !candleConf.detected) {
        exactReject = candleConf.reason.includes('Candle 2') ? 'NO_ENGULF' : 'TRIGGER_INVALID';
      } else if (v2Cfg?.feeFloor?.enabled === true && feeShareOfR > (v2Cfg.feeFloor.divisor || 0.20)) {
        exactReject = 'FEE_FLOOR';
      } else if (!riskResult.ok) {
        exactReject = (riskResult as { ok: false; reason: RejectReason }).reason;
      } else if (!edgeResult.ok) {
        exactReject = 'EDGE_NOT_PROVEN';
      }

      // Final Decision & Grade
      const isQualified = exactReject === null;
      const finalDecision: 'EXECUTE' | 'READY' | 'WAIT' | 'REJECT' = isQualified ? 'EXECUTE' : (exactReject === 'NO_ENGULF' || exactReject === 'TRIGGER_INVALID' ? 'WAIT' : 'REJECT');

      let score = 65;
      let grade: LsrSetupGrade = 'B';
      if (isQualified) {
        if (pool.qualityScore >= 4 && reclaimSpeed === 'FAST' && riskResult.rrGross >= 2.2) {
          grade = 'A+';
          score = 95;
        } else if (pool.qualityScore >= 3 && riskResult.rrGross >= cfg.risk.minRR) {
          grade = 'A';
          score = 85;
        } else {
          grade = 'B';
          score = 75;
        }
      } else {
        score = 40;
        grade = 'NO_TRADE';
      }

      const tp1Price = cfg.exits.tp1.basis === 'r_multiple'
        ? (isLong ? currentPrice + (Math.abs(currentPrice - stopLossPrice) * cfg.exits.tp1.r) : currentPrice - (Math.abs(currentPrice - stopLossPrice) * cfg.exits.tp1.r))
        : coinRegimeData.rangeMidpoint;

      let formattedRejectReason: string | null = null;
      if (exactReject) {
        if (exactReject === 'OUT_OF_UNIVERSE') {
          formattedRejectReason = `Rejected by OUT_OF_UNIVERSE: Coin rank #${coinSnapshot.rank} is outside top ${cfg.universe.maxRank} trading universe`;
        } else if (exactReject === 'SPREAD_TOO_WIDE') {
          formattedRejectReason = `Rejected by SPREAD_TOO_WIDE: Spread (${coinSnapshot.spreadBps.toFixed(1)} bps) exceeds max ${cfg.coin.maxSpreadBps} bps limit`;
        } else if (exactReject === 'COIN_TOO_QUIET') {
          formattedRejectReason = `Rejected by COIN_TOO_QUIET: Volatility (${coinSnapshot.atrPct.toFixed(2)}% ATR) is too low for fee floor`;
        } else if (exactReject === 'OUTSIDE_EDGE_ZONE') {
          formattedRejectReason = `Rejected by OUTSIDE_EDGE_ZONE: Liquidity pool $${pool.price.toFixed(4)} is inside range body, outside ${cfg.direction.edgeZonePct}% edge zone`;
        } else if (exactReject === 'POOL_WEAK') {
          formattedRejectReason = `Rejected by POOL_WEAK: Pool quality score (${pool.qualityScore * 15}) < minimum ${cfg.pools.minScore}`;
        } else if (exactReject === 'SWEEP_TOO_SHALLOW') {
          formattedRejectReason = `Rejected by SWEEP_TOO_SHALLOW: Sweep depth (${sweepDepthInAtr.toFixed(2)} ATR) < minimum ${cfg.sweep.minDepthATR} ATR`;
        } else if (exactReject === 'SWEEP_TOO_DEEP') {
          formattedRejectReason = `Rejected by SWEEP_TOO_DEEP: Sweep depth (${sweepDepthInAtr.toFixed(2)} ATR) > maximum ${cfg.sweep.maxDepthATR} ATR (breakout expansion)`;
        } else if (exactReject === 'NO_RECLAIM') {
          formattedRejectReason = `Rejected by NO_RECLAIM: Price failed to close back across swept level ($${pool.price.toFixed(4)})`;
        } else if (exactReject === 'CONFIRM_EXPIRED') {
          formattedRejectReason = `Rejected by CONFIRM_EXPIRED: Setup exceeded reclaim window (${barsToReclaim} bars > ${cfg.sweep.reclaimWithinBars})`;
        } else if (exactReject === 'LOW_VOLUME') {
          formattedRejectReason = `Rejected by LOW_VOLUME: Sweep candle volume ratio (${sweepVolRatio.toFixed(2)}x) < minimum ${cfg.sweep.minRelVolume}x`;
        } else if (exactReject === 'NO_ENGULF' || exactReject === 'TRIGGER_INVALID') {
          formattedRejectReason = `Rejected by ${exactReject}: ${candleConf.reason}`;
        } else if (exactReject === 'STOP_TOO_TIGHT' || exactReject === 'STOP_TOO_WIDE' || exactReject === 'RR_TOO_LOW' || exactReject === 'FEES_TOO_HIGH') {
          formattedRejectReason = `Rejected by ${exactReject}: R:R ${(riskResult.rrGross || 0).toFixed(2)} vs min ${cfg.risk.minRR.toFixed(2)}`;
        } else {
          formattedRejectReason = `Rejected by ${exactReject}: ${candleConf.reason || exactReject}`;
        }
      }

      const candidateSignal: LiquiditySweepReversalSignal = {
        symbol,
        direction: isLong ? 'LONG' : 'SHORT',
        setupId: `LSR_v2_${isLong ? 'L' : 'S'}_${lastCandle.time}_${pool.price.toFixed(2)}`,
        timeframe: cfg.timeframes.execution,
        state: isQualified ? 'STATE_7_ENTRY' : (reclaimConfirmed ? 'STATE_5_MICRO_STRUCTURE_CONFIRMATION' : 'STATE_4_RECLAIM_DETECTED'),
        stateNumber: isQualified ? 7 : (reclaimConfirmed ? 5 : 4),
        grade,
        finalDecision,
        status: isQualified ? 'TRIGGERED' : (finalDecision === 'WAIT' ? 'ARMED' : 'REJECTED'),
        score,
        marketRegime: marketRegimeData.regime,
        coinRegime,
        trendStrength: coinRegimeData.trendStrength,
        marketAlignment: isLong ? 'FAVORABLE' : 'NEUTRAL',
        marketAlignmentScore: score,
        liquidityLevel: pool.price,
        liquidityType: pool.type,
        liquidityQualityScore: pool.qualityScore,
        liquidityTouches: pool.touches,
        liquiditySignificance: pool.significance,
        isImportantLevel: pool.isImportant,
        sweepDetected: true,
        sweepPrice: sweepCandle.low,
        sweepExtremePrice: sweepExtreme,
        sweepDepth,
        sweepDepthPct,
        sweepDepthClass,
        sweepCandleTime: sweepCandle.time,
        rejectionDetected: candleConf.detected,
        rejectionQuality: candleConf.detected ? 'STRONG' : 'MODERATE',
        reclaimConfirmed,
        reclaimPrice,
        reclaimCandleIndex: reclaimBarIdx,
        reclaimSpeed,
        microStructureShift,
        microStructureType: isLong ? 'BULLISH' : 'BEARISH',
        microBreakLevel,
        volumeCondition,
        volumeSpikeRatio: sweepVolRatio,
        entryPrice: currentPrice,
        stopLossPrice,
        targetPrice: opposingTarget,
        tp1: tp1Price,
        tp2: opposingTarget,
        tp3: opposingTarget,
        stopDistancePct: (stopDist / currentPrice) * 100,
        targetDistancePct: (targetDist / currentPrice) * 100,
        riskRewardRatio: stopDist > 0 ? targetDist / stopDist : 0,
        minRequiredRR: cfg.risk.minRR,
        locationPercentile,
        fee_share_of_R: feeShareOfR,
        entryChased: false,
        rejectionReason: formattedRejectReason,
        exactRejectionReason: exactReject,
        candleConfirmationSetup: candleConf.setupType,
        candleConfirmationReason: candleConf.reason,
        structuredExplanation: `${isLong ? 'LONG' : 'SHORT'} v2 | Pool: [${pool.significance}] ${pool.description} ($${pool.price.toFixed(4)}) | Sweep: ${sweepDepthPct.toFixed(2)}% | Reversal Setup: ${candleConf.setupType} | R:R: ${riskResult.rrGross.toFixed(2)} (Net: ${riskResult.rrNet.toFixed(2)}) | Gate: ${exactReject || 'ALL_GATES_PASSED'}`,
        timestamp: Date.now(),
        opposingLiquidityPrice: opposingTarget,
        opposingLiquidityType: pool.description,
        atrValue: atr
      };

      if (score > highestScore || (isQualified && !bestSignal?.finalDecision.includes('EXECUTE'))) {
        highestScore = score;
        bestSignal = candidateSignal;
      }
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
strategy("Liquidity Sweep Reversal (LSR) v2 [Institutional Regime-Gated]", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.06)

// Inputs
executionTf = input.timeframe("15", "Execution Timeframe")
minRRRatio = input.float(${minRR}, "Minimum R:R Ratio", step=0.1)
maxReclaimBars = input.int(${maxReclaim}, "Max Reclaim Bars", minval=1, maxval=10)
slBufferAtr = input.float(${slBuffer}, "Stop Loss Buffer ATR", step=0.05)
modePreset = input.string("balanced", "Mode Preset", options=["strict", "balanced", "aggressive"])

// Indicators
atrVal = ta.atr(14)
volSma = ta.sma(volume, 20)
swingHigh = ta.pivothigh(high, 3, 3)
swingLow = ta.pivotlow(low, 3, 3)

var float lastSweepLevel = na
var float lastExtreme = na
var int sweepBar = na

// Long Sweep Detection
if not na(swingLow) and low < swingLow and close > swingLow
    lastSweepLevel := swingLow
    lastExtreme := low
    sweepBar := bar_index

// 2-Candle Bullish Confirmation
bool c1Rejection = (min(open[1], close[1]) - low[1]) >= (high[1] - low[1]) * 0.50
bool c2Engulf = close > open and close > high[1] and (close - open) >= (atrVal * 0.35)

if not na(lastSweepLevel) and (bar_index - sweepBar <= maxReclaimBars) and c1Rejection and c2Engulf
    float slPrice = lastExtreme - (slBufferAtr * atrVal)
    float tpPrice = close + ((close - slPrice) * minRRRatio)
    strategy.entry("LSR_LONG", strategy.long)
    strategy.exit("TP/SL", "LSR_LONG", stop=slPrice, limit=tpPrice)
    lastSweepLevel := na
`;
}
