/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateEMA, calculateSMA, calculateATR, calculateADX, calculateRSI } from '../indicators.js';

export type HtfBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type SweptLevelType =
  | 'EQUAL_LOWS'
  | 'SESSION_LOW'
  | 'PREVIOUS_DAY_LOW'
  | 'SWING_LOW'
  | 'EQUAL_HIGHS'
  | 'SESSION_HIGH'
  | 'PREVIOUS_DAY_HIGH'
  | 'SWING_HIGH'
  | 'NONE';

// ==========================================
// 1. VCB REGIME FILTER
// ==========================================
export interface VcbRegimeMetrics {
  wasCompressed: boolean;
  volumeRatio: number;
  atr: number;
  atrMovingAverage: number;
  breakoutConfirmed: boolean;
  extremeVolatility: boolean;
  breakoutIntoMajorLevel: boolean;
  close: number;
  rangeHigh: number;
  rangeLow: number;
  closeLocation: number; // 0.0 to 1.0 (bottom to top of candle range)
  htfBias: HtfBias;
  // Breakout-Specific Enhancements:
  atrRatio?: number;             // current ATR / ATR(20) MA (default min 1.20)
  adx?: number;                  // Entry timeframe ADX(14) (default min 20)
  rsi?: number;                  // Entry timeframe RSI(14) (default > 55 Long, < 45 Short)
  bodyRatio?: number;            // Real body / Total candle range (default min 0.60)
  htfAdx?: number;               // HTF ADX(14) (default min 20)
  htfStructure?: 'HH_HL' | 'LH_LL' | 'SIDEWAYS'; // HTF market structure
  htfMaAligned?: boolean;        // HTF Price above/below EMA50/200
  retestConfirmed?: boolean;     // Option A: Retest held
  followThroughConfirmed?: boolean; // Option B: 2 consecutive closes or >= 0.35 ATR progress
  sessionAllowed?: boolean;      // In Kill Zone / active liquidity
  newsFilterPassed?: boolean;    // No high impact news within 1-2 hours
  requireRetestOrFollowThrough?: boolean;
  // User Customizable Threshold Overrides:
  minVolumeRatio?: number;       // default 1.50
  minAtrRatio?: number;          // default 1.20
  minAdx?: number;               // default 20
  minHtfAdx?: number;            // default 20
  minBodyRatio?: number;         // default 0.60
  minRsiBullish?: number;        // default 55
  maxRsiBearish?: number;        // default 45
  minCloseLocation?: number;     // default 0.70
  requireHtfStructure?: boolean; // default false unless explicitly required
}

/**
 * VCB Regime Filter:
 * Allows VCB trades only during genuine transition from compression to directional expansion.
 * Rejects low volume (< 1.5x), flat ATR (< 1.2x), low ADX (< 20), weak candle body (< 60%),
 * opposing momentum (RSI), opposing HTF structure/bias, large rejection wicks, extreme volatility,
 * and breakouts directly into higher timeframe key barriers.
 */
export function allowVCB(m: VcbRegimeMetrics, direction: 'LONG' | 'SHORT'): boolean {
  const minVolRatio = m.minVolumeRatio ?? 1.5;
  const minAtrRatio = m.minAtrRatio ?? 1.20;
  const minAdx = m.minAdx ?? 20;
  const minHtfAdx = m.minHtfAdx ?? 20;
  const minBodyRatio = m.minBodyRatio ?? 0.60;
  const minRsiBullish = m.minRsiBullish ?? 55;
  const maxRsiBearish = m.maxRsiBearish ?? 45;
  const minCloseLocation = m.minCloseLocation ?? 0.70;

  // ATR expansion ratio: check explicit atrRatio or compute from atr / atrMovingAverage
  const computedAtrRatio = m.atrRatio !== undefined
    ? m.atrRatio
    : (m.atrMovingAverage > 0 ? m.atr / m.atrMovingAverage : 1.0);

  // Hard "No-Trade" Regime check:
  // If ADX < minAdx OR ATR ratio < minAtrRatio OR volumeRatio < minVolRatio -> disable breakout
  if (m.adx !== undefined && m.adx < minAdx) return false;
  if (computedAtrRatio < minAtrRatio) return false;
  if (m.volumeRatio < minVolRatio) return false;

  // Candle quality gates
  if (m.bodyRatio !== undefined && m.bodyRatio < minBodyRatio) return false;
  if (m.extremeVolatility || m.breakoutIntoMajorLevel || !m.breakoutConfirmed || !m.wasCompressed) return false;

  // HTF Trend strength check
  if (m.htfAdx !== undefined && m.htfAdx < minHtfAdx) return false;
  if (m.htfMaAligned !== undefined && !m.htfMaAligned) return false;
  if (m.requireHtfStructure && m.htfStructure !== undefined) {
    if (direction === 'LONG' && m.htfStructure !== 'HH_HL') return false;
    if (direction === 'SHORT' && m.htfStructure !== 'LH_LL') return false;
  }

  // Retest or Follow-Through requirement (if enabled)
  if (m.requireRetestOrFollowThrough) {
    const hasConfirmation = m.retestConfirmed || m.followThroughConfirmed;
    if (!hasConfirmation) return false;
  }

  // Session & News gates
  if (m.sessionAllowed !== undefined && !m.sessionAllowed) return false;
  if (m.newsFilterPassed !== undefined && !m.newsFilterPassed) return false;

  if (direction === 'LONG') {
    if (m.close <= m.rangeHigh) return false;
    if (m.closeLocation < minCloseLocation) return false;
    if (!['BULLISH', 'NEUTRAL'].includes(m.htfBias)) return false;
    if (m.rsi !== undefined && m.rsi < minRsiBullish) return false;
    return true;
  }

  if (direction === 'SHORT') {
    if (m.close >= m.rangeLow) return false;
    if (m.closeLocation > (1 - minCloseLocation)) return false;
    if (!['BEARISH', 'NEUTRAL'].includes(m.htfBias)) return false;
    if (m.rsi !== undefined && m.rsi > maxRsiBearish) return false;
    return true;
  }

  return false;
}

// ==========================================
// 2. SMC LIQUIDITY REGIME FILTER
// ==========================================
export interface SmcRegimeMetrics {
  clearLiquidityPool: boolean;
  sweepDetected: boolean;
  rejectionClose: boolean;
  mssConfirmed: boolean;
  displacementConfirmed: boolean;
  fvgConfirmed: boolean;
  rewardRisk: number;
  extremeVolatility: boolean;
  middleOfRange: boolean;
  sweptLevelType: SweptLevelType;
  sweptLevel: number;
  close: number;
  htfBias: HtfBias;
  intoMajorResistance: boolean;
  intoMajorSupport: boolean;
}

/**
 * SMC Liquidity Regime Filter:
 * Requires clear liquidity pool, sweep + rejection, MSS/CHoCH, displacement with FVG,
 * acceptable reward-to-risk (>= 1.5R), room to opposing liquidity, and no extreme volatility.
 */
export function allowSMCLiquidity(m: SmcRegimeMetrics, direction: 'LONG' | 'SHORT'): boolean {
  const common =
    m.clearLiquidityPool &&
    m.sweepDetected &&
    m.rejectionClose &&
    m.mssConfirmed &&
    m.displacementConfirmed &&
    m.fvgConfirmed &&
    m.rewardRisk >= 1.5 &&
    !m.extremeVolatility &&
    !m.middleOfRange;

  if (direction === 'LONG') {
    return (
      common &&
      ['EQUAL_LOWS', 'SESSION_LOW', 'PREVIOUS_DAY_LOW', 'SWING_LOW'].includes(m.sweptLevelType) &&
      m.close > m.sweptLevel &&
      ['BULLISH', 'NEUTRAL'].includes(m.htfBias) &&
      !m.intoMajorResistance
    );
  }
  return (
    common &&
    ['EQUAL_HIGHS', 'SESSION_HIGH', 'PREVIOUS_DAY_HIGH', 'SWING_HIGH'].includes(m.sweptLevelType) &&
    m.close < m.sweptLevel &&
    ['BEARISH', 'NEUTRAL'].includes(m.htfBias) &&
    !m.intoMajorSupport
  );
}

// ==========================================
// 3. EMA MEAN REVERSION REGIME FILTER
// ==========================================
export interface EmaMeanReversionRegimeMetrics {
  adx15: number;
  ema20Slope15: number;
  maxFlatSlope?: number;
  emaCrosses: number;
  distanceFromEmaAtr: number;
  volumeRatio: number;
  strongHTFTrend: boolean;
  recentBreakout: boolean;
  priceBelowEma20: boolean;
  priceAboveEma20: boolean;
  reversalUp: boolean;
  reversalDown: boolean;
}

/**
 * EMA Mean Reversion Regime Filter:
 * Requires flat EMA20 acting as magnet, ADX < 22, repeated crossings (>= 3),
 * 0.8-2.0 ATR deviation, no directional volume expansion (< 1.5x), and reversal pattern.
 */
export function allowEMAMeanReversion(m: EmaMeanReversionRegimeMetrics, direction: 'LONG' | 'SHORT'): boolean {
  const maxFlatSlope = m.maxFlatSlope ?? 0.02;
  const common =
    m.adx15 < 22 &&
    Math.abs(m.ema20Slope15) < maxFlatSlope &&
    m.emaCrosses >= 3 &&
    m.distanceFromEmaAtr >= 0.8 &&
    m.distanceFromEmaAtr <= 2.0 &&
    m.volumeRatio < 1.5 &&
    !m.strongHTFTrend &&
    !m.recentBreakout;

  if (direction === 'LONG') {
    return common && m.priceBelowEma20 && m.reversalUp;
  }
  return common && m.priceAboveEma20 && m.reversalDown;
}

// ==========================================
// 4. TREND PULLBACK REGIME FILTER
// ==========================================
export interface TrendPullbackRegimeMetrics {
  adx15: number;
  adxRisingOrStable: boolean;
  pullbackVolume: number;
  impulseVolume: number;
  structureBroken: boolean;
  timeframeConflict: boolean;
  diPlus: number;
  diMinus: number;
  ema20: number;
  ema50: number;
  ema50Slope: number;
  minTrendSlope?: number;
  minAdx?: number;
  htfBias: HtfBias;
  higherHighHigherLow: boolean;
  lowerHighLowerLow: boolean;
  pullbackHeldStructure: boolean;
}

/**
 * Trend Pullback Regime Filter:
 * Requires established trend (ADX >= 25, stable/rising), DI agreement, EMA20/50 alignment and slope,
 * HTF alignment, HH/HL or LH/LL structure, and controlled pullback volume < impulse volume.
 */
export function allowTrendPullback(m: TrendPullbackRegimeMetrics, direction: 'LONG' | 'SHORT'): boolean {
  const minTrendSlope = m.minTrendSlope ?? 0.02;
  const minAdx = m.minAdx ?? 25;
  const common =
    m.adx15 >= minAdx &&
    m.adxRisingOrStable &&
    m.pullbackVolume < m.impulseVolume &&
    !m.structureBroken &&
    !m.timeframeConflict;

  if (direction === 'LONG') {
    return (
      common &&
      m.diPlus > m.diMinus &&
      m.ema20 > m.ema50 &&
      m.ema50Slope > minTrendSlope &&
      m.htfBias === 'BULLISH' &&
      m.higherHighHigherLow &&
      m.pullbackHeldStructure
    );
  }
  return (
    common &&
    m.diMinus > m.diPlus &&
    m.ema20 < m.ema50 &&
    m.ema50Slope < -minTrendSlope &&
    m.htfBias === 'BEARISH' &&
    m.lowerHighLowerLow &&
    m.pullbackHeldStructure
  );
}

// ==========================================
// 5. METRICS EXTRACTION HELPERS (FROM CANDLES)
// ==========================================

export function deriveHtfBias(htfCandles?: any[] | null, fallbackCandles?: any[] | null): HtfBias {
  const target = (htfCandles && htfCandles.length >= 20) ? htfCandles : (fallbackCandles && fallbackCandles.length >= 20 ? fallbackCandles : null);
  if (!target) return 'NEUTRAL';
  const closes = target.map(c => c.close);
  const ema20 = calculateEMA(closes, 20).pop() || closes[closes.length - 1];
  const ema50 = calculateEMA(closes, 50).pop() || closes[closes.length - 1];
  const ema200 = calculateEMA(closes, 200).pop() || ema50;
  const lastClose = closes[closes.length - 1];

  if ((lastClose >= ema50 && ema50 >= ema200 * 0.99) || (lastClose >= ema50 && ema20 >= ema50)) return 'BULLISH';
  if ((lastClose <= ema50 && ema50 <= ema200 * 1.01) || (lastClose <= ema50 && ema20 <= ema50)) return 'BEARISH';
  return 'NEUTRAL';
}

export function extractVcbRegimeMetrics(
  candles: any[],
  htfCandles?: any[] | null,
  customSettings?: any
): VcbRegimeMetrics {
  if (!candles || candles.length < 30) {
    return {
      wasCompressed: false,
      volumeRatio: 0,
      atr: 0,
      atrMovingAverage: 0,
      atrRatio: 0,
      breakoutConfirmed: false,
      extremeVolatility: false,
      breakoutIntoMajorLevel: false,
      close: 0,
      rangeHigh: 0,
      rangeLow: 0,
      closeLocation: 0.5,
      htfBias: 'NEUTRAL'
    };
  }

  const lastBar = candles[candles.length - 1];
  const prevBars = candles.slice(Math.max(0, candles.length - 21), candles.length - 1);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);

  const atrs = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrs[atrs.length - 1] || (lastBar.close * 0.015);
  const recentAtrs = atrs.slice(-20);
  const atrMovingAverage = recentAtrs.length > 0 ? recentAtrs.reduce((a, b) => a + b, 0) / recentAtrs.length : currentAtr;
  const atrRatio = atrMovingAverage > 0 ? currentAtr / atrMovingAverage : 1.0;

  const rangeHigh = prevBars.length > 0 ? Math.max(...prevBars.map(c => c.high)) : lastBar.high;
  const rangeLow = prevBars.length > 0 ? Math.min(...prevBars.map(c => c.low)) : lastBar.low;
  const compressionHeight = rangeHigh - rangeLow;

  // Compression check: height of recent 20 bars is tight relative to ATR
  const wasCompressed = compressionHeight <= currentAtr * 3.5;

  const prevVols = volumes.slice(Math.max(0, volumes.length - 21), volumes.length - 1);
  const avgVol = prevVols.length > 0 ? prevVols.reduce((a, b) => a + b, 0) / prevVols.length : (lastBar.volume || 1);
  const volumeRatio = (lastBar.volume || 0) / (avgVol || 1);

  const candleRange = Math.max(0.00001, lastBar.high - lastBar.low);
  const closeLocation = (lastBar.close - lastBar.low) / candleRange;
  const candleBody = Math.abs(lastBar.close - lastBar.open);
  const bodyRatio = candleBody / candleRange;

  const breakoutConfirmed = (lastBar.close > rangeHigh && closeLocation >= 0.7) || (lastBar.close < rangeLow && closeLocation <= 0.3);
  const extremeVolatility = candleRange > currentAtr * 3.0 || currentAtr > atrMovingAverage * 2.5;

  const htfBias = deriveHtfBias(htfCandles, candles);

  // ADX on entry timeframe
  let localAdx: number | undefined;
  if (candles.length >= 28) {
    const adxResult = calculateADX(highs, lows, closes, 14);
    if (adxResult && adxResult.adx && adxResult.adx.length > 0) {
      localAdx = adxResult.adx[adxResult.adx.length - 1];
    }
  }

  // RSI on entry timeframe
  let localRsi: number | undefined;
  if (candles.length >= 15) {
    const rsiSeries = calculateRSI(closes, 14);
    if (rsiSeries && rsiSeries.length > 0) {
      localRsi = rsiSeries[rsiSeries.length - 1];
    }
  }

  // HTF Indicators & Structure
  let htfAdx: number | undefined;
  let htfStructure: 'HH_HL' | 'LH_LL' | 'SIDEWAYS' | undefined;
  let htfMaAligned: boolean | undefined;

  if (htfCandles && htfCandles.length >= 20) {
    const htfHighs = htfCandles.map(c => c.high);
    const htfLows = htfCandles.map(c => c.low);
    const htfCloses = htfCandles.map(c => c.close);

    if (htfCandles.length >= 28) {
      const htfAdxResult = calculateADX(htfHighs, htfLows, htfCloses, 14);
      if (htfAdxResult && htfAdxResult.adx && htfAdxResult.adx.length > 0) {
        htfAdx = htfAdxResult.adx[htfAdxResult.adx.length - 1];
      }
    }

    const recentHtf = htfCandles.slice(-20);
    let hhCount = 0;
    let hlCount = 0;
    let lhCount = 0;
    let llCount = 0;
    for (let i = 2; i < recentHtf.length; i++) {
      if (recentHtf[i].high > recentHtf[i - 1].high && recentHtf[i - 1].high >= recentHtf[i - 2].high) hhCount++;
      if (recentHtf[i].low > recentHtf[i - 1].low && recentHtf[i - 1].low >= recentHtf[i - 2].low) hlCount++;
      if (recentHtf[i].high < recentHtf[i - 1].high && recentHtf[i - 1].high <= recentHtf[i - 2].high) lhCount++;
      if (recentHtf[i].low < recentHtf[i - 1].low && recentHtf[i - 1].low <= recentHtf[i - 2].low) llCount++;
    }
    if (hhCount + hlCount > lhCount + llCount && hhCount >= 1 && hlCount >= 1) {
      htfStructure = 'HH_HL';
    } else if (lhCount + llCount > hhCount + hlCount && lhCount >= 1 && llCount >= 1) {
      htfStructure = 'LH_LL';
    } else {
      htfStructure = 'SIDEWAYS';
    }

    const ema50Series = calculateEMA(htfCloses, 50);
    const ema200Series = calculateEMA(htfCloses, 200);
    const lastHtfPrice = htfCloses[htfCloses.length - 1];
    const htfEma50 = ema50Series.length > 0 ? ema50Series[ema50Series.length - 1] : lastHtfPrice;
    const htfEma200 = ema200Series.length > 0 ? ema200Series[ema200Series.length - 1] : htfEma50;

    if (lastBar.close > rangeHigh) {
      htfMaAligned = lastHtfPrice >= htfEma50 || lastHtfPrice >= htfEma200;
    } else if (lastBar.close < rangeLow) {
      htfMaAligned = lastHtfPrice <= htfEma50 || lastHtfPrice <= htfEma200;
    } else {
      htfMaAligned = true;
    }
  }

  // Follow-through & Retest detection
  const followThroughAtrMin = customSettings?.vcbFollowThroughAtrMin ?? 0.35;
  let followThroughConfirmed = false;
  let retestConfirmed = false;

  const prevBar = candles[candles.length - 2];
  if (prevBar) {
    const brokeUpBoth = lastBar.close > rangeHigh && prevBar.close > rangeHigh;
    const brokeDownBoth = lastBar.close < rangeLow && prevBar.close < rangeLow;
    const decisiveAtrLong = lastBar.close >= rangeHigh + (followThroughAtrMin * currentAtr);
    const decisiveAtrShort = lastBar.close <= rangeLow - (followThroughAtrMin * currentAtr);
    if (brokeUpBoth || brokeDownBoth || decisiveAtrLong || decisiveAtrShort) {
      followThroughConfirmed = true;
    }
  }

  if (candles.length >= 6) {
    const recentSlice = candles.slice(-6, -1);
    const hadPriorLongBreak = recentSlice.some(c => c.close > rangeHigh);
    const hadPriorShortBreak = recentSlice.some(c => c.close < rangeLow);
    if (hadPriorLongBreak) {
      const retestTouch = recentSlice.some(c => Math.abs(c.low - rangeHigh) <= currentAtr * 0.25 || (c.low <= rangeHigh && c.close >= rangeHigh * 0.998));
      if (retestTouch && lastBar.close > rangeHigh) {
        retestConfirmed = true;
      }
    }
    if (hadPriorShortBreak) {
      const retestTouch = recentSlice.some(c => Math.abs(c.high - rangeLow) <= currentAtr * 0.25 || (c.high >= rangeLow && c.close <= rangeLow * 1.002));
      if (retestTouch && lastBar.close < rangeLow) {
        retestConfirmed = true;
      }
    }
  }

  // Session & News gates
  let sessionAllowed = true;
  if (customSettings?.vcbEnforceKillZone) {
    const candleTimeMs = lastBar.time > 1e11 ? lastBar.time : lastBar.time * 1000;
    const utcHour = new Date(candleTimeMs).getUTCHours();
    const inLondon = utcHour >= 7 && utcHour < 11;
    const inNewYork = utcHour >= 13 && utcHour < 17;
    sessionAllowed = inLondon || inNewYork;
  }
  const newsFilterPassed = true;

  // Check if breakout is directly into HTF major swing level
  let breakoutIntoMajorLevel = false;
  if (htfCandles && htfCandles.length >= 20) {
    const htfBars = htfCandles.slice(-20);
    const htfHigh = Math.max(...htfBars.map(c => c.high));
    const htfLow = Math.min(...htfBars.map(c => c.low));
    if (lastBar.close > rangeHigh && Math.abs(htfHigh - lastBar.close) < currentAtr * 0.5) {
      breakoutIntoMajorLevel = true;
    }
    if (lastBar.close < rangeLow && Math.abs(lastBar.close - htfLow) < currentAtr * 0.5) {
      breakoutIntoMajorLevel = true;
    }
  }

  return {
    wasCompressed,
    volumeRatio,
    atr: currentAtr,
    atrMovingAverage,
    atrRatio,
    adx: localAdx,
    rsi: localRsi,
    bodyRatio,
    htfAdx,
    htfStructure,
    htfMaAligned,
    retestConfirmed,
    followThroughConfirmed,
    sessionAllowed,
    newsFilterPassed,
    breakoutConfirmed,
    extremeVolatility,
    breakoutIntoMajorLevel,
    close: lastBar.close,
    rangeHigh,
    rangeLow,
    closeLocation,
    htfBias,
    // Customizable threshold overrides
    minVolumeRatio: customSettings?.vcbBreakoutVolumeMin,
    minAtrRatio: customSettings?.vcbLocalAtrRatioMin,
    minAdx: customSettings?.vcbLocalAdxMin,
    minHtfAdx: customSettings?.vcbHtfAdxMin,
    minBodyRatio: customSettings?.vcbBodyDominanceMin,
    minRsiBullish: customSettings?.vcbRsiBullishMin,
    maxRsiBearish: customSettings?.vcbRsiBearishMax,
    minCloseLocation: customSettings?.vcbCloseLocationMin,
    requireHtfStructure: customSettings?.vcbRequireHtfStructure,
    requireRetestOrFollowThrough: customSettings?.vcbRequireFollowThroughOrRetest
  };
}

export function extractSmcRegimeMetrics(candles: any[], htfCandles?: any[] | null): SmcRegimeMetrics {
  if (!candles || candles.length < 30) {
    return {
      clearLiquidityPool: false,
      sweepDetected: false,
      rejectionClose: false,
      mssConfirmed: false,
      displacementConfirmed: false,
      fvgConfirmed: false,
      rewardRisk: 0,
      extremeVolatility: false,
      middleOfRange: true,
      sweptLevelType: 'NONE',
      sweptLevel: 0,
      close: 0,
      htfBias: 'NEUTRAL',
      intoMajorResistance: false,
      intoMajorSupport: false
    };
  }

  const lastIdx = candles.length - 1;
  const lastBar = candles[lastIdx];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const atrs = calculateATR(highs, lows, closes, 14);
  const atr = atrs[lastIdx] || (lastBar.close * 0.015);
  const volSma = calculateSMA(volumes, 20);
  const currentVolSma = volSma[lastIdx] || (lastBar.volume || 1);

  // Look back for prior swing levels & liquidity pools (bars prior to recent sweep window)
  const sweepWindowLen = 8;
  const sweepStartIdx = Math.max(0, lastIdx - sweepWindowLen);
  const referenceBars = candles.slice(Math.max(0, sweepStartIdx - 25), sweepStartIdx);
  const priorHighest = referenceBars.length > 0 ? Math.max(...referenceBars.map(c => c.high)) : -Infinity;
  const priorLowest = referenceBars.length > 0 ? Math.min(...referenceBars.map(c => c.low)) : Infinity;

  // Window bars for range span & middle-of-range calculation
  const windowBars = candles.slice(Math.max(0, lastIdx - 25), lastIdx);
  const highestSwing = Math.max(...windowBars.map(c => c.high));
  const lowestSwing = Math.min(...windowBars.map(c => c.low));
  const rangeSpan = highestSwing - lowestSwing;

  const currentRangeLoc = rangeSpan > 0 ? (lastBar.close - lowestSwing) / rangeSpan : 0.5;
  const middleOfRange = currentRangeLoc >= 0.35 && currentRangeLoc <= 0.65;

  // Detect if recent bar swept a swing high or low
  let sweepDetected = false;
  let rejectionClose = false;
  let sweptLevelType: SweptLevelType = 'NONE';
  let sweptLevel = 0;

  // Sweep Low check (Bullish setup)
  if (priorLowest !== Infinity) {
    for (let i = sweepStartIdx; i < lastIdx; i++) {
      const c = candles[i];
      if (c.low < priorLowest) {
        const wick = Math.min(c.open, c.close) - c.low;
        const tot = Math.max(0.0001, c.high - c.low);
        if (wick / tot >= 0.5 && c.close > priorLowest) {
          sweepDetected = true;
          rejectionClose = true;
          sweptLevelType = 'SWING_LOW';
          sweptLevel = priorLowest;
          break;
        }
      }
    }
  }

  // Sweep High check (Bearish setup)
  if (!sweepDetected && priorHighest !== -Infinity) {
    for (let i = sweepStartIdx; i < lastIdx; i++) {
      const c = candles[i];
      if (c.high > priorHighest) {
        const wick = c.high - Math.max(c.open, c.close);
        const tot = Math.max(0.0001, c.high - c.low);
        if (wick / tot >= 0.5 && c.close < priorHighest) {
          sweepDetected = true;
          rejectionClose = true;
          sweptLevelType = 'SWING_HIGH';
          sweptLevel = priorHighest;
          break;
        }
      }
    }
  }

  // MSS, displacement, FVG
  const lastBarBody = Math.abs(lastBar.close - lastBar.open);
  const displacementConfirmed = lastBarBody >= atr * 0.45 && (lastBar.volume || 0) >= currentVolSma * 1.15;
  const mssConfirmed = sweepDetected; // MSS triggered following sweep

  // FVG check on last 3 bars
  let fvgConfirmed = false;
  if (lastIdx >= 2) {
    const c1 = candles[lastIdx - 2];
    const c3 = candles[lastIdx];
    if (c3.low > c1.high || c3.high < c1.low) {
      fvgConfirmed = true;
    }
  }

  const htfBias = deriveHtfBias(htfCandles, candles);
  const extremeVolatility = (lastBar.high - lastBar.low) > atr * 3.0;

  // Reward-to-risk approximation
  const targetDistance = sweptLevelType === 'SWING_LOW' ? Math.abs(highestSwing - lastBar.close) : Math.abs(lastBar.close - lowestSwing);
  const riskDistance = Math.max(0.0001, Math.abs(lastBar.close - sweptLevel));
  const rewardRisk = targetDistance / riskDistance;

  return {
    clearLiquidityPool: sweptLevelType !== 'NONE',
    sweepDetected,
    rejectionClose,
    mssConfirmed,
    displacementConfirmed,
    fvgConfirmed,
    rewardRisk,
    extremeVolatility,
    middleOfRange,
    sweptLevelType,
    sweptLevel,
    close: lastBar.close,
    htfBias,
    intoMajorResistance: false,
    intoMajorSupport: false
  };
}

export function extractEmaMeanReversionRegimeMetrics(candles: any[], htfCandles?: any[] | null): EmaMeanReversionRegimeMetrics {
  if (!candles || candles.length < 35) {
    return {
      adx15: 0,
      ema20Slope15: 0,
      emaCrosses: 0,
      distanceFromEmaAtr: 0,
      volumeRatio: 0,
      strongHTFTrend: false,
      recentBreakout: false,
      priceBelowEma20: false,
      priceAboveEma20: false,
      reversalUp: false,
      reversalDown: false
    };
  }

  const lastIdx = candles.length - 1;
  const lastBar = candles[lastIdx];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const atrs = calculateATR(highs, lows, closes, 14);
  const atr = Math.max(0.0001, atrs[lastIdx] || (lastBar.close * 0.015));

  const adxData = calculateADX(highs, lows, closes, 14);
  const adx15 = adxData.adx[lastIdx] || 15;

  const ema20 = calculateEMA(closes, 20);
  const currentEma20 = ema20[lastIdx] || lastBar.close;
  const prevEma20 = ema20[Math.max(0, lastIdx - 5)] || currentEma20;
  const ema20Slope15 = (currentEma20 - prevEma20) / (5 * atr);

  // Count crosses of EMA20 in the last 25 bars
  let emaCrosses = 0;
  for (let i = Math.max(1, lastIdx - 25); i <= lastIdx; i++) {
    const diffCurr = closes[i] - ema20[i];
    const diffPrev = closes[i - 1] - ema20[i - 1];
    if (diffCurr * diffPrev < 0) {
      emaCrosses++;
    }
  }

  const distanceFromEmaAtr = Math.abs(lastBar.close - currentEma20) / atr;

  const volSma = calculateSMA(volumes, 20);
  const currentVolSma = volSma[lastIdx] || (lastBar.volume || 1);
  const volumeRatio = (lastBar.volume || 0) / (currentVolSma || 1);

  // HTF Trend check
  let strongHTFTrend = false;
  if (htfCandles && htfCandles.length >= 25) {
    const htfHighs = htfCandles.map(c => c.high);
    const htfLows = htfCandles.map(c => c.low);
    const htfCloses = htfCandles.map(c => c.close);
    const htfAdx = calculateADX(htfHighs, htfLows, htfCloses, 14).adx;
    strongHTFTrend = (htfAdx[htfAdx.length - 1] || 0) >= 25;
  }

  // Reversal patterns
  const candleRange = Math.max(0.0001, lastBar.high - lastBar.low);
  const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const prevBar = candles[lastIdx - 1];

  const reversalUp =
    (lowerWick / candleRange >= 0.38 && lastBar.close > lastBar.open) ||
    (prevBar && prevBar.close < prevBar.open && lastBar.close > prevBar.open);

  const reversalDown =
    (upperWick / candleRange >= 0.38 && lastBar.close < lastBar.open) ||
    (prevBar && prevBar.close > prevBar.open && lastBar.close < prevBar.open);

  return {
    adx15,
    ema20Slope15,
    emaCrosses,
    distanceFromEmaAtr,
    volumeRatio,
    strongHTFTrend,
    recentBreakout: false,
    priceBelowEma20: lastBar.close < currentEma20,
    priceAboveEma20: lastBar.close > currentEma20,
    reversalUp,
    reversalDown
  };
}

export function extractTrendPullbackRegimeMetrics(
  candles: any[],
  htfCandles?: any[] | null,
  customSettings?: any
): TrendPullbackRegimeMetrics {
  if (!candles || candles.length < 35) {
    return {
      adx15: 0,
      adxRisingOrStable: false,
      pullbackVolume: 0,
      impulseVolume: 1,
      structureBroken: true,
      timeframeConflict: true,
      diPlus: 0,
      diMinus: 0,
      ema20: 0,
      ema50: 0,
      ema50Slope: 0,
      htfBias: 'NEUTRAL',
      higherHighHigherLow: false,
      lowerHighLowerLow: false,
      pullbackHeldStructure: false
    };
  }

  const lastIdx = candles.length - 1;
  const lastBar = candles[lastIdx];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const atrs = calculateATR(highs, lows, closes, 14);
  const atr = Math.max(0.0001, atrs[lastIdx] || (lastBar.close * 0.015));

  const adxData = calculateADX(highs, lows, closes, 14);
  const adx15 = adxData.adx[lastIdx] || 15;
  const prevAdx = adxData.adx[Math.max(0, lastIdx - 3)] || adx15;
  const adxRisingOrStable = (adx15 - prevAdx) >= -1.0;

  const diPlus = adxData.plusDI[lastIdx] || 20;
  const diMinus = adxData.minusDI[lastIdx] || 20;

  const ema20 = calculateEMA(closes, 20)[lastIdx] || lastBar.close;
  const ema50Series = calculateEMA(closes, 50);
  const ema50 = ema50Series[lastIdx] || lastBar.close;
  const prevEma50 = ema50Series[Math.max(0, lastIdx - 5)] || ema50;
  const ema50Slope = (ema50 - prevEma50) / (5 * atr);

  // Volume: last 3 bars (pullback) vs previous 5 bars (impulse)
  const pbVols = volumes.slice(Math.max(0, lastIdx - 2), lastIdx + 1);
  const impVols = volumes.slice(Math.max(0, lastIdx - 7), Math.max(0, lastIdx - 2));
  const pullbackVolume = pbVols.length > 0 ? pbVols.reduce((a, b) => a + b, 0) / pbVols.length : 1;
  const impulseVolume = impVols.length > 0 ? impVols.reduce((a, b) => a + b, 0) / impVols.length : pullbackVolume * 1.2;

  // Market structure check over last 20 bars
  const window1 = candles.slice(Math.max(0, lastIdx - 20), Math.max(0, lastIdx - 10));
  const window2 = candles.slice(Math.max(0, lastIdx - 10), lastIdx + 1);
  const high1 = window1.length > 0 ? Math.max(...window1.map(c => c.high)) : lastBar.high;
  const low1 = window1.length > 0 ? Math.min(...window1.map(c => c.low)) : lastBar.low;
  const high2 = window2.length > 0 ? Math.max(...window2.map(c => c.high)) : lastBar.high;
  const low2 = window2.length > 0 ? Math.min(...window2.map(c => c.low)) : lastBar.low;

  const higherHighHigherLow = high2 > high1 && low2 > low1;
  const lowerHighLowerLow = high2 < high1 && low2 < low1;

  const htfBias = deriveHtfBias(htfCandles, candles);
  const timeframeConflict = (ema20 > ema50 && htfBias === 'BEARISH') || (ema20 < ema50 && htfBias === 'BULLISH');
  const structureBroken = false;
  const pullbackHeldStructure = (ema20 > ema50 && lastBar.low >= ema50 * 0.995) || (ema20 < ema50 && lastBar.high <= ema50 * 1.005);

  return {
    adx15,
    adxRisingOrStable,
    pullbackVolume,
    impulseVolume,
    structureBroken,
    timeframeConflict,
    diPlus,
    diMinus,
    ema20,
    ema50,
    ema50Slope,
    htfBias,
    higherHighHigherLow,
    lowerHighLowerLow,
    pullbackHeldStructure,
    minAdx: customSettings?.tpbAdxMin,
    minTrendSlope: customSettings?.tpbMinTrendSlope
  };
}

// ==========================================
// 6. MASTER DECISION ENGINE & 2-CANDLE HYSTERESIS
// ==========================================

export interface StrategyFiltersResult {
  vcbLong: boolean;
  vcbShort: boolean;
  smcLong: boolean;
  smcShort: boolean;
  emaMrLong: boolean;
  emaMrShort: boolean;
  trendLong: boolean;
  trendShort: boolean;
}

export type MasterRegimeState =
  | 'VCB'
  | 'SMC'
  | 'EMA_MR'
  | 'TREND_PULLBACK'
  | 'NO_TRADE';

export interface MasterRegimeDecision {
  state: MasterRegimeState;
  direction: 'LONG' | 'SHORT' | 'NONE';
  rawCandidateState: MasterRegimeState;
  rawDirection: 'LONG' | 'SHORT' | 'NONE';
  confirmationCount: number;
  isConfirmed: boolean;
  hasConflict: boolean;
  filters: StrategyFiltersResult;
  reason: string;
}

export interface SymbolRegimeHistory {
  symbol: string;
  confirmedState: MasterRegimeState;
  confirmedDirection: 'LONG' | 'SHORT' | 'NONE';
  candidateState: MasterRegimeState;
  candidateDirection: 'LONG' | 'SHORT' | 'NONE';
  candidateBars: number;
  lastCandleTime: number;
}

export class StrategyRegimeTracker {
  private history = new Map<string, SymbolRegimeHistory>();

  public updateAndEvaluate(
    symbol: string,
    rawCandidateState: MasterRegimeState,
    rawDirection: 'LONG' | 'SHORT' | 'NONE',
    hasConflict: boolean,
    candleTime: number
  ): {
    confirmedState: MasterRegimeState;
    confirmedDirection: 'LONG' | 'SHORT' | 'NONE';
    confirmationCount: number;
    isConfirmed: boolean;
  } {
    let hist = this.history.get(symbol);
    if (!hist) {
      hist = {
        symbol,
        confirmedState: 'NO_TRADE',
        confirmedDirection: 'NONE',
        candidateState: rawCandidateState,
        candidateDirection: rawDirection,
        candidateBars: 1,
        lastCandleTime: candleTime
      };
      this.history.set(symbol, hist);
      return {
        confirmedState: 'NO_TRADE',
        confirmedDirection: 'NONE',
        confirmationCount: 1,
        isConfirmed: false
      };
    }

    // Prevent double-counting the exact same candle timestamp
    if (candleTime > 0 && hist.lastCandleTime === candleTime) {
      return {
        confirmedState: hist.confirmedState,
        confirmedDirection: hist.confirmedDirection,
        confirmationCount: hist.candidateBars,
        isConfirmed: hist.confirmedState === hist.candidateState && hist.confirmedState !== 'NO_TRADE'
      };
    }

    hist.lastCandleTime = candleTime;

    // Strict conflict veto: immediately revert to NO_TRADE
    if (hasConflict) {
      hist.candidateState = 'NO_TRADE';
      hist.candidateDirection = 'NONE';
      hist.candidateBars = 1;
      hist.confirmedState = 'NO_TRADE';
      hist.confirmedDirection = 'NONE';
      return {
        confirmedState: 'NO_TRADE',
        confirmedDirection: 'NONE',
        confirmationCount: 1,
        isConfirmed: true
      };
    }

    // Check if candidate matches previous candidate
    if (rawCandidateState === hist.candidateState && rawDirection === hist.candidateDirection) {
      hist.candidateBars += 1;
    } else {
      hist.candidateState = rawCandidateState;
      hist.candidateDirection = rawDirection;
      hist.candidateBars = 1;
    }

    // 2-candle confirmation requirement before changing confirmed state
    if (hist.candidateBars >= 2) {
      hist.confirmedState = hist.candidateState;
      hist.confirmedDirection = hist.candidateDirection;
    }

    return {
      confirmedState: hist.confirmedState,
      confirmedDirection: hist.confirmedDirection,
      confirmationCount: hist.candidateBars,
      isConfirmed: hist.candidateBars >= 2 && hist.confirmedState !== 'NO_TRADE'
    };
  }

  public reset(symbol?: string) {
    if (symbol) {
      this.history.delete(symbol);
    } else {
      this.history.clear();
    }
  }

  public getHistory(symbol: string): SymbolRegimeHistory | undefined {
    return this.history.get(symbol);
  }
}

export const strategyRegimeTracker = new StrategyRegimeTracker();

/**
 * Master Decision Logic:
 * Evaluates all 8 filters across the 4 strategies.
 * Detects conflicts (e.g. Long vs Short simultaneously), applies 2-candle hysteresis confirmation,
 * and produces explicit NO_TRADE state when no filters match or conflicts exist.
 */
export function evaluateMasterRegimeDecision(
  candles: any[],
  htfCandles?: any[] | null,
  options?: {
    symbol?: string;
    tracker?: StrategyRegimeTracker;
    candleTime?: number;
    customSettings?: any;
    vcbMetrics?: Partial<VcbRegimeMetrics>;
    smcMetrics?: Partial<SmcRegimeMetrics>;
    emaMrMetrics?: Partial<EmaMeanReversionRegimeMetrics>;
    trendMetrics?: Partial<TrendPullbackRegimeMetrics>;
  }
): MasterRegimeDecision {
  const symbol = options?.symbol || 'GLOBAL';
  const tracker = options?.tracker || strategyRegimeTracker;
  const candleTime = options?.candleTime || (candles && candles.length > 0 ? (candles[candles.length - 1].time || Date.now()) : 0);

  // Extract or override metrics
  const vcbM: VcbRegimeMetrics = {
    ...extractVcbRegimeMetrics(candles, htfCandles, options?.customSettings),
    ...(options?.vcbMetrics || {})
  };
  const smcM: SmcRegimeMetrics = {
    ...extractSmcRegimeMetrics(candles, htfCandles),
    ...(options?.smcMetrics || {})
  };
  const emaMrM: EmaMeanReversionRegimeMetrics = {
    ...extractEmaMeanReversionRegimeMetrics(candles, htfCandles),
    ...(options?.emaMrMetrics || {})
  };
  const trendM: TrendPullbackRegimeMetrics = {
    ...extractTrendPullbackRegimeMetrics(candles, htfCandles, options?.customSettings),
    ...(options?.trendMetrics || {})
  };

  // 8 Filter Evaluations
  const filters: StrategyFiltersResult = {
    vcbLong: allowVCB(vcbM, 'LONG'),
    vcbShort: allowVCB(vcbM, 'SHORT'),
    smcLong: allowSMCLiquidity(smcM, 'LONG'),
    smcShort: allowSMCLiquidity(smcM, 'SHORT'),
    emaMrLong: allowEMAMeanReversion(emaMrM, 'LONG'),
    emaMrShort: allowEMAMeanReversion(emaMrM, 'SHORT'),
    trendLong: allowTrendPullback(trendM, 'LONG'),
    trendShort: allowTrendPullback(trendM, 'SHORT')
  };

  const longStrategies: MasterRegimeState[] = [];
  if (filters.vcbLong) longStrategies.push('VCB');
  if (filters.trendLong) longStrategies.push('TREND_PULLBACK');
  if (filters.smcLong) longStrategies.push('SMC');
  if (filters.emaMrLong) longStrategies.push('EMA_MR');

  const shortStrategies: MasterRegimeState[] = [];
  if (filters.vcbShort) shortStrategies.push('VCB');
  if (filters.trendShort) shortStrategies.push('TREND_PULLBACK');
  if (filters.smcShort) shortStrategies.push('SMC');
  if (filters.emaMrShort) shortStrategies.push('EMA_MR');

  let hasConflict = false;
  let rawCandidateState: MasterRegimeState = 'NO_TRADE';
  let rawDirection: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  let reason = '';

  // 1. Conflict Check: Simultaneous LONG and SHORT across any strategies
  if (longStrategies.length > 0 && shortStrategies.length > 0) {
    hasConflict = true;
    rawCandidateState = 'NO_TRADE';
    rawDirection = 'NONE';
    reason = `Conflict: Simultaneous LONG (${longStrategies.join(',')}) and SHORT (${shortStrategies.join(',')}) filter activations`;
  } else if (longStrategies.length > 0) {
    rawDirection = 'LONG';
    rawCandidateState = longStrategies[0]; // Priority order: VCB > TREND_PULLBACK > SMC > EMA_MR
    reason = `Active regime: ${rawCandidateState} LONG (matching: ${longStrategies.join(',')})`;
  } else if (shortStrategies.length > 0) {
    rawDirection = 'SHORT';
    rawCandidateState = shortStrategies[0];
    reason = `Active regime: ${rawCandidateState} SHORT (matching: ${shortStrategies.join(',')})`;
  } else {
    rawCandidateState = 'NO_TRADE';
    rawDirection = 'NONE';
    reason = 'No strategy regime filters active';
  }

  // 2. Apply Two-Candle Confirmation Hysteresis
  const tracking = tracker.updateAndEvaluate(symbol, rawCandidateState, rawDirection, hasConflict, candleTime);

  return {
    state: tracking.confirmedState,
    direction: tracking.confirmedDirection,
    rawCandidateState,
    rawDirection,
    confirmationCount: tracking.confirmationCount,
    isConfirmed: tracking.isConfirmed,
    hasConflict,
    filters,
    reason: hasConflict ? reason : (tracking.isConfirmed ? `${reason} (Confirmed 2+ candles)` : `${reason} (Pending confirmation: bar ${tracking.confirmationCount}/2)`)
  };
}
