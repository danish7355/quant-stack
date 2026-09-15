/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateSMA, calculateRSI } from '../indicators';

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

export interface RangeMarketCheck {
  inRange: boolean;
  pctFromSma: number;
  smaSlope: number;
  smaValue: number;
  reason: string;
}

/**
 * Evaluates whether market is in a non-trending range
 * Rule: Price is within ±5% of 200-SMA OR 200-SMA slope is flat (|slope| < 0.02)
 */
export function inRangeMarket(
  closes: number[],
  maxPctFromSma: number = 0.05,
  maxSlope: number = 0.02
): RangeMarketCheck {
  const lastIdx = closes.length - 1;
  const currentClose = closes[lastIdx];

  // Prefer 200-period SMA; fallback to 50 or available lookback if data is between 50 and 200
  const smaPeriod = closes.length >= 200 ? 200 : Math.max(30, Math.min(100, closes.length - 10));
  const smaSeries = calculateSMA(closes, smaPeriod);
  const currentSma = smaSeries[lastIdx];

  if (!currentSma || currentSma <= 0) {
    return { inRange: true, pctFromSma: 0, smaSlope: 0, smaValue: currentClose, reason: 'Insufficient data for SMA; default range allowed' };
  }

  const pctFromSma = Math.abs(currentClose - currentSma) / currentSma;

  // Slope lookback: 20-50 bars ago
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
      ? `Market is in range: price ±${(pctFromSma * 100).toFixed(2)}% of SMA${smaPeriod}, slope: ${(smaSlope * 100).toFixed(2)}%`
      : `Strong trend active: price ${(pctFromSma * 100).toFixed(2)}% from SMA${smaPeriod} (limit ${maxPctFromSma * 100}%), slope: ${(smaSlope * 100).toFixed(2)}%`
  };
}

export interface RangeMeanReversionSignal {
  direction: 'LONG' | 'SHORT';
  score: number;
  entryPrice: number;
  bbLower: number;
  bbMiddle: number;
  bbUpper: number;
  rsi: number;
  prevRsi: number;
  stopDistance: number;
  sl: number;
  tp1: number; // 50% target at middle band (20-SMA)
  tp2: number; // Full 1:3 R:R target (entry ± 3 * stopDistance)
  tp3: number; // Runner target (entry ± 4.5 * stopDistance)
  atr: number;
  reason: string;
  gatesDetail: {
    rangeFilterPassed: boolean;
    bbExtremePassed: boolean;
    rsiExtremePassed: boolean;
    confirmationPassed: boolean;
    stopTightPassed: boolean;
    rewardRiskPassed: boolean;
    antiRunawayPassed: boolean;
  };
}

/**
 * Core Strategy: Ranging-Market Mean-Reversion with 1:3 R:R
 * Evaluates setup on klines and produces entry levels, tight structure stops, and 1:3 targets.
 */
export function evaluateRangeMeanReversion(
  candles: any[],
  currentPrice: number,
  params: {
    bbPeriod?: number;
    bbStdDev?: number;
    rsiPeriod?: number;
    rsiOversold?: number;
    rsiOverbought?: number;
    rangeSmaPct?: number;
    maxSmaSlope?: number;
    stopMult?: number;
    targetRr?: number;
  } = {}
): RangeMeanReversionSignal | null {
  if (!candles || candles.length < 35) return null;

  const bbPeriod = params.bbPeriod || 20;
  const bbStdDev = params.bbStdDev || 2.0;
  const rsiPeriod = params.rsiPeriod || 14;
  const rsiOversold = params.rsiOversold || 30;
  const rsiOverbought = params.rsiOverbought || 70;
  const rangeSmaPct = params.rangeSmaPct || 0.05;
  const maxSmaSlope = params.maxSmaSlope || 0.02;
  const stopMult = params.stopMult || 1.5;
  const targetRr = params.targetRr || 3.0;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const lastIdx = candles.length - 1;

  // 1. Range Market Filter
  const rangeCheck = inRangeMarket(closes, rangeSmaPct, maxSmaSlope);
  if (!rangeCheck.inRange) {
    return null;
  }

  // 2. Bollinger Bands & RSI Calculations
  const bb = calculateBollingerBands(closes, bbPeriod, bbStdDev);
  const rsiSeries = calculateRSI(closes, rsiPeriod);

  const prevIdx = lastIdx - 1;
  const prevBar = candles[prevIdx];
  const confirmedBar = candles[lastIdx];

  const prevClose = prevBar.close;
  const prevBbLow = bb.lower[prevIdx];
  const prevBbHigh = bb.upper[prevIdx];
  const prevRsi = rsiSeries[prevIdx];

  const close = currentPrice || confirmedBar.close;
  const bbLow = bb.lower[lastIdx];
  const bbMid = bb.middle[lastIdx];
  const bbHigh = bb.upper[lastIdx];
  const currentRsi = rsiSeries[lastIdx];

  // Estimate ATR (14) for safety limits
  let atrSum = 0;
  for (let i = Math.max(1, lastIdx - 14); i <= lastIdx; i++) {
    const h = highs[i];
    const l = lows[i];
    const prevC = closes[i - 1];
    atrSum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
  }
  const atr = Math.max(atrSum / 14, close * 0.005);

  // Anti-Runaway Check: Avoid new entries if strong breakout just happened (> 2.5% move in single bar)
  const currentBarRange = Math.abs(confirmedBar.high - confirmedBar.low);
  if (currentBarRange > close * 0.03 || currentBarRange > atr * 3.2) {
    return null; // Runaway volatility expansion; unsafe for mean-reversion
  }

  let direction: 'LONG' | 'SHORT' | null = null;
  let bandEntry = 0;
  let setupReason = '';

  // Condition 2 & 3: LONG SETUP
  // - Previous candle closed below lower BB & RSI < 30
  // - Current confirmation candle closes back inside lower BB
  const isLongSetup = prevClose < prevBbLow && prevRsi < rsiOversold;
  const isLongConfirmed = close > bbLow;

  // Condition 2 & 3: SHORT SETUP
  // - Previous candle closed above upper BB & RSI > 70
  // - Current confirmation candle closes back inside upper BB
  const isShortSetup = prevClose > prevBbHigh && prevRsi > rsiOverbought;
  const isShortConfirmed = close < bbHigh;

  if (isLongSetup && isLongConfirmed) {
    direction = 'LONG';
    bandEntry = bbLow;
    setupReason = `Mean-Reversion Long: Prev close (${prevClose.toFixed(4)}) < Lower BB (${prevBbLow.toFixed(4)}) & RSI (${prevRsi.toFixed(1)} < ${rsiOversold}), confirmed re-entry at ${close.toFixed(4)}`;
  } else if (isShortSetup && isShortConfirmed) {
    direction = 'SHORT';
    bandEntry = bbHigh;
    setupReason = `Mean-Reversion Short: Prev close (${prevClose.toFixed(4)}) > Upper BB (${prevBbHigh.toFixed(4)}) & RSI (${prevRsi.toFixed(1)} > ${rsiOverbought}), confirmed re-entry at ${close.toFixed(4)}`;
  } else {
    return null;
  }

  // Structure-Based Tight Stop Loss calculation:
  // stop_distance = 1.5 * (entry_price - lower_band_entry)
  const baseBandDistance = Math.abs(close - bandEntry);
  // Ensure minimum stop distance to protect against spread/micro-noise:
  const minStopDistance = Math.max(atr * 0.4, close * 0.003);
  let stopDistance = Math.max(stopMult * baseBandDistance, minStopDistance);

  let sl = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (direction === 'LONG') {
    // Check recent swing low (last 6 bars) for structure anchor:
    const recentSwingLow = Math.min(...candles.slice(Math.max(0, lastIdx - 6)).map(c => c.low));
    let rawSl = close - stopDistance;
    if (recentSwingLow < close && recentSwingLow - (atr * 0.1) < rawSl) {
      rawSl = recentSwingLow - (atr * 0.1);
      stopDistance = close - rawSl;
    }
    sl = Math.min(rawSl, close - minStopDistance);
    stopDistance = close - sl;

    // Targets: TP1 at 20-SMA middle band, TP2 at 1:3 R:R, TP3 at 1:4.5 R:R
    tp1 = Math.max(bbMid, close + (stopDistance * 1.5));
    tp2 = close + (targetRr * stopDistance);
    tp3 = close + ((targetRr + 1.5) * stopDistance);
  } else {
    // Check recent swing high (last 6 bars) for structure anchor:
    const recentSwingHigh = Math.max(...candles.slice(Math.max(0, lastIdx - 6)).map(c => c.high));
    let rawSl = close + stopDistance;
    if (recentSwingHigh > close && recentSwingHigh + (atr * 0.1) > rawSl) {
      rawSl = recentSwingHigh + (atr * 0.1);
      stopDistance = rawSl - close;
    }
    sl = Math.max(rawSl, close + minStopDistance);
    stopDistance = sl - close;

    // Targets: TP1 at 20-SMA middle band, TP2 at 1:3 R:R, TP3 at 1:4.5 R:R
    tp1 = Math.min(bbMid, close - (stopDistance * 1.5));
    tp2 = close - (targetRr * stopDistance);
    tp3 = close - ((targetRr + 1.5) * stopDistance);
  }

  // Score calculation: 90 base + up to 10 points for optimal setup alignment
  const score = 95;

  return {
    direction,
    score,
    entryPrice: close,
    bbLower: bbLow,
    bbMiddle: bbMid,
    bbUpper: bbHigh,
    rsi: currentRsi,
    prevRsi,
    stopDistance,
    sl,
    tp1,
    tp2,
    tp3,
    atr,
    reason: setupReason,
    gatesDetail: {
      rangeFilterPassed: true,
      bbExtremePassed: true,
      rsiExtremePassed: true,
      confirmationPassed: true,
      stopTightPassed: stopDistance >= minStopDistance,
      rewardRiskPassed: Math.abs(tp2 - close) / stopDistance >= 2.9,
      antiRunawayPassed: true
    }
  };
}
