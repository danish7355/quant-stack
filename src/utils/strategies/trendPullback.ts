/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Robust Trend-Pullback Strategy for Intraday Trading
 * Prioritizes:
 * - Confirmation accuracy & rejection-first execution
 * - Avoidance of fake pullbacks and false breakouts
 * - Multi-indicator market-regime detection (TRENDING_UP / TRENDING_DOWN only)
 * - Multi-timeframe agreement (Higher Timeframe determines permitted bias)
 * - Invalidation-based volatility-adjusted stop placement (LOCAL_EXECUTION_STOP)
 * - Realistic risk-to-reward (min 2.0:1 R:R) & positive expectancy
 * - Strict no-repainting: uses closed candles only
 * - Configurable execution timeframes (5m, 15m, etc.)
 */

import { 
  AppSettings, 
  TrendPullbackSignal, 
  TrendPullbackRegime, 
  TrendPullbackStopType, 
  TrendPullbackStatus, 
  TrendPullbackRejectionReason,
  TrendPullbackLifecycleState,
  RetestClassification
} from '../../types';

export interface Candle {
  time: number; // Unix timestamp in seconds or ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

// ---------------------------------------------------------------------------
// 1. Technical Math & Indicator Utilities
// ---------------------------------------------------------------------------

export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
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
  // Seed with SMA
  let sum = 0;
  const seedLength = Math.min(period, values.length);
  for (let i = 0; i < seedLength; i++) {
    sum += values[i];
  }
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

  // Wilder's smoothed ATR
  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length < period) return tr;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  atr[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

export function calculateADX(candles: Candle[], period: number = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = candles.length;
  const adx = new Array(n).fill(0);
  const plusDI = new Array(n).fill(0);
  const minusDI = new Array(n).fill(0);

  if (n < period * 2) return { adx, plusDI, minusDI };

  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  const tr: number[] = new Array(n).fill(0);

  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Smooth TR, +DM, -DM
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dx: number[] = new Array(n).fill(0);

  for (let i = period; i < n; i++) {
    smoothTR = smoothTR - (smoothTR / period) + tr[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];

    const pDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const mDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    plusDI[i] = pDI;
    minusDI[i] = mDI;

    const diSum = pDI + mDI;
    dx[i] = diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0;
  }

  // Calculate ADX as Wilder's smooth of DX
  let adxSum = 0;
  for (let i = period; i < period * 2; i++) {
    adxSum += dx[i];
  }
  adx[period * 2 - 1] = adxSum / period;

  for (let i = period * 2; i < n; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }

  return { adx, plusDI, minusDI };
}

export function calculateVWAP(candles: Candle[]): number[] {
  const vwap: number[] = new Array(candles.length).fill(0);
  let cumTypicalVol = 0;
  let cumVol = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    cumTypicalVol += typical * c.volume;
    cumVol += c.volume;
    vwap[i] = cumVol > 0 ? cumTypicalVol / cumVol : c.close;
  }
  return vwap;
}

// ---------------------------------------------------------------------------
// 2. Pivot & Structural Swing Identification
// ---------------------------------------------------------------------------

export function findPivots(candles: Candle[], structureLen: number = 5): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (!candles || candles.length < structureLen * 2 + 1) {
    return { highs, lows };
  }

  for (let i = structureLen; i < candles.length - structureLen; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isPivotHigh = true;
    let isPivotLow = true;

    for (let j = i - structureLen; j <= i + structureLen; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isPivotHigh = false;
      if (candles[j].low <= currentLow) isPivotLow = false;
    }

    if (isPivotHigh) {
      highs.push({ index: i, time: candles[i].time, price: currentHigh, type: 'HIGH' });
    }
    if (isPivotLow) {
      lows.push({ index: i, time: candles[i].low, price: currentLow, type: 'LOW' });
    }
  }

  return { highs, lows };
}

// ---------------------------------------------------------------------------
// 3. Market-Regime Detection Engine
// ---------------------------------------------------------------------------

export interface RegimeResult {
  regime: TrendPullbackRegime;
  reason: string;
  isTradable: boolean;
  adxValue: number;
  fastEma: number;
  slowEma: number;
  trendEma: number;
  slowEmaSlope: number;
  structureTrend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNCLEAR';
  extensionAtr: number;
  htfTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
}

export function detectMarketRegime(
  execCandles: Candle[],
  htfCandles: Candle[],
  config: {
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    trendEmaPeriod: number;
    adxPeriod: number;
    adxThreshold: number;
    atrPeriod: number;
  }
): RegimeResult {
  const defaultRes: RegimeResult = {
    regime: 'UNKNOWN',
    reason: 'Insufficient data for regime classification',
    isTradable: false,
    adxValue: 0,
    fastEma: 0,
    slowEma: 0,
    trendEma: 0,
    slowEmaSlope: 0,
    structureTrend: 'UNCLEAR',
    extensionAtr: 0,
    htfTrend: 'RANGING'
  };

  if (!execCandles || execCandles.length < 50) {
    return defaultRes;
  }

  const closes = execCandles.map(c => c.close);
  const fastEmaArr = calculateEMA(closes, config.fastEmaPeriod);
  const slowEmaArr = calculateEMA(closes, config.slowEmaPeriod);
  const trendEmaArr = calculateEMA(closes, config.trendEmaPeriod);
  const atrArr = calculateATR(execCandles, config.atrPeriod);
  const { adx } = calculateADX(execCandles, config.adxPeriod);

  const idx = execCandles.length - 1;
  const currentClose = closes[idx];
  const fastEma = fastEmaArr[idx];
  const slowEma = slowEmaArr[idx];
  const trendEma = trendEmaArr[idx] || slowEma;
  const currentAtr = atrArr[idx] || 1;
  const currentAdx = adx[idx] || 0;

  // Calculate Slow EMA slope over past 3 bars
  const prevSlowEma = slowEmaArr[Math.max(0, idx - 3)];
  const slowEmaSlope = prevSlowEma > 0 ? ((slowEma - prevSlowEma) / prevSlowEma) * 100 : 0;

  // Check recent volume for low liquidity
  const recentVols = execCandles.slice(-20).map(c => c.volume);
  const avgVol = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
  const lastVol = execCandles[idx].volume;
  if (avgVol > 0 && lastVol < avgVol * 0.15) {
    return {
      ...defaultRes,
      regime: 'LOW_LIQUIDITY',
      reason: 'Volume severely depleted (< 15% 20-period average)',
      adxValue: currentAdx,
      fastEma, slowEma, trendEma, slowEmaSlope,
      isTradable: false
    };
  }

  // Check volatility explosion / panic
  const recentAtrs = atrArr.slice(-20);
  const avgAtr = recentAtrs.reduce((a, b) => a + b, 0) / (recentAtrs.length || 1);
  if (avgAtr > 0 && currentAtr > avgAtr * 2.8) {
    return {
      ...defaultRes,
      regime: 'HIGH_VOLATILITY',
      reason: `Current ATR (${currentAtr.toFixed(2)}) is abnormally high (> 2.8x average ATR ${avgAtr.toFixed(2)})`,
      adxValue: currentAdx,
      fastEma, slowEma, trendEma, slowEmaSlope,
      isTradable: false
    };
  }

  // Analyze Higher Timeframe structure & trend
  let htfTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (htfCandles && htfCandles.length >= 20) {
    const htfCloses = htfCandles.map(c => c.close);
    const htfTrendEma = calculateEMA(htfCloses, Math.min(50, htfCloses.length))[htfCloses.length - 1];
    const lastHtfClose = htfCloses[htfCloses.length - 1];
    if (lastHtfClose > htfTrendEma * 1.002) {
      htfTrend = 'BULLISH';
    } else if (lastHtfClose < htfTrendEma * 0.998) {
      htfTrend = 'BEARISH';
    }
  } else {
    // If no HTF candles supplied, derive from main trend EMA on execution TF
    if (currentClose > trendEma) htfTrend = 'BULLISH';
    else if (currentClose < trendEma) htfTrend = 'BEARISH';
  }

  // Analyze execution timeframe price structure (swing pivots)
  const { highs, lows } = findPivots(execCandles, 5);
  let structureTrend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNCLEAR' = 'UNCLEAR';
  if (highs.length >= 2 && lows.length >= 2) {
    const lastHigh = highs[highs.length - 1].price;
    const prevHigh = highs[highs.length - 2].price;
    const lastLow = lows[lows.length - 1].price;
    const prevLow = lows[lows.length - 2].price;

    if (lastHigh > prevHigh && lastLow > prevLow) {
      structureTrend = 'BULLISH';
    } else if (lastHigh < prevHigh && lastLow < prevLow) {
      structureTrend = 'BEARISH';
    } else {
      structureTrend = 'RANGING';
    }
  }

  // Check extension from trend zone (fast/slow EMA)
  const distToEma = Math.abs(currentClose - slowEma);
  const extensionAtr = currentAtr > 0 ? distToEma / currentAtr : 0;

  // Determine overall regime
  const isAdxStrong = currentAdx >= config.adxThreshold;
  const isEmaBullish = fastEma > slowEma && slowEmaSlope > 0.01;
  const isEmaBearish = fastEma < slowEma && slowEmaSlope < -0.01;
  const isPriceAboveTrend = currentClose > trendEma && (htfTrend === 'BULLISH');
  const isPriceBelowTrend = currentClose < trendEma && (htfTrend === 'BEARISH');
  const notOverextended = extensionAtr <= 3.5;

  if (isPriceAboveTrend && isEmaBullish && structureTrend === 'BULLISH' && isAdxStrong && notOverextended) {
    return {
      regime: 'TRENDING_UP',
      reason: 'Strong Bullish Alignment: HTF > Trend EMA, Fast > Slow EMA, Slope > 0, Structure HH/HL, ADX >= threshold',
      isTradable: true,
      adxValue: currentAdx,
      fastEma, slowEma, trendEma, slowEmaSlope,
      structureTrend, extensionAtr, htfTrend
    };
  }

  if (isPriceBelowTrend && isEmaBearish && structureTrend === 'BEARISH' && isAdxStrong && notOverextended) {
    return {
      regime: 'TRENDING_DOWN',
      reason: 'Strong Bearish Alignment: HTF < Trend EMA, Fast < Slow EMA, Slope < 0, Structure LH/LL, ADX >= threshold',
      isTradable: true,
      adxValue: currentAdx,
      fastEma, slowEma, trendEma, slowEmaSlope,
      structureTrend, extensionAtr, htfTrend
    };
  }

  if (!isAdxStrong || structureTrend === 'RANGING' || Math.abs(fastEma - slowEma) / slowEma < 0.001) {
    return {
      regime: 'RANGING',
      reason: `Market in consolidation: ADX (${currentAdx.toFixed(1)}) < threshold (${config.adxThreshold}) or EMAs compressing`,
      isTradable: false,
      adxValue: currentAdx,
      fastEma, slowEma, trendEma, slowEmaSlope,
      structureTrend, extensionAtr, htfTrend
    };
  }

  return {
    regime: 'TRANSITION',
    reason: 'Mixed directional indicators: Structure and trend indicators in conflict',
    isTradable: false,
    adxValue: currentAdx,
    fastEma, slowEma, trendEma, slowEmaSlope,
    structureTrend, extensionAtr, htfTrend
  };
}

// ---------------------------------------------------------------------------
// 4. Session Timing Filter Helper
// ---------------------------------------------------------------------------

export function isWithinTradingSession(
  timestampSec: number,
  enabled: boolean = false,
  startStr: string = '07:00',
  endStr: string = '20:00'
): boolean {
  if (!enabled) return true;
  try {
    const date = new Date(timestampSec * 1000);
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const currentMin = utcHours * 60 + utcMinutes;

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startTotal = (startH || 0) * 60 + (startM || 0);
    const endTotal = (endH || 0) * 60 + (endM || 0);

    if (startTotal <= endTotal) {
      return currentMin >= startTotal && currentMin <= endTotal;
    } else {
      // Over midnight
      return currentMin >= startTotal || currentMin <= endTotal;
    }
  } catch (e) {
    return true;
  }
}

// ---------------------------------------------------------------------------
// 5. Main Trend-Pullback Evaluation Engine (Rejection-First Flow)
// ---------------------------------------------------------------------------

export function evaluateTrendPullback(
  rawExecCandles: Candle[],
  rawHtfCandles: Candle[],
  currentPrice: number,
  settings: Partial<AppSettings> = {}
): TrendPullbackSignal | null {
  // Configuration extraction with robust defaults
  const execTimeframe = settings.tpExecutionTimeframe || settings.timeframe || '15m';
  const htfTimeframe = settings.tpHigherTimeframe || '1H';
  const fastEmaPeriod = settings.tpFastEma ?? 20;
  const slowEmaPeriod = settings.tpSlowEma ?? 50;
  const trendEmaPeriod = settings.tpTrendEma ?? 200;
  const atrPeriod = settings.tpAtrPeriod ?? 14;
  const adxPeriod = settings.tpAdxPeriod ?? 14;
  const adxThreshold = settings.tpAdxThreshold ?? 25;
  const volMaPeriod = settings.tpVolMaPeriod ?? 20;
  const minVolRatio = settings.tpMinVolRatio ?? 1.0;
  const maxStopDistanceATR = settings.tpMaxStopDistanceATR ?? 3.0;
  const minStopDistanceATR = settings.tpMinStopDistanceATR ?? 0.5;
  const minRiskRewardRatio = settings.tpMinRiskRewardRatio ?? settings.minRRRatio ?? 2.0;
  const maxEntryDistanceATR = settings.tpMaxEntryDistanceATR ?? 0.5;
  const maxSpreadPct = settings.tpMaxSpreadPct ?? 0.08;
  const sessionsEnabled = settings.tpSessionsEnabled ?? false;
  const sessionStart = settings.tpSessionStart || '07:00';
  const sessionEnd = settings.tpSessionEnd || '20:00';
  const minSetupScore = settings.tpMinSetupScore ?? 7;
  const longsEnabled = settings.tpLongsEnabled ?? true;
  const shortsEnabled = settings.tpShortsEnabled ?? true;
  const allowNoVolume = settings.tpAllowNoVolume ?? false;
  const allowBroadStop = settings.tpAllowBroadStructuralStop ?? false;

  // Helper template for returning rejection or state signal
  const makeSignal = (
    decision: 'EXECUTE' | 'REJECT' | 'WAIT',
    status: TrendPullbackStatus,
    rejectionReason: TrendPullbackRejectionReason,
    details: string,
    direction: 'LONG' | 'SHORT' = 'LONG',
    score: number = 0,
    breakdown: any = { htfAligned: 0, trendStructure: 0, validPullback: 0, priceAction: 0, volume: 0, regimeFavorable: 0, noOpposingLevel: 0 },
    metrics: any = {}
  ): TrendPullbackSignal => ({
    symbol: metrics.symbol || 'PAIR',
    direction,
    executionTimeframe: execTimeframe,
    higherTimeframe: htfTimeframe,
    marketRegime: metrics.regime || 'UNKNOWN',
    trendStructure: metrics.structure || 'NONE',
    pullbackZone: metrics.pullbackZone || 'NONE',
    confirmationTimestamp: metrics.timestamp || Date.now(),
    priceActionPattern: metrics.pattern || 'NONE',
    volumeRatio: metrics.volumeRatio || 0,
    atrValue: metrics.atr || 0,
    stopType: metrics.stopType || 'INVALID_STOP',
    stopDistancePrice: metrics.stopDistPrice || 0,
    stopDistanceATR: metrics.stopDistAtr || 0,
    entryPrice: metrics.entryPrice || currentPrice,
    stopLossPrice: metrics.sl || 0,
    targetPrice: metrics.tp1 || 0,
    riskRewardRatio: metrics.rr || 0,
    triggerLevel: metrics.triggerLevel,
    invalidationLevel: metrics.invalidationLevel,
    pullbackSwingExtreme: metrics.pullbackSwingExtreme,
    retestTolerance: metrics.retestTolerance,
    retestArea: metrics.retestArea,
    lifecycleState: metrics.lifecycleState || (decision === 'EXECUTE' ? 'SIGNAL_CONFIRMED' : (status === 'WAITING_FOR_RETEST' ? 'CONFIRMATION_WAITING' : (status === 'RETESTING' ? 'RETESTING' : 'NO_SETUP'))),
    entryMode: metrics.entryMode || (settings.tpEntryMode ?? 'BREAK_RETEST'),
    retestClassification: metrics.retestClassification || 'NONE',
    retestDetails: metrics.retestDetails,
    score,
    scoreBreakdown: breakdown,
    status,
    finalDecision: decision,
    exactRejectionReason: rejectionReason,
    rejectionDetails: details,
    allowedRiskAmount: metrics.riskAmount || 100,
    positionSize: metrics.positionSize || 0,
    tp1: metrics.tp1 || 0,
    tp2: metrics.tp2 || 0,
    tp3: metrics.tp3 || 0,
    strategyRegimeStatus: decision === 'EXECUTE' ? 'IN_FAVOR' : (rejectionReason === 'UNFAVORABLE_MARKET_REGIME' ? 'WAITING' : 'NEUTRAL'),
    regimeFavorable: decision === 'EXECUTE' || (metrics.regime === 'TRENDING_UP' || metrics.regime === 'TRENDING_DOWN')
  });

  // 1. DATA VALIDATION: Require sufficient history
  if (!rawExecCandles || rawExecCandles.length < 55) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'INVALID_MARKET_DATA', 'Insufficient execution timeframe candle history (minimum 55 closed candles required)');
  }

  // 2. CANDLE CLOSE ENFORCEMENT: Strictly evaluate on CLOSED candles only
  // Slice off the latest active/forming candle to avoid look-ahead bias and repainting
  const execCandles = rawExecCandles.slice(0, -1);
  const htfCandles = (rawHtfCandles && rawHtfCandles.length > 0) ? rawHtfCandles.slice(0, -1) : [];

  const n = execCandles.length;
  const lastClosedCandle = execCandles[n - 1];
  const prevClosedCandle = execCandles[n - 2];
  const confirmTime = lastClosedCandle.time;

  // 3. SESSION FILTER
  if (sessionsEnabled && !isWithinTradingSession(confirmTime, true, sessionStart, sessionEnd)) {
    return makeSignal('WAIT', 'WAITING_FOR_REGIME_CONFIRMATION', 'UNFAVORABLE_MARKET_REGIME', `Outside active trading session window (${sessionStart} - ${sessionEnd} UTC)`);
  }

  // 4. MARKET REGIME DETECTION
  const regimeRes = detectMarketRegime(execCandles, htfCandles, {
    fastEmaPeriod,
    slowEmaPeriod,
    trendEmaPeriod,
    adxPeriod,
    adxThreshold,
    atrPeriod
  });

  if (!regimeRes.isTradable) {
    return makeSignal('WAIT', 'WAITING_FOR_TREND', 'UNFAVORABLE_MARKET_REGIME', `Market regime is '${regimeRes.regime}': ${regimeRes.reason}`, 'LONG', 0, undefined, {
      regime: regimeRes.regime,
      atr: calculateATR(execCandles, atrPeriod)[n - 1]
    });
  }

  // 5. MULTI-TIMEFRAME DIRECTION DETERMINATION
  const permittedDirection: 'LONG' | 'SHORT' = regimeRes.regime === 'TRENDING_UP' ? 'LONG' : 'SHORT';

  if (permittedDirection === 'LONG' && !longsEnabled) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'TIMEFRAME_MISMATCH', 'Long setups disabled in configuration');
  }
  if (permittedDirection === 'SHORT' && !shortsEnabled) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'TIMEFRAME_MISMATCH', 'Short setups disabled in configuration');
  }

  // Verify MTF agreement
  if (permittedDirection === 'LONG' && regimeRes.htfTrend !== 'BULLISH') {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'TIMEFRAME_MISMATCH', `Higher timeframe is '${regimeRes.htfTrend}', does not confirm Bullish trend`);
  }
  if (permittedDirection === 'SHORT' && regimeRes.htfTrend !== 'BEARISH') {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'TIMEFRAME_MISMATCH', `Higher timeframe is '${regimeRes.htfTrend}', does not confirm Bearish trend`);
  }

  // 6. TECHNICAL INDICATORS ON CLOSED EXECUTION TIMEFRAME
  const closes = execCandles.map(c => c.close);
  const fastEmaArr = calculateEMA(closes, fastEmaPeriod);
  const slowEmaArr = calculateEMA(closes, slowEmaPeriod);
  const vwapArr = calculateVWAP(execCandles);
  const atrArr = calculateATR(execCandles, atrPeriod);
  const vols = execCandles.map(c => c.volume);
  const volMaArr = calculateSMA(vols, volMaPeriod);

  const execAtr = atrArr[n - 1] || (lastClosedCandle.high - lastClosedCandle.low);
  const fastEma = fastEmaArr[n - 1];
  const slowEma = slowEmaArr[n - 1];
  const currentVwap = vwapArr[n - 1];
  const volMa = volMaArr[n - 1] || 1;

  // 7. PULLBACK IDENTIFICATION & VALIDATION
  const { highs, lows } = findPivots(execCandles, 5);

  let validPullback = false;
  let pullbackZoneName = 'NONE';
  let invalidationLevel = 0;
  let pullbackLow = Infinity;
  let pullbackHigh = -Infinity;

  // Lookback 15 bars for pullback swing extremes
  const pullbackWindow = execCandles.slice(-15);
  for (const c of pullbackWindow) {
    if (c.low < pullbackLow) pullbackLow = c.low;
    if (c.high > pullbackHigh) pullbackHigh = c.high;
  }

  if (permittedDirection === 'LONG') {
    // Bullish trend: Pullback should retrace toward Fast EMA, Slow EMA, or VWAP
    const touchedFastEma = pullbackLow <= fastEma * 1.002 && lastClosedCandle.close >= fastEma * 0.998;
    const touchedSlowEma = pullbackLow <= slowEma * 1.003 && lastClosedCandle.close >= slowEma * 0.995;
    const touchedVwap = pullbackLow <= currentVwap * 1.003 && lastClosedCandle.close >= currentVwap * 0.995;

    if (touchedFastEma || touchedSlowEma || touchedVwap) {
      validPullback = true;
      if (touchedSlowEma) pullbackZoneName = 'Slow EMA (50) Support';
      else if (touchedVwap) pullbackZoneName = 'VWAP Dynamic Support';
      else pullbackZoneName = 'Fast EMA (20) Trend Support';
    }

    // Identify latest confirmed Higher Low
    if (lows.length >= 2) {
      const recentLow = lows[lows.length - 1].price;
      invalidationLevel = Math.min(recentLow, pullbackLow);
    } else {
      invalidationLevel = pullbackLow;
    }

    // Invalidation check: Pullback must not decisively violate latest structural support
    if (lastClosedCandle.close < invalidationLevel - (execAtr * 0.2)) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'PULLBACK_INVALIDATED', `Pullback broke decisively below swing low invalidation level (${invalidationLevel.toFixed(2)})`);
    }

    // Pullback momentum check: candles in pullback shouldn't be massive runaway selling
    const maxDropBar = Math.max(...pullbackWindow.map(c => c.open > c.close ? (c.open - c.close) : 0));
    if (maxDropBar > execAtr * 2.5) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'PULLBACK_INVALIDATED', `Pullback momentum too violent: single red candle dropped ${maxDropBar.toFixed(2)} (> 2.5 ATR)`);
    }

  } else {
    // Bearish trend: Pullback should retrace upward toward Fast EMA, Slow EMA, or VWAP
    const touchedFastEma = pullbackHigh >= fastEma * 0.998 && lastClosedCandle.close <= fastEma * 1.002;
    const touchedSlowEma = pullbackHigh >= slowEma * 0.997 && lastClosedCandle.close <= slowEma * 1.005;
    const touchedVwap = pullbackHigh >= currentVwap * 0.997 && lastClosedCandle.close <= currentVwap * 1.005;

    if (touchedFastEma || touchedSlowEma || touchedVwap) {
      validPullback = true;
      if (touchedSlowEma) pullbackZoneName = 'Slow EMA (50) Resistance';
      else if (touchedVwap) pullbackZoneName = 'VWAP Dynamic Resistance';
      else pullbackZoneName = 'Fast EMA (20) Trend Resistance';
    }

    // Identify latest confirmed Lower High
    if (highs.length >= 2) {
      const recentHigh = highs[highs.length - 1].price;
      invalidationLevel = Math.max(recentHigh, pullbackHigh);
    } else {
      invalidationLevel = pullbackHigh;
    }

    // Invalidation check: Pullback must not decisively violate latest structural resistance
    if (lastClosedCandle.close > invalidationLevel + (execAtr * 0.2)) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'PULLBACK_INVALIDATED', `Pullback broke decisively above swing high invalidation level (${invalidationLevel.toFixed(2)})`);
    }

    // Pullback momentum check
    const maxRallyBar = Math.max(...pullbackWindow.map(c => c.close > c.open ? (c.close - c.open) : 0));
    if (maxRallyBar > execAtr * 2.5) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'PULLBACK_INVALIDATED', `Pullback momentum too violent: single green candle rallied ${maxRallyBar.toFixed(2)} (> 2.5 ATR)`);
    }
  }

  if (!validPullback) {
    return makeSignal('WAIT', 'WAITING_FOR_PULLBACK', 'NO_VALID_PULLBACK', 'Price has not retraced to a valid dynamic support/resistance zone (20 EMA, 50 EMA, or VWAP)');
  }

  // 8. PRICE-ACTION CONFIRMATION ON CLOSED CANDLE
  const candleRange = lastClosedCandle.high - lastClosedCandle.low;
  const body = Math.abs(lastClosedCandle.close - lastClosedCandle.open);
  const isGreen = lastClosedCandle.close > lastClosedCandle.open;
  const isRed = lastClosedCandle.close < lastClosedCandle.open;

  // Rejection checks for weak confirmation
  // 1. Doji check: body < 15% of range
  if (candleRange > 0 && (body / candleRange) < 0.15) {
    return makeSignal('WAIT', 'WAITING_FOR_PRICE_ACTION', 'PRICE_ACTION_NOT_CONFIRMED', 'Last candle is a Doji (indecision, body < 15% of range)');
  }

  // 2. Tiny candle check: range < 0.3 ATR
  if (candleRange < execAtr * 0.3) {
    return makeSignal('WAIT', 'WAITING_FOR_PRICE_ACTION', 'PRICE_ACTION_NOT_CONFIRMED', 'Last candle range is too tiny (< 0.3 ATR) to confirm directional impulse');
  }

  let priceActionConfirmed = false;
  let patternName = 'NONE';

  if (permittedDirection === 'LONG') {
    const lowerWick = Math.min(lastClosedCandle.open, lastClosedCandle.close) - lastClosedCandle.low;
    const upperWick = lastClosedCandle.high - Math.max(lastClosedCandle.open, lastClosedCandle.close);
    const closeNearHigh = candleRange > 0 && (upperWick / candleRange) <= 0.25;
    const isEngulfing = isGreen && prevClosedCandle.close < prevClosedCandle.open && lastClosedCandle.close > prevClosedCandle.open && lastClosedCandle.open < prevClosedCandle.close;
    const strongRejection = candleRange > 0 && (lowerWick / candleRange) >= 0.45 && isGreen;
    const closeAbovePrevHigh = lastClosedCandle.close > prevClosedCandle.high;

    if (isEngulfing) {
      priceActionConfirmed = true;
      patternName = 'Bullish Engulfing';
    } else if (strongRejection) {
      priceActionConfirmed = true;
      patternName = 'Strong Bullish Pinbar / Support Rejection';
    } else if (closeAbovePrevHigh && isGreen) {
      priceActionConfirmed = true;
      patternName = 'Bullish Break Above Previous High';
    } else if (isGreen && closeNearHigh && body >= execAtr * 0.4) {
      priceActionConfirmed = true;
      patternName = 'Strong Bullish Impulse Closing Near High';
    }

    // Opposing wick check: if upper wick is too long (> 35% of range)
    if (candleRange > 0 && (upperWick / candleRange) > 0.35) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'FAKE_BREAKOUT', 'Confirmation candle has large upper rejection wick (> 35% of range)');
    }

  } else {
    // SHORT confirmation
    const upperWick = lastClosedCandle.high - Math.max(lastClosedCandle.open, lastClosedCandle.close);
    const lowerWick = Math.min(lastClosedCandle.open, lastClosedCandle.close) - lastClosedCandle.low;
    const closeNearLow = candleRange > 0 && (lowerWick / candleRange) <= 0.25;
    const isEngulfing = isRed && prevClosedCandle.close > prevClosedCandle.open && lastClosedCandle.close < prevClosedCandle.open && lastClosedCandle.open > prevClosedCandle.close;
    const strongRejection = candleRange > 0 && (upperWick / candleRange) >= 0.45 && isRed;
    const closeBelowPrevLow = lastClosedCandle.close < prevClosedCandle.low;

    if (isEngulfing) {
      priceActionConfirmed = true;
      patternName = 'Bearish Engulfing';
    } else if (strongRejection) {
      priceActionConfirmed = true;
      patternName = 'Strong Bearish Pinbar / Resistance Rejection';
    } else if (closeBelowPrevLow && isRed) {
      priceActionConfirmed = true;
      patternName = 'Bearish Break Below Previous Low';
    } else if (isRed && closeNearLow && body >= execAtr * 0.4) {
      priceActionConfirmed = true;
      patternName = 'Strong Bearish Impulse Closing Near Low';
    }

    // Opposing wick check: if lower wick is too long (> 35% of range)
    if (candleRange > 0 && (lowerWick / candleRange) > 0.35) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'FAKE_BREAKOUT', 'Confirmation candle has large lower rejection wick (> 35% of range)');
    }
  }

  if (!priceActionConfirmed) {
    return makeSignal('WAIT', 'WAITING_FOR_PRICE_ACTION', 'PRICE_ACTION_NOT_CONFIRMED', 'Awaiting solid closed price-action confirmation (Engulfing, Pinbar, or Momentum Close)');
  }

  // 9. TWO-LEVEL STRUCTURAL SEPARATION: TRIGGER LEVEL VS. INVALIDATION LEVEL
  const entryMode = settings.tpEntryMode ?? 'BREAK_RETEST';
  const retestToleranceAtr = settings.tpRetestToleranceAtr ?? 0.5;
  const structuralStopBufferAtr = settings.tpStructuralStopBufferAtr ?? 0.2;
  const retestTolerance = execAtr * retestToleranceAtr;
  
  // Calculate trigger level (the confirmation/breakout pivot level)
  let triggerLevel = 0;
  if (permittedDirection === 'LONG') {
    triggerLevel = Math.max(prevClosedCandle.high, ...pullbackWindow.slice(-4, -1).map(c => Math.max(c.open, c.close)));
  } else {
    triggerLevel = Math.min(prevClosedCandle.low, ...pullbackWindow.slice(-4, -1).map(c => Math.min(c.open, c.close)));
  }

  const retestArea = permittedDirection === 'LONG' ? {
    low: triggerLevel - retestTolerance,
    high: triggerLevel + (retestTolerance * 0.5),
    description: `Breakout level retest support (${(triggerLevel - retestTolerance).toFixed(2)} - ${(triggerLevel + retestTolerance * 0.5).toFixed(2)})`
  } : {
    low: triggerLevel - (retestTolerance * 0.5),
    high: triggerLevel + retestTolerance,
    description: `Breakdown level retest resistance (${(triggerLevel - retestTolerance * 0.5).toFixed(2)} - ${(triggerLevel + retestTolerance).toFixed(2)})`
  };

  let lifecycleState: TrendPullbackLifecycleState = 'NO_SETUP';
  let retestClassification: RetestClassification = 'NONE';
  let retestDetails = '';

  // Evaluate Retest state if in BREAK_RETEST mode
  if (entryMode === 'BREAK_RETEST') {
    const recentBars = execCandles.slice(-6);
    let hasBrokenTrigger = false;
    let hasRetestedTrigger = false;
    let retestViolatedStructure = false;
    let highOpposingVolumeOnRetest = false;

    for (let i = 0; i < recentBars.length - 1; i++) {
      const b = recentBars[i];
      if (permittedDirection === 'LONG') {
        if (b.close > triggerLevel) hasBrokenTrigger = true;
        if (hasBrokenTrigger && b.low <= retestArea.high) {
          hasRetestedTrigger = true;
          if (b.close < invalidationLevel) retestViolatedStructure = true;
          if (b.open > b.close && b.volume > volMa * 1.5) highOpposingVolumeOnRetest = true;
        }
      } else {
        if (b.close < triggerLevel) hasBrokenTrigger = true;
        if (hasBrokenTrigger && b.high >= retestArea.low) {
          hasRetestedTrigger = true;
          if (b.close > invalidationLevel) retestViolatedStructure = true;
          if (b.close > b.open && b.volume > volMa * 1.5) highOpposingVolumeOnRetest = true;
        }
      }
    }

    if (retestViolatedStructure) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'FAILED_RETEST', `Retest invalidated: bar closed beyond structural invalidation level (${invalidationLevel.toFixed(2)})`, permittedDirection, 0, undefined, {
        lifecycleState: 'INVALIDATED',
        retestClassification: 'TRUE_INVALIDATION',
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        entryMode
      });
    }

    if (highOpposingVolumeOnRetest && settings.tpDangerousRetestEarlyExit) {
      return makeSignal('REJECT', 'TRADE_REJECTED', 'DANGEROUS_RETEST', `Dangerous retest: aggressive opposing volume violated retest zone`, permittedDirection, 0, undefined, {
        lifecycleState: 'INVALIDATED',
        retestClassification: 'DANGEROUS_RETEST',
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        entryMode
      });
    }

    const continuationConfirmed = permittedDirection === 'LONG'
      ? (lastClosedCandle.close > lastClosedCandle.open && lastClosedCandle.close >= triggerLevel)
      : (lastClosedCandle.close < lastClosedCandle.open && lastClosedCandle.close <= triggerLevel);

    if (hasBrokenTrigger && hasRetestedTrigger && continuationConfirmed && priceActionConfirmed) {
      lifecycleState = 'CONTINUATION_CONFIRMED';
      retestClassification = 'HEALTHY_RETEST';
      retestDetails = `Break and healthy retest of trigger (${triggerLevel.toFixed(2)}) confirmed by closed continuation candle`;
    } else if (hasBrokenTrigger && hasRetestedTrigger && !continuationConfirmed) {
      return makeSignal('WAIT', 'WAITING_FOR_CONTINUATION', 'WAITING_FOR_CONTINUATION', `Retest holding in zone (${retestArea.low.toFixed(2)} - ${retestArea.high.toFixed(2)}). Awaiting closed continuation candle.`, permittedDirection, 5, undefined, {
        lifecycleState: 'RETESTING',
        retestClassification: 'HEALTHY_RETEST',
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        retestTolerance,
        retestArea,
        entryMode
      });
    } else if (hasBrokenTrigger && !hasRetestedTrigger) {
      return makeSignal('WAIT', 'WAITING_FOR_RETEST', 'WAITING_FOR_RETEST', `Breakout confirmed above ${triggerLevel.toFixed(2)}. Awaiting normal retest into trigger area.`, permittedDirection, 5, undefined, {
        lifecycleState: 'CONFIRMATION_WAITING',
        retestClassification: 'NONE',
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        retestTolerance,
        retestArea,
        entryMode
      });
    } else {
      // In BREAK_RETEST mode, if trigger has not broken yet, wait for confirmation
      return makeSignal('WAIT', 'WAITING_FOR_RETEST', 'WAITING_FOR_RETEST', `Pullback formed. Awaiting breakout beyond trigger level (${triggerLevel.toFixed(4)}) before executing Break & Retest entry.`, permittedDirection, 5, undefined, {
        lifecycleState: 'CONFIRMATION_WAITING',
        retestClassification: 'NONE',
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        retestTolerance,
        retestArea,
        entryMode
      });
    }
  } else {
    // BALANCED mode: enters on solid closed confirmation candle
    lifecycleState = 'ENTRY_ACTIVE';
    retestClassification = 'NONE';
    retestDetails = `Balanced entry on closed confirmation candle (${patternName}) with structural invalidation anchor`;
  }

  // 10. VOLUME CONFIRMATION
  const confirmVolume = lastClosedCandle.volume;
  const prevVolume = prevClosedCandle.volume;
  const volRatio = volMa > 0 ? (confirmVolume / volMa) : 1;

  if (!allowNoVolume) {
    if (confirmVolume <= prevVolume && volRatio < minVolRatio) {
      return makeSignal('WAIT', 'WAITING_FOR_VOLUME', 'VOLUME_NOT_CONFIRMED', `Volume (${confirmVolume.toFixed(0)}) < previous candle and ratio (${volRatio.toFixed(2)}x) < threshold (${minVolRatio}x)`);
    }
  }

  // 11. FAKE BREAKOUT & EXHAUSTION FILTERS
  if (candleRange > execAtr * 2.8) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'FAKE_BREAKOUT', `Confirmation candle range (${candleRange.toFixed(2)}) is abnormally large (> 2.8 ATR), indicating climactic exhaustion`);
  }

  // 12. STOP-LOSS CALCULATION & STRUCTURAL INVALIDATION RULE
  // Volatility buffer beyond technical invalidation point
  const slBuffer = execAtr * structuralStopBufferAtr;
  let stopPrice = 0;
  let stopType: TrendPullbackStopType = 'LOCAL_EXECUTION_STOP';

  if (permittedDirection === 'LONG') {
    stopPrice = invalidationLevel - slBuffer;
    if (stopPrice >= lastClosedCandle.close) {
      stopType = 'INVALID_STOP';
      return makeSignal('REJECT', 'TRADE_REJECTED', 'INVALID_STOP_PLACEMENT', 'Calculated Stop Loss is above or equal to current price');
    }
  } else {
    stopPrice = invalidationLevel + slBuffer;
    if (stopPrice <= lastClosedCandle.close) {
      stopType = 'INVALID_STOP';
      return makeSignal('REJECT', 'TRADE_REJECTED', 'INVALID_STOP_PLACEMENT', 'Calculated Stop Loss is below or equal to current price');
    }
  }

  // Calculate Stop Distance & ATR Multiple
  const entryTriggerPrice = lastClosedCandle.close;
  const stopDistance = Math.abs(entryTriggerPrice - stopPrice);
  const stopATRMultiple = execAtr > 0 ? (stopDistance / execAtr) : 0;

  // Stop Distance Filter: Reject if too tight (noise)
  if (stopATRMultiple < minStopDistanceATR) {
    return makeSignal('REJECT', 'STOP_TOO_TIGHT', 'STOP_TOO_TIGHT_FOR_MARKET_NOISE', `Stop distance (${stopATRMultiple.toFixed(2)} ATR) is below minimum safe threshold (${minStopDistanceATR} ATR)`);
  }

  // MANDATORY USER DIRECTIVE:
  // "The stop should be below the true invalidation level, not just below the confirmation candle.
  // However, if the true invalidation stop is too far for the selected timeframe:
  // Do not tighten the stop artificially.
  // Do not widen the target artificially.
  // Do not enter the trade.
  // Return: NO TRADE — VALID INVALIDATION STOP IS TOO WIDE"
  if (stopATRMultiple > maxStopDistanceATR) {
    return makeSignal(
      'REJECT', 
      'STOP_TOO_WIDE', 
      'STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME', 
      `NO TRADE — VALID INVALIDATION STOP IS TOO WIDE (${stopATRMultiple.toFixed(2)} ATR > ${maxStopDistanceATR} ATR). Structural stop not tightened artificially.`,
      permittedDirection,
      0,
      undefined,
      {
        triggerLevel,
        invalidationLevel,
        pullbackSwingExtreme: invalidationLevel,
        stopDistAtr: stopATRMultiple,
        entryPrice: entryTriggerPrice,
        sl: stopPrice
      }
    );
  }

  // 13. ENTRY DISTANCE FILTER (Prevent late entries)
  const currentEntryDist = Math.abs(currentPrice - entryTriggerPrice);
  const currentEntryDistAtr = execAtr > 0 ? (currentEntryDist / execAtr) : 0;
  if (currentEntryDistAtr > maxEntryDistanceATR) {
    return makeSignal('REJECT', 'ENTRY_TOO_LATE', 'ENTRY_TOO_LATE', `Price has moved ${currentEntryDistAtr.toFixed(2)} ATR away from confirmation trigger (${entryTriggerPrice.toFixed(2)}). Max allowed is ${maxEntryDistanceATR} ATR`);
  }

  // 14. LOGICAL TARGET & RISK-TO-REWARD RATIO
  let targetPrice = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (permittedDirection === 'LONG') {
    // Structural target: Prior swing high or minimum R:R target
    const recentSwingHigh = highs.length > 0 ? highs[highs.length - 1].price : (entryTriggerPrice + stopDistance * minRiskRewardRatio);
    targetPrice = Math.max(recentSwingHigh, entryTriggerPrice + (stopDistance * minRiskRewardRatio));
    tp2 = entryTriggerPrice + (stopDistance * (minRiskRewardRatio + 1.0));
    tp3 = entryTriggerPrice + (stopDistance * (minRiskRewardRatio + 2.0));
  } else {
    // Short structural target: Prior swing low or minimum R:R target
    const recentSwingLow = lows.length > 0 ? lows[lows.length - 1].price : (entryTriggerPrice - stopDistance * minRiskRewardRatio);
    targetPrice = Math.min(recentSwingLow, entryTriggerPrice - (stopDistance * minRiskRewardRatio));
    tp2 = entryTriggerPrice - (stopDistance * (minRiskRewardRatio + 1.0));
    tp3 = entryTriggerPrice - (stopDistance * (minRiskRewardRatio + 2.0));
  }

  const reward = Math.abs(targetPrice - entryTriggerPrice);
  const calculatedRR = stopDistance > 0 ? (reward / stopDistance) : 0;

  if (calculatedRR < minRiskRewardRatio) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'RISK_REWARD_TOO_LOW', `Available structural Risk-to-Reward ratio (${calculatedRR.toFixed(2)}:1) is below required minimum (${minRiskRewardRatio}:1)`);
  }

  // 15. POSITION SIZING CALCULATION
  const accountBalance = settings.startingBalance || 10000;
  const riskPct = (settings.tpRiskPctPerTrade ?? settings.accountRiskPct ?? 1.0) / 100;
  const allowedRiskAmount = accountBalance * riskPct;
  const positionSize = stopDistance > 0 ? (allowedRiskAmount / stopDistance) : 0;

  // 16. CONFIRMATION SCORING ENGINE (0 - 10)
  // - Higher-timeframe direction aligned: 2 points
  // - Clear trend structure: 2 points
  // - Valid pullback zone: 1 point
  // - Price-action confirmation: 2 points
  // - Volume confirmation: 2 points
  // - Volatility and regime favorable: 1 point
  // - No nearby opposing level: 1 point
  let score = 0;
  const breakdown = {
    htfAligned: 0,
    trendStructure: 0,
    validPullback: 0,
    priceAction: 0,
    volume: 0,
    regimeFavorable: 0,
    noOpposingLevel: 0
  };

  // HTF aligned: 2 points
  if ((permittedDirection === 'LONG' && regimeRes.htfTrend === 'BULLISH') || (permittedDirection === 'SHORT' && regimeRes.htfTrend === 'BEARISH')) {
    breakdown.htfAligned = 2;
    score += 2;
  }

  // Clear trend structure: 2 points
  if ((permittedDirection === 'LONG' && regimeRes.structureTrend === 'BULLISH') || (permittedDirection === 'SHORT' && regimeRes.structureTrend === 'BEARISH')) {
    breakdown.trendStructure = 2;
    score += 2;
  }

  // Valid pullback zone: 1 point
  if (validPullback) {
    breakdown.validPullback = 1;
    score += 1;
  }

  // Price action confirmation: 2 points
  if (priceActionConfirmed) {
    breakdown.priceAction = 2;
    score += 2;
  }

  // Volume confirmation: 2 points
  if (volRatio >= minVolRatio && confirmVolume > prevVolume) {
    breakdown.volume = 2;
    score += 2;
  } else if (volRatio >= 0.9) {
    breakdown.volume = 1;
    score += 1;
  }

  // Volatility & regime favorable: 1 point
  if (regimeRes.isTradable && regimeRes.adxValue >= adxThreshold) {
    breakdown.regimeFavorable = 1;
    score += 1;
  }

  // No nearby opposing level: 1 point
  const distanceToTarget = Math.abs(targetPrice - entryTriggerPrice);
  if (distanceToTarget >= execAtr * 1.5) {
    breakdown.noOpposingLevel = 1;
    score += 1;
  }

  const finalScore = Math.min(score, 10);

  // Score threshold check (Score never overrides mandatory failures, but can reject mediocre setups)
  if (finalScore < minSetupScore) {
    return makeSignal('REJECT', 'TRADE_REJECTED', 'UNFAVORABLE_MARKET_REGIME', `Setup score (${finalScore}/10) is below minimum threshold (${minSetupScore}/10)`, permittedDirection, finalScore, breakdown);
  }

  // 16. FINAL CONFIRMED SIGNAL EXECUTION
  return makeSignal(
    'EXECUTE',
    'SIGNAL_CONFIRMED',
    null,
    `Trend-Pullback setup confirmed! Regime: ${regimeRes.regime}, Pattern: ${patternName}, Zone: ${pullbackZoneName}, R:R: ${calculatedRR.toFixed(2)}:1`,
    permittedDirection,
    finalScore,
    breakdown,
    {
      symbol: 'EXEC',
      regime: regimeRes.regime,
      structure: regimeRes.structureTrend,
      pullbackZone: pullbackZoneName,
      timestamp: confirmTime,
      pattern: patternName,
      volumeRatio: parseFloat(volRatio.toFixed(2)),
      atr: parseFloat(execAtr.toFixed(4)),
      stopType,
      stopDistPrice: parseFloat(stopDistance.toFixed(4)),
      stopDistAtr: parseFloat(stopATRMultiple.toFixed(2)),
      entryPrice: entryTriggerPrice,
      sl: parseFloat(stopPrice.toFixed(4)),
      tp1: parseFloat(targetPrice.toFixed(4)),
      tp2: parseFloat(tp2.toFixed(4)),
      tp3: parseFloat(tp3.toFixed(4)),
      rr: parseFloat(calculatedRR.toFixed(2)),
      triggerLevel: parseFloat(triggerLevel.toFixed(4)),
      invalidationLevel: parseFloat(invalidationLevel.toFixed(4)),
      pullbackSwingExtreme: parseFloat(invalidationLevel.toFixed(4)),
      retestTolerance: parseFloat(retestTolerance.toFixed(4)),
      retestArea,
      lifecycleState,
      entryMode,
      retestClassification,
      retestDetails,
      riskAmount: allowedRiskAmount,
      positionSize
    }
  );
}

// ---------------------------------------------------------------------------
// 6. Pine Script v6 Strategy Generator for TradingView Webhook Alerts
// ---------------------------------------------------------------------------

export function generateTrendPullbackPineScript(settings: Partial<AppSettings> = {}): string {
  const execTf = settings.tpExecutionTimeframe || '15';
  const fastEma = settings.tpFastEma ?? 20;
  const slowEma = settings.tpSlowEma ?? 50;
  const trendEma = settings.tpTrendEma ?? 200;
  const atrPeriod = settings.tpAtrPeriod ?? 14;
  const adxPeriod = settings.tpAdxPeriod ?? 14;
  const adxThreshold = settings.tpAdxThreshold ?? 25;
  const volPeriod = settings.tpVolMaPeriod ?? 20;
  const minVolRatio = settings.tpMinVolRatio ?? 1.0;
  const minRR = settings.tpMinRiskRewardRatio ?? 2.0;
  const minStopAtr = settings.tpMinStopDistanceATR ?? 0.5;
  const maxStopAtr = settings.tpMaxStopDistanceATR ?? 3.0;
  const maxEntryDistAtr = settings.tpMaxEntryDistanceATR ?? 0.5;

  return `//@version=6
strategy("Robust Trend-Pullback Intraday Strategy [SMC/Price-Action]", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.04)

// ---------------------------------------------------------------------------
// Configuration Inputs
// ---------------------------------------------------------------------------
grp_trend = "Trend & Indicators"
fastEmaLen   = input.int(${fastEma}, "Fast EMA Period", group=grp_trend)
slowEmaLen   = input.int(${slowEma}, "Slow EMA Period", group=grp_trend)
trendEmaLen  = input.int(${trendEma}, "Main Trend EMA Period", group=grp_trend)
atrLen       = input.int(${atrPeriod}, "ATR Period", group=grp_trend)
adxLen       = input.int(${adxPeriod}, "ADX Period", group=grp_trend)
adxThresh    = input.int(${adxThreshold}, "Minimum ADX Directional Strength", group=grp_trend)
volMaLen     = input.int(${volPeriod}, "Volume SMA Period", group=grp_trend)
minVolMult   = input.float(${minVolRatio}, "Min Confirmation Volume Ratio", group=grp_trend)

grp_risk = "Risk Management & Retest Confirmation"
entryMode    = input.string("${settings.tpEntryMode || 'BREAK_RETEST'}", "Entry Mode", options=["BREAK_RETEST", "BALANCED"], group=grp_risk)
retestTolAtr = input.float(${settings.tpRetestToleranceAtr ?? 0.5}, "Retest Tolerance Zone (ATR)", group=grp_risk)
minRRRatio   = input.float(${minRR}, "Minimum Risk-to-Reward Ratio", group=grp_risk)
minStopAtrM  = input.float(${minStopAtr}, "Min Allowed Stop Distance (ATR)", group=grp_risk)
maxStopAtrM  = input.float(${maxStopAtr}, "Max Allowed Stop Distance (ATR)", group=grp_risk)
maxEntryAtrM = input.float(${maxEntryDistAtr}, "Max Entry Distance (ATR)", group=grp_risk)
slBufferMult = input.float(${settings.tpStructuralStopBufferAtr ?? 0.2}, "Structural Invalidation Stop ATR Buffer", group=grp_risk)

grp_sess = "Trading Sessions (UTC)"
useSession   = input.bool(${settings.tpSessionsEnabled ? 'true' : 'false'}, "Enable Session Filter", group=grp_sess)
sessionTime  = input.session("${settings.tpSessionStart || '0700'}-${settings.tpSessionEnd || '2000'}:1234567", "Session Window", group=grp_sess)

// ---------------------------------------------------------------------------
// Indicators Calculation
// ---------------------------------------------------------------------------
fastEma = ta.ema(close, fastEmaLen)
slowEma = ta.ema(close, slowEmaLen)
trendEma = ta.ema(close, trendEmaLen)
atrVal = ta.atr(atrLen)
volMa = ta.sma(volume, volMaLen)

// ADX & DI
[plusDI, minusDI, adxVal] = ta.dmi(adxLen, adxLen)

// Slow EMA slope over 3 bars
slowEmaSlope = (slowEma - slowEma[3]) / slowEma[3] * 100

// In-session check
inSession = not useSession or not na(time(timeframe.period, sessionTime, "UTC"))

// ---------------------------------------------------------------------------
// Market Regime Detection
// ---------------------------------------------------------------------------
isTrendingUp = close > trendEma and fastEma > slowEma and slowEmaSlope > 0.01 and adxVal >= adxThresh
isTrendingDown = close < trendEma and fastEma < slowEma and slowEmaSlope < -0.01 and adxVal >= adxThresh

// ---------------------------------------------------------------------------
// Pullback Detection
// ---------------------------------------------------------------------------
// 5-bar swing pivots
ph = ta.pivothigh(high, 5, 5)
pl = ta.pivotlow(low, 5, 5)

var float lastSwingLow = na
var float lastSwingHigh = na

if not na(pl)
    lastSwingLow := pl
if not na(ph)
    lastSwingHigh := ph

pullbackLow = ta.lowest(low, 12)
pullbackHigh = ta.highest(high, 12)

validLongPullback = isTrendingUp and (pullbackLow <= fastEma * 1.002 or pullbackLow <= slowEma * 1.003) and close >= slowEma * 0.995
validShortPullback = isTrendingDown and (pullbackHigh >= fastEma * 0.998 or pullbackHigh >= slowEma * 0.997) and close <= slowEma * 1.005

// ---------------------------------------------------------------------------
// Price Action Confirmation (Closed Bars)
// ---------------------------------------------------------------------------
candleRange = high - low
bodySize = math.abs(close - open)
isGreen = close > open
isRed = close < open

// Rejection wick math
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)

// Long patterns
longEngulfing = isGreen and isRed[1] and close > open[1] and open < close[1]
longPinbar = candleRange > 0 and (lowerWick / candleRange) >= 0.45 and isGreen and (upperWick / candleRange) <= 0.35
longBreakPrev = close > high[1] and isGreen and bodySize >= atrVal * 0.4
validLongPA = (longEngulfing or longPinbar or longBreakPrev) and bodySize >= candleRange * 0.20

// Short patterns
shortEngulfing = isRed and isGreen[1] and close < open[1] and open > close[1]
shortPinbar = candleRange > 0 and (upperWick / candleRange) >= 0.45 and isRed and (lowerWick / candleRange) <= 0.35
shortBreakPrev = close < low[1] and isRed and bodySize >= atrVal * 0.4
validShortPA = (shortEngulfing or shortPinbar or shortBreakPrev) and bodySize >= candleRange * 0.20

// Volume confirmation
volConfirmed = volume >= volume[1] or (volMa > 0 and volume >= volMa * minVolMult)

// ---------------------------------------------------------------------------
// Rejection-First Execution Logic
// ---------------------------------------------------------------------------
// Stop calculation
longInvalidation = na(lastSwingLow) ? pullbackLow : math.min(lastSwingLow, pullbackLow)
longStop = longInvalidation - (atrVal * slBufferMult)
longStopDist = close - longStop
longStopAtrMult = atrVal > 0 ? (longStopDist / atrVal) : 0

shortInvalidation = na(lastSwingHigh) ? pullbackHigh : math.max(lastSwingHigh, pullbackHigh)
shortStop = shortInvalidation + (atrVal * slBufferMult)
shortStopDist = shortStop - close
shortStopAtrMult = atrVal > 0 ? (shortStopDist / atrVal) : 0

// Stop distance validations
longStopValid = longStopAtrMult >= minStopAtrM and longStopAtrMult <= maxStopAtrM and longStop < close
shortStopValid = shortStopAtrMult >= minStopAtrM and shortStopAtrMult <= maxStopAtrM and shortStop > close

// Targets
longTarget = close + (longStopDist * minRRRatio)
shortTarget = close - (shortStopDist * minRRRatio)

// Final signals
longTrigger = validLongPullback and validLongPA and volConfirmed and longStopValid and inSession and strategy.position_size == 0
shortTrigger = validShortPullback and validShortPA and volConfirmed and shortStopValid and inSession and strategy.position_size == 0

// ---------------------------------------------------------------------------
// Trade Execution & Webhook Alerts
// ---------------------------------------------------------------------------
if longTrigger
    alertMsg = '{"strategy":"TREND_PULLBACK","action":"BUY","symbol":"' + syminfo.ticker + '","price":' + str.tostring(close) + ',"sl":' + str.tostring(longStop) + ',"tp":' + str.tostring(longTarget) + '}'
    strategy.entry("Long", strategy.long, alert_message=alertMsg)
    strategy.exit("Exit Long", "Long", stop=longStop, limit=longTarget, alert_message='{"action":"CLOSE_LONG"}')

if shortTrigger
    alertMsg = '{"strategy":"TREND_PULLBACK","action":"SELL","symbol":"' + syminfo.ticker + '","price":' + str.tostring(close) + ',"sl":' + str.tostring(shortStop) + ',"tp":' + str.tostring(shortTarget) + '}'
    strategy.entry("Short", strategy.short, alert_message=alertMsg)
    strategy.exit("Exit Short", "Short", stop=shortStop, limit=shortTarget, alert_message='{"action":"CLOSE_SHORT"}')

// ---------------------------------------------------------------------------
// Plots & Visuals
// ---------------------------------------------------------------------------
plot(fastEma, "Fast EMA (20)", color=color.new(#00e696, 0), linewidth=2)
plot(slowEma, "Slow EMA (50)", color=color.new(#2962ff, 0), linewidth=2)
plot(trendEma, "Trend EMA (200)", color=color.new(#ff6d00, 0), linewidth=2)

plotshape(longTrigger, "Long Signal", shape.triangleup, location.belowbar, color.new(#00e696, 0), size=size.small, text="PULLBACK BUY")
plotshape(shortTrigger, "Short Signal", shape.triangledown, location.abovebar, color.new(#f23645, 0), size=size.small, text="PULLBACK SELL")
`;
}
