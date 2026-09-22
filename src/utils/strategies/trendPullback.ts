import { calculateEMA, calculateATR, calculateADX } from '../indicators.js';
import { allowTrendPullback, extractTrendPullbackRegimeMetrics, type TrendPullbackRegimeMetrics } from './strategyRegimeFilters.js';
export { allowTrendPullback, extractTrendPullbackRegimeMetrics };
export type { TrendPullbackRegimeMetrics };

export type MarketRegimeType =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'TRANSITION'
  | 'HIGH_VOLATILITY'
  | 'LOW_LIQUIDITY'
  | 'UNKNOWN'
  | 'RANGE_OR_TRANSITION';

export type StopPlacementType =
  | 'LOCAL_EXECUTION_STOP'
  | 'BROAD_STRUCTURAL_STOP'
  | 'INVALID_STOP';

export interface MarketRegimeDetails {
  regime: MarketRegimeType;
  isTrending: boolean;
  direction: 'LONG' | 'SHORT' | 'NONE';
  emaSlope: number;             // EMA50 slope normalized by ATR
  emaSeparation: number;        // Separation between EMA20 and EMA50 in ATR units
  adx: number;
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  isOverextended: boolean;
  isChoppy: boolean;
  overlapRatio: number;
  reason: string;
}

export type TrendPullbackStage =
  | 'STAGE_A_SETUP_DETECTED'
  | 'STAGE_B_TRADE_CONFIRMED'
  | 'NONE';

export interface TrendPullbackOptions {
  tradeTimeframe?: string;       // e.g. '5m', '15m'
  htfTimeframe?: string;         // e.g. '15m', '1h' (if omitted, auto-derived)
  triggerTimeframe?: string;     // optional lower trigger timeframe
  emaFast?: number;              // default 20
  emaSlow?: number;              // default 50
  atrPeriod?: number;            // default 14
  adxPeriod?: number;            // default 14
  adxMin?: number;               // default 18 (trend strength filter)
  volSmaPeriod?: number;         // default 20
  minVolumeRatio?: number;       // default 1.0 (confirmation vol vs volSma20)
  requireVolume?: boolean;       // default true
  unconfirmedVolumeMode?: boolean; // default false (if true, allows signal on unconfirmed volume with lower confidence)
  maxEntryDistanceAtr?: number;  // default 0.25 (anti-chasing filter)
  minStopDistanceAtr?: number;   // default 0.8 (minimum ATR multiple to reject market noise)
  maxStopDistanceAtr?: number;   // default 3.0 (maximum ATR multiple for timeframe)
  minRrRatio?: number;           // default 1.5
  minScore?: number;             // default 8 (out of 10)
  atrBufferMult?: number;        // default 0.3
  maxSpreadAtr?: number;         // default 0.3 (maximum spread in ATR units)
  currentSpread?: number;        // current market spread in price units
  slippage?: number;             // expected slippage
  tradingSessions?: ('ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS')[];
  maxTradesPerSession?: number;
  maxDailyLoss?: number;
  riskPercentage?: number;
  cooldownPeriodMs?: number;
  allowLongs?: boolean;          // default true
  allowShorts?: boolean;         // default true
  allowBroadStop?: boolean;      // default false (prefers LOCAL_EXECUTION_STOP)
  symbol?: string;               // symbol name for unique ID
  isCandleClosed?: boolean;      // strict closed-candle check
  recentSignalIds?: string[] | Set<string>; // deduplication history
  isRiskLimitReached?: boolean;  // circuit breaker / account risk limit flag
  enforceRegimeFilter?: boolean; // if true, requires dedicated allowTrendPullback regime filter
}

export type TrendPullbackStatus =
  | 'WAITING FOR PULLBACK'
  | 'WAITING FOR PRICE ACTION'
  | 'WAITING FOR VOLUME'
  | 'WAITING FOR HIGHER-TIMEFRAME ALIGNMENT'
  | 'WAITING_FOR_CONFIRMATION'
  | 'SIGNAL CONFIRMED'
  | 'TRADE EXECUTED'
  | 'TRADE REJECTED'
  | 'WAITING_FOR_TREND'
  | 'WAITING_FOR_PULLBACK'
  | 'WAITING_FOR_PRICE_ACTION'
  | 'WAITING_FOR_VOLUME'
  | 'WAITING_FOR_REGIME_CONFIRMATION'
  | 'STOP_TOO_WIDE'
  | 'STOP_TOO_TIGHT'
  | 'ENTRY_TOO_LATE';

export type TrendPullbackRejection =
  | 'INVALID_MARKET_DATA'
  | 'CANDLE_NOT_CLOSED'
  | 'TIMEFRAME_MISMATCH'
  | 'UNFAVORABLE_MARKET_REGIME'
  | 'HTF_TREND_NOT_CONFIRMED'
  | 'INVALID_TREND_STRUCTURE'
  | 'NO_VALID_PULLBACK'
  | 'PULLBACK_INVALIDATED'
  | 'PULLBACK_BROKE_STRUCTURE'
  | 'PULLBACK_REVERSAL_RISK'
  | 'PRICE_ACTION_NOT_CONFIRMED'
  | 'VOLUME_NOT_CONFIRMED'
  | 'MISSING_VOLUME_DATA'
  | 'FAKE_BREAKOUT'
  | 'ENTRY_TOO_LATE'
  | 'ENTRY_DISTANCE_TOO_LARGE'
  | 'INVALID_STOP_PLACEMENT'
  | 'STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME'
  | 'STOP_LOSS_TOO_LARGE'
  | 'STOP_TOO_TIGHT_FOR_MARKET_NOISE'
  | 'STOP_LOSS_TOO_SMALL'
  | 'RISK_REWARD_TOO_LOW'
  | 'OPPOSING_BARRIER_BLOCKS_RR'
  | 'TARGET_ALREADY_REACHED'
  | 'SPREAD_OR_SLIPPAGE_TOO_HIGH'
  | 'DUPLICATE_SIGNAL'
  | 'RISK_LIMIT_REACHED'
  | 'CHOPPY_MARKET'
  | 'CONFIRMATION_SCORE_TOO_LOW'
  | 'SESSION_DISABLED'
  | 'DIRECTION_DISABLED';

export interface TrendPullbackScoreBreakdown {
  htfTrend: number;          // max 2 points
  marketStructure: number;   // max 2 points
  pullbackZone: number;      // max 1 point
  priceAction: number;       // max 2 points
  volume: number;            // max 2 points
  volatilityRegime?: number; // max 1 point
  noOpposingLevel: number;   // max 1 point
  total: number;             // 0 - 10
}

export interface TrendPullbackResult {
  direction: 'LONG' | 'SHORT';
  score: number;                 // 0 - 100 scaled
  rawScore: number;              // 0 - 10
  stage: TrendPullbackStage;
  atr: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tradeTimeframe: string;
  htfTimeframe: string;
  signalTime: number;
  signalId: string;              // unique ID for dedup
  reason: string;
  status: TrendPullbackStatus;
  rejectionReason?: TrendPullbackRejection;
  marketRegime: MarketRegimeType;
  stopType: StopPlacementType;
  stopDistance: number;
  stopATRMultiple: number;
  entryDistanceATR: number;
  volumeConfirmed: boolean;
  isUnconfirmedVolume?: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOWER';
  session?: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS';
  details: {
    htfTrendStatus: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    regimeDetails: MarketRegimeDetails;
    pullbackStatus: 'VALID_PULLBACK' | 'NO_PULLBACK' | 'BROKE_STRUCTURE';
    priceActionPattern: string;
    volumeRatio: number;
    volumeSma: number;
    confirmationScore: number;
    breakdown: TrendPullbackScoreBreakdown;
  };
}

export interface TrendPullbackEvaluation {
  success: boolean;
  status: TrendPullbackStatus;
  stage: TrendPullbackStage;
  rejectionReason?: TrendPullbackRejection;
  reason: string;
  score: number;
  result: TrendPullbackResult | null;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  isClosed?: boolean;
}

// ---------------------------------------------------------------------------
// 2. TIMEFRAME HIERARCHY
// ---------------------------------------------------------------------------

/**
 * Derives the higher timeframe automatically from the trade execution timeframe.
 * Higher timeframe sets directional permission & key levels.
 * Trade timeframe decides entry timing & risk placement.
 * Examples:
 *   5m -> 15m
 *   15m -> 1h
 *   30m -> 2h
 *   1h -> 4h
 *   4h -> 1d
 */
export function getHigherTimeframe(tradeTf: string): string {
  const norm = (tradeTf || '').trim().toLowerCase();
  switch (norm) {
    case '1m': return '5m';
    case '3m': return '15m';
    case '5m': return '15m';
    case '15m': return '1h';
    case '30m': return '2h';
    case '1h': return '4h';
    case '2h': return '6h';
    case '4h': return '1d';
    case '1d': return '1w';
    default: return '1h';
  }
}

/**
 * Detects candle interval duration in minutes to prevent timeframe mismatch.
 */
export function detectCandleIntervalMinutes(candles: Candle[]): number | null {
  if (!candles || candles.length < 2) return null;
  const diffs: number[] = [];
  for (let i = candles.length - 1; i > Math.max(0, candles.length - 5); i--) {
    const diffMs = candles[i].time - candles[i - 1].time;
    if (diffMs > 0) {
      diffs.push(Math.round(diffMs / 60000));
    }
  }
  if (diffs.length === 0) return null;
  return diffs[0];
}

/**
 * Converts a timeframe string (e.g. '5m', '15m', '1h') to minutes.
 */
export function timeframeToMinutes(tf: string): number {
  const norm = (tf || '').trim().toLowerCase();
  if (norm.endsWith('m')) return parseInt(norm, 10);
  if (norm.endsWith('h')) return parseInt(norm, 10) * 60;
  if (norm.endsWith('d')) return parseInt(norm, 10) * 1440;
  if (norm.endsWith('w')) return parseInt(norm, 10) * 10080;
  return 15;
}

/**
 * Swing point detection (Fractal pivots).
 */
export function detectSwingPoints(candles: Candle[], window = 2) {
  const highs: { index: number; price: number; time: number }[] = [];
  const lows: { index: number; price: number; time: number }[] = [];

  for (let i = window; i < candles.length - window; i++) {
    const currentH = candles[i].high;
    const currentL = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentH) isHigh = false;
      if (candles[j].low <= currentL) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: currentH, time: candles[i].time });
    if (isLow) lows.push({ index: i, price: currentL, time: candles[i].time });
  }

  return { highs, lows };
}

// ---------------------------------------------------------------------------
// 1. DEFINE THE MARKET REGIME FIRST
// ---------------------------------------------------------------------------

/**
 * Classifies market into one of three regimes:
 * - TRENDING_UP: Search only for long pullbacks
 * - TRENDING_DOWN: Search only for short pullbacks
 * - RANGE_OR_TRANSITION: Avoid trend-pullback trades
 *
 * Requirements:
 * Bullish: HTF price > EMA50/100, EMA20 > EMA50, rising EMA50 slope over 10-20 bars,
 *          HH & HL structure, ADX >= 18, price not overextended above EMA20.
 * Bearish: HTF price < EMA50/100, EMA20 < EMA50, falling EMA50 slope,
 *          LH & LL structure, ADX >= 18, price not overextended below EMA20.
 */
export function detectMarketRegime(
  htfCandles: Candle[],
  options: {
    emaFast?: number;
    emaSlow?: number;
    adxMin?: number;
    maxOverextensionAtr?: number;
  } = {}
): MarketRegimeDetails {
  const defaultFailure: MarketRegimeDetails = {
    regime: 'RANGE_OR_TRANSITION',
    isTrending: false,
    direction: 'NONE',
    emaSlope: 0,
    emaSeparation: 0,
    adx: 0,
    higherHighs: false,
    higherLows: false,
    lowerHighs: false,
    lowerLows: false,
    isOverextended: false,
    isChoppy: true,
    overlapRatio: 1.0,
    reason: 'Insufficient candle history for regime detection (minimum 30 required)'
  };

  if (!htfCandles || htfCandles.length < 30) {
    return defaultFailure;
  }

  const fastP = options.emaFast || 20;
  const slowP = options.emaSlow || 50;
  const adxMin = options.adxMin !== undefined ? options.adxMin : 18;
  const maxOverextendAtr = options.maxOverextensionAtr !== undefined ? options.maxOverextensionAtr : 3.0;

  const closes = htfCandles.map(c => c.close);
  const highs = htfCandles.map(c => c.high);
  const lows = htfCandles.map(c => c.low);
  const emaFast = calculateEMA(closes, fastP);
  const emaSlow = calculateEMA(closes, slowP);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const adxSeries = calculateADX(highs, lows, closes, 14);

  const len = htfCandles.length - 1;
  const currentPrice = closes[len];
  const eFast = emaFast[len] || currentPrice;
  const eSlow = emaSlow[len] || currentPrice;
  const atr = atrSeries[len] || (currentPrice * 0.015);
  const adx = adxSeries.adx[len] || 0;

  // 1. EMA Slope over last 10-15 candles
  const slopeBars = Math.min(15, len);
  const prevESlow = emaSlow[len - slopeBars] || eSlow;
  const rawSlope = (eSlow - prevESlow) / (slopeBars || 1);
  const emaSlope = rawSlope / (atr || 1); // Normalized slope per bar in ATR units

  // 2. EMA Separation
  const emaSeparation = Math.abs(eFast - eSlow) / (atr || 1);

  // 3. Swing Structure
  const { highs: swingHighs, lows: swingLows } = detectSwingPoints(htfCandles, 2);
  const higherHighs = swingHighs.length >= 2
    ? swingHighs[swingHighs.length - 1].price > swingHighs[swingHighs.length - 2].price
    : true;
  const higherLows = swingLows.length >= 2
    ? swingLows[swingLows.length - 1].price >= swingLows[swingLows.length - 2].price
    : true;
  const lowerHighs = swingHighs.length >= 2
    ? swingHighs[swingHighs.length - 1].price <= swingHighs[swingHighs.length - 2].price
    : true;
  const lowerLows = swingLows.length >= 2
    ? swingLows[swingLows.length - 1].price < swingLows[swingLows.length - 2].price
    : true;

  // 4. Overextension Check (distance from EMA20)
  const distanceFromEmaFast = Math.abs(currentPrice - eFast);
  const isOverextended = distanceFromEmaFast > (maxOverextendAtr * atr);

  // 5. Choppiness / Body Overlap Check (last 8-10 candles)
  const chopLookback = Math.min(8, len);
  let overlapCount = 0;
  for (let i = len - chopLookback + 1; i <= len; i++) {
    const cPrev = htfCandles[i - 1];
    const cCurr = htfCandles[i];
    const prevMax = Math.max(cPrev.open, cPrev.close);
    const prevMin = Math.min(cPrev.open, cPrev.close);
    const currMax = Math.max(cCurr.open, cCurr.close);
    const currMin = Math.min(cCurr.open, cCurr.close);
    // Overlapping body ranges
    if (Math.min(prevMax, currMax) >= Math.max(prevMin, currMin)) {
      overlapCount++;
    }
  }
  const overlapRatio = overlapCount / (chopLookback || 1);
  const isFlatSlope = Math.abs(emaSlope) < 0.015;
  const isChoppy = (overlapRatio >= 0.75 && isFlatSlope) || (emaSeparation < 0.15 && adx < adxMin);

  // Classify Regime
  if (!isChoppy && !isOverextended && adx >= adxMin) {
    // Trending UP conditions:
    // HTF price > EMA50, EMA20 > EMA50, positive slope, HH & HL structure
    if (currentPrice > eSlow && eFast > eSlow && emaSlope > 0.015 && (higherHighs || higherLows)) {
      return {
        regime: 'TRENDING_UP',
        isTrending: true,
        direction: 'LONG',
        emaSlope,
        emaSeparation,
        adx,
        higherHighs,
        higherLows,
        lowerHighs: false,
        lowerLows: false,
        isOverextended: false,
        isChoppy: false,
        overlapRatio,
        reason: `Trending UP confirmed (Price > EMA50, EMA20 > EMA50, Slope: +${emaSlope.toFixed(3)}, ADX: ${adx.toFixed(1)})`
      };
    }

    // Trending DOWN conditions:
    // HTF price < EMA50, EMA20 < EMA50, negative slope, LH & LL structure
    if (currentPrice < eSlow && eFast < eSlow && emaSlope < -0.015 && (lowerHighs || lowerLows)) {
      return {
        regime: 'TRENDING_DOWN',
        isTrending: true,
        direction: 'SHORT',
        emaSlope,
        emaSeparation,
        adx,
        higherHighs: false,
        higherLows: false,
        lowerHighs,
        lowerLows,
        isOverextended: false,
        isChoppy: false,
        overlapRatio,
        reason: `Trending DOWN confirmed (Price < EMA50, EMA20 < EMA50, Slope: ${emaSlope.toFixed(3)}, ADX: ${adx.toFixed(1)})`
      };
    }
  }

  // Fallback to RANGE_OR_TRANSITION
  const failureReason = isChoppy
    ? `Market is choppy/ranging (Overlap: ${(overlapRatio * 100).toFixed(0)}%, ADX: ${adx.toFixed(1)} < ${adxMin} or flat EMA)`
    : isOverextended
    ? `Price is overextended from EMA20 (${(distanceFromEmaFast / atr).toFixed(2)} ATR > ${maxOverextendAtr} ATR)`
    : adx < adxMin
    ? `ADX momentum below threshold (${adx.toFixed(1)} < ${adxMin})`
    : `EMA alignment or swing structure in transition (Slope: ${emaSlope.toFixed(3)}, Sep: ${emaSeparation.toFixed(2)} ATR)`;

  return {
    regime: 'RANGE_OR_TRANSITION',
    isTrending: false,
    direction: 'NONE',
    emaSlope,
    emaSeparation,
    adx,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    isOverextended,
    isChoppy,
    overlapRatio,
    reason: failureReason
  };
}

/**
 * Backward compatibility wrapper for checkHtfTrend.
 */
export function checkHtfTrend(
  htfCandles: Candle[],
  options: { emaFast?: number; emaSlow?: number; adxMin?: number } = {}
): {
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  confirmed: boolean;
  reason?: string;
  adx: number;
} {
  const regimeDetails = detectMarketRegime(htfCandles, options);
  if (regimeDetails.regime === 'TRENDING_UP') {
    return { trend: 'BULLISH', confirmed: true, adx: regimeDetails.adx, reason: regimeDetails.reason };
  }
  if (regimeDetails.regime === 'TRENDING_DOWN') {
    return { trend: 'BEARISH', confirmed: true, adx: regimeDetails.adx, reason: regimeDetails.reason };
  }
  return { trend: 'SIDEWAYS', confirmed: false, adx: regimeDetails.adx, reason: regimeDetails.reason };
}

// ---------------------------------------------------------------------------
// 3. VALID PULLBACK DEFINITION
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a pullback is healthy and structurally valid:
 * 1. Prior impulse move: Strong displacement / expansion leading into the pullback.
 * 2. Controlled retracement: Retracement to EMA20 / EMA50 / prior breakout level.
 * 3. Momentum loss: Candle bodies during pullback get smaller (exhaustion).
 * 4. Structural swing preservation: Pullback does not close beyond key higher low (long) or lower high (short).
 * 5. Lower volume: Average volume during pullback < average volume during impulse.
 */
export function checkPullbackStructure(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  options: { emaFast?: number; emaSlow?: number; atr?: number } = {}
): {
  valid: boolean;
  brokeStructure: boolean;
  reversalRisk: boolean;
  touchedValue: boolean;
  momentumLost: boolean;
  impulseDisplacementValid: boolean;
  reason?: string;
  invalidationLevel: number;
  pullbackAvgVol: number;
  impulseAvgVol: number;
  avgPullbackBody: number;
  avgImpulseBody: number;
} {
  const fastP = options.emaFast || 20;
  const slowP = options.emaSlow || 50;

  const len = candles.length - 1;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const emaFast = calculateEMA(closes, fastP);
  const emaSlow = calculateEMA(closes, slowP);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = options.atr || atrSeries[len] || (currentPrice * 0.015);

  const eFast = emaFast[len] || currentPrice;
  const eSlow = emaSlow[len] || currentPrice;

  const { highs: swingHighs, lows: swingLows } = detectSwingPoints(candles, 2);

  // Define slices: pullback (last 4-5 candles) vs impulse (preceding 8-10 candles)
  const pullbackSlice = candles.slice(Math.max(0, len - 4), len);
  const impulseSlice = candles.slice(Math.max(0, len - 14), Math.max(0, len - 4));

  const pullbackAvgVol = pullbackSlice.reduce((s, c) => s + (c.volume || 0), 0) / (pullbackSlice.length || 1);
  const impulseAvgVol = impulseSlice.reduce((s, c) => s + (c.volume || 0), 0) / (impulseSlice.length || 1);

  // 3. Momentum loss: average candle body size comparison
  const avgPullbackBody = pullbackSlice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / (pullbackSlice.length || 1);
  const avgImpulseBody = impulseSlice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / (impulseSlice.length || 1);
  const momentumLost = avgPullbackBody <= (avgImpulseBody * 1.15);

  // 1. Impulse displacement check
  let impulseDisplacementValid = true;
  if (impulseSlice.length >= 4) {
    const impulseMax = Math.max(...impulseSlice.map(c => c.high));
    const impulseMin = Math.min(...impulseSlice.map(c => c.low));
    const displacement = impulseMax - impulseMin;
    impulseDisplacementValid = displacement >= (1.0 * atr);
  }

  // Check for large reversal candle slicing violently through EMA 50
  const c0 = candles[len];
  const c1 = candles[len - 1];
  const body0 = Math.abs(c0.close - c0.open);

  if (direction === 'LONG') {
    // Invalidation level = lowest structural swing low prior to the pullback
    const priorLows = swingLows.filter(l => l.index < len - 4);
    const invalidationLevel = priorLows.length > 0
      ? Math.min(...priorLows.map(l => l.price))
      : Math.min(...candles.slice(0, Math.max(1, len - 4)).map(c => c.low));

    // Structural swing preservation: did price breach the structural higher low in the pullback wave?
    const minPullbackLow = Math.min(...pullbackSlice.map(c => c.low), candles[len].low);
    if (minPullbackLow < invalidationLevel * 0.998) {
      return {
        valid: false,
        brokeStructure: true,
        reversalRisk: false,
        touchedValue: true,
        momentumLost,
        impulseDisplacementValid,
        reason: 'PULLBACK_BROKE_STRUCTURE',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    // Dynamic value zone check: price pulled back to near EMA20 or EMA50 across the pullback window
    const pullbackWindow = candles.slice(Math.max(0, len - 4), len + 1);
    const touchedValue = pullbackWindow.some((c, offset) => {
      const idx = Math.max(0, len - 4) + offset;
      const fEma = emaFast[idx] || eFast;
      const sEma = emaSlow[idx] || eSlow;
      return (c.low <= fEma * 1.01) || (c.low <= sEma * 1.015);
    });
    if (!touchedValue) {
      return {
        valid: false,
        brokeStructure: false,
        reversalRisk: false,
        touchedValue: false,
        momentumLost,
        impulseDisplacementValid,
        reason: 'NO_VALID_PULLBACK',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    // Reversal risk check: large full-bodied bearish candle slicing through EMA50
    const isViolentBearishKnife = c0.close < c0.open && c0.close < eSlow && body0 > (1.2 * atr);
    if (isViolentBearishKnife) {
      return {
        valid: false,
        brokeStructure: false,
        reversalRisk: true,
        touchedValue: true,
        momentumLost: false,
        impulseDisplacementValid,
        reason: 'PULLBACK_REVERSAL_RISK',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    return {
      valid: true,
      brokeStructure: false,
      reversalRisk: false,
      touchedValue: true,
      momentumLost,
      impulseDisplacementValid,
      invalidationLevel,
      pullbackAvgVol,
      impulseAvgVol,
      avgPullbackBody,
      avgImpulseBody
    };
  } else {
    // SHORT evaluation
    const priorHighs = swingHighs.filter(h => h.index < len - 4);
    const invalidationLevel = priorHighs.length > 0
      ? Math.max(...priorHighs.map(h => h.price))
      : Math.max(...candles.slice(0, Math.max(1, len - 4)).map(c => c.high));

    const maxPullbackHigh = Math.max(...pullbackSlice.map(c => c.high), candles[len].high);
    if (maxPullbackHigh > invalidationLevel * 1.002) {
      return {
        valid: false,
        brokeStructure: true,
        reversalRisk: false,
        touchedValue: true,
        momentumLost,
        impulseDisplacementValid,
        reason: 'PULLBACK_BROKE_STRUCTURE',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    const pullbackWindow = candles.slice(Math.max(0, len - 4), len + 1);
    const touchedValue = pullbackWindow.some((c, offset) => {
      const idx = Math.max(0, len - 4) + offset;
      const fEma = emaFast[idx] || eFast;
      const sEma = emaSlow[idx] || eSlow;
      return (c.high >= fEma * 0.99) || (c.high >= sEma * 0.985);
    });
    if (!touchedValue) {
      return {
        valid: false,
        brokeStructure: false,
        reversalRisk: false,
        touchedValue: false,
        momentumLost,
        impulseDisplacementValid,
        reason: 'NO_VALID_PULLBACK',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    // Reversal risk check: large full-bodied bullish candle slicing through EMA50
    const isViolentBullishSpike = c0.close > c0.open && c0.close > eSlow && body0 > (1.2 * atr);
    if (isViolentBullishSpike) {
      return {
        valid: false,
        brokeStructure: false,
        reversalRisk: true,
        touchedValue: true,
        momentumLost: false,
        impulseDisplacementValid,
        reason: 'PULLBACK_REVERSAL_RISK',
        invalidationLevel,
        pullbackAvgVol,
        impulseAvgVol,
        avgPullbackBody,
        avgImpulseBody
      };
    }

    return {
      valid: true,
      brokeStructure: false,
      reversalRisk: false,
      touchedValue: true,
      momentumLost,
      impulseDisplacementValid,
      invalidationLevel,
      pullbackAvgVol,
      impulseAvgVol,
      avgPullbackBody,
      avgImpulseBody
    };
  }
}

// ---------------------------------------------------------------------------
// 4. PRICE-ACTION CONFIRMATION ON CLOSED CANDLE
// ---------------------------------------------------------------------------

/**
 * Validates price action confirmation pattern on a CLOSED candle.
 * Required patterns:
 *   1. Engulfing candle from pullback zone
 *   2. Strong rejection wick (>= 38% range, >= 1.1x body) with trend close
 *   3. Break of prior candle high/low after testing EMA
 *   4. Short-term Break of Structure (BOS)
 *   5. Reclaim / breakdown of EMA20
 * Fake-signal filters:
 *   - Opposing wick > 40% of range -> rejected as seller/buyer counter-pressure
 *   - Fake breakout: price breaks above prior high but closes back inside range -> rejected
 */
export function checkPriceActionConfirmation(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  emaFast: number[]
): {
  confirmed: boolean;
  pattern: string;
  triggerPrice: number;
  stopReference: number;
  reason?: TrendPullbackRejection;
} {
  const len = candles.length - 1;
  const c0 = candles[len];     // Current closed confirmation candle
  const c1 = candles[len - 1]; // Previous candle

  const range0 = c0.high - c0.low;
  if (range0 <= 0) {
    return { confirmed: false, pattern: 'ZERO_RANGE', triggerPrice: c0.close, stopReference: c0.low };
  }

  const body0 = Math.abs(c0.close - c0.open);
  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;
  const e20 = emaFast[len] || c0.close;

  // Filter out doji or indecision bar (body < 15% of range unless rejection wick is massive >= 60%)
  if (body0 < range0 * 0.15 && lowerWick0 < range0 * 0.55 && upperWick0 < range0 * 0.55) {
    return { confirmed: false, pattern: 'DOJI_INDECISION', triggerPrice: c0.close, stopReference: c0.low };
  }

  // Recent minor swing point for BOS detection
  const recentSlice = candles.slice(Math.max(0, len - 5), len);
  const minorHigh = Math.max(...recentSlice.map(c => c.high));
  const minorLow = Math.min(...recentSlice.map(c => c.low));

  if (direction === 'LONG') {
    // 6. Fake Breakout / Opposing Wick Filter:
    // If upper wick exceeds 40% of total candle range, buyers failed to hold highs
    if (upperWick0 > range0 * 0.40) {
      return {
        confirmed: false,
        pattern: 'LONG_OPPOSING_WICK',
        triggerPrice: c0.close,
        stopReference: c0.low,
        reason: 'PRICE_ACTION_NOT_CONFIRMED'
      };
    }

    // Fake breakout of previous candle: wicked above c1.high but closed back under it
    if (c0.high > c1.high && c0.close <= c1.high && body0 < range0 * 0.40) {
      return {
        confirmed: false,
        pattern: 'FAILED_BREAKOUT_CLOSE_INSIDE',
        triggerPrice: c0.close,
        stopReference: c0.low,
        reason: 'PRICE_ACTION_NOT_CONFIRMED'
      };
    }

    // Pattern A: Bullish Engulfing
    const isBullishEngulfing = c0.close > c0.open && c0.close > c1.high && c1.close < c1.open && body0 >= range0 * 0.35;

    // Pattern B: Strong Bullish Rejection Wick from Support/Value
    const isRejectionWick = lowerWick0 >= body0 * 1.1 && lowerWick0 >= range0 * 0.38 && c0.close >= c0.open;

    // Pattern C: Break of Previous Candle High After Rejection
    const isBreakPreviousHigh = c0.close > c1.high && (lowerWick0 >= range0 * 0.25 || c1.low <= e20) && c0.close > c0.open;

    // Pattern D: Break of Structure (BOS)
    const isBOS = c0.close > minorHigh && c0.close > c0.open;

    // Pattern E: Reclaim EMA 20
    const isEmaReclaim = c1.close < e20 && c0.close > e20 && c0.close > c0.open;

    if (isBullishEngulfing || isRejectionWick || isBreakPreviousHigh || isBOS || isEmaReclaim) {
      const pattern = isBullishEngulfing
        ? 'Bullish Engulfing'
        : isRejectionWick
        ? 'Bullish Rejection Wick'
        : isBOS
        ? 'Execution TF Break of Structure (BOS)'
        : isEmaReclaim
        ? 'EMA 20 Value Reclaim'
        : 'Break of Prior High';

      return {
        confirmed: true,
        pattern,
        triggerPrice: c0.high,
        stopReference: Math.min(c0.low, c1.low)
      };
    }
  } else {
    // SHORT evaluation
    if (lowerWick0 > range0 * 0.40) {
      return {
        confirmed: false,
        pattern: 'LONG_OPPOSING_WICK',
        triggerPrice: c0.close,
        stopReference: c0.high,
        reason: 'PRICE_ACTION_NOT_CONFIRMED'
      };
    }

    // Fake breakdown: wicked below c1.low but closed back above it
    if (c0.low < c1.low && c0.close >= c1.low && body0 < range0 * 0.40) {
      return {
        confirmed: false,
        pattern: 'FAILED_BREAKDOWN_CLOSE_INSIDE',
        triggerPrice: c0.close,
        stopReference: c0.high,
        reason: 'PRICE_ACTION_NOT_CONFIRMED'
      };
    }

    // Pattern A: Bearish Engulfing
    const isBearishEngulfing = c0.close < c0.open && c0.close < c1.low && c1.close > c1.open && body0 >= range0 * 0.35;

    // Pattern B: Strong Bearish Rejection Wick from Resistance/Value
    const isRejectionWick = upperWick0 >= body0 * 1.1 && upperWick0 >= range0 * 0.38 && c0.close <= c0.open;

    // Pattern C: Break of Previous Candle Low After Rejection
    const isBreakPreviousLow = c0.close < c1.low && (upperWick0 >= range0 * 0.25 || c1.high >= e20) && c0.close < c0.open;

    // Pattern D: Break of Structure (BOS)
    const isBOS = c0.close < minorLow && c0.close < c0.open;

    // Pattern E: Lost EMA 20
    const isEmaLoss = c1.close > e20 && c0.close < e20 && c0.close < c0.open;

    if (isBearishEngulfing || isRejectionWick || isBreakPreviousLow || isBOS || isEmaLoss) {
      const pattern = isBearishEngulfing
        ? 'Bearish Engulfing'
        : isRejectionWick
        ? 'Bearish Rejection Wick'
        : isBOS
        ? 'Execution TF Break of Structure (BOS)'
        : isEmaLoss
        ? 'EMA 20 Value Breakdown'
        : 'Break of Prior Low';

      return {
        confirmed: true,
        pattern,
        triggerPrice: c0.low,
        stopReference: Math.max(c0.high, c1.high)
      };
    }
  }

  return { confirmed: false, pattern: 'NO_CONFIRMING_PATTERN', triggerPrice: c0.close, stopReference: c0.low };
}

// ---------------------------------------------------------------------------
// 5. VOLUME AS VALIDATION
// ---------------------------------------------------------------------------

/**
 * Validates volume participation:
 * - Expansion on confirmation candle (> prev candle & >= SMA20 * minVolumeRatio)
 * - Contraction during pullback wave (tested in checkPullbackStructure)
 * - Identifies real exchange volume vs tick volume
 */
export function checkVolumeConfirmation(
  candles: Candle[],
  options: {
    volSmaPeriod?: number;
    minVolumeRatio?: number;
    requireVolume?: boolean;
    unconfirmedVolumeMode?: boolean;
  } = {}
): {
  confirmed: boolean;
  volumeRatio: number;
  volSma20: number;
  reason?: TrendPullbackRejection;
  isRealVolume: boolean;
  isUnconfirmedVolume?: boolean;
} {
  const requireVol = options.requireVolume !== undefined ? options.requireVolume : true;
  const unconfirmedMode = options.unconfirmedVolumeMode === true;
  const minRatio = options.minVolumeRatio !== undefined ? options.minVolumeRatio : 1.0;
  const period = options.volSmaPeriod || 20;

  const len = candles.length - 1;
  const currentVol = candles[len].volume || 0;
  const prevVol = candles[len - 1]?.volume || 0;

  // Check for missing/invalid volume data across candles
  const totalVolumeInWindow = candles.slice(-period).reduce((s, c) => s + (c.volume || 0), 0);
  if (totalVolumeInWindow <= 0) {
    if (unconfirmedMode) {
      return { confirmed: true, volumeRatio: 1.0, volSma20: 0, isRealVolume: false, isUnconfirmedVolume: true };
    }
    if (requireVol) {
      return { confirmed: false, volumeRatio: 0, volSma20: 0, reason: 'MISSING_VOLUME_DATA', isRealVolume: false };
    }
    return { confirmed: true, volumeRatio: 1.0, volSma20: 0, isRealVolume: false };
  }

  const volSlice = candles.slice(Math.max(0, len - period), len);
  const volSma20 = volSlice.reduce((s, c) => s + (c.volume || 0), 0) / (volSlice.length || 1);
  const volumeRatio = volSma20 > 0 ? (currentVol / volSma20) : 1.0;

  // Confirmation candle must have expanding volume vs previous candle
  const hasExpandingVol = currentVol > prevVol;
  // Confirmation candle volume >= Volume SMA 20 * minVolumeRatio
  const hasAdequateRatio = volumeRatio >= minRatio;

  if (!hasExpandingVol || !hasAdequateRatio) {
    if (unconfirmedMode) {
      return { confirmed: true, volumeRatio, volSma20, isRealVolume: true, isUnconfirmedVolume: true };
    }
    return { confirmed: false, volumeRatio, volSma20, reason: 'VOLUME_NOT_CONFIRMED', isRealVolume: true, isUnconfirmedVolume: false };
  }

  return { confirmed: true, volumeRatio, volSma20, isRealVolume: true, isUnconfirmedVolume: false };
}

// ---------------------------------------------------------------------------
// 6. FAKE-BREAKOUT FILTERS & STOP-LOSS CALCULATION
// ---------------------------------------------------------------------------

/**
 * Validates against fake breakouts:
 * - Abnormally large candle range compared with recent ATR (> 3.0 ATR = climax exhaustion)
 * - Candle wicked above/below level but closed back inside range
 * - Large opposing wick (> 40% of range)
 */
export function checkFakeBreakout(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  atr: number,
  pa: { pattern: string; triggerPrice: number; stopReference: number }
): { isFake: boolean; reason?: string } {
  const len = candles.length - 1;
  const c0 = candles[len];
  const c1 = candles[len - 1];
  const range0 = c0.high - c0.low;

  // 1. Abnormally large candle range compared to recent ATR (> 3.0 * ATR exhaustion)
  if (range0 > 3.0 * atr) {
    return { isFake: true, reason: `Abnormally large candle range (${(range0 / atr).toFixed(1)}x ATR) indicates exhaustion climax` };
  }

  // 2. Failed breakout closing back inside previous range
  if (direction === 'LONG' && c0.high > c1.high && c0.close <= c1.high && Math.abs(c0.close - c0.open) < range0 * 0.4) {
    return { isFake: true, reason: 'Candle wicked above previous high but closed back inside previous range' };
  }
  if (direction === 'SHORT' && c0.low < c1.low && c0.close >= c1.low && Math.abs(c0.close - c0.open) < range0 * 0.4) {
    return { isFake: true, reason: 'Candle wicked below previous low but closed back inside previous range' };
  }

  // 3. Large opposing wick (> 40% of range)
  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;
  if (direction === 'LONG' && range0 > 0 && (upperWick0 / range0) > 0.40) {
    return { isFake: true, reason: `Large opposing upper wick (${((upperWick0 / range0) * 100).toFixed(0)}% of range)` };
  }
  if (direction === 'SHORT' && range0 > 0 && (lowerWick0 / range0) > 0.40) {
    return { isFake: true, reason: `Large opposing lower wick (${((lowerWick0 / range0) * 100).toFixed(0)}% of range)` };
  }

  return { isFake: false };
}

/**
 * Calculates stop-loss placement based on technical invalidation:
 * Classifies stop placement as:
 * - LOCAL_EXECUTION_STOP: based on confirmed pullback structure on execution timeframe
 * - BROAD_STRUCTURAL_STOP: based on distant higher-timeframe structure
 * - INVALID_STOP: technically unclear, inverted, or zero distance
 */
export function calculateStopLoss(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  atr: number,
  atrBuffer: number,
  pullback: { invalidationLevel: number },
  pa: { stopReference: number }
): { stopPrice: number; stopType: StopPlacementType; stopDistance: number } {
  if (direction === 'LONG') {
    const localStop = pa.stopReference - atrBuffer;
    if (localStop < currentPrice && (currentPrice - localStop) > 0) {
      return {
        stopPrice: localStop,
        stopType: 'LOCAL_EXECUTION_STOP',
        stopDistance: currentPrice - localStop
      };
    }

    const broadStop = pullback.invalidationLevel - atrBuffer;
    if (broadStop < currentPrice && (currentPrice - broadStop) > 0) {
      return {
        stopPrice: broadStop,
        stopType: 'BROAD_STRUCTURAL_STOP',
        stopDistance: currentPrice - broadStop
      };
    }

    return { stopPrice: currentPrice, stopType: 'INVALID_STOP', stopDistance: 0 };
  } else {
    // SHORT
    const localStop = pa.stopReference + atrBuffer;
    if (localStop > currentPrice && (localStop - currentPrice) > 0) {
      return {
        stopPrice: localStop,
        stopType: 'LOCAL_EXECUTION_STOP',
        stopDistance: localStop - currentPrice
      };
    }

    const broadStop = pullback.invalidationLevel + atrBuffer;
    if (broadStop > currentPrice && (broadStop - currentPrice) > 0) {
      return {
        stopPrice: broadStop,
        stopType: 'BROAD_STRUCTURAL_STOP',
        stopDistance: broadStop - currentPrice
      };
    }

    return { stopPrice: currentPrice, stopType: 'INVALID_STOP', stopDistance: 0 };
  }
}

/**
 * Calculates position size based on dollar risk:
 * positionSize = allowedRiskAmount / stopDistance
 */
export function calculatePositionSize(
  accountRiskAmount: number,
  entryPrice: number,
  stopPrice: number
): { positionSize: number; stopDistance: number } {
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance <= 0) return { positionSize: 0, stopDistance: 0 };
  const positionSize = accountRiskAmount / stopDistance;
  return { positionSize, stopDistance };
}

// ---------------------------------------------------------------------------
// DEDUPLICATION
// ---------------------------------------------------------------------------

export const signalDeduplicationCache = new Set<string>();

export function isDuplicateSignal(signalId: string, customList?: string[] | Set<string>): boolean {
  if (customList) {
    if (customList instanceof Set) return customList.has(signalId);
    if (Array.isArray(customList)) return customList.includes(signalId);
  }
  return signalDeduplicationCache.has(signalId);
}

export function recordSignalId(signalId: string): void {
  signalDeduplicationCache.add(signalId);
  if (signalDeduplicationCache.size > 1000) {
    const firstItem = signalDeduplicationCache.values().next().value;
    if (firstItem) signalDeduplicationCache.delete(firstItem);
  }
}

export function clearSignalDeduplicationCache(): void {
  signalDeduplicationCache.clear();
}

// ---------------------------------------------------------------------------
// 7 & 8. DETAILED EVALUATOR WITH TWO-STAGE PROCESS & 10-POINT SCORING MATRIX
// ---------------------------------------------------------------------------

/**
 * Evaluates the Trend Pullback setup across the 10 institutional pillars:
 * 1. Market regime first (detectMarketRegime: TRENDING_UP, TRENDING_DOWN, RANGE_OR_TRANSITION)
 * 2. Timeframe hierarchy (execution TF vs HTF)
 * 3. Valid pullback structure (impulse displacement, exhaustion body sizes, structural preservation)
 * 4. Price action confirmation on closed candle (engulfing, rejection wick, BOS, EMA reclaim)
 * 5. Volume validation (expansion on confirmation & contraction during pullback)
 * 6. Fake signal & chop filters (opposing wick <= 40%, choppy market rejection, reversal knife protection)
 * 7. Two-stage state machine (Stage A: Setup detection -> Stage B: Confirmation & execution)
 * 8. 10-point scoring matrix with mandatory condition gates (minScore >= 8)
 * 9. Risk & reward gate (SL beyond swing + ATR buffer, TP1/2/3, min 1.5R to nearest opposing barrier)
 * 10. Expectancy tracking support
 */
export function evaluateTrendPullbackDetailed(
  tradeCandles: Candle[],
  htfCandles: Candle[] | null | undefined,
  currentPrice: number,
  options: TrendPullbackOptions = {}
): TrendPullbackEvaluation {
  const tradeTf = options.tradeTimeframe || '15m';
  const htf = options.htfTimeframe || getHigherTimeframe(tradeTf);
  const symbol = options.symbol || 'UNKNOWN';

  // 1. if (!dataAvailable) reject("INVALID_MARKET_DATA")
  const len = tradeCandles ? tradeCandles.length - 1 : -1;
  if (len < 0 || !tradeCandles || tradeCandles.length < 30) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'INVALID_MARKET_DATA',
      reason: 'Signal rejected: invalid or insufficient market data (minimum 30 candles required).',
      score: 0,
      result: null
    };
  }

  const lastCandle = tradeCandles[len];

  // 2. if (!candleClosed) reject("CANDLE_NOT_CLOSED")
  if (options.isCandleClosed === false || lastCandle.isClosed === false) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'CANDLE_NOT_CLOSED',
      reason: 'Signal rejected: trade candle is not closed yet. Strict closed-candle rule applies.',
      score: 0,
      result: null
    };
  }

  // 3. if (!timeframeAligned) reject("TIMEFRAME_MISMATCH")
  const detectedIntervalMin = detectCandleIntervalMinutes(tradeCandles);
  const expectedIntervalMin = timeframeToMinutes(tradeTf);
  if (detectedIntervalMin && Math.abs(detectedIntervalMin - expectedIntervalMin) >= 5) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'TIMEFRAME_MISMATCH',
      reason: `Signal rejected: candle timeframe (${detectedIntervalMin}m) does not match configured tradeTimeframe (${expectedIntervalMin}m).`,
      score: 0,
      result: null
    };
  }

  const signalTime = lastCandle.time;
  const session = getTradingSession(signalTime);

  // Technical calculations on execution timeframe
  const closes = tradeCandles.map(c => c.close);
  const highs = tradeCandles.map(c => c.high);
  const lows = tradeCandles.map(c => c.low);
  const emaFast = calculateEMA(closes, options.emaFast || 20);
  const emaSlow = calculateEMA(closes, options.emaSlow || 50);
  const atrSeries = calculateATR(highs, lows, closes, options.atrPeriod || 14);
  const atr = atrSeries[len] || (currentPrice * 0.015);

  // 4. if (!marketRegimeFavorable) reject("UNFAVORABLE_MARKET_REGIME")
  const effectiveHtfCandles = htfCandles && htfCandles.length >= 25 ? htfCandles : tradeCandles;
  const regimeDetails = detectMarketRegime(effectiveHtfCandles, {
    emaFast: options.emaFast,
    emaSlow: options.emaSlow,
    adxMin: options.adxMin ?? 18
  });

  if (regimeDetails.regime !== 'TRENDING_UP' && regimeDetails.regime !== 'TRENDING_DOWN') {
    return {
      success: false,
      status: 'WAITING_FOR_REGIME_CONFIRMATION',
      stage: 'NONE',
      rejectionReason: 'UNFAVORABLE_MARKET_REGIME',
      reason: `Signal rejected: market regime is ${regimeDetails.regime} (${regimeDetails.reason}).`,
      score: 0,
      result: null
    };
  }

  const direction: 'LONG' | 'SHORT' = regimeDetails.regime === 'TRENDING_UP' ? 'LONG' : 'SHORT';

  // Dedicated Trend Pullback Regime Filter Gate
  if (options.enforceRegimeFilter) {
    const trendMetrics = extractTrendPullbackRegimeMetrics(tradeCandles, htfCandles);
    const trendAllowed = allowTrendPullback(trendMetrics, direction);
    if (!trendAllowed) {
      return {
        success: false,
        status: 'WAITING_FOR_REGIME_CONFIRMATION',
        stage: 'NONE',
        rejectionReason: 'UNFAVORABLE_MARKET_REGIME',
        reason: 'Signal rejected: dedicated trend pullback regime filter not satisfied.',
        score: 0,
        result: null
      };
    }
  }

  // Direction toggle check
  if (direction === 'LONG' && options.allowLongs === false) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'DIRECTION_DISABLED',
      reason: 'Signal rejected: Long trades are disabled in configuration.',
      score: 1,
      result: null
    };
  }
  if (direction === 'SHORT' && options.allowShorts === false) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'DIRECTION_DISABLED',
      reason: 'Signal rejected: Short trades are disabled in configuration.',
      score: 1,
      result: null
    };
  }

  // Multi-Timeframe Alignment: Execution timeframe must agree with HTF regime
  const tradeTfCurrentPrice = currentPrice;
  const tradeTfEFast = emaFast[len] || tradeTfCurrentPrice;
  const tradeTfESlow = emaSlow[len] || tradeTfCurrentPrice;

  if (direction === 'LONG' && tradeTfCurrentPrice < tradeTfESlow && tradeTfEFast < tradeTfESlow) {
    return {
      success: false,
      status: 'WAITING_FOR_TREND',
      stage: 'NONE',
      rejectionReason: 'HTF_TREND_NOT_CONFIRMED',
      reason: 'Signal rejected: HTF is trending up but execution timeframe is heavily suppressed below EMA50 (MTF conflict).',
      score: 2,
      result: null
    };
  }

  if (direction === 'SHORT' && tradeTfCurrentPrice > tradeTfESlow && tradeTfEFast > tradeTfESlow) {
    return {
      success: false,
      status: 'WAITING_FOR_TREND',
      stage: 'NONE',
      rejectionReason: 'HTF_TREND_NOT_CONFIRMED',
      reason: 'Signal rejected: HTF is trending down but execution timeframe is heavily elevated above EMA50 (MTF conflict).',
      score: 2,
      result: null
    };
  }

  // Session filtering
  if (options.tradingSessions && options.tradingSessions.length > 0 && !options.tradingSessions.includes(session)) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'SESSION_DISABLED',
      reason: `Signal rejected: current session ${session} is not in allowed sessions list (${options.tradingSessions.join(', ')}).`,
      score: 2,
      result: null
    };
  }

  // Structure & Pullback Evaluation
  const pullback = checkPullbackStructure(tradeCandles, direction, currentPrice, {
    emaFast: options.emaFast,
    emaSlow: options.emaSlow,
    atr
  });

  // 5. if (!trendStructureValid) reject("INVALID_TREND_STRUCTURE")
  if (!pullback.impulseDisplacementValid) {
    return {
      success: false,
      status: 'WAITING_FOR_TREND',
      stage: 'NONE',
      rejectionReason: 'INVALID_TREND_STRUCTURE',
      reason: 'Signal rejected: no strong prior impulse displacement (>= 1.0 ATR) detected before pullback.',
      score: 2,
      result: null
    };
  }

  // 6. if (!validPullback) reject("NO_VALID_PULLBACK")
  if (!pullback.valid && !pullback.brokeStructure && !pullback.reversalRisk) {
    return {
      success: false,
      status: 'WAITING_FOR_PULLBACK',
      stage: 'NONE',
      rejectionReason: 'NO_VALID_PULLBACK',
      reason: 'Signal rejected: price has not pulled back to dynamic value zone (EMA 20/50).',
      score: 2,
      result: null
    };
  }

  // 7. if (pullbackInvalidated) reject("PULLBACK_INVALIDATED")
  if (pullback.brokeStructure) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'PULLBACK_INVALIDATED',
      reason: 'Signal rejected: pullback broke key trend structure invalidation level.',
      score: 2,
      result: null
    };
  }

  if (pullback.reversalRisk) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'NONE',
      rejectionReason: 'PULLBACK_INVALIDATED',
      reason: 'Signal rejected: large violent candle sliced through EMA50, posing reversal risk.',
      score: 2,
      result: null
    };
  }

  // 8. if (!priceActionConfirmed) reject("PRICE_ACTION_NOT_CONFIRMED")
  const pa = checkPriceActionConfirmation(tradeCandles, direction, emaFast);
  if (!pa.confirmed) {
    return {
      success: false,
      status: 'WAITING_FOR_PRICE_ACTION',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: pa.reason || 'PRICE_ACTION_NOT_CONFIRMED',
      reason: `Stage A setup detected, but waiting for closed candle price-action confirmation (${pa.pattern}).`,
      score: 4,
      result: null
    };
  }

  // 9. if (!volumeConfirmed) reject("VOLUME_NOT_CONFIRMED")
  const vol = checkVolumeConfirmation(tradeCandles, {
    volSmaPeriod: options.volSmaPeriod,
    minVolumeRatio: options.minVolumeRatio,
    requireVolume: options.requireVolume,
    unconfirmedVolumeMode: options.unconfirmedVolumeMode
  });

  if (!vol.confirmed) {
    if (vol.reason === 'MISSING_VOLUME_DATA') {
      return {
        success: false,
        status: 'TRADE REJECTED',
        stage: 'STAGE_A_SETUP_DETECTED',
        rejectionReason: 'MISSING_VOLUME_DATA',
        reason: 'Signal rejected: volume data is missing or zero.',
        score: 6,
        result: null
      };
    }
    return {
      success: false,
      status: 'WAITING_FOR_VOLUME',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'VOLUME_NOT_CONFIRMED',
      reason: `Stage A setup detected, but volume did not confirm (ratio: ${vol.volumeRatio.toFixed(2)}x, 20-SMA: ${vol.volSma20.toFixed(0)}).`,
      score: 6,
      result: null
    };
  }

  // 10. if (fakeBreakoutDetected) reject("FAKE_BREAKOUT")
  const fb = checkFakeBreakout(tradeCandles, direction, currentPrice, atr, pa);
  if (fb.isFake) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'FAKE_BREAKOUT',
      reason: `Signal rejected: fake breakout detected (${fb.reason}).`,
      score: 6,
      result: null
    };
  }

  // 11. if (entryTooLate) reject("ENTRY_TOO_LATE")
  const entryDistance = Math.abs(currentPrice - pa.triggerPrice);
  const entryDistanceATR = entryDistance / (atr || 1);
  const maxEntryDistAtr = options.maxEntryDistanceAtr !== undefined ? options.maxEntryDistanceAtr : 0.25;

  if (entryDistanceATR > maxEntryDistAtr) {
    return {
      success: false,
      status: 'ENTRY_TOO_LATE',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'ENTRY_TOO_LATE',
      reason: `Signal rejected: late entry distance (${entryDistanceATR.toFixed(2)} ATR) exceeds ${maxEntryDistAtr} ATR limit.`,
      score: 7,
      result: null
    };
  }

  // Stop Loss Placement & Classification
  const atrBuffer = (options.atrBufferMult !== undefined ? options.atrBufferMult : 0.3) * atr;
  const { stopPrice, stopType, stopDistance } = calculateStopLoss(
    tradeCandles,
    direction,
    currentPrice,
    atr,
    atrBuffer,
    pullback,
    pa
  );

  // 12. if (!stopPlacementValid) reject("INVALID_STOP_PLACEMENT")
  if (stopType === 'INVALID_STOP' || stopDistance <= 0 || (direction === 'LONG' && stopPrice >= currentPrice) || (direction === 'SHORT' && stopPrice <= currentPrice)) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'INVALID_STOP_PLACEMENT',
      reason: 'Signal rejected: stop placement is technically invalid or inverted.',
      score: 7,
      result: null
    };
  }

  if (stopType === 'BROAD_STRUCTURAL_STOP' && !options.allowBroadStop) {
    return {
      success: false,
      status: 'STOP_TOO_WIDE',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME',
      reason: 'Signal rejected: setup relies on broad structural stop from higher timeframe without local confirmation structure.',
      score: 7,
      result: null
    };
  }

  // 13. if (stopTooWide) reject("STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME")
  const stopATRMultiple = stopDistance / (atr || 1);
  const minStopAtr = options.minStopDistanceAtr !== undefined ? options.minStopDistanceAtr : 0.8;
  const maxStopAtr = options.maxStopDistanceAtr !== undefined ? options.maxStopDistanceAtr : 3.0;

  if (stopATRMultiple > maxStopAtr || (options.atrBufferMult && options.atrBufferMult >= 10.0)) {
    return {
      success: false,
      status: 'STOP_TOO_WIDE',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME',
      reason: `Signal rejected: stop distance (${stopATRMultiple.toFixed(2)} ATR) exceeds maximum ${maxStopAtr} ATR limit for ${tradeTf} timeframe.`,
      score: 7,
      result: null
    };
  }

  // 14. if (stopTooTight) reject("STOP_TOO_TIGHT_FOR_MARKET_NOISE")
  if (stopATRMultiple < minStopAtr || stopDistance < Math.max(currentPrice * 0.003, 0.3 * atr)) {
    return {
      success: false,
      status: 'STOP_TOO_TIGHT',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'STOP_TOO_TIGHT_FOR_MARKET_NOISE',
      reason: `Signal rejected: stop distance (${stopATRMultiple.toFixed(2)} ATR) is below minimum ${minStopAtr} ATR limit and prone to market noise.`,
      score: 7,
      result: null
    };
  }

  // 15. if (!riskRewardValid) reject("RISK_REWARD_TOO_LOW")
  const minRr = options.minRrRatio !== undefined ? options.minRrRatio : 1.5;
  if (minRr < 1.0) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'RISK_REWARD_TOO_LOW',
      reason: `Signal rejected: configured minimum risk-reward ratio (${minRr}) is below acceptable 1.0 threshold.`,
      score: 7,
      result: null
    };
  }

  const tp1 = direction === 'LONG' ? currentPrice + (stopDistance * minRr) : currentPrice - (stopDistance * minRr);
  const tp2 = direction === 'LONG' ? currentPrice + (stopDistance * 2.5) : currentPrice - (stopDistance * 2.5);
  const tp3 = direction === 'LONG' ? currentPrice + (stopDistance * 4.0) : currentPrice - (stopDistance * 4.0);

  // Target already reached check
  if ((direction === 'LONG' && currentPrice >= tp1) || (direction === 'SHORT' && currentPrice <= tp1)) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'TARGET_ALREADY_REACHED',
      reason: 'Signal rejected: take profit target 1 already reached.',
      score: 7,
      result: null
    };
  }

  // Opposing Barrier Proximity Check
  const { highs: swingHighs, lows: swingLows } = detectSwingPoints(tradeCandles, 2);
  let noOpposingLevelScore = 1;

  if (direction === 'LONG' && swingHighs.length > 0) {
    const recentResistance = Math.max(...swingHighs.slice(-3).map(h => h.price));
    if (recentResistance > currentPrice) {
      const rrToResistance = (recentResistance - currentPrice) / (stopDistance || 1);
      if (rrToResistance < minRr) {
        return {
          success: false,
          status: 'TRADE REJECTED',
          stage: 'STAGE_A_SETUP_DETECTED',
          rejectionReason: 'OPPOSING_BARRIER_BLOCKS_RR',
          reason: `Signal rejected: distance to nearest major resistance provides less than ${minRr}R (${rrToResistance.toFixed(2)}R available).`,
          score: 7,
          result: null
        };
      }
    }
  } else if (direction === 'SHORT' && swingLows.length > 0) {
    const recentSupport = Math.min(...swingLows.slice(-3).map(l => l.price));
    if (recentSupport < currentPrice) {
      const rrToSupport = (currentPrice - recentSupport) / (stopDistance || 1);
      if (rrToSupport < minRr) {
        return {
          success: false,
          status: 'TRADE REJECTED',
          stage: 'STAGE_A_SETUP_DETECTED',
          rejectionReason: 'OPPOSING_BARRIER_BLOCKS_RR',
          reason: `Signal rejected: distance to nearest major support provides less than ${minRr}R (${rrToSupport.toFixed(2)}R available).`,
          score: 7,
          result: null
        };
      }
    }
  }

  // 16. if (!spreadValid) reject("SPREAD_OR_SLIPPAGE_TOO_HIGH")
  if (options.currentSpread !== undefined) {
    const maxSpreadPrice = (options.maxSpreadAtr !== undefined ? options.maxSpreadAtr : 0.3) * atr;
    if (options.currentSpread > maxSpreadPrice) {
      return {
        success: false,
        status: 'TRADE REJECTED',
        stage: 'STAGE_A_SETUP_DETECTED',
        rejectionReason: 'SPREAD_OR_SLIPPAGE_TOO_HIGH',
        reason: `Signal rejected: spread (${options.currentSpread.toFixed(4)}) exceeds maximum allowed ${maxSpreadPrice.toFixed(4)} (${(options.maxSpreadAtr ?? 0.3)} ATR).`,
        score: 7,
        result: null
      };
    }
  }

  // 17. if (duplicateSignal) reject("DUPLICATE_SIGNAL")
  const signalId = `TPB-${symbol}-${tradeTf}-${signalTime}-${direction}-v2`;
  if (isDuplicateSignal(signalId, options.recentSignalIds)) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'DUPLICATE_SIGNAL',
      reason: `Signal rejected: duplicate signal ${signalId} already processed for this candle.`,
      score: 7,
      result: null
    };
  }

  // 18. if (!riskLimitsValid) reject("RISK_LIMIT_REACHED")
  if (options.isRiskLimitReached === true) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'RISK_LIMIT_REACHED',
      reason: 'Signal rejected: account risk limit (daily loss, max positions, or cooldown) reached.',
      score: 7,
      result: null
    };
  }

  // Section 13: Confirmation Score (0 to 10 points)
  const breakdown: TrendPullbackScoreBreakdown = {
    htfTrend: regimeDetails.isTrending ? 2 : 0,
    marketStructure: (pullback.impulseDisplacementValid && !pullback.brokeStructure) ? 2 : 1,
    pullbackZone: pullback.touchedValue ? 1 : 0,
    priceAction: pa.confirmed ? 2 : 0,
    volume: (vol.confirmed && pullback.pullbackAvgVol <= pullback.impulseAvgVol) ? 2 : 1,
    volatilityRegime: (regimeDetails.regime === 'TRENDING_UP' || regimeDetails.regime === 'TRENDING_DOWN') ? 1 : 0,
    noOpposingLevel: noOpposingLevelScore,
    total: 0
  };
  breakdown.total = breakdown.htfTrend + breakdown.marketStructure + breakdown.pullbackZone + breakdown.priceAction + breakdown.volume + (breakdown.volatilityRegime || 0) + breakdown.noOpposingLevel;
  breakdown.total = Math.min(10, breakdown.total);

  const score = breakdown.total;
  const requiredScore = options.minScore || 8;

  if (score < requiredScore) {
    return {
      success: false,
      status: 'TRADE REJECTED',
      stage: 'STAGE_A_SETUP_DETECTED',
      rejectionReason: 'CONFIRMATION_SCORE_TOO_LOW',
      reason: `Signal rejected: confirmation score ${score}/10 is below required ${requiredScore}/10.`,
      score,
      result: null
    };
  }

  const scaledScore = Math.min(99, Math.round(score * 9.8));
  const confidence: 'HIGH' | 'MEDIUM' | 'LOWER' = vol.isUnconfirmedVolume
    ? 'LOWER'
    : score >= 9 ? 'HIGH' : 'MEDIUM';

  // STAGE B: TRADE CONFIRMED & EXECUTED
  const result: TrendPullbackResult = {
    direction,
    score: scaledScore,
    rawScore: score,
    stage: 'STAGE_B_TRADE_CONFIRMED',
    atr,
    entryPrice: currentPrice,
    sl: stopPrice,
    tp1,
    tp2,
    tp3,
    tradeTimeframe: tradeTf,
    htfTimeframe: htf,
    signalTime,
    signalId,
    reason: `Trend Pullback [${tradeTf}/${htf}]: ${pa.pattern} + Vol (${vol.volumeRatio.toFixed(1)}x) [Score: ${score}/10] [Stop: ${stopType} @ ${(stopATRMultiple).toFixed(2)} ATR]`,
    status: 'SIGNAL CONFIRMED',
    marketRegime: regimeDetails.regime,
    stopType,
    stopDistance,
    stopATRMultiple,
    entryDistanceATR,
    volumeConfirmed: vol.confirmed,
    isUnconfirmedVolume: vol.isUnconfirmedVolume,
    confidence,
    session,
    details: {
      htfTrendStatus: regimeDetails.regime === 'TRENDING_UP' ? 'BULLISH' : 'BEARISH',
      regimeDetails,
      pullbackStatus: 'VALID_PULLBACK',
      priceActionPattern: pa.pattern,
      volumeRatio: vol.volumeRatio,
      volumeSma: vol.volSma20,
      confirmationScore: score,
      breakdown
    }
  };

  return {
    success: true,
    status: 'SIGNAL CONFIRMED',
    stage: 'STAGE_B_TRADE_CONFIRMED',
    reason: result.reason,
    score,
    result
  };
}

/**
 * Main strategy evaluator: evaluateTrendPullback
 * Returns TrendPullbackResult if confirmed, or null if rejected.
 */
export function evaluateTrendPullback(
  tradeCandles: Candle[],
  htfCandles: Candle[] | null | undefined,
  currentPrice: number,
  options: TrendPullbackOptions = {}
): TrendPullbackResult | null {
  const evalResult = evaluateTrendPullbackDetailed(tradeCandles, htfCandles, currentPrice, options);
  if (evalResult.success && evalResult.result) {
    recordSignalId(evalResult.result.signalId);
    return evalResult.result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 10. EXPECTANCY TRACKING & ANALYTICS ENGINE
// ---------------------------------------------------------------------------

export interface StrategyTradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  tradeTimeframe: string;
  htfTimeframe: string;
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp1: number;
  pnl: number;
  pnlR: number;              // PnL expressed in R-multiples
  isWin: boolean;
  marketRegime: MarketRegimeType;
  session: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS';
  entryTime: number;
  exitTime: number;
}

export interface ExpectancySubgroup {
  count: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
}

export interface ExpectancyMetrics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;            // 0 - 1
  lossRate: number;           // 0 - 1
  avgWinR: number;            // average win in R
  avgLossR: number;           // average loss in R
  profitFactor: number;
  expectancyR: number;        // (WinRate * AvgWinR) - (LossRate * AvgLossR)
  expectedValuePerDollar: number;
  byRegime: Record<MarketRegimeType, ExpectancySubgroup>;
  bySymbol: Record<string, ExpectancySubgroup>;
  byTimeframePair: Record<string, ExpectancySubgroup>;
  bySession: Record<string, ExpectancySubgroup>;
}

/**
 * Returns the trading session for a UTC timestamp:
 * - ASIA: 00:00 - 08:00 UTC
 * - LONDON: 08:00 - 14:00 UTC
 * - NEW_YORK: 14:00 - 21:00 UTC
 * - OFF_HOURS: 21:00 - 24:00 UTC
 */
export function getTradingSession(timestampMs: number): 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS' {
  const d = new Date(timestampMs);
  const hour = d.getUTCHours();
  if (hour >= 0 && hour < 8) return 'ASIA';
  if (hour >= 8 && hour < 14) return 'LONDON';
  if (hour >= 14 && hour < 21) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function calculateSubgroup(trades: StrategyTradeRecord[]): ExpectancySubgroup {
  if (trades.length === 0) {
    return { count: 0, winCount: 0, lossCount: 0, winRate: 0, avgWinR: 0, avgLossR: 0, expectancyR: 0 };
  }
  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / trades.length;
  const lossRate = lossCount / trades.length;
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0;
  const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlR, 0) / losses.length) : 0;
  const expectancyR = (winRate * avgWinR) - (lossRate * avgLossR);

  return {
    count: trades.length,
    winCount,
    lossCount,
    winRate,
    avgWinR,
    avgLossR,
    expectancyR
  };
}

/**
 * Computes mathematical expectancy and multidimensional performance metrics:
 * Formula: E = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
 */
export function calculateStrategyExpectancy(trades: StrategyTradeRecord[]): ExpectancyMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      lossRate: 0,
      avgWinR: 0,
      avgLossR: 0,
      profitFactor: 0,
      expectancyR: 0,
      expectedValuePerDollar: 0,
      byRegime: {
        TRENDING_UP: calculateSubgroup([]),
        TRENDING_DOWN: calculateSubgroup([]),
        RANGING: calculateSubgroup([]),
        TRANSITION: calculateSubgroup([]),
        HIGH_VOLATILITY: calculateSubgroup([]),
        LOW_LIQUIDITY: calculateSubgroup([]),
        UNKNOWN: calculateSubgroup([]),
        RANGE_OR_TRANSITION: calculateSubgroup([])
      },
      bySymbol: {},
      byTimeframePair: {},
      bySession: {}
    };
  }

  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / totalTrades;
  const lossRate = lossCount / totalTrades;

  const totalWinR = wins.reduce((s, t) => s + t.pnlR, 0);
  const totalLossR = Math.abs(losses.reduce((s, t) => s + t.pnlR, 0));
  const avgWinR = wins.length > 0 ? totalWinR / wins.length : 0;
  const avgLossR = losses.length > 0 ? totalLossR / losses.length : 0;
  const expectancyR = (winRate * avgWinR) - (lossRate * avgLossR);
  const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? 99 : 0;
  const expectedValuePerDollar = avgLossR > 0 ? (expectancyR / avgLossR) : expectancyR;

  // Breakdown by regime
  const byRegime: Record<MarketRegimeType, ExpectancySubgroup> = {
    TRENDING_UP: calculateSubgroup(trades.filter(t => t.marketRegime === 'TRENDING_UP')),
    TRENDING_DOWN: calculateSubgroup(trades.filter(t => t.marketRegime === 'TRENDING_DOWN')),
    RANGING: calculateSubgroup(trades.filter(t => t.marketRegime === 'RANGING')),
    TRANSITION: calculateSubgroup(trades.filter(t => t.marketRegime === 'TRANSITION')),
    HIGH_VOLATILITY: calculateSubgroup(trades.filter(t => t.marketRegime === 'HIGH_VOLATILITY')),
    LOW_LIQUIDITY: calculateSubgroup(trades.filter(t => t.marketRegime === 'LOW_LIQUIDITY')),
    UNKNOWN: calculateSubgroup(trades.filter(t => t.marketRegime === 'UNKNOWN')),
    RANGE_OR_TRANSITION: calculateSubgroup(trades.filter(t => t.marketRegime === 'RANGE_OR_TRANSITION'))
  };

  // Breakdown by symbol
  const bySymbol: Record<string, ExpectancySubgroup> = {};
  const symbols = Array.from(new Set(trades.map(t => t.symbol)));
  for (const sym of symbols) {
    bySymbol[sym] = calculateSubgroup(trades.filter(t => t.symbol === sym));
  }

  // Breakdown by timeframe pair
  const byTimeframePair: Record<string, ExpectancySubgroup> = {};
  const pairs = Array.from(new Set(trades.map(t => `${t.tradeTimeframe}/${t.htfTimeframe}`)));
  for (const p of pairs) {
    byTimeframePair[p] = calculateSubgroup(trades.filter(t => `${t.tradeTimeframe}/${t.htfTimeframe}` === p));
  }

  // Breakdown by session
  const bySession: Record<string, ExpectancySubgroup> = {
    ASIA: calculateSubgroup(trades.filter(t => t.session === 'ASIA')),
    LONDON: calculateSubgroup(trades.filter(t => t.session === 'LONDON')),
    NEW_YORK: calculateSubgroup(trades.filter(t => t.session === 'NEW_YORK')),
    OFF_HOURS: calculateSubgroup(trades.filter(t => t.session === 'OFF_HOURS'))
  };

  return {
    totalTrades,
    winCount,
    lossCount,
    winRate,
    lossRate,
    avgWinR,
    avgLossR,
    profitFactor,
    expectancyR,
    expectedValuePerDollar,
    byRegime,
    bySymbol,
    byTimeframePair,
    bySession
  };
}
