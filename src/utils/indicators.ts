/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoinDetail, IndicatorDetails, SignalDirection, CoinStatus } from '../types';

// Let's implement robust technical functions

export type RegimeLabel = 'STRONG_TREND' | 'WEAK_TREND' | 'TRANSITION' | 'RANGE' | 'UNSAFE';

export interface RegimeResult {
  label: RegimeLabel;
  score: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  componentScores: any;
}

export function calculateRegimeScore(
  emaS: number, emaM: number, emaL: number, close: number,
  adx: number, vwap: number,
  atrCurrent: number, atrSma5: number,
  volCurrent: number, volSma20: number
): RegimeResult {
  const scores: any = {};
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

  if (close > emaS && emaS > emaM && emaM > emaL) {
    scores.ema = 25; direction = 'LONG';
  } else if (close < emaS && emaS < emaM && emaM < emaL) {
    scores.ema = 25; direction = 'SHORT';
  } else if (emaS > emaM && emaM > emaL) {
    scores.ema = 15; direction = 'LONG';
  } else if (emaS < emaM && emaM < emaL) {
    scores.ema = 15; direction = 'SHORT';
  } else {
    scores.ema = 0; direction = 'NEUTRAL';
  }

  if (adx >= 35) scores.adx = 25;
  else if (adx >= 28) scores.adx = 20;
  else if (adx >= 24) scores.adx = 15;
  else if (adx >= 18) scores.adx = 8;
  else scores.adx = 0;

  if (direction === 'LONG' && close > vwap * 1.001) scores.vwap = 20;
  else if (direction === 'SHORT' && close < vwap * 0.999) scores.vwap = 20;
  else if (Math.abs(close - vwap) / vwap < 0.001) scores.vwap = 10;
  else scores.vwap = 0;

  if (atrCurrent > atrSma5 * 1.1) scores.atr_expansion = 15;
  else if (atrCurrent > atrSma5 * 0.95) scores.atr_expansion = 8;
  else scores.atr_expansion = 0;

  const volRatio = volCurrent / (volSma20 || 1);
  if (volRatio >= 1.5) scores.volume = 15;
  else if (volRatio >= 1.1) scores.volume = 10;
  else if (volRatio >= 0.8) scores.volume = 5;
  else scores.volume = 0;

  const totalScore = (scores.ema || 0) + (scores.adx || 0) + (scores.vwap || 0) + (scores.atr_expansion || 0) + (scores.volume || 0);
  
  let label: RegimeLabel = 'UNSAFE';
  if (totalScore >= 80) label = 'STRONG_TREND';
  else if (totalScore >= 60) label = 'WEAK_TREND';
  else if (totalScore >= 40) label = 'TRANSITION';
  else if (totalScore >= 20) label = 'RANGE';
  
  return { label, score: totalScore, direction, componentScores: scores };
}

export function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  if (prices.length === 0) return ema;

  const k = 2 / (period + 1);
  let prevEma = prices[0];
  ema.push(prevEma);

  for (let i = 1; i < prices.length; i++) {
    const currentEma = prices[i] * k + prevEma * (1 - k);
    ema.push(currentEma);
    prevEma = currentEma;
  }
  return ema;
}

export function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(prices[i]); // fallback
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j];
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (prices.length <= period) {
    return new Array(prices.length).fill(50);
  }

  let gains = 0;
  let losses = 0;

  // First RSI value using SMA
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  // Initialize padding for indices below period
  const finalRsi = new Array(period).fill(50);
  finalRsi.push(rsi[0]);

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 1000 : avgGain / avgLoss;
    finalRsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return finalRsi;
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number[] {
  const atr: number[] = [];
  if (closes.length === 0) return atr;

  const tr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hpc, lpc));
  }

  // Calculate smoothed ATR
  let sum = 0;
  for (let i = 0; i < Math.min(period, tr.length); i++) {
    sum += tr[i];
  }
  let currentAtr = sum / Math.min(period, tr.length);

  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      atr.push(currentAtr); // Warmup period
    } else {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      atr.push(currentAtr);
    }
  }
  return atr;
}

export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const len = closes.length;
  const adx = new Array(len).fill(0);
  const plusDI = new Array(len).fill(0);
  const minusDI = new Array(len).fill(0);

  if (len <= period) {
    return { adx, plusDI, minusDI };
  }

  const tr = new Array(len).fill(0);
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hpc, lpc);

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    if (upMove > downMove && upMove > 0) {
      plusDM[i] = upMove;
    } else {
      plusDM[i] = 0;
    }

    if (downMove > upMove && downMove > 0) {
      minusDM[i] = downMove;
    } else {
      minusDM[i] = 0;
    }
  }

  // Smoothed averages
  let trSum = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let plusDMSum = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let minusDMSum = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);

  let smoothedTr = trSum;
  let smoothedPlusDM = plusDMSum;
  let smoothedMinusDM = minusDMSum;

  plusDI[period] = smoothedTr === 0 ? 0 : (smoothedPlusDM / smoothedTr) * 100;
  minusDI[period] = smoothedTr === 0 ? 0 : (smoothedMinusDM / smoothedTr) * 100;

  const dxValues = new Array(len).fill(0);
  const diff = Math.abs(plusDI[period] - minusDI[period]);
  const sum = plusDI[period] + minusDI[period];
  dxValues[period] = sum === 0 ? 0 : (diff / sum) * 100;

  for (let i = period + 1; i < len; i++) {
    smoothedTr = smoothedTr - smoothedTr / period + tr[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];

    plusDI[i] = smoothedTr === 0 ? 0 : (smoothedPlusDM / smoothedTr) * 100;
    minusDI[i] = smoothedTr === 0 ? 0 : (smoothedMinusDM / smoothedTr) * 100;

    const diffDI = Math.abs(plusDI[i] - minusDI[i]);
    const sumDI = plusDI[i] + minusDI[i];
    dxValues[i] = sumDI === 0 ? 0 : (diffDI / sumDI) * 100;
  }

  // Calculate ADX from DX
  let dxSum = dxValues.slice(period, period * 2).reduce((a, b) => a + b, 0);
  let currentAdx = dxSum / period;
  adx[period * 2 - 1] = currentAdx;

  for (let i = period * 2; i < len; i++) {
    currentAdx = (currentAdx * (period - 1) + dxValues[i]) / period;
    adx[i] = currentAdx;
  }

  // Fill initial indicators with simple values
  for (let i = 0; i < period * 2 - 1; i++) {
    adx[i] = 15; // default low
    plusDI[i] = 20;
    minusDI[i] = 20;
  }

  return { adx, plusDI, minusDI };
}

export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const len = prices.length;
  const macd = new Array(len).fill(0);
  const signal = new Array(len).fill(0);
  const histogram = new Array(len).fill(0);

  if (len < slowPeriod) return { macd, signal, histogram };

  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);

  for (let i = 0; i < len; i++) {
    macd[i] = emaFast[i] - emaSlow[i];
  }

  const signalLine = calculateEMA(macd, signalPeriod);

  for (let i = 0; i < len; i++) {
    signal[i] = signalLine[i];
    histogram[i] = macd[i] - signalLine[i];
  }

  return { macd, signal, histogram };
}

export function calculateSuperTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 10,
  multiplier: number = 3.0
): { direction: ('uptrend' | 'downtrend')[]; value: number[] } {
  const len = closes.length;
  const direction: ('uptrend' | 'downtrend')[] = new Array(len).fill('uptrend');
  const superTrendValues: number[] = new Array(len).fill(0);

  if (len < period) {
    return { direction, value: closes };
  }

  const atr = calculateATR(highs, lows, closes, period);

  const basicUpperBand = new Array(len).fill(0);
  const basicLowerBand = new Array(len).fill(0);
  const finalUpperBand = new Array(len).fill(0);
  const finalLowerBand = new Array(len).fill(0);

  for (let i = 0; i < len; i++) {
    const hl2 = (highs[i] + lows[i]) / 2;
    basicUpperBand[i] = hl2 + multiplier * atr[i];
    basicLowerBand[i] = hl2 - multiplier * atr[i];
  }

  finalUpperBand[0] = basicUpperBand[0];
  finalLowerBand[0] = basicLowerBand[0];
  superTrendValues[0] = finalUpperBand[0];

  for (let i = 1; i < len; i++) {
    // Top band logic
    if (basicUpperBand[i] < finalUpperBand[i - 1] || closes[i - 1] > finalUpperBand[i - 1]) {
      finalUpperBand[i] = basicUpperBand[i];
    } else {
      finalUpperBand[i] = finalUpperBand[i - 1];
    }

    // Bottom band logic
    if (basicLowerBand[i] > finalLowerBand[i - 1] || closes[i - 1] < finalLowerBand[i - 1]) {
      finalLowerBand[i] = basicLowerBand[i];
    } else {
      finalLowerBand[i] = finalLowerBand[i - 1];
    }

    // Trend direction swap
    if (closes[i] > finalUpperBand[i]) {
      direction[i] = 'uptrend';
    } else if (closes[i] < finalLowerBand[i]) {
      direction[i] = 'downtrend';
    } else {
      direction[i] = direction[i - 1];
    }

    if (direction[i] === 'uptrend') {
      superTrendValues[i] = finalLowerBand[i];
    } else {
      superTrendValues[i] = finalUpperBand[i];
    }
  }

  return { direction, value: superTrendValues };
}

// VWAP Logic
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): number[] {
  const vwap: number[] = [];
  if (closes.length === 0) return [];

  let cumTypicalVolume = 0;
  let cumVolume = 0;

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes[i] || 1; // default to avoid zero div

    cumTypicalVolume += typicalPrice * vol;
    cumVolume += vol;

    vwap.push(cumTypicalVolume / cumVolume);
  }

  return vwap;
}

// Fibonacci Retracements
export function calculateFibonacci(
  highs: number[],
  lows: number[],
  lookback: number = 100
): { swingHigh: number; swingLow: number; levels: { [key: string]: number } } {
  const sliceHighs = highs.slice(-lookback);
  const sliceLows = lows.slice(-lookback);

  const swingHigh = sliceHighs.length > 0 ? Math.max(...sliceHighs) : 100;
  const swingLow = sliceLows.length > 0 ? Math.min(...sliceLows) : 0;
  const diff = swingHigh - swingLow;

  return {
    swingHigh,
    swingLow,
    levels: {
      '0': swingHigh,
      '0.236': swingHigh - diff * 0.236,
      '0.382': swingHigh - diff * 0.382,
      '0.5': swingHigh - diff * 0.5,
      '0.618': swingHigh - diff * 0.618,
      '0.786': swingHigh - diff * 0.786,
      '1': swingLow,
      '1.272': swingHigh + diff * 0.272,
      '1.618': swingHigh + diff * 0.618,
    }
  };
}

// Support and Resistance Pivots (Horizontal Zones)
export function calculateSupportResistance(
  highs: number[],
  lows: number[],
  lookback: number = 200
): { supports: number[]; resistances: number[] } {
  // Simple Pivot Point Finder (checking local extrema)
  const leftBars = 4;
  const rightBars = 4;
  const h = highs.slice(-lookback);
  const l = lows.slice(-lookback);
  
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = leftBars; i < h.length - rightBars; i++) {
    // Check local high pivot
    let isHighPivot = true;
    for (let j = 1; j <= leftBars; j++) {
      if (h[i] < h[i - j]) isHighPivot = false;
    }
    for (let j = 1; j <= rightBars; j++) {
      if (h[i] < h[i + j]) isHighPivot = false;
    }
    if (isHighPivot && resistances.length < 5) {
      // Avoid duplicate levels nearby
      if (!resistances.some(r => Math.abs(r - h[i]) / h[i] < 0.005)) {
        resistances.push(h[i]);
      }
    }

    // Check local low pivot
    let isLowPivot = true;
    for (let j = 1; j <= leftBars; j++) {
      if (l[i] > l[i - j]) isLowPivot = false;
    }
    for (let j = 1; j <= rightBars; j++) {
      if (l[i] > l[i + j]) isLowPivot = false;
    }
    if (isLowPivot && supports.length < 5) {
      if (!supports.some(s => Math.abs(s - l[i]) / l[i] < 0.005)) {
        supports.push(l[i]);
      }
    }
  }

  // Sort them for easy charting/calculations
  return {
    supports: supports.sort((a, b) => a - b),
    resistances: resistances.sort((a, b) => a - b),
  };
}

// RSI divergence (simplistic checking last 30 bars)
export function detectDivergence(
  closes: number[],
  rsi: number[]
): 'bullish' | 'bearish' | null {
  if (closes.length < 30) return null;
  const endIdx = closes.length - 1;

  // simplistic: check previous local structural troughs or peaks
  // Bearish divergence: Price forms higher high, RSI forms lower high
  // Bullish divergence: Price forms lower low, RSI forms higher low
  const currentPrice = closes[endIdx];
  const currentRsi = rsi[endIdx];

  const prevPeakIdx1 = endIdx - 5;
  const prevPeakIdx2 = endIdx - 20;

  if (prevPeakIdx2 >= 0) {
    const pricePeak1 = closes[prevPeakIdx1];
    const rsiPeak1 = rsi[prevPeakIdx1];
    const pricePeak2 = closes[prevPeakIdx2];
    const rsiPeak2 = rsi[prevPeakIdx2];

    if (pricePeak1 > pricePeak2 && rsiPeak1 < rsiPeak2) {
      return 'bearish';
    }
    if (pricePeak1 < pricePeak2 && rsiPeak1 > rsiPeak2) {
      return 'bullish';
    }
  }

  return null;
}

// Full Engine Scoring Logic per Coin


export function runScoringEngine(
  candles: any[],
  params: any
): { score: number; direction: any; status: any; reason: string; indicators: any; gates: any; wmPattern: any; regime: any } {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const idx = closes.length - 1;

  const defaultGates = { g1: false, g2: false, g3: false, g4: false, g5: false, g6: false, g7: false, g8: false, g9: false, g10: false, blockReasons: [] };
  const defaultRegime: RegimeResult = { label: 'UNSAFE', score: 0, direction: 'NEUTRAL', componentScores: {} };
  const defaultInds = {
    emaFast: closes[idx] || 0, emaSlow: closes[idx] || 0, emaTrend: closes[idx] || 0,
    rsi: 50, rsiDivergence: null, macd: { macd: 0, signal: 0, histogram: 0 },
    adx: { adx: 15, plusDI: 20, minusDI: 20 }, superTrend: { direction: 'uptrend', value: closes[idx] || 0 },
    volume20Ma: 0, volumeRatio: 1.0, vwap: closes[idx] || 0, vwapDeviationPct: 0,
    atr: 0, fib: { swingHigh: closes[idx] || 0, swingLow: closes[idx] || 0, levels: {} },
    supportResistance: { supports: [], resistances: [] }
  };

  if (closes.length < 200) {
    return { score: 0, direction: 'NEUTRAL', status: 'UNSAFE', reason: 'Not enough data', indicators: defaultInds, gates: defaultGates, wmPattern: 'NONE', regime: defaultRegime };
  }

  const emaS_all = calculateEMA(closes, params.emaFastPeriod || 9);
  const emaM_all = calculateEMA(closes, params.emaSlowPeriod || 21);
  const emaL_all = calculateEMA(closes, params.emaTrendPeriod || 50);
  const rsi_all = calculateRSI(closes, params.rsiPeriod || 14);
  const rsiDiv = detectDivergence(closes, rsi_all);
  const adxResult = calculateADX(highs, lows, closes, params.adxPeriod || 14);
  const atrAll = calculateATR(highs, lows, closes, params.atrPeriod || 14);
  const volSma = calculateSMA(volumes.slice(0, -1), 20);
  const vwapAll = calculateVWAP(highs, lows, closes, volumes);
  const superTrendResult = calculateSuperTrend(highs, lows, closes, params.superTrendPeriod || 10, params.superTrendMultiplier || 3);
  const macdAll = calculateMACD(closes, 12, 26, 9);
  const fib = calculateFibonacci(highs, lows, params.fibLookback || 100);
  const sr = calculateSupportResistance(highs, lows, 200);

  const emaS = emaS_all[idx];
  const emaM = emaM_all[idx];
  const emaL = emaL_all[idx];
  const close = closes[idx];
  const adx = adxResult.adx[idx];
  const vwap = vwapAll[idx];
  const atrCurrent = atrAll[idx];
  const atrSma5 = atrAll.slice(idx - 5, idx).reduce((a,b)=>a+b,0)/5;
  const volCurrent = volumes[idx];
  const vol20Ma = volSma[idx - 1] || 1;
  const rsi = rsi_all[idx];

  const regime = calculateRegimeScore(emaS, emaM, emaL, close, adx, vwap, atrCurrent, atrSma5, volCurrent, vol20Ma);

  const completeIndDetails = {
    emaFast: emaS, emaSlow: emaM, emaTrend: emaL, rsi, rsiDivergence: rsiDiv,
    macd: { macd: macdAll.macd[idx], signal: macdAll.signal[idx], histogram: macdAll.histogram[idx] },
    adx: { adx, plusDI: adxResult.plusDI[idx], minusDI: adxResult.minusDI[idx] },
    superTrend: { direction: superTrendResult.direction[idx], value: superTrendResult.value[idx] },
    volume20Ma: vol20Ma, volumeRatio: volCurrent / vol20Ma, vwap, vwapDeviationPct: ((close - vwap) / vwap) * 100,
    atr: atrCurrent, fib, supportResistance: sr
  };

  // --- 10 GATES WITH BYPASS SUPPORT ---
  const disabledGates = params.disabledGates || {};
  const isBypassed = (id: string, key: string) => !!(disabledGates[id] || disabledGates[key]);

  let gates = { ...defaultGates, blockReasons: [] as string[] };
  
  // G1: Liquidity (24h Volume >= Min Volume)
  const g1Bypassed = isBypassed('COMPOSITE_g1', 'g1');
  gates.g1 = true || g1Bypassed;
  
  // G2: Spread (Max Spread <= Threshold)
  const g2Bypassed = isBypassed('COMPOSITE_g2', 'g2');
  gates.g2 = true || g2Bypassed;

  // G3: Regime (Weak Trend or Better)
  const g3Bypassed = isBypassed('COMPOSITE_g3', 'g3');
  const g3Raw = regime.score >= 60;
  gates.g3 = g3Raw || g3Bypassed;
  if (!g3Raw && !g3Bypassed) gates.blockReasons.push(`G3: Regime Score ${regime.score} < 60 (${regime.label})`);

  // G4: Trend Alignment (EMAs & ADX)
  const g4Bypassed = isBypassed('COMPOSITE_g4', 'g4');
  const dir = regime.direction;
  const minAdxThreshold = params.adxTrendThreshold || params.minAdx || 20;
  let g4Raw = false;
  if (dir === 'LONG' && emaS > emaM && emaM > emaL && adx > minAdxThreshold) g4Raw = true;
  else if (dir === 'SHORT' && emaS < emaM && emaM < emaL && adx > minAdxThreshold) g4Raw = true;
  gates.g4 = g4Raw || g4Bypassed;
  if (!g4Raw && !g4Bypassed) gates.blockReasons.push(`G4: Trend/ADX alignment failed (ADX: ${adx.toFixed(1)}, Dir: ${dir})`);

  // G5: Volatility / ATR Safe Corridor
  const g5Bypassed = isBypassed('COMPOSITE_g5', 'g5');
  const atrPct = (atrCurrent / close) * 100;
  const g5Raw = atrPct >= 0.3 && atrPct <= 6.0;
  gates.g5 = g5Raw || g5Bypassed;
  if (!g5Raw && !g5Bypassed) gates.blockReasons.push(`G5: ATR% ${atrPct.toFixed(2)}% out of bounds (0.3-6.0%)`);

  // G6: Momentum (RSI)
  const g6Bypassed = isBypassed('COMPOSITE_g6', 'g6');
  let g6Raw = false;
  if (dir === 'LONG' && rsi >= 45 && rsi <= 72) g6Raw = true;
  else if (dir === 'SHORT' && rsi >= 28 && rsi <= 55) g6Raw = true;
  gates.g6 = g6Raw || g6Bypassed;

  // G7: Structure Breakout / Pullback
  const g7Bypassed = isBypassed('COMPOSITE_g7', 'g7');
  const swingHigh = Math.max(...highs.slice(idx - 10, idx));
  const swingLow = Math.min(...lows.slice(idx - 10, idx));
  const open_price = candles[idx].open;
  let g7Raw = false;
  if (dir === 'LONG' && (close > swingHigh || (lows[idx] <= emaM * 1.001 && close > open_price))) g7Raw = true;
  else if (dir === 'SHORT' && (close < swingLow || (highs[idx] >= emaM * 0.999 && close < open_price))) g7Raw = true;
  gates.g7 = g7Raw || g7Bypassed;

  // G8: Volume Surge Confirmation
  const g8Bypassed = isBypassed('COMPOSITE_g8', 'g8');
  const requiredVolMult = params.volumeMultiplier || 1.5;
  const g8Raw = volCurrent >= vol20Ma * requiredVolMult;
  gates.g8 = g8Raw || g8Bypassed;
  if (!g8Raw && !g8Bypassed) gates.blockReasons.push(`G8: Volume ${(volCurrent / vol20Ma).toFixed(2)}x < ${requiredVolMult}x 20SMA`);

  // G9: Funding Rate Guard
  const g9Bypassed = isBypassed('COMPOSITE_g9', 'g9');
  gates.g9 = true || g9Bypassed;

  // G10: Risk/Reward Ratio
  const g10Bypassed = isBypassed('COMPOSITE_g10', 'g10');
  gates.g10 = true || g10Bypassed;

  const passedGatesCount = [gates.g1, gates.g2, gates.g3, gates.g4, gates.g5, gates.g6, gates.g7, gates.g8, gates.g9, gates.g10].filter(Boolean).length;
  const mandatoryPass = gates.g1 && gates.g2 && gates.g3 && gates.g4 && gates.g5 && gates.g8 && gates.g9;
  const confCount = (gates.g6 ? 1 : 0) + (gates.g7 ? 1 : 0) + (gates.g10 ? 1 : 0);
  const entryAllowed = mandatoryPass && (confCount >= 2 || isBypassed('COMPOSITE_g6', 'g6') || isBypassed('COMPOSITE_g7', 'g7'));

  // Dynamic composite score: 60% based on passed gates (6% each) + 40% based on regime score
  const gateScorePct = (passedGatesCount / 10) * 0.6;
  const regimeScorePct = (regime.score / 100) * 0.4;
  let confidence = gateScorePct + regimeScorePct;

  return {
    score: Math.max(15, Math.min(100, Math.round(confidence * 100))),
    direction: dir,
    status: regime.label,
    reason: entryAllowed ? 'All gates passed' : gates.blockReasons.join(' | '),
    indicators: completeIndDetails,
    gates,
    wmPattern: 'NONE',
    regime
  };
}


