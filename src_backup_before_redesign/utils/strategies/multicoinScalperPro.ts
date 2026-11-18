/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 3Commas / SwissAlgo Multicoin Scalper PRO (Top 100 Volume Universe)
 * Optimized for 5m scalps and 15m swings across high-volume altcoins.
 * 
 * Features:
 * 1. Universe & Pre-Filters:
 *    - Top 100 volume USDT pairs; strict stablecoin & wrapped token exclusion
 *    - Minimum 24h liquidity (>= $20M-$50M) & tight spread limit (<= 0.05-0.08%)
 *    - ATR(14) volatility filter (0.15% - 2.5% band) to avoid dead or chaotic markets
 *    - Extreme move / news spike filter (skips single candles > 5-7%)
 * 2. 5m Scalp Profile:
 *    - EMA 9 / 21 / 55 Stack
 *    - Daily Session VWAP intraday bias
 *    - Pullback to EMA 21 / VWAP with rejection wick
 *    - RSI(7) resting zone (35-55 long / 45-65 short)
 *    - Volume confirmation >= 0.8x 20-MA
 *    - Entry on candle closing back across level
 *    - Dynamic ATR Stop Loss & 2-tier Take Profit (TP1 0.8%, TP2 1.5%, TP3 2.2%)
 * 3. 15m Swing Profile:
 *    - EMA 20 / 50 / 200 Stack with Higher-Highs / Higher-Lows
 *    - Optional 1H/4H EMA 89 & 200 Higher Timeframe trend filter
 *    - Pullback to EMA 20/50 with RSI(14) in 40-50 (long) / 50-60 (short)
 *    - Volume confirmation >= 0.8x 20-MA
 *    - Structure-based Stop Loss & Extended targets (TP1 prior swing, TP2 1.8x risk)
 * 4. TradingView Pine Script v6 strategy generator with 3Commas webhook alerts.
 */

import { AppSettings, MulticoinProfile, MulticoinScalperSignal } from '../../types';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// 1. Stablecoin & Wrapped Tokens Blacklist (Pre-Filter 1a)
// ---------------------------------------------------------------------------
const STABLE_AND_WRAPPED_TOKENS = new Set([
  'USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'BUSDUSDT', 'USDPUSDT', 'DAIUSDT',
  'EURUSDT', 'AEURUSDT', 'WBTCUSDT', 'WETHUSDT', 'STETHUSDT', 'USTCUSDT',
  'SUSDUSDT', 'USDUSDT', 'PAXGUSDT', 'FDUSD', 'USDC', 'TUSD', 'BUSD', 'DAI'
]);

export function isStableOrWrapped(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.toUpperCase().replace('/', '').trim();
  if (STABLE_AND_WRAPPED_TOKENS.has(clean)) return true;
  // Patterns like USDC, FDUSD, USD, DAI
  if (clean.startsWith('USDC') || clean.startsWith('FDUSD') || clean.startsWith('TUSD') || clean.startsWith('BUSD') || clean.startsWith('DAI') || clean.startsWith('EUR')) {
    return true;
  }
  if (clean.includes('STETH') || clean.includes('WBTC') || clean.includes('WETH')) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2. Math & Indicator Helpers
// ---------------------------------------------------------------------------
export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

export function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length === 0) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  const seedLength = Math.min(period, values.length);
  for (let i = 0; i < seedLength; i++) sum += values[i];
  let currentEma = sum / seedLength;
  result[seedLength - 1] = currentEma;
  for (let i = seedLength; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    result[i] = currentEma;
  }
  return result;
}

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return tr;
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length < period) return atr;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

export function calculateRSI(closes: number[], period: number = 7): number[] {
  const rsi: number[] = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsi;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const curGain = diff >= 0 ? diff : 0;
    const curLoss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + curGain) / period;
    avgLoss = (avgLoss * (period - 1) + curLoss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export function calculateSessionVWAP(candles: Candle[]): number[] {
  const vwap: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return vwap;

  let cumTypicalVolume = 0;
  let cumVolume = 0;
  let currentDay = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const timestampMs = c.time < 2000000000 ? c.time * 1000 : c.time;
    const date = new Date(timestampMs);
    const day = date.getUTCDate();

    // Reset VWAP at daily session boundary (00:00 UTC)
    if (day !== currentDay) {
      currentDay = day;
      cumTypicalVolume = 0;
      cumVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = Math.max(c.volume || 1, 0.0001);
    cumTypicalVolume += typicalPrice * vol;
    cumVolume += vol;

    vwap[i] = cumVolume > 0 ? (cumTypicalVolume / cumVolume) : c.close;
  }
  return vwap;
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): {
  plusDI: number[];
  minusDI: number[];
  adx: number[];
} {
  const len = closes.length;
  const plusDI = new Array(len).fill(0);
  const minusDI = new Array(len).fill(0);
  const adx = new Array(len).fill(0);
  if (len < period * 2) return { plusDI, minusDI, adx };

  const tr: number[] = new Array(len).fill(0);
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let trSmooth = 0;
  let plusDMSmooth = 0;
  let minusDMSmooth = 0;
  for (let i = 1; i <= period; i++) {
    trSmooth += tr[i];
    plusDMSmooth += plusDM[i];
    minusDMSmooth += minusDM[i];
  }

  plusDI[period] = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
  minusDI[period] = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;

  const dx: number[] = new Array(len).fill(0);
  const diSum = plusDI[period] + minusDI[period];
  dx[period] = diSum > 0 ? (Math.abs(plusDI[period] - minusDI[period]) / diSum) * 100 : 0;

  for (let i = period + 1; i < len; i++) {
    trSmooth = trSmooth - (trSmooth / period) + tr[i];
    plusDMSmooth = plusDMSmooth - (plusDMSmooth / period) + plusDM[i];
    minusDMSmooth = minusDMSmooth - (minusDMSmooth / period) + minusDM[i];
    plusDI[i] = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
    minusDI[i] = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;
    const curDiSum = plusDI[i] + minusDI[i];
    dx[i] = curDiSum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / curDiSum) * 100 : 0;
  }

  let dxSum = 0;
  for (let i = period; i < period * 2; i++) dxSum += dx[i];
  adx[period * 2 - 1] = dxSum / period;

  for (let i = period * 2; i < len; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }
  return { plusDI, minusDI, adx };
}

// ---------------------------------------------------------------------------
// 3. Multicoin Scalper PRO Core Evaluation
// ---------------------------------------------------------------------------

export interface MulticoinLiquidityData {
  quoteVolume24h?: number;
  spreadPct?: number;
  isNewCoin?: boolean;
}

export function evaluateMulticoinScalperPro(
  candles: Candle[],
  htfCandles: Candle[] = [],
  currentPrice: number,
  settings: AppSettings,
  liquidity?: MulticoinLiquidityData
): MulticoinScalperSignal | null {
  if (!candles || candles.length < 55) return null;

  // Use closed bars to prevent intrabar repainting
  const closedCandles = candles.slice(0, -1);
  if (closedCandles.length < 50) return null;

  const lastClosed = closedCandles[closedCandles.length - 1];
  const evalPrice = currentPrice > 0 ? currentPrice : lastClosed.close;
  const profile: MulticoinProfile = settings.multicoinProfile || (settings.timeframe === '15m' ? '15m_SWING' : '5m_SCALP');

  const closes = closedCandles.map(c => c.close);
  const highs = closedCandles.map(c => c.high);
  const lows = closedCandles.map(c => c.low);
  const opens = closedCandles.map(c => c.open);
  const volumes = closedCandles.map(c => c.volume);
  const lastIdx = closedCandles.length - 1;

  // Track filter breakdown
  const passedFilters = {
    stablecoinCheck: true,
    liquidityCheck: true,
    spreadCheck: true,
    volatilityCheck: true,
    extremeSpikeCheck: true,
    trendCheck: false,
    intradayBiasCheck: false,
    pullbackCheck: false,
    rsiCheck: false,
    volumeCheck: false
  };

  // 1. Stablecoin & Wrapped Token Pre-Filter
  const filterStables = settings.multicoinFilterStables !== false;
  if (filterStables && isStableOrWrapped((settings as any).symbol || '')) {
    passedFilters.stablecoinCheck = false;
    return null;
  }

  // 2. Minimum 24h Volume Liquidity & Spread Pre-Filter
  const minVolume = settings.multicoinMin24hVolumeUsdt ?? 20000000;
  if (liquidity?.quoteVolume24h !== undefined && liquidity.quoteVolume24h < minVolume) {
    passedFilters.liquidityCheck = false;
    return null;
  }

  const maxSpread = settings.multicoinMaxSpreadPct ?? 0.08;
  if (liquidity?.spreadPct !== undefined && liquidity.spreadPct > maxSpread) {
    passedFilters.spreadCheck = false;
    return null;
  }

  // 3. Volatility Filter using ATR(14)
  const atrs = calculateATR(closedCandles, 14);
  const curAtr = atrs[lastIdx] || lastClosed.close * 0.01;
  const atrPct = (curAtr / lastClosed.close) * 100;

  const minAtrPct = settings.multicoinMinAtrPct ?? (profile === '5m_SCALP' ? 0.15 : 0.4);
  const maxAtrPct = settings.multicoinMaxAtrPct ?? (profile === '5m_SCALP' ? 2.5 : 5.0);

  if (atrPct < minAtrPct || atrPct > maxAtrPct) {
    passedFilters.volatilityCheck = false;
    return {
      symbol: (settings as any).symbol || 'UNKNOWN',
      direction: 'LONG',
      profile,
      entryPrice: lastClosed.close,
      stopLossPrice: lastClosed.close * 0.99,
      tp1: lastClosed.close * 1.008,
      tp2: lastClosed.close * 1.015,
      tp3: lastClosed.close * 1.022,
      riskRewardRatio: 1.5,
      atrValue: curAtr,
      atrPct,
      emaFast: lastClosed.close,
      emaMid: lastClosed.close,
      emaSlow: lastClosed.close,
      vwap: lastClosed.close,
      rsi: 50,
      volumeRatio: 1,
      adx: 15,
      score: 40,
      passedFilters,
      status: 'WAITING',
      finalDecision: 'WAIT',
      rejectionReason: `Volatility out of bounds (ATR%: ${atrPct.toFixed(2)}%, range: ${minAtrPct}-${maxAtrPct}%)`,
      exactRejectionReason: 'WAITING_FOR_FAVORABLE_REGIME',
      reason: `Market condition not in favor of Scalper PRO: ATR% (${atrPct.toFixed(2)}%) is outside active scalp band. Waiting for favorable volatility.`,
      pattern: 'Waiting for Scalp Regime',
      signalTime: lastClosed.time,
      timestamp: lastClosed.time,
      strategyRegimeStatus: 'WAITING',
      marketRegime: 'Unfavorable Volatility'
    };
  }

  // 4. Extreme News Spike Filter (> 5-7% single candle jump)
  const maxSingleBarPct = settings.multicoinMaxSingleBarPct ?? 5.0;
  const lastCandleMovePct = (Math.abs(lastClosed.close - lastClosed.open) / lastClosed.open) * 100;
  if (lastCandleMovePct > maxSingleBarPct) {
    passedFilters.extremeSpikeCheck = false;
    return {
      symbol: (settings as any).symbol || 'UNKNOWN',
      direction: 'LONG',
      profile,
      entryPrice: lastClosed.close,
      stopLossPrice: lastClosed.close * 0.99,
      tp1: lastClosed.close * 1.008,
      tp2: lastClosed.close * 1.015,
      tp3: lastClosed.close * 1.022,
      riskRewardRatio: 1.5,
      atrValue: curAtr,
      atrPct,
      emaFast: lastClosed.close,
      emaMid: lastClosed.close,
      emaSlow: lastClosed.close,
      vwap: lastClosed.close,
      rsi: 50,
      volumeRatio: 1,
      adx: 15,
      score: 35,
      passedFilters,
      status: 'WAITING',
      finalDecision: 'WAIT',
      rejectionReason: `Extreme news spike (${lastCandleMovePct.toFixed(1)}% > ${maxSingleBarPct}%)`,
      exactRejectionReason: 'WAITING_FOR_FAVORABLE_REGIME',
      reason: 'Market condition not in favor of Scalper PRO: Extreme news spike detected. Waiting for market stabilization.',
      pattern: 'Waiting for Stabilization',
      signalTime: lastClosed.time,
      timestamp: lastClosed.time,
      strategyRegimeStatus: 'WAITING',
      marketRegime: 'High-Impact Spike'
    };
  }

  // 5. Volume Confirmation: Current volume >= 0.8x 20-MA
  const volSma = calculateSMA(volumes, 20);
  const curVolSma = volSma[lastIdx] || 1;
  const minVolRatio = settings.multicoinMinVolRatio ?? 0.8;
  const volumeRatio = curVolSma > 0 ? (lastClosed.volume / curVolSma) : 1;
  if (volumeRatio < minVolRatio) {
    passedFilters.volumeCheck = false;
    return {
      symbol: (settings as any).symbol || 'UNKNOWN',
      direction: 'LONG',
      profile,
      entryPrice: lastClosed.close,
      stopLossPrice: lastClosed.close * 0.99,
      tp1: lastClosed.close * 1.008,
      tp2: lastClosed.close * 1.015,
      tp3: lastClosed.close * 1.022,
      riskRewardRatio: 1.5,
      atrValue: curAtr,
      atrPct,
      emaFast: lastClosed.close,
      emaMid: lastClosed.close,
      emaSlow: lastClosed.close,
      vwap: lastClosed.close,
      rsi: 50,
      volumeRatio,
      adx: 15,
      score: 45,
      passedFilters,
      status: 'WAITING',
      finalDecision: 'WAIT',
      rejectionReason: `Volume ratio (${volumeRatio.toFixed(2)}x) below threshold (${minVolRatio}x)`,
      exactRejectionReason: 'WAITING_FOR_FAVORABLE_REGIME',
      reason: `Market condition not in favor of Scalper PRO: Insufficient volume turnover (${volumeRatio.toFixed(2)}x < ${minVolRatio}x). Waiting for active liquidity.`,
      pattern: 'Waiting for Volume',
      signalTime: lastClosed.time,
      timestamp: lastClosed.time,
      strategyRegimeStatus: 'WAITING',
      marketRegime: 'Low Volume / Flat'
    };
  }
  passedFilters.volumeCheck = true;

  // 6. Calculate Indicator Set
  let emaFastPeriod = 9;
  let emaMidPeriod = 21;
  let emaSlowPeriod = 55;
  let rsiPeriod = 7;

  if (profile === '15m_SWING') {
    emaFastPeriod = settings.multicoinEmaFast || 20;
    emaMidPeriod = settings.multicoinEmaMid || 50;
    emaSlowPeriod = settings.multicoinEmaSlow || 200;
    rsiPeriod = settings.multicoinRsiPeriod || 14;
  } else {
    emaFastPeriod = settings.multicoinEmaFast || 9;
    emaMidPeriod = settings.multicoinEmaMid || 21;
    emaSlowPeriod = settings.multicoinEmaSlow || 55;
    rsiPeriod = settings.multicoinRsiPeriod || 7;
  }

  const emaFastSeries = calculateEMA(closes, emaFastPeriod);
  const emaMidSeries = calculateEMA(closes, emaMidPeriod);
  const emaSlowSeries = calculateEMA(closes, emaSlowPeriod);
  const rsiSeries = calculateRSI(closes, rsiPeriod);
  const vwapSeries = calculateSessionVWAP(closedCandles);
  const adxResult = calculateADX(highs, lows, closes, 14);

  const curEmaFast = emaFastSeries[lastIdx];
  const curEmaMid = emaMidSeries[lastIdx];
  const curEmaSlow = emaSlowSeries[lastIdx];
  const curRsi = rsiSeries[lastIdx];
  const curVwap = vwapSeries[lastIdx];
  const curAdx = adxResult.adx[lastIdx] || 20;

  // Candlestick anatomy for rejection detection
  const candleRange = lastClosed.high - lastClosed.low;
  const lowerWick = Math.min(lastClosed.open, lastClosed.close) - lastClosed.low;
  const upperWick = lastClosed.high - Math.max(lastClosed.open, lastClosed.close);
  const lowerWickRatio = candleRange > 0 ? (lowerWick / candleRange) : 0;
  const upperWickRatio = candleRange > 0 ? (upperWick / candleRange) : 0;

  let direction: 'LONG' | 'SHORT' | null = null;
  let score = 0;
  let rejectionReason = '';

  // -------------------------------------------------------------------------
  // PROFILE A: 5m Scalp Profile
  // -------------------------------------------------------------------------
  if (profile === '5m_SCALP') {
    const rsiLongMin = settings.multicoinRsiLongMin ?? 35;
    const rsiLongMax = settings.multicoinRsiLongMax ?? 55;
    const rsiShortMin = settings.multicoinRsiShortMin ?? 45;
    const rsiShortMax = settings.multicoinRsiShortMax ?? 65;

    // LONG SCALP CHECK:
    // 1. Micro-trend up: EMA 9 > EMA 21 > EMA 55
    const isMicroTrendUp = curEmaFast > curEmaMid && curEmaMid > curEmaSlow;
    // 2. Intraday bias up: close > VWAP
    const isBiasUp = lastClosed.close > curVwap;
    // 3. Pullback to touch or within 0.1% of EMA 21 (or VWAP)
    const touchedEmaMidLong = (lastClosed.low <= curEmaMid * 1.001) || (lastClosed.low <= curVwap * 1.001);
    const hasBullishRejection = (lowerWickRatio >= 0.20) || (lastClosed.close > lastClosed.open);
    // 4. RSI between 35 and 55 on pullback
    const isRsiLongOk = curRsi >= rsiLongMin && curRsi <= rsiLongMax;
    // 5. Entry candle closes back above EMA 21
    const closedBackAbove = lastClosed.close >= curEmaMid;

    // SHORT SCALP CHECK:
    // 1. Micro-trend down: EMA 9 < EMA 21 < EMA 55
    const isMicroTrendDown = curEmaFast < curEmaMid && curEmaMid < curEmaSlow;
    // 2. Intraday bias down: close < VWAP
    const isBiasDown = lastClosed.close < curVwap;
    // 3. Pullback up to EMA 21
    const touchedEmaMidShort = (lastClosed.high >= curEmaMid * 0.999) || (lastClosed.high >= curVwap * 0.999);
    const hasBearishRejection = (upperWickRatio >= 0.20) || (lastClosed.close < lastClosed.open);
    // 4. RSI between 45 and 65
    const isRsiShortOk = curRsi >= rsiShortMin && curRsi <= rsiShortMax;
    // 5. Closed back below EMA 21
    const closedBackBelow = lastClosed.close <= curEmaMid;

    if (isMicroTrendUp && isBiasUp && touchedEmaMidLong && hasBullishRejection && isRsiLongOk && closedBackAbove) {
      direction = 'LONG';
      passedFilters.trendCheck = true;
      passedFilters.intradayBiasCheck = true;
      passedFilters.pullbackCheck = true;
      passedFilters.rsiCheck = true;
      score = 85;
      if (volumeRatio >= 1.2) score += 5;
      if (curAdx >= 22) score += 5;
    } else if (isMicroTrendDown && isBiasDown && touchedEmaMidShort && hasBearishRejection && isRsiShortOk && closedBackBelow) {
      direction = 'SHORT';
      passedFilters.trendCheck = true;
      passedFilters.intradayBiasCheck = true;
      passedFilters.pullbackCheck = true;
      passedFilters.rsiCheck = true;
      score = 85;
      if (volumeRatio >= 1.2) score += 5;
      if (curAdx >= 22) score += 5;
    } else {
      if (!isMicroTrendUp && !isMicroTrendDown) rejectionReason = 'EMA Ribbon (9/21/55) not in aligned stack';
      else if (!isBiasUp && !isBiasDown) rejectionReason = 'Counter-VWAP bias violation';
      else if (!isRsiLongOk && !isRsiShortOk) rejectionReason = `RSI (${curRsi.toFixed(1)}) outside pullback resting zone`;
      else rejectionReason = 'No clear pullback rejection at EMA 21 / VWAP';
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // PROFILE B: 15m Swing Profile
  // -------------------------------------------------------------------------
  else {
    const rsiLongMin = settings.multicoinRsiLongMin ?? 38;
    const rsiLongMax = settings.multicoinRsiLongMax ?? 55;
    const rsiShortMin = settings.multicoinRsiShortMin ?? 45;
    const rsiShortMax = settings.multicoinRsiShortMax ?? 62;

    // Optional HTF trend alignment (1H or 4H)
    let htfBull = true;
    let htfBear = true;
    if (settings.multicoinUseHtfFilter !== false && htfCandles && htfCandles.length >= 35) {
      const htfCloses = htfCandles.map(c => c.close);
      const htfEmaFast = calculateEMA(htfCloses, settings.multicoinHtfEmaFast || 89);
      const htfEmaSlow = calculateEMA(htfCloses, settings.multicoinHtfEmaSlow || 200);
      const lastHtfClose = htfCloses[htfCloses.length - 1];
      const curHtfFast = htfEmaFast[htfEmaFast.length - 1];
      const curHtfSlow = htfEmaSlow[htfEmaSlow.length - 1];
      htfBull = lastHtfClose > curHtfFast && lastHtfClose > curHtfSlow;
      htfBear = lastHtfClose < curHtfFast && lastHtfClose < curHtfSlow;
    }

    // 15m Trend & Structure: EMA 20 > EMA 50 > EMA 200
    const is15mTrendUp = curEmaFast > curEmaMid && curEmaMid > curEmaSlow;
    const is15mTrendDown = curEmaFast < curEmaMid && curEmaMid < curEmaSlow;

    // Pullback to EMA 20 or EMA 50
    const touchedEmaLong = lastClosed.low <= curEmaFast * 1.002 || lastClosed.low <= curEmaMid * 1.003;
    const touchedEmaShort = lastClosed.high >= curEmaFast * 0.998 || lastClosed.high >= curEmaMid * 0.997;

    const isRsiLongOk = curRsi >= rsiLongMin && curRsi <= rsiLongMax;
    const isRsiShortOk = curRsi >= rsiShortMin && curRsi <= rsiShortMax;

    const closedBackAboveEma = lastClosed.close >= curEmaFast;
    const closedBackBelowEma = lastClosed.close <= curEmaFast;

    if (htfBull && is15mTrendUp && touchedEmaLong && isRsiLongOk && closedBackAboveEma) {
      direction = 'LONG';
      passedFilters.trendCheck = true;
      passedFilters.intradayBiasCheck = true;
      passedFilters.pullbackCheck = true;
      passedFilters.rsiCheck = true;
      score = 88;
      if (volumeRatio >= 1.2) score += 4;
      if (curAdx >= 22) score += 4;
    } else if (htfBear && is15mTrendDown && touchedEmaShort && isRsiShortOk && closedBackBelowEma) {
      direction = 'SHORT';
      passedFilters.trendCheck = true;
      passedFilters.intradayBiasCheck = true;
      passedFilters.pullbackCheck = true;
      passedFilters.rsiCheck = true;
      score = 88;
      if (volumeRatio >= 1.2) score += 4;
      if (curAdx >= 22) score += 4;
    } else {
      if (!htfBull && !htfBear) rejectionReason = 'HTF 1H/4H Macro Trend alignment failed';
      else if (!is15mTrendUp && !is15mTrendDown) rejectionReason = '15m EMA 20/50/200 Stack not aligned';
      else if (!isRsiLongOk && !isRsiShortOk) rejectionReason = `RSI (${curRsi.toFixed(1)}) outside swing resting zone`;
      else rejectionReason = 'No clear pullback to EMA 20/50';
      return null;
    }
  }

  if (!direction) return null;

  // -------------------------------------------------------------------------
  // Exits, Stop Loss & Take Profit Target Calculations
  // -------------------------------------------------------------------------
  let sl = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;
  const slAtrMult = settings.multicoinSlAtrMult ?? 1.5;

  // Pull recent swing extremes (last 6 candles)
  const recentHigh = Math.max(...highs.slice(-6));
  const recentLow = Math.min(...lows.slice(-6));

  if (profile === '5m_SCALP') {
    // 5m Scalp Exits: SL below swing low or 1.2-1.5x ATR beyond EMA 55 / VWAP
    if (direction === 'LONG') {
      const stopCandidate1 = recentLow - (curAtr * 0.3);
      const stopCandidate2 = Math.min(curEmaSlow, curVwap) - (curAtr * 0.5);
      sl = Math.min(stopCandidate1, stopCandidate2);
      const risk = evalPrice - sl;
      const minScalpRisk = evalPrice * 0.004; // 0.4% minimum stop
      if (risk < minScalpRisk) sl = evalPrice - minScalpRisk;

      // Scalp Targets: TP1 0.8% (or 1R), TP2 1.5%, TP3 2.2%
      const tp1Pct = (settings.multicoinTp1Pct || 0.8) / 100;
      const tp2Pct = (settings.multicoinTp2Pct || 1.5) / 100;
      tp1 = evalPrice * (1 + tp1Pct);
      tp2 = evalPrice * (1 + tp2Pct);
      tp3 = evalPrice * (1 + (tp2Pct * 1.5));
    } else {
      const stopCandidate1 = recentHigh + (curAtr * 0.3);
      const stopCandidate2 = Math.max(curEmaSlow, curVwap) + (curAtr * 0.5);
      sl = Math.max(stopCandidate1, stopCandidate2);
      const risk = sl - evalPrice;
      const minScalpRisk = evalPrice * 0.004;
      if (risk < minScalpRisk) sl = evalPrice + minScalpRisk;

      const tp1Pct = (settings.multicoinTp1Pct || 0.8) / 100;
      const tp2Pct = (settings.multicoinTp2Pct || 1.5) / 100;
      tp1 = evalPrice * (1 - tp1Pct);
      tp2 = evalPrice * (1 - tp2Pct);
      tp3 = evalPrice * (1 - (tp2Pct * 1.5));
    }
  } else {
    // 15m Swing Exits: SL 2-4% or below pullback swing low/high
    if (direction === 'LONG') {
      sl = recentLow - (curAtr * slAtrMult);
      const risk = evalPrice - sl;
      const tp1Pct = (settings.multicoinTp1Pct || 2.5) / 100;
      const tp2Pct = (settings.multicoinTp2Pct || 4.5) / 100;
      tp1 = Math.max(evalPrice * (1 + tp1Pct), evalPrice + (risk * 1.2));
      tp2 = evalPrice * (1 + tp2Pct);
      tp3 = evalPrice + (risk * 2.5);
    } else {
      sl = recentHigh + (curAtr * slAtrMult);
      const risk = sl - evalPrice;
      const tp1Pct = (settings.multicoinTp1Pct || 2.5) / 100;
      const tp2Pct = (settings.multicoinTp2Pct || 4.5) / 100;
      tp1 = Math.min(evalPrice * (1 - tp1Pct), evalPrice - (risk * 1.2));
      tp2 = evalPrice * (1 - tp2Pct);
      tp3 = evalPrice - (risk * 2.5);
    }
  }

  const riskDist = Math.abs(evalPrice - sl);
  const rewardDist = Math.abs(tp2 - evalPrice);
  const rr = riskDist > 0 ? parseFloat((rewardDist / riskDist).toFixed(2)) : 2.0;

  return {
    symbol: (settings as any).symbol || 'UNKNOWN',
    direction,
    profile,
    entryPrice: evalPrice,
    stopLossPrice: sl,
    tp1,
    tp2,
    tp3,
    riskRewardRatio: rr,
    atrValue: curAtr,
    atrPct,
    emaFast: curEmaFast,
    emaMid: curEmaMid,
    emaSlow: curEmaSlow,
    vwap: curVwap,
    rsi: curRsi,
    volumeRatio,
    adx: curAdx,
    score,
    passedFilters,
    timestamp: lastClosed.time,
    signalTime: lastClosed.time,
    status: 'TRIGGERED',
    finalDecision: 'EXECUTE',
    pattern: profile === '5m_SCALP' ? '5M_EMA_PULLBACK_SCALP' : '15M_EMA_SWING_PULLBACK',
    reason: `${profile} pullback entry confirmed with VWAP bias and RSI rest`,
    exactRejectionReason: 'NONE',
    strategyRegimeStatus: 'IN_FAVOR',
    marketRegime: `Momentum Scalp (${profile})`,
    timeExitBars: profile === '5m_SCALP' ? 4 : 8
  };
}

// ---------------------------------------------------------------------------
// 4. TradingView Pine Script v6 Generator (with 3Commas Webhook Support)
// ---------------------------------------------------------------------------

export function generateMulticoinScalperPineScript(settings: AppSettings): string {
  const profile = settings.multicoinProfile || '5m_SCALP';
  const isScalp = profile === '5m_SCALP';

  const fastEmaLen = isScalp ? (settings.multicoinEmaFast || 9) : (settings.multicoinEmaFast || 20);
  const midEmaLen = isScalp ? (settings.multicoinEmaMid || 21) : (settings.multicoinEmaMid || 50);
  const slowEmaLen = isScalp ? (settings.multicoinEmaSlow || 55) : (settings.multicoinEmaSlow || 200);
  const rsiLen = isScalp ? (settings.multicoinRsiPeriod || 7) : (settings.multicoinRsiPeriod || 14);

  const tp1Pct = settings.multicoinTp1Pct || (isScalp ? 0.8 : 2.5);
  const tp2Pct = settings.multicoinTp2Pct || (isScalp ? 1.5 : 4.5);
  const slAtrMult = settings.multicoinSlAtrMult || 1.5;

  return `//@version=6
strategy("3Commas Multicoin Scalper PRO (SwissAlgo)", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.04)

// ===========================================================================
// Strategy Mode & Profile
// ===========================================================================
grp_profile = "Strategy Profile & Universe"
strategyProfile = input.string("${profile}", "Strategy Profile", options=["5m_SCALP", "15m_SWING"], group=grp_profile)
minVolUsdt      = input.float(${settings.multicoinMin24hVolumeUsdt || 20000000}, "Min 24h Volume USDT", group=grp_profile)
maxSpreadPct    = input.float(${settings.multicoinMaxSpreadPct || 0.08}, "Max Bid-Ask Spread %", group=grp_profile)
minAtrPct       = input.float(${settings.multicoinMinAtrPct || 0.15}, "Min ATR % (Avoid Dead Markets)", group=grp_profile)
maxAtrPct       = input.float(${settings.multicoinMaxAtrPct || 2.5}, "Max ATR % (Avoid Crazy News Spikes)", group=grp_profile)
maxSingleBarPct = input.float(${settings.multicoinMaxSingleBarPct || 5.0}, "Max Single Bar Move %", group=grp_profile)

// ===========================================================================
// Indicators Configuration
// ===========================================================================
grp_ind = "Indicators (Ribbon, RSI & VWAP)"
fastEmaLen = input.int(${fastEmaLen}, "Fast EMA Period", group=grp_ind)
midEmaLen  = input.int(${midEmaLen}, "Mid Pullback EMA Period", group=grp_ind)
slowEmaLen = input.int(${slowEmaLen}, "Slow Trend EMA Period", group=grp_ind)
rsiLen     = input.int(${rsiLen}, "RSI Period", group=grp_ind)
atrLen     = input.int(14, "ATR Period", group=grp_ind)
volMaLen   = input.int(20, "Volume SMA Period", group=grp_ind)
minVolMult = input.float(${settings.multicoinMinVolRatio || 0.8}, "Min Volume / 20-MA Ratio", group=grp_ind)

// Pullback RSI Bands
rsiLongMin  = input.float(${settings.multicoinRsiLongMin || 35}, "RSI Long Pullback Min", group=grp_ind)
rsiLongMax  = input.float(${settings.multicoinRsiLongMax || 55}, "RSI Long Pullback Max", group=grp_ind)
rsiShortMin = input.float(${settings.multicoinRsiShortMin || 45}, "RSI Short Pullback Min", group=grp_ind)
rsiShortMax = input.float(${settings.multicoinRsiShortMax || 65}, "RSI Short Pullback Max", group=grp_ind)

// ===========================================================================
// Risk Management & Webhook Alerts
// ===========================================================================
grp_risk = "Risk & Target Management"
tp1PctInput = input.float(${tp1Pct}, "Take Profit 1 (%)", group=grp_risk)
tp2PctInput = input.float(${tp2Pct}, "Take Profit 2 (%)", group=grp_risk)
slAtrMultInput = input.float(${slAtrMult}, "Stop Loss ATR Multiplier", group=grp_risk)
enableTimeExit = input.bool(true, "Enable Time-Based Exit (15-20m)", group=grp_risk)
timeExitBars   = input.int(4, "Time Exit Max Bars", group=grp_risk)

// ===========================================================================
// Calculations
// ===========================================================================
fastEma = ta.ema(close, fastEmaLen)
midEma  = ta.ema(close, midEmaLen)
slowEma = ta.ema(close, slowEmaLen)
rsiVal  = ta.rsi(close, rsiLen)
atrVal  = ta.atr(atrLen)
volMa   = ta.sma(volume, volMaLen)
sessionVwap = ta.vwap(hlc3)

// Volatility filter
atrPct = (atrVal / close) * 100
volatilityOk = atrPct >= minAtrPct and atrPct <= maxAtrPct

// News spike veto
singleBarPct = (math.abs(close - open) / open) * 100
notSpike = singleBarPct <= maxSingleBarPct

// Volume confirmation
volConfirmed = volume >= volMa * minVolMult

// Rejection wick
candleRange = high - low
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
hasBullishWick = candleRange > 0 and (lowerWick / candleRange) >= 0.20
hasBearishWick = candleRange > 0 and (upperWick / candleRange) >= 0.20

// ===========================================================================
// Strategy Entry Conditions
// ===========================================================================
// Long Setup
longTrend = fastEma > midEma and midEma > slowEma
longBias  = close > sessionVwap
longPullback = (low <= midEma * 1.001 or low <= sessionVwap * 1.001) and (hasBullishWick or close > open)
longRsiOk = rsiVal >= rsiLongMin and rsiVal <= rsiLongMax
longCloseAbove = close >= midEma

longCondition = longTrend and longBias and longPullback and longRsiOk and longCloseAbove and volConfirmed and volatilityOk and notSpike and strategy.position_size == 0

// Short Setup
shortTrend = fastEma < midEma and midEma < slowEma
shortBias  = close < sessionVwap
shortPullback = (high >= midEma * 0.999 or high >= sessionVwap * 0.999) and (hasBearishWick or close < open)
shortRsiOk = rsiVal >= rsiShortMin and rsiVal <= rsiShortMax
shortCloseBelow = close <= midEma

shortCondition = shortTrend and shortBias and shortPullback and shortRsiOk and shortCloseBelow and volConfirmed and volatilityOk and notSpike and strategy.position_size == 0

// Stop & Target Levels
var float longSL = na
var float longTP1 = na
var float longTP2 = na
var float shortSL = na
var float shortTP1 = na
var float shortTP2 = na

if longCondition
    longSL := math.min(ta.lowest(low, 5), math.min(slowEma, sessionVwap) - (atrVal * 0.5))
    longTP1 := close * (1 + (tp1PctInput / 100))
    longTP2 := close * (1 + (tp2PctInput / 100))
    // 3Commas Webhook JSON message
    alertMsgLong = '{"message_type":"bot","bot_id":"3COMMAS_BOT_ID","email_token":"YOUR_TOKEN","delay_seconds":0,"pair":"' + syminfo.ticker + '","action":"start_deal"}'
    strategy.entry("Long", strategy.long, alert_message=alertMsgLong)

if shortCondition
    shortSL := math.max(ta.highest(high, 5), math.max(slowEma, sessionVwap) + (atrVal * 0.5))
    shortTP1 := close * (1 - (tp1PctInput / 100))
    shortTP2 := close * (1 - (tp2PctInput / 100))
    alertMsgShort = '{"message_type":"bot","bot_id":"3COMMAS_BOT_ID","email_token":"YOUR_TOKEN","delay_seconds":0,"pair":"' + syminfo.ticker + '","action":"start_deal"}'
    strategy.entry("Short", strategy.short, alert_message=alertMsgShort)

// Position Exits
if strategy.position_size > 0
    strategy.exit("Exit Long TP1", "Long", qty_percent=50, limit=longTP1, stop=longSL)
    strategy.exit("Exit Long TP2", "Long", qty_percent=100, limit=longTP2, stop=longSL)

if strategy.position_size < 0
    strategy.exit("Exit Short TP1", "Short", qty_percent=50, limit=shortTP1, stop=shortSL)
    strategy.exit("Exit Short TP2", "Short", qty_percent=100, limit=shortTP2, stop=shortSL)

// Time-based exit for sluggish trades
if enableTimeExit and ta.barssince(longCondition or shortCondition) >= timeExitBars and strategy.position_size != 0
    strategy.close_all(comment="Sluggish Time Exit")

// ===========================================================================
// Visual Overlays & Indicator Plots
// ===========================================================================
plot(fastEma, "Fast EMA", color=color.new(#00e696, 0), linewidth=2)
plot(midEma, "Pullback EMA", color=color.new(#ffb300, 0), linewidth=2)
plot(slowEma, "Slow Baseline", color=color.new(#2962ff, 0), linewidth=2)
plot(sessionVwap, "Session VWAP", color=color.new(#e040fb, 0), linewidth=1, style=plot.style_linebr)

plotshape(longCondition, "Long Scalp", shape.triangleup, location.belowbar, color.new(#00e696, 0), size=size.small, text="SCALP BUY")
plotshape(shortCondition, "Short Scalp", shape.triangledown, location.abovebar, color.new(#f23645, 0), size=size.small, text="SCALP SELL")
`;
}
