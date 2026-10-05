/**
 * RANGE_REGIME_V1 Engine
 *
 * Implements the full Range Regime V1 strategy:
 * - Direction/Range TF (e.g. 1h) builds range edges, ADX/ER regime score, and drift bias
 * - Execution TF (e.g. 5m/15m) triggers S1 (Edge Rejection), S2 (Sweep & Reclaim), S3 (Band Snap-back)
 * - Confluence grading (Grade A vs Grade B), fee drag floor, and asymmetric R:R targets
 */

import { calculateATR, calculateADX, calculateEMA, calculateSMA, calculateRSI } from '../../indicators.js';
import { calculateBollingerBands } from '../rangeMeanReversion.js';
import {
  RangeConfig,
  DEFAULTS,
  RejectCode,
  Tf,
  TF_MINUTES
} from './schema.js';

export interface RangeRegimeSignal {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  grade: 'GRADE_A' | 'GRADE_B';
  setupType: 'S1_EDGE_REJECTION' | 'S2_SWEEP_RECLAIM' | 'S3_BAND_SNAPBACK';
  confluenceScore: number;
  regimeScore: number;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeHeightAtr: number;
  riskMultiplier: number;
  riskPerUnit: number;
  r1: number;
  r2: number;
  blendedNetR: number;
  feeShareOfR: number;
  reason: string;
  rejectionReason: null;
}

export interface RangeRegimeRejection {
  rejectionReason: RejectCode;
  reason: string;
  regimeScore?: number;
  rangeHigh?: number;
  rangeLow?: number;
  direction?: 'LONG' | 'SHORT';
}

export type RangeRegimeResult = RangeRegimeSignal | RangeRegimeRejection;

export interface ExtraRangeLevels {
  pdh?: number;
  pdl?: number;
  vwap?: number;
  sessionHigh?: number;
  sessionLow?: number;
}

export interface RangeStateHistory {
  edgeTradeCounts?: Record<string, number>; // key: 'HIGH' | 'LOW'
  lastLossCandleTime?: number;
  dailySignalCount?: number;
}

/**
 * Calculates Kaufman Efficiency Ratio ER(n)
 * ER = |Change(n)| / Sum(|Change(1)| over n bars)
 */
export function calculateKaufmanER(closes: number[], period: number = 20): number {
  if (!closes || closes.length < period + 1) return 0.30;
  const change = Math.abs(closes[closes.length - 1] - closes[closes.length - 1 - period]);
  let sumPath = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sumPath += Math.abs(closes[i] - closes[i - 1]);
  }
  if (sumPath === 0) return 0;
  return change / sumPath;
}

/**
 * Finds swing pivots (highs and lows) over a candle series using left/right bar lag
 */
export function findSwingPivots(
  highs: number[],
  lows: number[],
  pivotLen: number = 3
): { swingHighs: { price: number; index: number }[]; swingLows: { price: number; index: number }[] } {
  const swingHighs: { price: number; index: number }[] = [];
  const swingLows: { price: number; index: number }[] = [];

  for (let i = pivotLen; i < highs.length - pivotLen; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= pivotLen; j++) {
      if (highs[i] <= highs[i - j] || highs[i] < highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] > lows[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push({ price: highs[i], index: i });
    if (isLow) swingLows.push({ price: lows[i], index: i });
  }

  return { swingHighs, swingLows };
}

/**
 * Main evaluation function for RANGE_REGIME_V1
 */
export function evaluateRangeRegimeV1(
  executionCandles: any[],
  directionCandles: any[],
  currentPrice: number,
  userConfig: Partial<RangeConfig> = {},
  extraLevels: ExtraRangeLevels = {},
  stateHistory: RangeStateHistory = {}
): RangeRegimeResult {
  const cfg: RangeConfig = { ...DEFAULTS, ...userConfig };

  if (!executionCandles || executionCandles.length < 35 || !directionCandles || directionCandles.length < 30) {
    return { rejectionReason: 'REGIME_SCORE_LOW', reason: 'Insufficient candle history for range regime analysis' };
  }

  const execCloses = executionCandles.map(c => c.close);
  const execHighs = executionCandles.map(c => c.high);
  const execLows = executionCandles.map(c => c.low);
  const execVolumes = executionCandles.map(c => c.volume || 0);

  const dirCloses = directionCandles.map(c => c.close);
  const dirHighs = directionCandles.map(c => c.high);
  const dirLows = directionCandles.map(c => c.low);

  // 1. ATR Computations
  const atrDirSeries = calculateATR(dirHighs, dirLows, dirCloses, 14);
  const atrDir = atrDirSeries[atrDirSeries.length - 1] || (dirCloses[dirCloses.length - 1] * 0.015);

  const atrExecSeries = calculateATR(execHighs, execLows, execCloses, 14);
  const atrExec = atrExecSeries[atrExecSeries.length - 1] || (execCloses[execCloses.length - 1] * 0.008);

  // 2. Regime Filter & Score on Direction TF
  const adxPeriod = Number(cfg.adxPeriod) || 14;
  const adxResult = calculateADX(dirHighs, dirLows, dirCloses, adxPeriod);
  const adx = adxResult.adx[adxResult.adx.length - 1] || 20;

  const adxHardMax = Number(cfg.adxHardMax) || 30;
  if (adx > adxHardMax) {
    return {
      rejectionReason: 'ADX_HARD_VETO',
      reason: `Direction TF ADX(${adxPeriod}) = ${adx.toFixed(1)} > hard veto cap of ${adxHardMax} (trending market)`
    };
  }

  const er = calculateKaufmanER(dirCloses, 20);

  // ATR expansion ratio: ATR_dir / SMA50(ATR_dir)
  const smaAtr50Series = calculateSMA(atrDirSeries, 50);
  const smaAtr50 = smaAtr50Series[smaAtr50Series.length - 1] || atrDir;
  const atrExpansion = smaAtr50 > 0 ? (atrDir / smaAtr50) : 1.0;

  // 3. Range Construction on Direction TF
  const lookbackBars = Math.min(Number(cfg.rangeLookbackBars) || 48, directionCandles.length - 1);
  const recentDirHighs = dirHighs.slice(-lookbackBars);
  const recentDirLows = dirLows.slice(-lookbackBars);
  const recentDirCloses = dirCloses.slice(-lookbackBars);

  const pivotLen = Number(cfg.pivotLen) || 3;
  const { swingHighs, swingLows } = findSwingPivots(recentDirHighs, recentDirLows, pivotLen);

  const highestHigh = Math.max(...recentDirHighs);
  const lowestLow = Math.min(...recentDirLows);

  const touchTolAtr = Number(cfg.touchTolAtr) || 0.35;
  const touchTolDir = touchTolAtr * atrDir;

  // Edge cluster: High edge = avg of swing highs within touchTolDir of highestHigh, or highestHigh
  const topCluster = swingHighs.filter(p => highestHigh - p.price <= touchTolDir).map(p => p.price);
  const rangeHigh = topCluster.length > 0 ? topCluster.reduce((s, p) => s + p, 0) / topCluster.length : highestHigh;

  // Low edge = avg of swing lows within touchTolDir of lowestLow, or lowestLow
  const bottomCluster = swingLows.filter(p => p.price - lowestLow <= touchTolDir).map(p => p.price);
  const rangeLow = bottomCluster.length > 0 ? bottomCluster.reduce((s, p) => s + p, 0) / bottomCluster.length : lowestLow;

  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeHeight = rangeHigh - rangeLow;
  const rangeHeightAtr = rangeHeight / atrDir;

  // Range Height Checks
  const minRangeAtr = Number(cfg.minRangeAtr) || 2.5;
  if (rangeHeightAtr < minRangeAtr) {
    return {
      rejectionReason: 'RANGE_TOO_NARROW',
      reason: `Range height ${rangeHeightAtr.toFixed(2)} ATR_dir is below min ${minRangeAtr} ATR (insufficient room for fees/RR)`,
      rangeHigh,
      rangeLow
    };
  }

  const maxRangeAtr = Number(cfg.maxRangeAtr) || 8.0;
  if (rangeHeightAtr > maxRangeAtr) {
    return {
      rejectionReason: 'RANGE_TOO_WIDE',
      reason: `Range height ${rangeHeightAtr.toFixed(2)} ATR_dir is wider than max ${maxRangeAtr} ATR (swing market, not bounded range)`,
      rangeHigh,
      rangeLow
    };
  }

  // Range Break Check: Direction TF close beyond edge by breakConfirmAtr
  const breakConfirmAtr = Number(cfg.breakConfirmAtr) || 0.30;
  const lastDirClose = dirCloses[dirCloses.length - 1];
  if (lastDirClose > rangeHigh + (breakConfirmAtr * atrDir) || lastDirClose < rangeLow - (breakConfirmAtr * atrDir)) {
    return {
      rejectionReason: 'RANGE_BROKEN',
      reason: `Direction TF closed beyond range edge by > ${breakConfirmAtr} ATR (breakout in progress)`,
      rangeHigh,
      rangeLow
    };
  }

  // Count Mid-range crossings in direction lookback
  let midCrossCount = 0;
  for (let i = 1; i < recentDirCloses.length; i++) {
    if ((recentDirCloses[i - 1] < rangeMid && recentDirCloses[i] >= rangeMid) ||
        (recentDirCloses[i - 1] > rangeMid && recentDirCloses[i] <= rangeMid)) {
      midCrossCount++;
    }
  }

  // Count edge touches
  let topTouches = 0;
  let bottomTouches = 0;
  for (let i = 0; i < recentDirHighs.length; i++) {
    if (rangeHigh - recentDirHighs[i] <= touchTolDir && recentDirHighs[i] >= rangeHigh - (touchTolDir * 2)) topTouches++;
    if (recentDirLows[i] - rangeLow <= touchTolDir && recentDirLows[i] <= rangeLow + (touchTolDir * 2)) bottomTouches++;
  }
  topTouches = Math.max(topTouches, topCluster.length, 1);
  bottomTouches = Math.max(bottomTouches, bottomCluster.length, 1);

  // Compute Regime Score (0-100)
  let regimeScore = 0;
  const adxSoftMax = Number(cfg.adxSoftMax) || 22;
  if (adx <= adxSoftMax) regimeScore += 25;
  else regimeScore += Math.max(0, 25 * (1 - (adx - adxSoftMax) / (adxHardMax - adxSoftMax)));

  const erMax = Number(cfg.erMax) || 0.30;
  if (er <= erMax) regimeScore += 25;
  else regimeScore += Math.max(0, 25 * (1 - (er - erMax) / 0.30));

  const minMidCrosses = Number(cfg.minMidCrosses) || 3;
  if (midCrossCount >= minMidCrosses) regimeScore += 20;
  else regimeScore += Math.max(0, 20 * (midCrossCount / minMidCrosses));

  const atrExpansionMax = Number(cfg.atrExpansionMax) || 1.30;
  if (atrExpansion <= 1.1) regimeScore += 15;
  else if (atrExpansion <= atrExpansionMax) regimeScore += Math.max(0, 15 * (1 - (atrExpansion - 1.1) / (atrExpansionMax - 1.1)));

  if (topTouches >= 2 && bottomTouches >= 2) regimeScore += 15;
  else regimeScore += (topTouches >= 2 || bottomTouches >= 2) ? 8 : 0;

  const regimeMinScore = Number(cfg.regimeMinScore) || 60;
  if (regimeScore < regimeMinScore) {
    return {
      rejectionReason: 'REGIME_SCORE_LOW',
      reason: `Regime score ${regimeScore.toFixed(0)} < min required ${regimeMinScore} (ADX=${adx.toFixed(1)}, ER=${er.toFixed(2)}, MidCross=${midCrossCount})`,
      regimeScore,
      rangeHigh,
      rangeLow
    };
  }

  // 4. Direction & Drift Bias Determination
  // Direction TF EMA50 slope
  const dirEma50Series = calculateEMA(dirCloses, 50);
  const ema50Now = dirEma50Series[dirEma50Series.length - 1] || rangeMid;
  const ema50Prev = dirEma50Series[Math.max(0, dirEma50Series.length - 6)] || ema50Now;
  const ema50Slope = ema50Now - ema50Prev;

  let driftBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (ema50Slope > 0.05 * atrDir && currentPrice > rangeMid) {
    driftBias = 'BULLISH';
  } else if (ema50Slope < -0.05 * atrDir && currentPrice < rangeMid) {
    driftBias = 'BEARISH';
  }

  const edgeZonePct = Number(cfg.edgeZonePct) || 0.20;
  const edgeZoneDepth = rangeHeight * edgeZonePct;

  const inBottomZone = currentPrice <= (rangeLow + edgeZoneDepth) && currentPrice >= (rangeLow - (0.6 * atrDir));
  const inTopZone = currentPrice >= (rangeHigh - edgeZoneDepth) && currentPrice <= (rangeHigh + (0.6 * atrDir));

  if (!inBottomZone && !inTopZone) {
    return {
      rejectionReason: 'NOT_IN_EDGE_ZONE',
      reason: `Price ${currentPrice.toFixed(4)} is in the range middle, outside edge zones (Bottom: <= ${(rangeLow + edgeZoneDepth).toFixed(4)}, Top: >= ${(rangeHigh - edgeZoneDepth).toFixed(4)})`,
      rangeHigh,
      rangeLow
    };
  }

  const tradeDirection: 'LONG' | 'SHORT' = inBottomZone ? 'LONG' : 'SHORT';

  // Bias mode filtering
  const biasMode = String(cfg.biasMode || 'AUTO');
  if (biasMode === 'LONG_ONLY' && tradeDirection === 'SHORT') {
    return { rejectionReason: 'COUNTER_BIAS_BLOCKED', reason: 'Short trade blocked by LONG_ONLY biasMode setting' };
  }
  if (biasMode === 'SHORT_ONLY' && tradeDirection === 'LONG') {
    return { rejectionReason: 'COUNTER_BIAS_BLOCKED', reason: 'Long trade blocked by SHORT_ONLY biasMode setting' };
  }

  // Counter bias check in AUTO mode
  let isAgainstDrift = false;
  if (biasMode === 'AUTO') {
    if (tradeDirection === 'LONG' && driftBias === 'BEARISH') isAgainstDrift = true;
    if (tradeDirection === 'SHORT' && driftBias === 'BULLISH') isAgainstDrift = true;
  }

  const counterBiasPolicy = String(cfg.counterBiasPolicy || 'SIZE_DOWN');
  if (isAgainstDrift && counterBiasPolicy === 'BLOCK') {
    return {
      rejectionReason: 'COUNTER_BIAS_BLOCKED',
      reason: `Trade direction ${tradeDirection} counters dominant drift ${driftBias} and counterBiasPolicy is BLOCK`
    };
  }

  // Check edge proven touches
  const testedTouches = tradeDirection === 'LONG' ? bottomTouches : topTouches;
  const minEdgeTouches = Number(cfg.minEdgeTouches) || 2;
  if (testedTouches < minEdgeTouches) {
    return {
      rejectionReason: 'EDGE_UNPROVEN',
      reason: `Tested ${tradeDirection === 'LONG' ? 'support' : 'resistance'} edge has only ${testedTouches} touches (min required: ${minEdgeTouches})`,
      rangeHigh,
      rangeLow
    };
  }

  // Check edge touch trade limit from state history
  const edgeKey = tradeDirection === 'LONG' ? 'LOW' : 'HIGH';
  const edgeTradeCount = (stateHistory.edgeTradeCounts?.[edgeKey] || 0);
  const maxEntriesPerEdge = Number(cfg.maxEntriesPerEdge) || 3;
  if (edgeTradeCount >= maxEntriesPerEdge) {
    return {
      rejectionReason: 'EDGE_TOUCH_LIMIT',
      reason: `Max entries per edge reached (${edgeTradeCount}/${maxEntriesPerEdge}) on ${edgeKey} edge`
    };
  }

  // Check Daily Cap
  const maxSignalsPerSymbolPerDay = Number(cfg.maxSignalsPerSymbolPerDay) || 6;
  if ((stateHistory.dailySignalCount || 0) >= maxSignalsPerSymbolPerDay) {
    return {
      rejectionReason: 'DAILY_CAP',
      reason: `Daily signal limit (${stateHistory.dailySignalCount}/${maxSignalsPerSymbolPerDay}) reached for symbol`
    };
  }

  // 5. Execution TF Setup Evaluation (S1, S2, S3)
  const execLen = executionCandles.length;
  const lastClosed = executionCandles[execLen - 1];
  const priorClosed = executionCandles[execLen - 2];

  // Impulse Veto Check: Any bar in recent 3 bars with range >= impulseVetoAtr * ATR_exec closing into the zone
  const impulseVetoAtr = Number(cfg.impulseVetoAtr) || 2.0;
  const impulseThreshold = impulseVetoAtr * atrExec;
  for (let i = Math.max(0, execLen - 3); i < execLen; i++) {
    const bar = executionCandles[i];
    const barRange = bar.high - bar.low;
    if (barRange >= impulseThreshold) {
      if (tradeDirection === 'LONG' && bar.close < bar.open && bar.close <= rangeLow + edgeZoneDepth) {
        return {
          rejectionReason: 'IMPULSE_VETO',
          reason: `Violent bearish impulse bar (${(barRange / atrExec).toFixed(1)}x ATR_exec) closed into support zone`
        };
      }
      if (tradeDirection === 'SHORT' && bar.close > bar.open && bar.close >= rangeHigh - edgeZoneDepth) {
        return {
          rejectionReason: 'IMPULSE_VETO',
          reason: `Violent bullish impulse bar (${(barRange / atrExec).toFixed(1)}x ATR_exec) closed into resistance zone`
        };
      }
    }
  }

  let triggeredSetup: 'S1_EDGE_REJECTION' | 'S2_SWEEP_RECLAIM' | 'S3_BAND_SNAPBACK' | null = null;
  let invalidationPrice = tradeDirection === 'LONG' ? lastClosed.low : lastClosed.high;
  let setupReason = '';

  const enableEdgeRejection = cfg.enableEdgeRejection !== false;
  const enableSweepReclaim = cfg.enableSweepReclaim !== false;
  const enableBandSnapback = cfg.enableBandSnapback !== false;

  const triggerMode = String(cfg.triggerMode || 'EITHER');
  const rejWickPct = Number(cfg.rejWickPct) || 0.40;
  const closeLocationMin = Number(cfg.closeLocationMin) || 0.60;

  // Evaluate S2: Sweep & Reclaim First (Higher Confluence)
  if (enableSweepReclaim && !triggeredSetup) {
    const sweepMinAtr = Number(cfg.sweepMinAtr) || 0.10;
    const sweepMaxAtrDir = Number(cfg.sweepMaxAtrDir) || 0.60;
    const reclaimBars = Number(cfg.reclaimBars) || 3;

    let foundSweep = false;
    let sweepExtreme = currentPrice;

    for (let i = 1; i <= reclaimBars; i++) {
      const idx = execLen - i;
      if (idx < 0) break;
      const b = executionCandles[idx];

      if (tradeDirection === 'LONG') {
        const sweepDepth = rangeLow - b.low;
        if (sweepDepth >= (sweepMinAtr * atrExec) && sweepDepth <= (sweepMaxAtrDir * atrDir)) {
          foundSweep = true;
          sweepExtreme = Math.min(sweepExtreme, b.low);
        }
      } else {
        const sweepDepth = b.high - rangeHigh;
        if (sweepDepth >= (sweepMinAtr * atrExec) && sweepDepth <= (sweepMaxAtrDir * atrDir)) {
          foundSweep = true;
          sweepExtreme = Math.max(sweepExtreme, b.high);
        }
      }
    }

    // Reclaim condition: lastClosed closes back inside the range edge
    if (foundSweep) {
      const isReclaimed = tradeDirection === 'LONG' ? lastClosed.close > rangeLow : lastClosed.close < rangeHigh;
      if (isReclaimed) {
        triggeredSetup = 'S2_SWEEP_RECLAIM';
        invalidationPrice = sweepExtreme;
        setupReason = `S2 Sweep & Reclaim of ${tradeDirection === 'LONG' ? 'support' : 'resistance'} edge (Extreme: ${sweepExtreme.toFixed(4)})`;
      }
    }
  }

  // Evaluate S1: Edge Rejection
  if (enableEdgeRejection && !triggeredSetup) {
    const barRange = lastClosed.high - lastClosed.low;
    if (barRange > 0) {
      if (tradeDirection === 'LONG') {
        const lowerWick = Math.min(lastClosed.open, lastClosed.close) - lastClosed.low;
        const wickRatio = lowerWick / barRange;
        const closeLoc = (lastClosed.close - lastClosed.low) / barRange;

        const isRejectionCandle = wickRatio >= rejWickPct && closeLoc >= closeLocationMin;
        const isReclaimClose = lastClosed.close > priorClosed.close && lastClosed.close > rangeLow;

        const validS1 = triggerMode === 'REJECTION_CANDLE'
          ? isRejectionCandle
          : triggerMode === 'RECLAIM_CLOSE'
          ? isReclaimClose
          : (isRejectionCandle || isReclaimClose);

        if (validS1) {
          triggeredSetup = 'S1_EDGE_REJECTION';
          invalidationPrice = Math.min(lastClosed.low, priorClosed.low);
          setupReason = `S1 Edge Rejection Candle at support edge (Wick: ${(wickRatio * 100).toFixed(0)}%, CloseLoc: ${(closeLoc * 100).toFixed(0)}%)`;
        }
      } else {
        const upperWick = lastClosed.high - Math.max(lastClosed.open, lastClosed.close);
        const wickRatio = upperWick / barRange;
        const closeLoc = (lastClosed.high - lastClosed.close) / barRange;

        const isRejectionCandle = wickRatio >= rejWickPct && closeLoc >= closeLocationMin;
        const isReclaimClose = lastClosed.close < priorClosed.close && lastClosed.close < rangeHigh;

        const validS1 = triggerMode === 'REJECTION_CANDLE'
          ? isRejectionCandle
          : triggerMode === 'RECLAIM_CLOSE'
          ? isReclaimClose
          : (isRejectionCandle || isReclaimClose);

        if (validS1) {
          triggeredSetup = 'S1_EDGE_REJECTION';
          invalidationPrice = Math.max(lastClosed.high, priorClosed.high);
          setupReason = `S1 Edge Rejection Candle at resistance edge (Wick: ${(wickRatio * 100).toFixed(0)}%, CloseLoc: ${(closeLoc * 100).toFixed(0)}%)`;
        }
      }
    }
  }

  // Evaluate S3: Band Snap-back (Grade B)
  if (enableBandSnapback && !triggeredSetup) {
    const bbPeriod = Number(cfg.bbPeriod) || 20;
    const bbStd = Number(cfg.bbStd) || 2.0;
    const bb = calculateBollingerBands(execCloses, bbPeriod, bbStd);

    const rsiPeriod = Number(cfg.rsiPeriod) || 14;
    const rsiSeries = calculateRSI(execCloses, rsiPeriod);
    const rsiNow = rsiSeries[rsiSeries.length - 1] || 50;
    const recentRsi = rsiSeries.slice(-3);

    const snapbackRangePosPct = Number(cfg.snapbackRangePosPct) || 0.30;
    const rangePos = (currentPrice - rangeLow) / rangeHeight;

    const lowerBbNow = bb.lower[bb.lower.length - 1];
    const upperBbNow = bb.upper[bb.upper.length - 1];
    const lowerBbPrev = bb.lower[bb.lower.length - 2];
    const upperBbPrev = bb.upper[bb.upper.length - 2];

    const rsiOversold = Number(cfg.rsiOversold) || 32;
    const rsiOverbought = Number(cfg.rsiOverbought) || 68;

    if (tradeDirection === 'LONG') {
      const hadRsiDip = recentRsi.some(r => r <= rsiOversold);
      const isBottomPos = rangePos <= snapbackRangePosPct;
      const closedInsideBand = priorClosed.low <= lowerBbPrev && lastClosed.close > lowerBbNow;

      if (hadRsiDip && isBottomPos && closedInsideBand) {
        triggeredSetup = 'S3_BAND_SNAPBACK';
        invalidationPrice = Math.min(lastClosed.low, priorClosed.low);
        setupReason = `S3 Band Snap-back re-entry from lower Bollinger Band (RSI: ${rsiNow.toFixed(1)})`;
      }
    } else {
      const hadRsiSpike = recentRsi.some(r => r >= rsiOverbought);
      const isTopPos = rangePos >= (1 - snapbackRangePosPct);
      const closedInsideBand = priorClosed.high >= upperBbPrev && lastClosed.close < upperBbNow;

      if (hadRsiSpike && isTopPos && closedInsideBand) {
        triggeredSetup = 'S3_BAND_SNAPBACK';
        invalidationPrice = Math.max(lastClosed.high, priorClosed.high);
        setupReason = `S3 Band Snap-back re-entry from upper Bollinger Band (RSI: ${rsiNow.toFixed(1)})`;
      }
    }
  }

  if (!triggeredSetup) {
    return {
      rejectionReason: 'NO_TRIGGER',
      reason: `No valid range trigger candle found (S1 Rejection, S2 Sweep/Reclaim, or S3 Snapback not active)`,
      rangeHigh,
      rangeLow
    };
  }

  // 6. Confluence Evaluation
  let confluenceScore = 0;

  // Volume point: lastClosed volume vs SMA20 volume
  const volSma20Series = calculateSMA(execVolumes, 20);
  const volSma20 = volSma20Series[volSma20Series.length - 1] || 1;
  const volSpikeMult = Number(cfg.volSpikeMult) || 1.30;
  if (lastClosed.volume >= (volSma20 * volSpikeMult)) confluenceScore++;

  // Key Level Confluence: PDH, PDL, VWAP within levelConfluenceAtr of edge
  const levelTol = (Number(cfg.levelConfluenceAtr) || 0.30) * atrDir;
  const testEdgePrice = tradeDirection === 'LONG' ? rangeLow : rangeHigh;
  const hasLevelConfluence = [
    extraLevels.pdh, extraLevels.pdl, extraLevels.vwap, extraLevels.sessionHigh, extraLevels.sessionLow
  ].some(lvl => typeof lvl === 'number' && Math.abs(lvl - testEdgePrice) <= levelTol);
  if (hasLevelConfluence) confluenceScore++;

  // Multi-touch edge bonus (testedTouches >= 3)
  if (testedTouches >= 3) confluenceScore++;

  // Setup quality bonus (S2 sweep or strong S1 wick)
  if (triggeredSetup === 'S2_SWEEP_RECLAIM') confluenceScore++;

  // RSI extreme bonus
  const execRsi = calculateRSI(execCloses, 14);
  const lastRsi = execRsi[execRsi.length - 1] || 50;
  if ((tradeDirection === 'LONG' && lastRsi <= 35) || (tradeDirection === 'SHORT' && lastRsi >= 65)) {
    confluenceScore++;
  }

  const minConfluence = Number(cfg.minConfluence) || 1;
  if (confluenceScore < minConfluence) {
    return {
      rejectionReason: 'CONFLUENCE_LOW',
      reason: `Confluence score ${confluenceScore} < min required ${minConfluence} (need volume, level, or multi-touch edge backing)`,
      rangeHigh,
      rangeLow
    };
  }

  // Grade Assignment: Grade A requires gradeAMin confluence and cannot be S3
  const gradeAMin = Number(cfg.gradeAMin) || 3;
  const isGradeA = confluenceScore >= gradeAMin && triggeredSetup !== 'S3_BAND_SNAPBACK';
  const grade: 'GRADE_A' | 'GRADE_B' = isGradeA ? 'GRADE_A' : 'GRADE_B';

  if (isAgainstDrift && counterBiasPolicy === 'A_GRADE_ONLY' && grade !== 'GRADE_A') {
    return {
      rejectionReason: 'COUNTER_BIAS_BLOCKED',
      reason: `Fade against drift ${driftBias} is Grade B, but policy requires A_GRADE_ONLY`
    };
  }

  // 7. Stop Loss Placement & Checks
  const slBufferAtr = Number(cfg.slBufferAtr) || 0.20;
  const slBuffer = slBufferAtr * atrExec;

  let rawSl = tradeDirection === 'LONG' ? (invalidationPrice - slBuffer) : (invalidationPrice + slBuffer);
  let stopDistance = Math.abs(currentPrice - rawSl);

  // Min Stop Distance Check (widen if too tight, do not reject)
  const minStopAtr = Number(cfg.minStopAtr) || 0.60;
  const minStopDist = minStopAtr * atrExec;
  if (stopDistance < minStopDist) {
    stopDistance = minStopDist;
    rawSl = tradeDirection === 'LONG' ? (currentPrice - stopDistance) : (currentPrice + stopDistance);
  }

  // Max Stop vs Range Check: Stop distance as fraction of range height
  const maxStopPctOfRange = Number(cfg.maxStopPctOfRange) || 0.30;
  if (stopDistance > (maxStopPctOfRange * rangeHeight)) {
    return {
      rejectionReason: 'STOP_TOO_WIDE',
      reason: `Stop distance ${stopDistance.toFixed(4)} (${(stopDistance / rangeHeight * 100).toFixed(1)}% of range) exceeds max ${maxStopPctOfRange * 100}% of range height`,
      rangeHigh,
      rangeLow
    };
  }

  // Fee Share of R Check: Round-trip fee / stopDistance
  const feeRoundTripPct = Number(cfg.feeRoundTripPct) || 0.118;
  const roundTripFeePerUnit = currentPrice * (feeRoundTripPct / 100);
  const feeShareOfR = roundTripFeePerUnit / stopDistance;
  const maxFeeShareOfR = Number(cfg.maxFeeShareOfR) || 0.30;

  if (feeShareOfR > maxFeeShareOfR) {
    return {
      rejectionReason: 'FEE_GATE',
      reason: `Round-trip fee ($${roundTripFeePerUnit.toFixed(4)}) consumes ${(feeShareOfR * 100).toFixed(1)}% of 1R stop distance (max allowed: ${maxFeeShareOfR * 100}%)`,
      rangeHigh,
      rangeLow
    };
  }

  // Slippage Guard Check: Price run from trigger candle close
  const maxSlippageR = Number(cfg.maxSlippageR) || 0.15;
  const driftFromClose = Math.abs(currentPrice - lastClosed.close);
  if ((driftFromClose / stopDistance) > maxSlippageR) {
    return {
      rejectionReason: 'SLIPPAGE_GUARD',
      reason: `Price drifted ${(driftFromClose / stopDistance).toFixed(2)}R from signal close (max allowed: ${maxSlippageR}R)`
    };
  }

  // 8. Take Profit Placement & Expectancy Verification
  const tp1MinR = Number(cfg.tp1MinR) || 0.80;
  const tp2MinR = Number(cfg.tp2MinR) || 1.80;
  const minBlendedNetR = Number(cfg.minBlendedNetR) || 1.20;
  const tp1ClosePct = (Number(cfg.tp1ClosePct) || 50) / 100;
  const tp2FrontRunPct = Number(cfg.tp2FrontRunPct) || 0.10;

  // TP1 Mode: NEAREST_LEVEL | RANGE_MID | VWAP
  const tp1Mode = String(cfg.tp1Mode || 'NEAREST_LEVEL');
  let tp1 = tradeDirection === 'LONG' ? rangeMid : rangeMid;

  if (tp1Mode === 'RANGE_MID') {
    tp1 = rangeMid;
  } else if (tp1Mode === 'VWAP' && typeof extraLevels.vwap === 'number') {
    tp1 = extraLevels.vwap;
  } else {
    // NEAREST_LEVEL: check if rangeMid clears tp1MinR, or use rangeMid
    const midDistance = Math.abs(rangeMid - currentPrice);
    if ((midDistance / stopDistance) >= tp1MinR) {
      tp1 = rangeMid;
    } else {
      tp1 = tradeDirection === 'LONG' ? (currentPrice + (tp1MinR * stopDistance)) : (currentPrice - (tp1MinR * stopDistance));
    }
  }

  // Ensure TP1 clears min R
  const tp1Distance = Math.abs(tp1 - currentPrice);
  const r1 = tp1Distance / stopDistance;
  if (r1 < tp1MinR) {
    tp1 = tradeDirection === 'LONG' ? (currentPrice + (tp1MinR * stopDistance)) : (currentPrice - (tp1MinR * stopDistance));
  }

  // TP2: Front-run opposite edge
  const tp2 = tradeDirection === 'LONG'
    ? (rangeHigh - (tp2FrontRunPct * rangeHeight))
    : (rangeLow + (tp2FrontRunPct * rangeHeight));

  const tp2Distance = Math.abs(tp2 - currentPrice);
  const r2 = tp2Distance / stopDistance;

  if (r2 < tp2MinR) {
    return {
      rejectionReason: 'RR_TOO_LOW',
      reason: `Opposite edge TP2 target offers ${r2.toFixed(2)}R < min required ${tp2MinR}R`,
      rangeHigh,
      rangeLow
    };
  }

  // TP3: Full opposite edge extreme or 3.0R
  const tp3 = tradeDirection === 'LONG' ? rangeHigh : rangeLow;

  // Blended Net R Calculation
  const blendedGrossR = (tp1ClosePct * r1) + ((1 - tp1ClosePct) * r2);
  const blendedNetR = blendedGrossR - feeShareOfR;

  if (blendedNetR < minBlendedNetR) {
    return {
      rejectionReason: 'RR_TOO_LOW',
      reason: `Blended net R after fees is ${blendedNetR.toFixed(2)}R < min required ${minBlendedNetR}R`,
      rangeHigh,
      rangeLow
    };
  }

  // 9. Risk Sizing Multiplier
  let riskMultiplier = 1.0;
  if (grade === 'GRADE_B') {
    riskMultiplier *= (Number(cfg.gradeBRiskMult) || 0.60);
  }
  if (isAgainstDrift && counterBiasPolicy === 'SIZE_DOWN') {
    riskMultiplier *= (Number(cfg.counterBiasSizeMult) || 0.50);
  }

  // 10. Composite Score (0-100)
  const score = Math.min(100, Math.max(50, Math.round(
    50 + (confluenceScore * 8) + (isGradeA ? 15 : 5) + (blendedNetR >= 2.0 ? 10 : 5) + (regimeScore >= 75 ? 10 : 0)
  )));

  return {
    direction: tradeDirection,
    entryPrice: currentPrice,
    sl: parseFloat(rawSl.toFixed(4)),
    tp1: parseFloat(tp1.toFixed(4)),
    tp2: parseFloat(tp2.toFixed(4)),
    tp3: parseFloat(tp3.toFixed(4)),
    score,
    grade,
    setupType: triggeredSetup,
    confluenceScore,
    regimeScore,
    rangeHigh: parseFloat(rangeHigh.toFixed(4)),
    rangeLow: parseFloat(rangeLow.toFixed(4)),
    rangeMid: parseFloat(rangeMid.toFixed(4)),
    rangeHeightAtr: parseFloat(rangeHeightAtr.toFixed(2)),
    riskMultiplier: parseFloat(riskMultiplier.toFixed(2)),
    riskPerUnit: parseFloat(stopDistance.toFixed(4)),
    r1: parseFloat(r1.toFixed(2)),
    r2: parseFloat(r2.toFixed(2)),
    blendedNetR: parseFloat(blendedNetR.toFixed(2)),
    feeShareOfR: parseFloat(feeShareOfR.toFixed(3)),
    reason: `${setupReason} [${grade} Confluence: ${confluenceScore}, Net R: ${blendedNetR.toFixed(2)}]`,
    rejectionReason: null
  };
}
