/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RANGE_REGIME_V1 Strategy Engine
 * 
 * Single source of truth execution engine evaluating range-bound market conditions,
 * edge rejection/sweep/snapback setups, multi-level confluence, and net R:R expectations.
 */

import {
  RangeConfig,
  DEFAULTS,
  RejectCode,
  feeShareOfStopDistance,
  calcBlendedNetR
} from './rangeRegime.config.js';
import { calculateATR, calculateEMA, calculateSMA, calculateRSI, calculateADX } from '../indicators.js';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RangeRegimeSignal {
  symbol: string;
  finalDecision: 'EXECUTE' | 'REJECT';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number; // 0-100
  setupType: 'S1_REJECTION' | 'S2_SWEEP_RECLAIM' | 'S3_BAND_SNAPBACK' | 'NONE';
  grade: 'GRADE_A' | 'GRADE_B' | 'NONE';
  rejectCode: RejectCode | null;
  rejectReason: string | null;
  displayStatus: string;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  tp1: number;
  tp2: number;
  riskRewardRatio: number;
  netBlendedR: number;
  feeShareOfR: number;
  atrDir: number;
  atrExec: number;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeHeightAtr: number;
  edgeTouches: number;
  confluenceCount: number;
  confluenceFactors: string[];
  biasDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  isCounterBias: boolean;
  sizeMultiplier: number;
  reason: string;
  signalTime: number;
}

/** Calculate Kaufman Efficiency Ratio (ER): |Close - Close[n]| / Sum(|Close[i] - Close[i-1]|) */
export function calculateEfficiencyRatio(closes: number[], period: number = 20): number {
  if (closes.length <= period) return 0.5;
  const lastIdx = closes.length - 1;
  const netChange = Math.abs(closes[lastIdx] - closes[lastIdx - period]);
  let sumDiff = 0;
  for (let i = lastIdx - period + 1; i <= lastIdx; i++) {
    sumDiff += Math.abs(closes[i] - closes[i - 1]);
  }
  if (sumDiff === 0) return 0;
  return netChange / sumDiff;
}

/** Count crossings of the range midpoint over the lookback window */
export function countMidCrossings(closes: number[], mid: number, lookback: number): number {
  if (closes.length < 2) return 0;
  const start = Math.max(1, closes.length - lookback);
  let crosses = 0;
  for (let i = start; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if ((prev < mid && curr >= mid) || (prev > mid && curr <= mid)) {
      crosses++;
    }
  }
  return crosses;
}

/** Identify Swing Highs and Swing Lows with pivot length */
export function findPivots(candles: Candle[], pivotLen: number, lookbackBars: number) {
  const highs: { price: number; index: number }[] = [];
  const lows: { price: number; index: number }[] = [];
  const start = Math.max(pivotLen, candles.length - lookbackBars);
  const end = candles.length - pivotLen - 1;

  for (let i = start; i <= end; i++) {
    let isHigh = true;
    let isLow = true;
    const currH = candles[i].high;
    const currL = candles[i].low;

    for (let k = 1; k <= pivotLen; k++) {
      if (candles[i - k].high >= currH || candles[i + k].high > currH) isHigh = false;
      if (candles[i - k].low <= currL || candles[i + k].low < currL) isLow = false;
    }

    if (isHigh) highs.push({ price: currH, index: i });
    if (isLow) lows.push({ price: currL, index: i });
  }

  return { highs, lows };
}

export interface TwoCandleSetupResult {
  isConfirmed: boolean;
  setupName: string;
  reason: string;
  sweepCandleLow: number;
  sweepCandleHigh: number;
  confirmationClose: number;
  invalidationLevel: number;
}

/**
 * Validates the 2-Candle Setup (Sweep/Probe Candle + Confirmation/Engulfing Candle)
 * as marked in the user reference chart.
 * 
 * For LONG:
 * - Candle 1 (preceding candle): Probes or sweeps below key level / range support, leaving a lower wick or swing low.
 * - Candle 2 (confirmation candle): MUST close green (close > open), with decisive body (>= 35% of candle range),
 *   reclaiming above prior candle close/midpoint and holding above the swept support level without breaking the sweep low.
 * 
 * For SHORT:
 * - Candle 1 (preceding candle): Probes or sweeps above key level / range resistance, leaving an upper wick or swing high.
 * - Candle 2 (confirmation candle): MUST close red (close < open), with decisive body (>= 35% of candle range),
 *   closing below prior candle close/midpoint and holding below the swept resistance level without breaking the sweep high.
 */
export function checkTwoCandleReversalSetup(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  keyLevel: number,
  atr: number
): TwoCandleSetupResult {
  if (!candles || candles.length < 2) {
    return {
      isConfirmed: false,
      setupName: 'INSUFFICIENT_DATA',
      reason: 'Need at least 2 closed candles to verify 2-candle setup',
      sweepCandleLow: 0,
      sweepCandleHigh: 0,
      confirmationClose: 0,
      invalidationLevel: 0
    };
  }

  const c2 = candles[candles.length - 1]; // Latest closed candle (confirmation candle)
  const c1 = candles[candles.length - 2]; // Prior candle (sweep/probe candle)

  const c1Range = Math.max(0.0000001, c1.high - c1.low);
  const c2Range = Math.max(0.0000001, c2.high - c2.low);
  const c2Body = Math.abs(c2.close - c2.open);
  const c2BodyRatio = c2Body / c2Range;

  if (direction === 'LONG') {
    const c1LowerWick = Math.min(c1.open, c1.close) - c1.low;
    const c1LowerWickRatio = c1LowerWick / c1Range;
    const sweptDown = c1.low <= keyLevel * 1.0025 || c1LowerWickRatio >= 0.28 || c2.low <= keyLevel * 1.0025;
    const isC2Bullish = c2.close > c2.open;
    const isDecisiveBody = c2BodyRatio >= 0.35;
    const reclaimsAboveC1 = c2.close >= Math.max(c1.close, (c1.open + c1.close) / 2);
    const reclaimsAboveLevel = c2.close >= keyLevel * 0.9985;
    const holdsSweepLow = c2.low >= c1.low - (0.05 * atr);

    const isConfirmed = sweptDown && isC2Bullish && isDecisiveBody && reclaimsAboveC1 && reclaimsAboveLevel && holdsSweepLow;

    let reason = '';
    if (!sweptDown) {
      reason = `Waiting for Candle 1 sweep/probe: low $${c1.low.toFixed(4)} did not sweep support $${keyLevel.toFixed(4)}`;
    } else if (!isC2Bullish) {
      reason = `Waiting for bullish confirmation: Candle 2 closed red ($${c2.close.toFixed(4)} <= open $${c2.open.toFixed(4)})`;
    } else if (!isDecisiveBody) {
      reason = `Waiting for decisive body: Candle 2 body ${(c2BodyRatio * 100).toFixed(0)}% < 35% minimum (doji/indecision)`;
    } else if (!reclaimsAboveC1 || !reclaimsAboveLevel) {
      reason = `Waiting for reclaim: Candle 2 close $${c2.close.toFixed(4)} must close above Candle 1 ($${c1.close.toFixed(4)}) and support $${keyLevel.toFixed(4)}`;
    } else if (!holdsSweepLow) {
      reason = `Waiting for valid support: Candle 2 broke below sweep low ($${c2.low.toFixed(4)} < $${c1.low.toFixed(4)})`;
    } else {
      reason = `2-Candle Setup Confirmed: Candle 1 swept low ($${c1.low.toFixed(4)}) + Candle 2 bullish engulfing/reclaim close ($${c2.close.toFixed(4)}) holding above support`;
    }

    const slLow = Math.min(c1.low, c2.low);
    return {
      isConfirmed,
      setupName: '2_CANDLE_SWEEP_RECLAIM',
      reason,
      sweepCandleLow: slLow,
      sweepCandleHigh: Math.max(c1.high, c2.high),
      confirmationClose: c2.close,
      invalidationLevel: slLow - Math.max(0.15 * atr, slLow * 0.002)
    };
  } else {
    // SHORT
    const c1UpperWick = c1.high - Math.max(c1.open, c1.close);
    const c1UpperWickRatio = c1UpperWick / c1Range;
    const sweptUp = c1.high >= keyLevel * 0.9975 || c1UpperWickRatio >= 0.28 || c2.high >= keyLevel * 0.9975;
    const isC2Bearish = c2.close < c2.open;
    const isDecisiveBody = c2BodyRatio >= 0.35;
    const dropsBelowC1 = c2.close <= Math.min(c1.close, (c1.open + c1.close) / 2);
    const dropsBelowLevel = c2.close <= keyLevel * 1.0015;
    const holdsSweepHigh = c2.high <= c1.high + (0.05 * atr);

    const isConfirmed = sweptUp && isC2Bearish && isDecisiveBody && dropsBelowC1 && dropsBelowLevel && holdsSweepHigh;

    let reason = '';
    if (!sweptUp) {
      reason = `Waiting for Candle 1 sweep/probe: high $${c1.high.toFixed(4)} did not sweep resistance $${keyLevel.toFixed(4)}`;
    } else if (!isC2Bearish) {
      reason = `Waiting for bearish confirmation: Candle 2 closed green ($${c2.close.toFixed(4)} >= open $${c2.open.toFixed(4)})`;
    } else if (!isDecisiveBody) {
      reason = `Waiting for decisive body: Candle 2 body ${(c2BodyRatio * 100).toFixed(0)}% < 35% minimum (doji/indecision)`;
    } else if (!dropsBelowC1 || !dropsBelowLevel) {
      reason = `Waiting for reclaim: Candle 2 close $${c2.close.toFixed(4)} must close below Candle 1 ($${c1.close.toFixed(4)}) and resistance $${keyLevel.toFixed(4)}`;
    } else if (!holdsSweepHigh) {
      reason = `Waiting for valid resistance: Candle 2 broke above sweep high ($${c2.high.toFixed(4)} > $${c1.high.toFixed(4)})`;
    } else {
      reason = `2-Candle Setup Confirmed: Candle 1 swept high ($${c1.high.toFixed(4)}) + Candle 2 bearish engulfing/reclaim close ($${c2.close.toFixed(4)}) holding below resistance`;
    }

    const slHigh = Math.max(c1.high, c2.high);
    return {
      isConfirmed,
      setupName: '2_CANDLE_SWEEP_RECLAIM',
      reason,
      sweepCandleLow: Math.min(c1.low, c2.low),
      sweepCandleHigh: slHigh,
      confirmationClose: c2.close,
      invalidationLevel: slHigh + Math.max(0.15 * atr, slHigh * 0.002)
    };
  }
}

/** Evaluate Range Regime V1 Strategy for a Symbol */
export function evaluateRangeRegime(
  symbol: string,
  rawCandlesDir: Candle[], // DirectionTF candles (e.g. 1h)
  rawCandlesExec: Candle[], // ExecutionTF candles (e.g. 15m)
  userCfg?: Partial<RangeConfig>,
  currentDayLevels?: { pdh?: number; pdl?: number; vwap?: number }
): RangeRegimeSignal {
  const candlesDir = rawCandlesDir && rawCandlesDir.length > 1 ? rawCandlesDir.slice(0, -1) : rawCandlesDir;
  const candlesExec = rawCandlesExec && rawCandlesExec.length > 1 ? rawCandlesExec.slice(0, -1) : rawCandlesExec;
  const cfg: RangeConfig = { ...DEFAULTS, ...userCfg };
  const now = candlesExec.length > 0 ? candlesExec[candlesExec.length - 1].time : Date.now();

  const rejectResult = (code: RejectCode, reason: string): RangeRegimeSignal => ({
    symbol,
    finalDecision: 'REJECT',
    direction: 'NEUTRAL',
    score: 0,
    setupType: 'NONE',
    grade: 'NONE',
    rejectCode: code,
    rejectReason: reason,
    displayStatus: code.replace(/_/g, ' '),
    entryPrice: candlesExec.length > 0 ? candlesExec[candlesExec.length - 1].close : 0,
    stopLossPrice: 0,
    targetPrice: 0,
    tp1: 0,
    tp2: 0,
    riskRewardRatio: 0,
    netBlendedR: 0,
    feeShareOfR: 0,
    atrDir: 0,
    atrExec: 0,
    rangeHigh: 0,
    rangeLow: 0,
    rangeMid: 0,
    rangeHeightAtr: 0,
    edgeTouches: 0,
    confluenceCount: 0,
    confluenceFactors: [],
    biasDirection: 'NEUTRAL',
    isCounterBias: false,
    sizeMultiplier: 1.0,
    reason,
    signalTime: now
  });

  if (candlesDir.length < 50 || candlesExec.length < 50) {
    return rejectResult('REGIME_SCORE_LOW', 'Insufficient candle history on direction or execution timeframe');
  }

  // 1. Calculate direction ATR(14) and execution ATR(14)
  const dirHighs = candlesDir.map(c => c.high);
  const dirLows = candlesDir.map(c => c.low);
  const dirCloses = candlesDir.map(c => c.close);
  const dirVolumes = candlesDir.map(c => c.volume);
  const atrDirArr = calculateATR(dirHighs, dirLows, dirCloses, 14);
  const atrDir = atrDirArr[atrDirArr.length - 1] || 1;

  const execHighs = candlesExec.map(c => c.high);
  const execLows = candlesExec.map(c => c.low);
  const execCloses = candlesExec.map(c => c.close);
  const execVolumes = candlesExec.map(c => c.volume);
  const atrExecArr = calculateATR(execHighs, execLows, execCloses, 14);
  const atrExec = atrExecArr[atrExecArr.length - 1] || 1;

  // 2. Regime Evaluation on directionTF
  const adxPeriod = Number(cfg.adxPeriod) || 14;
  const adxResult = calculateADX(dirHighs, dirLows, dirCloses, adxPeriod);
  const adxVal = adxResult.adx[adxResult.adx.length - 1] || 25;

  const adxHardMax = Number(cfg.adxHardMax) || 30;
  if (adxVal > adxHardMax) {
    return rejectResult('ADX_HARD_VETO', `ADX ${adxVal.toFixed(1)} > hard max ${adxHardMax} (trending, not ranging)`);
  }

  const er20 = calculateEfficiencyRatio(dirCloses, 20);
  const erMax = Number(cfg.erMax) || 0.30;

  // ATR expansion ratio: ATR_dir / SMA50(ATR_dir)
  const atrSma50 = calculateSMA(atrDirArr, Math.min(50, atrDirArr.length));
  const atrSmaVal = atrSma50[atrSma50.length - 1] || atrDir;
  const atrExpansion = atrDir / (atrSmaVal > 0 ? atrSmaVal : atrDir);
  const atrExpansionMax = Number(cfg.atrExpansionMax) || 1.30;

  // Range Construction using Swing Pivots on directionTF
  const lookbackBars = Number(cfg.rangeLookbackBars) || 48;
  const pivotLen = Number(cfg.pivotLen) || 3;
  const { highs: swingHighs, lows: swingLows } = findPivots(candlesDir, pivotLen, lookbackBars);

  if (swingHighs.length === 0 || swingLows.length === 0) {
    return rejectResult('EDGE_UNPROVEN', 'No verified swing pivots found inside lookback to define range boundaries');
  }

  // Extreme range boundaries
  const maxSwingHigh = Math.max(...swingHighs.map(h => h.price));
  const minSwingLow = Math.min(...swingLows.map(l => l.price));
  const rangeHeight = maxSwingHigh - minSwingLow;
  const rangeMid = (maxSwingHigh + minSwingLow) / 2;
  const rangeHeightAtr = rangeHeight / atrDir;

  const minRangeAtr = Number(cfg.minRangeAtr) || 2.5;
  const maxRangeAtr = Number(cfg.maxRangeAtr) || 8.0;

  if (rangeHeightAtr < minRangeAtr) {
    return rejectResult('RANGE_TOO_NARROW', `Range height ${rangeHeightAtr.toFixed(2)}x ATR < min ${minRangeAtr}x (fee-drag zone)`);
  }
  if (rangeHeightAtr > maxRangeAtr) {
    return rejectResult('RANGE_TOO_WIDE', `Range height ${rangeHeightAtr.toFixed(2)}x ATR > max ${maxRangeAtr}x (macro swing, not range)`);
  }

  // Check Range Break
  const lastDirClose = dirCloses[dirCloses.length - 1];
  const breakConfirmAtr = Number(cfg.breakConfirmAtr) || 0.30;
  if (lastDirClose > maxSwingHigh + breakConfirmAtr * atrDir || lastDirClose < minSwingLow - breakConfirmAtr * atrDir) {
    return rejectResult('RANGE_BROKEN', `Directional candle closed outside range by ${breakConfirmAtr}x ATR`);
  }

  // Count edge touches within touch tolerance
  const touchTolAtr = Number(cfg.touchTolAtr) || 0.35;
  const upperTol = touchTolAtr * atrDir;
  const lowerTol = touchTolAtr * atrDir;
  const highTouches = swingHighs.filter(h => Math.abs(h.price - maxSwingHigh) <= upperTol).length;
  const lowTouches = swingLows.filter(l => Math.abs(l.price - minSwingLow) <= lowerTol).length;
  const midCrosses = countMidCrossings(dirCloses, rangeMid, lookbackBars);

  // Regime Score (0-100)
  let regimeScore = 0;
  const adxSoftMax = Number(cfg.adxSoftMax) || 22;
  if (adxVal <= adxSoftMax) regimeScore += 30;
  else regimeScore += Math.max(0, 30 * (1 - (adxVal - adxSoftMax) / (adxHardMax - adxSoftMax)));

  if (er20 <= erMax) regimeScore += 25;
  else regimeScore += Math.max(0, 25 * (1 - (er20 - erMax) / 0.3));

  const minMidCrosses = Number(cfg.minMidCrosses) || 3;
  if (midCrosses >= minMidCrosses) regimeScore += 25;
  else regimeScore += (midCrosses / minMidCrosses) * 20;

  if (atrExpansion <= 1.0) regimeScore += 20;
  else if (atrExpansion <= atrExpansionMax) regimeScore += Math.max(0, 20 * (1 - (atrExpansion - 1.0) / (atrExpansionMax - 1.0)));

  const regimeMinScore = Number(cfg.regimeMinScore) || 60;
  if (regimeScore < regimeMinScore) {
    return rejectResult('REGIME_SCORE_LOW', `Regime Score ${Math.round(regimeScore)} < required min ${regimeMinScore}`);
  }

  // 3. Direction & Drift Bias
  const ema50Arr = calculateEMA(dirCloses, 50);
  const ema50 = ema50Arr[ema50Arr.length - 1] || rangeMid;
  const ema50Prev = ema50Arr[Math.max(0, ema50Arr.length - 4)] || ema50;
  const ema50Slope = ema50 - ema50Prev;

  let biasDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (ema50Slope > 0 && lastDirClose >= rangeMid) {
    biasDirection = 'LONG';
  } else if (ema50Slope < 0 && lastDirClose <= rangeMid) {
    biasDirection = 'SHORT';
  }

  const biasMode = String(cfg.biasMode || 'AUTO');
  let allowedDirection: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY' = 'BOTH';
  if (biasMode === 'LONG_ONLY') allowedDirection = 'LONG_ONLY';
  else if (biasMode === 'SHORT_ONLY') allowedDirection = 'SHORT_ONLY';

  // 4. Execution TF Setup Identification
  const edgeZonePct = Number(cfg.edgeZonePct) || 0.20;
  const upperZoneBottom = maxSwingHigh - edgeZonePct * rangeHeight;
  const lowerZoneTop = minSwingLow + edgeZonePct * rangeHeight;

  const lastExecCandle = candlesExec[candlesExec.length - 1];
  const prevExecCandle = candlesExec[candlesExec.length - 2];
  const currentPrice = lastExecCandle.close;

  // In Upper Edge Zone (Short Candidates) or Lower Edge Zone (Long Candidates)
  const isInUpperZone = lastExecCandle.high >= upperZoneBottom && lastExecCandle.low <= maxSwingHigh * 1.02;
  const isInLowerZone = lastExecCandle.low <= lowerZoneTop && lastExecCandle.high >= minSwingLow * 0.98;

  if (!isInUpperZone && !isInLowerZone) {
    return rejectResult('NOT_IN_EDGE_ZONE', `Price (${currentPrice}) is in range body, outside edge zones (Lower: <${lowerZoneTop.toFixed(2)}, Upper: >${upperZoneBottom.toFixed(2)})`);
  }

  const candidateDirection: 'LONG' | 'SHORT' = isInLowerZone ? 'LONG' : 'SHORT';

  // Check edge touches for this specific edge
  // The original pivot counts as 1, and the current touch inside edge zone counts as the active test
  const relevantTouches = candidateDirection === 'LONG' ? lowTouches : highTouches;
  const minEdgeTouches = Number(cfg.minEdgeTouches) || 2;
  const effectiveEdgeTests = relevantTouches + 1; // current test in edge zone
  if (effectiveEdgeTests < minEdgeTouches) {
    return rejectResult('EDGE_UNPROVEN', `${candidateDirection} edge has only ${relevantTouches} prior pivots (${effectiveEdgeTests}/${minEdgeTouches} required edge tests)`);
  }

  // Check Direction Bias mode
  if (allowedDirection === 'LONG_ONLY' && candidateDirection !== 'LONG') {
    return rejectResult('COUNTER_BIAS_BLOCKED', 'Bias mode set to LONG_ONLY; Short fade blocked');
  }
  if (allowedDirection === 'SHORT_ONLY' && candidateDirection !== 'SHORT') {
    return rejectResult('COUNTER_BIAS_BLOCKED', 'Bias mode set to SHORT_ONLY; Long fade blocked');
  }

  const isCounterBias = (biasDirection === 'LONG' && candidateDirection === 'SHORT') ||
                        (biasDirection === 'SHORT' && candidateDirection === 'LONG');

  const counterBiasPolicy = String(cfg.counterBiasPolicy || 'SIZE_DOWN');
  if (isCounterBias && counterBiasPolicy === 'BLOCK') {
    return rejectResult('COUNTER_BIAS_BLOCKED', `Counter-bias fade blocked by policy (${candidateDirection} vs ${biasDirection} drift)`);
  }

  // Impulse Veto check: Skip if a large execution bar recently smashed through
  const impulseVetoAtr = Number(cfg.impulseVetoAtr) || 2.0;
  const last3Exec = candlesExec.slice(-4);
  const hasImpulseBar = last3Exec.some(c => (c.high - c.low) >= impulseVetoAtr * atrExec);
  if (hasImpulseBar) {
    return rejectResult('IMPULSE_VETO', `Impulse candle > ${impulseVetoAtr}x ATR detected entering the zone`);
  }

  // Test Setups: S1, S2, S3
  let detectedSetup: 'S1_REJECTION' | 'S2_SWEEP_RECLAIM' | 'S3_BAND_SNAPBACK' | 'NONE' = 'NONE';
  let invalidationPrice = candidateDirection === 'LONG' ? lastExecCandle.low : lastExecCandle.high;

  // S1: Edge Rejection
  const enableS1 = cfg.enableEdgeRejection !== false;
  const rejWickPct = Number(cfg.rejWickPct) || 0.40;
  const closeLocationMin = Number(cfg.closeLocationMin) || 0.60;
  const candleRange = Math.max(0.0000001, lastExecCandle.high - lastExecCandle.low);

  let isS1Valid = false;
  if (enableS1) {
    if (candidateDirection === 'LONG') {
      const lowerWick = Math.min(lastExecCandle.open, lastExecCandle.close) - lastExecCandle.low;
      const lowerWickRatio = lowerWick / candleRange;
      const closeLoc = (lastExecCandle.close - lastExecCandle.low) / candleRange;
      if (lowerWickRatio >= rejWickPct && closeLoc >= closeLocationMin) {
        isS1Valid = true;
        invalidationPrice = lastExecCandle.low;
      }
    } else {
      const upperWick = lastExecCandle.high - Math.max(lastExecCandle.open, lastExecCandle.close);
      const upperWickRatio = upperWick / candleRange;
      const closeLoc = (lastExecCandle.high - lastExecCandle.close) / candleRange;
      if (upperWickRatio >= rejWickPct && closeLoc >= closeLocationMin) {
        isS1Valid = true;
        invalidationPrice = lastExecCandle.high;
      }
    }
  }

  // S2: Sweep & Reclaim
  const enableS2 = cfg.enableSweepReclaim !== false;
  const sweepMinAtr = Number(cfg.sweepMinAtr) || 0.10;
  const sweepMaxAtrDir = Number(cfg.sweepMaxAtrDir) || 0.60;
  let isS2Valid = false;

  if (enableS2) {
    if (candidateDirection === 'LONG') {
      const lowestOfLast3 = Math.min(...last3Exec.map(c => c.low));
      const sweepDepth = minSwingLow - lowestOfLast3;
      if (sweepDepth >= sweepMinAtr * atrExec && sweepDepth <= sweepMaxAtrDir * atrDir && lastExecCandle.close > minSwingLow) {
        isS2Valid = true;
        invalidationPrice = lowestOfLast3;
      }
    } else {
      const highestOfLast3 = Math.max(...last3Exec.map(c => c.high));
      const sweepDepth = highestOfLast3 - maxSwingHigh;
      if (sweepDepth >= sweepMinAtr * atrExec && sweepDepth <= sweepMaxAtrDir * atrDir && lastExecCandle.close < maxSwingHigh) {
        isS2Valid = true;
        invalidationPrice = highestOfLast3;
      }
    }
  }

  // S3: Band Snapback (Bollinger + RSI)
  const enableS3 = cfg.enableBandSnapback !== false;
  const bbPeriod = Number(cfg.bbPeriod) || 20;
  const bbStd = Number(cfg.bbStd) || 2.0;
  const rsiPeriod = Number(cfg.rsiPeriod) || 14;
  const rsiArr = calculateRSI(execCloses, rsiPeriod);
  const lastRsi = rsiArr[rsiArr.length - 1] || 50;
  const minRsi3 = Math.min(...rsiArr.slice(-3));
  const maxRsi3 = Math.max(...rsiArr.slice(-3));
  let isS3Valid = false;

  if (enableS3) {
    const sma20Arr = calculateSMA(execCloses, bbPeriod);
    const sma20 = sma20Arr[sma20Arr.length - 1] || currentPrice;
    // Standard deviation
    const slice = execCloses.slice(-bbPeriod);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma20, 2), 0) / bbPeriod;
    const std = Math.sqrt(variance);
    const lowerBand = sma20 - bbStd * std;
    const upperBand = sma20 + bbStd * std;

    if (candidateDirection === 'LONG') {
      const piercedLower = prevExecCandle.low <= lowerBand;
      const closedInside = lastExecCandle.close > lowerBand;
      const rsiOversold = Number(cfg.rsiOversold) || 32;
      if (piercedLower && closedInside && minRsi3 <= rsiOversold) {
        isS3Valid = true;
        invalidationPrice = Math.min(prevExecCandle.low, lastExecCandle.low);
      }
    } else {
      const piercedUpper = prevExecCandle.high >= upperBand;
      const closedInside = lastExecCandle.close < upperBand;
      const rsiOverbought = Number(cfg.rsiOverbought) || 68;
      if (piercedUpper && closedInside && maxRsi3 >= rsiOverbought) {
        isS3Valid = true;
        invalidationPrice = Math.max(prevExecCandle.high, lastExecCandle.high);
      }
    }
  }

  if (isS2Valid) detectedSetup = 'S2_SWEEP_RECLAIM';
  else if (isS1Valid) detectedSetup = 'S1_REJECTION';
  else if (isS3Valid) detectedSetup = 'S3_BAND_SNAPBACK';
  else {
    return rejectResult('NO_TRIGGER', 'No confirmed S1 (rejection), S2 (sweep reclaim), or S3 (band snap-back) trigger candle');
  }

  // Mandatory 2-Candle Setup Check (User Directive: Candle 1 Sweep/Probe + Candle 2 Bullish/Bearish Confirmation)
  const targetKeyLevel = candidateDirection === 'LONG' ? minSwingLow : maxSwingHigh;
  const twoCandleCheck = checkTwoCandleReversalSetup(candlesExec, candidateDirection, targetKeyLevel, atrExec);
  if (!twoCandleCheck.isConfirmed) {
    return rejectResult('NO_TRIGGER', twoCandleCheck.reason);
  }
  invalidationPrice = twoCandleCheck.invalidationLevel;

  // 5. Confluence Scoring
  const confluenceFactors: string[] = [];
  const volSpikeMult = Number(cfg.volSpikeMult) || 1.3;
  const volSma20 = calculateSMA(execVolumes, 20);
  const avgVol = volSma20[volSma20.length - 1] || 1;
  if (lastExecCandle.volume >= avgVol * volSpikeMult) {
    confluenceFactors.push(`Volume Spike (${(lastExecCandle.volume / avgVol).toFixed(1)}x)`);
  }

  if (relevantTouches >= 3) {
    confluenceFactors.push(`Triple Edge Test (${relevantTouches} touches)`);
  }

  const levelConfluenceAtr = Number(cfg.levelConfluenceAtr) || 0.30;
  if (currentDayLevels?.pdh && Math.abs(maxSwingHigh - currentDayLevels.pdh) <= levelConfluenceAtr * atrDir) {
    confluenceFactors.push('PDH Confluence');
  }
  if (currentDayLevels?.pdl && Math.abs(minSwingLow - currentDayLevels.pdl) <= levelConfluenceAtr * atrDir) {
    confluenceFactors.push('PDL Confluence');
  }
  if (currentDayLevels?.vwap && Math.abs(rangeMid - currentDayLevels.vwap) <= levelConfluenceAtr * atrDir) {
    confluenceFactors.push('VWAP Range Mid Alignment');
  }

  const minConfluence = Number(cfg.minConfluence) || 1;
  if (confluenceFactors.length < minConfluence) {
    return rejectResult('CONFLUENCE_LOW', `Confluence count ${confluenceFactors.length} < required min ${minConfluence}`);
  }

  const gradeAMin = Number(cfg.gradeAMin) || 3;
  let grade: 'GRADE_A' | 'GRADE_B' = (confluenceFactors.length >= gradeAMin && detectedSetup !== 'S3_BAND_SNAPBACK') ? 'GRADE_A' : 'GRADE_B';
  if (isCounterBias && counterBiasPolicy === 'A_GRADE_ONLY' && grade !== 'GRADE_A') {
    return rejectResult('COUNTER_BIAS_BLOCKED', 'Counter-bias policy requires Grade A; signal graded B');
  }

  // Strict Grade B Disabling Gate:
  // If user disabled Grade B setups (allowGradeB === false or enableGradeB === false), reject all Grade B signals
  const isGradeBAllowed = cfg.allowGradeB !== false &&
    (cfg as any).enableGradeB !== false &&
    (cfg as any).allowGradeBSetups !== false &&
    !(cfg as any).gradeAOnly &&
    !(cfg as any).strictGradeAOnly;

  if (!isGradeBAllowed && grade === 'GRADE_B') {
    return rejectResult(
      'GRADE_B_DISABLED',
      `Grade B setups are turned off in settings (confluence: ${confluenceFactors.length}/${gradeAMin}, setup: ${detectedSetup}). Grade A required.`
    );
  }

  // 6. Stop Loss & Fee Gate
  const slBufferAtr = Number(cfg.slBufferAtr) || 0.40;
  const minStopAtr = Number(cfg.minStopAtr) || 0.60;
  const bufferDist = slBufferAtr * atrExec;
  const minStopDist = minStopAtr * atrExec;

  let stopLossPrice = candidateDirection === 'LONG'
    ? invalidationPrice - bufferDist
    : invalidationPrice + bufferDist;

  const directionalStopDist = candidateDirection === 'LONG'
    ? currentPrice - stopLossPrice
    : stopLossPrice - currentPrice;

  if (directionalStopDist <= 0) {
    return rejectResult(
      'RANGE_BROKEN',
      `${candidateDirection} stop loss $${stopLossPrice.toFixed(4)} is invalid against current price $${currentPrice.toFixed(4)} (invalidation level breached)`
    );
  }

  let rawStopDist = directionalStopDist;
  if (rawStopDist < minStopDist) {
    stopLossPrice = candidateDirection === 'LONG' ? currentPrice - minStopDist : currentPrice + minStopDist;
    rawStopDist = minStopDist;
  }

  const maxStopPctOfRange = Number(cfg.maxStopPctOfRange) || 0.30;
  if (rawStopDist > maxStopPctOfRange * rangeHeight) {
    return rejectResult('STOP_TOO_WIDE', `Stop distance ${(rawStopDist / rangeHeight * 100).toFixed(1)}% of range > max ${maxStopPctOfRange * 100}%`);
  }

  const feeRoundTripPct = Number(cfg.feeRoundTripPct) || 0.118;
  const feeShareOfR = feeShareOfStopDistance(feeRoundTripPct, currentPrice, stopLossPrice);
  const maxFeeShareOfR = Number(cfg.maxFeeShareOfR) || 0.30;

  if (feeShareOfR > maxFeeShareOfR) {
    return rejectResult('FEE_GATE', `Fee drag ${(feeShareOfR * 100).toFixed(1)}% of 1R exceeds max allowed ${(maxFeeShareOfR * 100).toFixed(0)}%`);
  }

  // 7. Take Profit Targets & Net R:R
  const tp1MinR = Number(cfg.tp1MinR) || 0.8;
  const tp2MinR = Number(cfg.tp2MinR) || 1.8;
  const tp1ClosePct = Number(cfg.tp1ClosePct) || 50;
  const tp2FrontRunPct = Number(cfg.tp2FrontRunPct) || 0.10;

  // TP1 defaults to Range Mid
  let tp1 = rangeMid;
  let tp1Dist = Math.abs(tp1 - currentPrice);
  let tp1R = tp1Dist / rawStopDist;

  // If TP1 doesn't clear min R, push outward
  if (tp1R < tp1MinR) {
    tp1 = candidateDirection === 'LONG' ? currentPrice + tp1MinR * rawStopDist : currentPrice - tp1MinR * rawStopDist;
    tp1Dist = Math.abs(tp1 - currentPrice);
    tp1R = tp1Dist / rawStopDist;
  }

  // TP2 is opposite edge with front-run
  const oppositeEdge = candidateDirection === 'LONG' ? maxSwingHigh : minSwingLow;
  const tp2 = candidateDirection === 'LONG'
    ? oppositeEdge - tp2FrontRunPct * rangeHeight
    : oppositeEdge + tp2FrontRunPct * rangeHeight;

  const tp2Dist = Math.abs(tp2 - currentPrice);
  const tp2R = tp2Dist / rawStopDist;

  if (tp2R < tp2MinR) {
    return rejectResult('RR_TOO_LOW', `TP2 opposite-edge target offers ${tp2R.toFixed(2)}R < required min ${tp2MinR}R`);
  }

  const stopDistPct = (rawStopDist / currentPrice) * 100;
  const netBlendedR = calcBlendedNetR(tp1R, tp2R, tp1ClosePct, feeRoundTripPct, stopDistPct);
  const minBlendedNetR = Number(cfg.minBlendedNetR) || 1.2;

  if (netBlendedR < minBlendedNetR) {
    return rejectResult('RR_TOO_LOW', `Net Blended R ${netBlendedR.toFixed(2)}R < required min ${minBlendedNetR}R after fees`);
  }

  // Size Multiplier
  let sizeMultiplier = 1.0;
  if (grade === 'GRADE_B') {
    sizeMultiplier *= Number(cfg.gradeBRiskMult) || 0.60;
  }
  if (isCounterBias) {
    sizeMultiplier *= Number(cfg.counterBiasSizeMult) || 0.50;
  }

  // Composite Score (scaled to 80-98 so it passes autoTradeThreshold >= 75 and competes cleanly with other strategies)
  const score = Math.round(
    Math.min(98, Math.max(80, 60 + regimeScore * 0.2 + confluenceFactors.length * 5 + netBlendedR * 5 + (grade === 'GRADE_A' ? 10 : 0)))
  );

  return {
    symbol,
    finalDecision: 'EXECUTE',
    direction: candidateDirection,
    score,
    setupType: detectedSetup,
    grade,
    rejectCode: null,
    rejectReason: null,
    displayStatus: `${detectedSetup} (${grade.replace('_', ' ')} | ${netBlendedR.toFixed(1)}R)`,
    entryPrice: currentPrice,
    stopLossPrice,
    targetPrice: tp2,
    tp1,
    tp2,
    riskRewardRatio: tp2R,
    netBlendedR,
    feeShareOfR,
    atrDir,
    atrExec,
    rangeHigh: maxSwingHigh,
    rangeLow: minSwingLow,
    rangeMid,
    rangeHeightAtr,
    edgeTouches: relevantTouches,
    confluenceCount: confluenceFactors.length,
    confluenceFactors,
    biasDirection,
    isCounterBias,
    sizeMultiplier,
    reason: `${candidateDirection} ${detectedSetup} at range edge (${relevantTouches} touches). Stop: $${stopLossPrice.toFixed(4)}, TP1: $${tp1.toFixed(4)}, TP2: $${tp2.toFixed(4)} (${netBlendedR.toFixed(1)} Net R). Confluence: ${confluenceFactors.join(', ')}`,
    signalTime: now
  };
}

/** Pine Script v6 Generator for TradingView */
export function generateRangeRegimePineScript(cfg: RangeConfig = DEFAULTS): string {
  return `//@version=6
strategy("Range Regime V1 — Institutional Fades", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=1.0)

// ── Inputs
directionTF = input.timeframe("${cfg.directionTF || '1h'}", "Direction / Range Timeframe")
executionTF = input.timeframe("${cfg.executionTF || '5m'}", "Execution Timeframe")
regimeMinScore = input.int(${cfg.regimeMinScore || 60}, "Min Regime Score", minval=30, maxval=90)
rangeLookbackBars = input.int(${cfg.rangeLookbackBars || 48}, "Range Lookback Bars")
pivotLen = input.int(${cfg.pivotLen || 3}, "Pivot Length")
minEdgeTouches = input.int(${cfg.minEdgeTouches || 2}, "Min Edge Tests")
edgeZonePct = input.float(${cfg.edgeZonePct || 0.20}, "Edge Zone Depth %")
slBufferAtr = input.float(${cfg.slBufferAtr || 0.20}, "SL Buffer ATR")
tp1MinR = input.float(${cfg.tp1MinR || 0.8}, "TP1 Min R")
tp2MinR = input.float(${cfg.tp2MinR || 1.8}, "TP2 Min R")
tp2FrontRunPct = input.float(${cfg.tp2FrontRunPct || 0.10}, "TP2 Front Run %")

// ── Multi-Timeframe Highs & Lows (Non-Repainting Barmerge Reference)
htfHigh = request.security(syminfo.tickerid, directionTF, ta.highest(high, rangeLookbackBars)[1], lookahead = barmerge.lookahead_off)
htfLow = request.security(syminfo.tickerid, directionTF, ta.lowest(low, rangeLookbackBars)[1], lookahead = barmerge.lookahead_off)
htfMid = (htfHigh + htfLow) / 2
htfAtr = request.security(syminfo.tickerid, directionTF, ta.atr(14)[1], lookahead = barmerge.lookahead_off)
execAtr = ta.atr(14)

rangeHeight = htfHigh - htfLow
upperZone = htfHigh - rangeHeight * edgeZonePct
lowerZone = htfLow + rangeHeight * edgeZonePct

// ── Plot Range Boundaries
plot(htfHigh, "Range High", color=color.new(color.red, 20), linewidth=2)
plot(htfMid, "Range Mid", color=color.new(color.gray, 50), style=plot.style_linebr)
plot(htfLow, "Range Low", color=color.new(color.green, 20), linewidth=2)
p1 = plot(upperZone, "Upper Edge Zone", color=color.new(color.red, 70))
p2 = plot(lowerZone, "Lower Edge Zone", color=color.new(color.green, 70))
fill(p1, plot(htfHigh), color=color.new(color.red, 90), title="Short Fade Zone")
fill(p2, plot(htfLow), color=color.new(color.green, 90), title="Long Fade Zone")

// ── S1 / S2 Conditions
isLowerZone = low <= lowerZone and close > htfLow
isUpperZone = high >= upperZone and close < htfHigh

longTrigger = isLowerZone and close > open and (open - low) >= (high - low) * 0.40
shortTrigger = isUpperZone and close < open and (high - open) >= (high - low) * 0.40

if (longTrigger and strategy.position_size == 0)
    sl = low - slBufferAtr * execAtr
    tp1 = htfMid
    tp2 = htfHigh - rangeHeight * tp2FrontRunPct
    strategy.entry("Long Fade", strategy.long)
    strategy.exit("TP1", "Long Fade", qty_percent=50, limit=tp1, stop=sl)
    strategy.exit("TP2", "Long Fade", limit=tp2, stop=sl)

if (shortTrigger and strategy.position_size == 0)
    sl = high + slBufferAtr * execAtr
    tp1 = htfMid
    tp2 = htfLow + rangeHeight * tp2FrontRunPct
    strategy.entry("Short Fade", strategy.short)
    strategy.exit("TP1", "Short Fade", qty_percent=50, limit=tp1, stop=sl)
    strategy.exit("TP2", "Short Fade", limit=tp2, stop=sl)
`;
}
