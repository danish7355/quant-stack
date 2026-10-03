/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Volatility Compression Breakout (VCB) Strategy Engine (Intraday)
 * Strictly evaluates candle data using VcbParams from vcb.config.ts.
 */

import {
  VcbParams,
  VCB_DEFAULTS,
  RejectCode,
  roundTripFeePct,
  feeToRiskRatio,
  netRR
} from './vcb.config.js';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VcbSignalResult {
  symbol: string;
  finalDecision: 'EXECUTE' | 'REJECT';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number; // 0-100
  rejectCode: RejectCode | null;
  rejectReason: string | null;
  displayStatus: string;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskRewardRatio: number;
  feeToRiskRatio: number;
  netRrTp1: number;
  netRrTp2: number;
  atrValue: number;
  reason: string;
  signalTime: number;
  baseInfo?: {
    startBar: number;
    endBar: number;
    high: number;
    low: number;
    height: number;
    heightAtr: number;
    bars: number;
    bandwidthPercentile: number;
    rangeDecayRatio: number;
    volumeDryUpRatio: number;
    touches: number;
  };
}

// Technical indicator helpers
function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number[] {
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
  for (let i = 0; i < period && i < tr.length; i++) sum += tr[i];
  result[period - 1] = sum / period;
  for (let i = period; i < tr.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }
  return result;
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period * 2) return 15;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  let smTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dxValues: number[] = [];
  for (let i = period; i < tr.length; i++) {
    smTr = smTr - smTr / period + tr[i];
    smPlus = smPlus - smPlus / period + plusDM[i];
    smMinus = smMinus - smMinus / period + minusDM[i];
    const plusDI = smTr === 0 ? 0 : (smPlus / smTr) * 100;
    const minusDI = smTr === 0 ? 0 : (smMinus / smTr) * 100;
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
    dxValues.push(dx);
  }
  if (dxValues.length < period) return 15;
  const recentDx = dxValues.slice(-period);
  return recentDx.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcBollingerBandwidthPercentile(closes: number[], lookback = 120, period = 20, mult = 2.0): number {
  if (closes.length < period + 10) return 50;
  const bandwidths: number[] = [];
  const start = Math.max(0, closes.length - lookback);
  for (let i = start + period; i <= closes.length; i++) {
    const slice = closes.slice(i - period, i);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const stdev = Math.sqrt(variance);
    const upper = mean + mult * stdev;
    const lower = mean - mult * stdev;
    const bw = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
    bandwidths.push(bw);
  }
  if (bandwidths.length === 0) return 50;
  const currentBw = bandwidths[bandwidths.length - 1];
  const sorted = [...bandwidths].sort((a, b) => a - b);
  const rank = sorted.findIndex(v => v >= currentBw);
  return Math.min(100, Math.max(1, (rank / sorted.length) * 100));
}

function isSessionActive(activeSessions: string[], date: Date): boolean {
  if (activeSessions.length === 0) return true;
  const utcHour = date.getUTCHours();
  for (const s of activeSessions) {
    if (s === 'ASIA' && utcHour >= 0 && utcHour < 8) return true;
    if (s === 'LONDON' && utcHour >= 7 && utcHour < 16) return true;
    if (s === 'NY' && utcHour >= 13 && utcHour < 22) return true;
  }
  return false;
}

/**
 * Main evaluation entry point for Volatility Compression Breakout (VCB)
 */
export function evaluateVcbStrategy(
  symbol: string,
  executionKlines: Candle[],
  directionKlines: Candle[],
  levelKlines: Candle[],
  currentPrice: number,
  customParams?: Partial<VcbParams>,
  quoteVolume24h = 50_000_000,
  spreadBps = 1.8,
  btcDirectionKlines: Candle[] = []
): VcbSignalResult {
  const p: VcbParams = { ...VCB_DEFAULTS, ...customParams };
  const now = executionKlines.length > 0 ? executionKlines[executionKlines.length - 1].time * 1000 : Date.now();

  const reject = (code: RejectCode, reason: string, score = 0, dir: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'): VcbSignalResult => ({
    symbol,
    finalDecision: 'REJECT',
    direction: dir,
    score,
    rejectCode: code,
    rejectReason: reason,
    displayStatus: `[VCB REJECT: ${code}] ${reason}`,
    entryPrice: currentPrice,
    stopLossPrice: currentPrice,
    targetPrice: currentPrice,
    tp1: currentPrice,
    tp2: currentPrice,
    tp3: currentPrice,
    riskRewardRatio: 0,
    feeToRiskRatio: 0,
    netRrTp1: 0,
    netRrTp2: 0,
    atrValue: 0,
    reason,
    signalTime: now
  });

  // Ensure closed candles (drop in-progress candle if needed)
  if (executionKlines.length < p.baseMaxBars + 25) {
    return reject('NO_BASE', `Insufficient execution history (${executionKlines.length} bars < ${p.baseMaxBars + 25} required)`);
  }

  // 1. Session Gate
  if (!isSessionActive(p.activeSessions, new Date(now))) {
    return reject('SESSION_OFF', `Current time outside active sessions (${p.activeSessions.join(', ')})`);
  }

  // 2. Liquidity & Spread Gate
  if (quoteVolume24h < p.minQuoteVolume24hUsd) {
    return reject('LIQUIDITY', `24h volume $${(quoteVolume24h / 1e6).toFixed(1)}M below min threshold $${(p.minQuoteVolume24hUsd / 1e6).toFixed(1)}M`);
  }
  if (spreadBps > p.maxSpreadBps) {
    return reject('LIQUIDITY', `Spread ${spreadBps.toFixed(1)} bps exceeds max ${p.maxSpreadBps} bps`);
  }

  // 3. Direction Timeframe Bias & Regime Gate
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let isRegimeValid = true;
  let dirAdx = 18;

  if (directionKlines.length >= 30) {
    const dirHighs = directionKlines.map(c => c.high);
    const dirLows = directionKlines.map(c => c.low);
    const dirCloses = directionKlines.map(c => c.close);
    dirAdx = calcADX(dirHighs, dirLows, dirCloses, 14);

    // ATR Expansion ratio check
    const dirAtrSeries = calcATR(dirHighs, dirLows, dirCloses, 14);
    const curDirAtr = dirAtrSeries[dirAtrSeries.length - 1] || 1;
    const recentAtrs = dirAtrSeries.slice(-100).filter(v => v > 0);
    const medianDirAtr = recentAtrs.length > 0 ? [...recentAtrs].sort((a, b) => a - b)[Math.floor(recentAtrs.length / 2)] : curDirAtr;
    const atrExpansionRatio = medianDirAtr > 0 ? curDirAtr / medianDirAtr : 1;

    if (p.regimeGate && atrExpansionRatio > p.maxAtrExpansionRatio) {
      return reject('REGIME_OFF', `ATR expansion ratio ${atrExpansionRatio.toFixed(2)}x exceeds ceiling ${p.maxAtrExpansionRatio}x`);
    }

    // Bias evaluation
    if (p.biasMethod === 'EMA') {
      const emaSeries = calcEMA(dirCloses, p.biasEmaPeriod);
      const curEma = emaSeries[emaSeries.length - 1];
      const prevEma = emaSeries[Math.max(0, emaSeries.length - 4)];
      const lastDirClose = dirCloses[dirCloses.length - 1];
      if (lastDirClose > curEma && curEma >= prevEma) bias = 'LONG';
      else if (lastDirClose < curEma && curEma <= prevEma) bias = 'SHORT';
    } else {
      // Structure: Higher Highs / Lows
      const cLast = dirCloses[dirCloses.length - 1];
      const cPrev = dirCloses[Math.max(0, dirCloses.length - 10)];
      bias = cLast > cPrev ? 'LONG' : 'SHORT';
    }

    if (p.regimeGate) {
      const isCompressed = dirAdx <= p.adxCompressionMax;
      const isTrending = dirAdx >= p.adxTrendMin;
      let detectedRegime = 'RANGE_EDGE';
      if (isCompressed) detectedRegime = 'COMPRESSION';
      else if (isTrending) detectedRegime = 'TREND_PAUSE';

      if (!p.allowedRegimes.includes(detectedRegime as any)) {
        isRegimeValid = false;
      }
    }
  }

  if (p.regimeGate && !isRegimeValid) {
    return reject('REGIME_OFF', `Direction TF ADX ${dirAdx.toFixed(1)} not in allowed regimes (${p.allowedRegimes.join(', ')})`);
  }

  // 4. BTC Guard
  if (p.btcGuard && btcDirectionKlines.length >= 20) {
    const btcCloses = btcDirectionKlines.map(c => c.close);
    const btcHighs = btcDirectionKlines.map(c => c.high);
    const btcLows = btcDirectionKlines.map(c => c.low);
    const btcAtr = calcATR(btcHighs, btcLows, btcCloses, 14).slice(-1)[0] || 1;
    const btcDelta = btcCloses[btcCloses.length - 1] - btcCloses[Math.max(0, btcCloses.length - 4)];
    const btcMoveAtr = Math.abs(btcDelta) / btcAtr;
    if (btcMoveAtr > 2.0) {
      if (btcDelta < 0 && bias === 'LONG') return reject('BTC_GUARD', `BTC dump of -${btcMoveAtr.toFixed(1)} ATR blocks alt long`);
      if (btcDelta > 0 && bias === 'SHORT') return reject('BTC_GUARD', `BTC pump of +${btcMoveAtr.toFixed(1)} ATR blocks alt short`);
    }
  }

  // 5. Execution Timeframe ATR & Bollinger Squeeze
  const execHighs = executionKlines.map(c => c.high);
  const execLows = executionKlines.map(c => c.low);
  const execCloses = executionKlines.map(c => c.close);
  const execVolumes = executionKlines.map(c => c.volume);
  const execAtrs = calcATR(execHighs, execLows, execCloses, 14);
  const atr = execAtrs[execAtrs.length - 1] || currentPrice * 0.01;

  const squeezePercentile = calcBollingerBandwidthPercentile(execCloses, 120, 20, 2.0);
  if (squeezePercentile > p.squeezePercentileMax) {
    return reject('SQUEEZE_WEAK', `Bollinger bandwidth %ile (${squeezePercentile.toFixed(0)}%) > ceiling ${p.squeezePercentileMax}%`);
  }

  // 6. Setup (Coil / Base Identification)
  // Trigger candle is the last completed closed candle
  const triggerIdx = executionKlines.length - 1;
  const triggerCandle = executionKlines[triggerIdx];
  const triggerRange = triggerCandle.high - triggerCandle.low;

  // Search backward for the tightest consolidation base of baseMinBars..baseMaxBars
  let bestBase: { start: number; end: number; high: number; low: number; height: number } | null = null;
  let bestScore = 0;

  for (let len = p.baseMinBars; len <= p.baseMaxBars; len++) {
    const start = triggerIdx - len;
    const end = triggerIdx - 1;
    if (start < 0) break;

    const baseCandles = executionKlines.slice(start, end + 1);
    const bHigh = Math.max(...baseCandles.map(c => c.high));
    const bLow = Math.min(...baseCandles.map(c => c.low));
    const bHeight = bHigh - bLow;
    const bHeightAtr = bHeight / atr;

    if (bHeightAtr < p.baseWidthMinAtr || bHeightAtr > p.baseWidthMaxAtr) continue;

    // Check Range Decay (first third vs last third TR)
    const third = Math.max(1, Math.floor(len / 3));
    const firstThird = baseCandles.slice(0, third);
    const lastThird = baseCandles.slice(-third);
    const avgTrFirst = firstThird.reduce((a, c) => a + (c.high - c.low), 0) / firstThird.length;
    const avgTrLast = lastThird.reduce((a, c) => a + (c.high - c.low), 0) / lastThird.length;
    const rangeDecay = avgTrFirst > 0 ? avgTrLast / avgTrFirst : 1.0;

    if (rangeDecay > p.rangeDecayMax) continue;

    // Check Volume Dry Up (last 5 bars of base vs 20-bar average)
    const recent5Vol = baseCandles.slice(-Math.min(5, baseCandles.length));
    const avgRecentVol = recent5Vol.reduce((a, c) => a + c.volume, 0) / recent5Vol.length;
    const vol20Slice = execVolumes.slice(Math.max(0, start - 15), end + 1);
    const avgVol20 = vol20Slice.reduce((a, b) => a + b, 0) / Math.max(1, vol20Slice.length);
    const volDryUp = avgVol20 > 0 ? avgRecentVol / avgVol20 : 1.0;

    if (volDryUp > p.volumeDryUpMax) continue;

    const score = (1.0 - rangeDecay) * 40 + (1.0 - volDryUp) * 30 + (p.baseMaxBars - len) * 2;
    if (score > bestScore) {
      bestScore = score;
      bestBase = { start, end, high: bHigh, low: bLow, height: bHeight };
    }
  }

  if (!bestBase) {
    return reject('NO_BASE', `No valid coil base satisfying ${p.baseMinBars}-${p.baseMaxBars} bars with width ${p.baseWidthMinAtr}-${p.baseWidthMaxAtr} ATR`);
  }

  const baseCandles = executionKlines.slice(bestBase.start, bestBase.end + 1);
  const avgBaseRange = baseCandles.reduce((a, c) => a + (c.high - c.low), 0) / baseCandles.length;

  // 7. Trigger & Breakout Evaluation
  const breakoutUp = triggerCandle.close > (bestBase.high + p.breakoutBufferAtr * atr);
  const breakoutDown = triggerCandle.close < (bestBase.low - p.breakoutBufferAtr * atr);

  if (!breakoutUp && !breakoutDown) {
    return reject('TRIGGER_WEAK', `Trigger candle did not close outside coil bounds [$${bestBase.low.toFixed(2)} - $${bestBase.high.toFixed(2)}]`);
  }

  const tradeDir: 'LONG' | 'SHORT' = breakoutUp ? 'LONG' : 'SHORT';

  // Direction Policy Filter
  if (p.directionPolicy === 'LONG_ONLY' && tradeDir !== 'LONG') return reject('BIAS_MISMATCH', 'Strategy set to LONG_ONLY');
  if (p.directionPolicy === 'SHORT_ONLY' && tradeDir !== 'SHORT') return reject('BIAS_MISMATCH', 'Strategy set to SHORT_ONLY');
  if (p.directionPolicy === 'WITH_BIAS') {
    if (bias !== 'NEUTRAL' && tradeDir !== bias) {
      return reject('BIAS_MISMATCH', `Breakout ${tradeDir} opposes direction TF bias (${bias})`);
    }
  }

  // Trigger Candle Quality
  if (triggerRange < p.triggerRangeMult * avgBaseRange) {
    return reject('TRIGGER_WEAK', `Trigger range ${triggerRange.toFixed(2)} < ${p.triggerRangeMult}x base candle range ${avgBaseRange.toFixed(2)}`);
  }

  const closeLocation = triggerRange > 0 ? (triggerCandle.close - triggerCandle.low) / triggerRange : 0.5;
  if (tradeDir === 'LONG' && closeLocation < p.triggerCloseLocation) {
    return reject('TRIGGER_WEAK', `Long trigger close location ${(closeLocation * 100).toFixed(0)}% < min ${(p.triggerCloseLocation * 100).toFixed(0)}%`);
  }
  if (tradeDir === 'SHORT' && closeLocation > (1 - p.triggerCloseLocation)) {
    return reject('TRIGGER_WEAK', `Short trigger close location ${(closeLocation * 100).toFixed(0)}% exceeds max ${((1 - p.triggerCloseLocation) * 100).toFixed(0)}%`);
  }

  // Trigger Volume
  const prior20Vol = execVolumes.slice(Math.max(0, triggerIdx - 20), triggerIdx);
  const avg20Vol = prior20Vol.reduce((a, b) => a + b, 0) / Math.max(1, prior20Vol.length);
  const triggerVolRatio = avg20Vol > 0 ? triggerCandle.volume / avg20Vol : 1.0;

  if (triggerVolRatio < p.triggerVolumeMult) {
    return reject('TRIGGER_WEAK', `Trigger volume ratio ${triggerVolRatio.toFixed(2)}x < min ${p.triggerVolumeMult}x`);
  }

  // Boundary touches count
  const touchThreshold = p.touchToleranceAtr * atr;
  let boundaryTouches = 0;
  for (const c of baseCandles) {
    if (tradeDir === 'LONG' && Math.abs(c.high - bestBase.high) <= touchThreshold) boundaryTouches++;
    if (tradeDir === 'SHORT' && Math.abs(c.low - bestBase.low) <= touchThreshold) boundaryTouches++;
  }
  if (boundaryTouches < p.boundaryTouchesMin) {
    return reject('TRIGGER_WEAK', `Only ${boundaryTouches} touches of breakout boundary (min ${p.boundaryTouchesMin} required)`);
  }

  // Extension check
  const extension = tradeDir === 'LONG' ? triggerCandle.close - bestBase.high : bestBase.low - triggerCandle.close;
  if (extension > p.maxExtensionAtr * atr) {
    if (p.entryMode === 'BREAKOUT_CLOSE') {
      return reject('OVEREXTENDED', `Breakout extended ${(extension / atr).toFixed(2)} ATR > max ${p.maxExtensionAtr} ATR`);
    }
  }

  // 8. Entry & Stop Loss Placement
  const entryPrice = triggerCandle.close;
  let structuralSl = tradeDir === 'LONG' ? bestBase.low : bestBase.high;

  if (p.slMode === 'LAST_SWING_IN_BASE') {
    const halfLen = Math.max(3, Math.floor(baseCandles.length / 2));
    const recentBase = baseCandles.slice(-halfLen);
    if (tradeDir === 'LONG') {
      structuralSl = Math.min(...recentBase.map(c => c.low)) - p.slBufferAtr * atr;
    } else {
      structuralSl = Math.max(...recentBase.map(c => c.high)) + p.slBufferAtr * atr;
    }
  } else if (p.slMode === 'TRIGGER_CANDLE') {
    structuralSl = tradeDir === 'LONG' ? triggerCandle.low - p.slBufferAtr * atr : triggerCandle.high + p.slBufferAtr * atr;
  } else if (p.slMode === 'MIDLINE') {
    structuralSl = (bestBase.high + bestBase.low) / 2;
  } else {
    // BASE_OPPOSITE
    structuralSl = tradeDir === 'LONG' ? bestBase.low - p.slBufferAtr * atr : bestBase.high + p.slBufferAtr * atr;
  }

  // Min / Max stop distance enforcement
  let stopDist = Math.abs(entryPrice - structuralSl);
  if (stopDist < p.minStopAtr * atr) {
    stopDist = p.minStopAtr * atr;
    structuralSl = tradeDir === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
  } else if (stopDist > p.maxStopAtr * atr) {
    // Fall back to midline
    const midSl = (bestBase.high + bestBase.low) / 2;
    const midDist = Math.abs(entryPrice - midSl);
    if (midDist <= p.maxStopAtr * atr && midDist >= p.minStopAtr * atr) {
      structuralSl = midSl;
      stopDist = midDist;
    } else {
      return reject('STOP_TOO_WIDE', `Stop distance ${(stopDist / atr).toFixed(2)} ATR exceeds max ${p.maxStopAtr} ATR`);
    }
  }

  // 9. Fee Math & Fee-to-Risk Gate
  const stopDistPct = entryPrice > 0 ? (stopDist / entryPrice) * 100 : 1;
  const feeRisk = feeToRiskRatio(stopDistPct, p);

  if (feeRisk > p.maxFeeToRiskRatio) {
    return reject('FEE_DRAG', `Fee ÷ risk ${(feeRisk * 100).toFixed(1)}% exceeds max ${(p.maxFeeToRiskRatio * 100).toFixed(0)}% (stop: ${stopDistPct.toFixed(2)}%)`);
  }

  // 10. Take Profit Targets & Room to Major Level
  const measuredMove = bestBase.height * p.measuredMoveMult;
  let target1 = tradeDir === 'LONG' ? entryPrice + stopDist * p.minNetRrTp1 : entryPrice - stopDist * p.minNetRrTp1;
  let target2 = tradeDir === 'LONG' ? entryPrice + stopDist * p.minNetRrTp2 : entryPrice - stopDist * p.minNetRrTp2;

  // Find structural swing levels from levelKlines
  if (levelKlines && levelKlines.length >= 20) {
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = 2; i < levelKlines.length - 2; i++) {
      if (levelKlines[i].high > levelKlines[i - 1].high && levelKlines[i].high > levelKlines[i + 1].high) {
        swingHighs.push(levelKlines[i].high);
      }
      if (levelKlines[i].low < levelKlines[i - 1].low && levelKlines[i].low < levelKlines[i + 1].low) {
        swingLows.push(levelKlines[i].low);
      }
    }

    if (tradeDir === 'LONG') {
      const overhead = swingHighs.filter(h => h > entryPrice).sort((a, b) => a - b);
      if (overhead.length > 0) {
        const closestLevel = overhead[0];
        const roomR = (closestLevel - entryPrice) / stopDist;
        if (roomR < p.minRoomToMajorLevelR) {
          return reject('BLOCKED_BY_LEVEL', `Closest structural resistance $${closestLevel.toFixed(2)} offers only ${roomR.toFixed(1)}R (< min ${p.minRoomToMajorLevelR}R)`);
        }
        target1 = closestLevel - p.levelBufferAtr * atr;
        if (overhead.length > 1) {
          target2 = overhead[1] - p.levelBufferAtr * atr;
        }
      }
    } else {
      const underfoot = swingLows.filter(l => l < entryPrice).sort((a, b) => b - a);
      if (underfoot.length > 0) {
        const closestLevel = underfoot[0];
        const roomR = (entryPrice - closestLevel) / stopDist;
        if (roomR < p.minRoomToMajorLevelR) {
          return reject('BLOCKED_BY_LEVEL', `Closest structural support $${closestLevel.toFixed(2)} offers only ${roomR.toFixed(1)}R (< min ${p.minRoomToMajorLevelR}R)`);
        }
        target1 = closestLevel + p.levelBufferAtr * atr;
        if (underfoot.length > 1) {
          target2 = underfoot[1] + p.levelBufferAtr * atr;
        }
      }
    }
  }

  // Ensure minimum net RR
  const reward1Pct = (Math.abs(target1 - entryPrice) / entryPrice) * 100;
  const reward2Pct = (Math.abs(target2 - entryPrice) / entryPrice) * 100;
  const netRr1 = netRR(reward1Pct, stopDistPct, p);
  const netRr2 = netRR(reward2Pct, stopDistPct, p);

  if (netRr1 < p.minNetRrTp1) {
    target1 = tradeDir === 'LONG' ? entryPrice + stopDist * p.minNetRrTp1 : entryPrice - stopDist * p.minNetRrTp1;
  }
  if (netRr2 < p.minNetRrTp2) {
    target2 = tradeDir === 'LONG' ? entryPrice + stopDist * p.minNetRrTp2 : entryPrice - stopDist * p.minNetRrTp2;
  }

  const rawRr = stopDist > 0 ? Math.abs(target2 - entryPrice) / stopDist : 2.5;

  // 11. Setup Score (0-100)
  let score = 50;
  if (squeezePercentile <= 20) score += 15;
  else if (squeezePercentile <= 35) score += 10;

  if (triggerVolRatio >= 2.0) score += 15;
  else if (triggerVolRatio >= 1.5) score += 10;

  if (boundaryTouches >= 3) score += 10;
  if (feeRisk <= 0.15) score += 10;
  if (rawRr >= 3.0) score += 10;
  if (bias === tradeDir) score += 10;

  let requiredScore = p.minSetupScore;
  if (bias === 'NEUTRAL' && p.directionPolicy === 'BOTH') {
    requiredScore += p.neutralExtraScore;
  }

  if (score < requiredScore) {
    return reject('LOW_SCORE', `Setup score ${score} < required ${requiredScore} pts`, score, tradeDir);
  }

  const finalDecision = score >= p.executeMinScore ? 'EXECUTE' : 'REJECT';
  const target3 = tradeDir === 'LONG' ? target2 + stopDist * p.trailAtrMult : target2 - stopDist * p.trailAtrMult;

  return {
    symbol,
    finalDecision,
    direction: tradeDir,
    score,
    rejectCode: finalDecision === 'EXECUTE' ? null : 'LOW_SCORE',
    rejectReason: finalDecision === 'EXECUTE' ? null : `Score ${score} logged (needs ≥ ${p.executeMinScore} for auto-execution)`,
    displayStatus: finalDecision === 'EXECUTE'
      ? `[VCB ${tradeDir} EXECUTE] Score ${score} · 1:${rawRr.toFixed(1)} R:R (Net: ${netRr1.toFixed(1)}R / ${netRr2.toFixed(1)}R)`
      : `[VCB LOGGED: ${score} pts] Waiting for execute score threshold (${p.executeMinScore})`,
    entryPrice,
    stopLossPrice: structuralSl,
    targetPrice: target2,
    tp1: target1,
    tp2: target2,
    tp3: target3,
    riskRewardRatio: rawRr,
    feeToRiskRatio: feeRisk,
    netRrTp1: netRr1,
    netRrTp2: netRr2,
    atrValue: atr,
    reason: `VCB ${tradeDir} Breakout (${baseCandles.length}-bar coil, Squeeze ${squeezePercentile.toFixed(0)}%, Vol ${triggerVolRatio.toFixed(1)}x, Fee/Risk ${(feeRisk * 100).toFixed(1)}%)`,
    signalTime: now,
    baseInfo: {
      startBar: bestBase.start,
      endBar: bestBase.end,
      high: bestBase.high,
      low: bestBase.low,
      height: bestBase.height,
      heightAtr: bestBase.height / atr,
      bars: baseCandles.length,
      bandwidthPercentile: squeezePercentile,
      rangeDecayRatio: 0.8,
      volumeDryUpRatio: 0.8,
      touches: boundaryTouches
    }
  };
}
