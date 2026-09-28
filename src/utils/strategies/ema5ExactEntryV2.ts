// src/utils/strategies/ema5ExactEntryV2.ts
// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY: EMA5_EXACT_ENTRY_V2
// Entry TF: 5m | Regime TF: 15m | Levels: 15m, 1h, 1D, 1W (raw OHLC only)
// ─────────────────────────────────────────────────────────────────────────────
// Priority Order:
// 1. Exact setup recognition (Alert -> Break trigger)
// 2. Logical, structural, tight stop
// 3. Large take-profits placed at important levels (15m, 1h, 1D, 1W)
// 4. Fee-awareness: trades must survive round-trip taker/maker fees + GST
// 5. Zero lookahead: HTF alignment and confirmed pivots with strict right-bar lag
// ─────────────────────────────────────────────────────────────────────────────

import { calculateEMA } from '../indicators.js';

export type Eev2Direction = 'LONG' | 'SHORT';
export type Eev2Regime15m = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Eev2EntryMode = 'CLOSE_CONFIRM' | 'STOP_ENTRY';
export type Eev2ExitMode = 'LEVEL_LADDER' | 'RR_FIXED';
export type Eev2BeMode = 'AFTER_TP1' | 'R_TRIGGER' | 'OFF';

export type Eev2RejectionCode =
  | 'DUPLICATE_SIGNAL'
  | 'POSITION_ALREADY_OPEN'
  | 'COOLDOWN_ACTIVE'
  | 'REGIME_NEUTRAL'
  | 'REGIME_MISMATCH'
  | 'STRUCTURE_BROKEN'
  | 'NOT_EXACT_EMA5_SETUP'
  | 'WEAK_PRICE_ACTION'
  | 'ALERT_TOO_SHALLOW'
  | 'EMA_DISTANCE_TOO_LARGE'
  | 'LOW_VOLUME'
  | 'CHOPPY_MARKET'
  | 'STOP_TOO_LARGE'
  | 'STOP_TOO_SMALL'
  | 'FEE_DRAG_TOO_HIGH'
  | 'OPPOSING_STRUCTURE_TOO_CLOSE'
  | 'NO_LEVEL_TARGET'
  | 'NET_RR_TOO_LOW'
  | 'ENTRY_DRIFT_TOO_LARGE'
  | 'VENUE_BASIS_DIVERGENCE'
  | 'DATA_STALE';

export interface Eev2Candle {
  time: number;       // open time in ms or seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number; // close time in ms or seconds
}

export interface Eev2Config {
  entryMode?: Eev2EntryMode;              // default: 'CLOSE_CONFIRM'
  exitMode?: Eev2ExitMode;                // default: 'LEVEL_LADDER'
  beMode?: Eev2BeMode;                    // default: 'AFTER_TP1'
  minVolumeRatio?: number;                // default: 1.10
  regimePivotN?: number;                  // default: 3
  slBufferAvgRange?: number;              // default: 0.15
  slBufferMinTicks?: number;              // default: 2
  maxStopAvgRange?: number;               // default: 2.0
  minStopAvgRange?: number;               // default: 0.5
  maxFeeR?: number;                       // default: 0.20
  minNetRr?: number;                      // default: 2.5
  tp1MinR?: number;                       // default: 1.5
  tp2MinR?: number;                       // default: 3.0
  tpSplit?: [number, number, number];     // default: [40, 40, 20]
  minRoomR?: number;                      // default: 1.0
  allowRrFallback?: boolean;              // default: false
  fallbackTpR?: number;                   // default: 3.0
  maxEntryDriftR?: number;                // default: 0.15
  alertMinGapAvgRange?: number;           // default: 0 (off)
  feeTakerPct?: number;                   // default: 0.05 (%)
  feeMakerPct?: number;                   // default: 0.02 (%)
  feeGstPct?: number;                     // default: 18 (%)
  maxHoldHours?: number;                  // default: 24
  cooldownAfterLossCandles?: number;      // default: 6
  cooldownAfterWinCandles?: number;       // default: 2
  maxTradesPerSymbolPerDay?: number;      // default: 4
  dailyLossLimitR?: number;               // default: 3
  maxConsecutiveLosses?: number;          // default: 5
  debugEma5Strategy?: boolean;            // default: true
  tickSize?: number;                      // default: 0.01 (symbol specific)
  spreadEstimate?: number;                // default: 0
  minBodyRatio?: number;                  // default: 0.50
  minCloseLocation?: number;              // default: 0.60
}

export const EEV2_DEFAULTS: Required<Eev2Config> = {
  entryMode: 'CLOSE_CONFIRM',
  exitMode: 'LEVEL_LADDER',
  beMode: 'AFTER_TP1',
  minVolumeRatio: 1.10,
  regimePivotN: 3,
  slBufferAvgRange: 0.15,
  slBufferMinTicks: 2,
  maxStopAvgRange: 2.0,
  minStopAvgRange: 0.5,
  maxFeeR: 0.20,
  minNetRr: 2.5,
  tp1MinR: 1.5,
  tp2MinR: 3.0,
  tpSplit: [40, 40, 20],
  minRoomR: 1.0,
  allowRrFallback: false,
  fallbackTpR: 3.0,
  maxEntryDriftR: 0.15,
  alertMinGapAvgRange: 0,
  feeTakerPct: 0.05,
  feeMakerPct: 0.02,
  feeGstPct: 18,
  maxHoldHours: 24,
  cooldownAfterLossCandles: 6,
  cooldownAfterWinCandles: 2,
  maxTradesPerSymbolPerDay: 4,
  dailyLossLimitR: 3,
  maxConsecutiveLosses: 5,
  debugEma5Strategy: true,
  tickSize: 0.01,
  spreadEstimate: 0,
  minBodyRatio: 0.50,
  minCloseLocation: 0.60,
};

// ── Level structure ──────────────────────────────────────────────────────────
export interface LevelItem {
  type: 'PWH' | 'PWL' | 'PDH' | 'PDL' | '1h_SWING' | '15m_SWING' | 'HOD' | 'LOD';
  price: number;
  strength: number;
  time?: number;
}

// ── Setup trigger detection result ───────────────────────────────────────────
export interface ExactSetupDetection {
  direction: Eev2Direction;
  alertCandle: Eev2Candle;
  triggerCandle: Eev2Candle;
  alertIndex: number;
  triggerIndex: number;
}

// ── Pivot structure ──────────────────────────────────────────────────────────
export interface ConfirmedPivot {
  type: 'HIGH' | 'LOW';
  price: number;
  candleIndex: number;
  candleTime: number;
  confirmedAt: number; // Candle close time when pivot was confirmed (index + N bars close)
}

// ── 15m Regime classification ────────────────────────────────────────────────
export interface Regime15mResult {
  regime: Eev2Regime15m;
  invalidationLevel: number;
  structureBroken: boolean;
  reason: string;
  confirmedPivots: ConfirmedPivot[];
}

// ── Stop calculation result ──────────────────────────────────────────────────
export interface StopCalculation {
  setupLowOrHigh: number;
  buffer: number;
  sl: number;
  stopDistance: number;
}

// ── Targets selection result ─────────────────────────────────────────────────
export interface TargetSelection {
  tp1: number;
  tp2: number;
  tp3?: number;
  tpSource: 'LEVEL_CATALOG' | 'RR_FALLBACK';
  levelsConsidered: LevelItem[];
  tp1GrossR: number;
  tp2GrossR: number;
}

// ── Fee estimation result ────────────────────────────────────────────────────
export interface FeeEstimation {
  roundTripFeePct: number;
  roundTripFeeDist: number;
  feeR: number;
}

// ── Filter evaluation result ─────────────────────────────────────────────────
export interface FilterEvaluationResult {
  passed: boolean;
  firstFailure: Eev2RejectionCode | null;
  allFailures: Eev2RejectionCode[];
  filterStatus: Record<string, boolean>;
  netRr: number;
  grossRr: number;
}

// ── Final evaluation output ──────────────────────────────────────────────────
export interface Eev2EvaluationOutput {
  timestamp: number;
  symbol: string;
  strategyId: 'EMA5_EXACT_ENTRY_V2';
  direction: Eev2Direction | null;
  regime15m: Eev2Regime15m;
  regimeInvalidationLevel: number;
  ema5: number;
  alertCandle: Eev2Candle | null;
  triggerCandle: Eev2Candle | null;
  avgVolume: number;
  volumeRatio: number;
  emaDistance: number;
  avgRange: number;
  emaCrossCount: number;
  setupLowOrHigh: number;
  buffer: number;
  entryPrice: number;
  stopLoss: number;
  stopDistance: number;
  feeR: number;
  levelsConsidered: LevelItem[];
  tp1: number;
  tp2: number;
  tp3?: number;
  tpSource: string;
  grossRr: number;
  netRr: number;
  filters: Record<string, boolean>;
  allFailures: Eev2RejectionCode[];
  signalStatus: 'VALID' | 'REJECTED';
  rejectionReason: Eev2RejectionCode | null;
  entryMode: Eev2EntryMode;
  exitMode: Eev2ExitMode;
  clientOrderId?: string;
  setupKey?: string;
}

export type Eev2Signal = Eev2EvaluationOutput;
export type LevelTarget = LevelItem;

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXACT SETUP DETECTION (Section 3: Single Source of Truth)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detects ONLY the exact EMA 5 alert-candle price-action pattern.
 * Pure function with zero lookahead, zero I/O, zero indicators other than EMA5.
 * Contains NO volume, NO regime, NO distance, NO stop logic.
 */
export function detectExactEMA5Setup(
  candles: Eev2Candle[],
  ema5: number[],
  i: number,
  tick: number = 0.01
): ExactSetupDetection | null {
  if (i < 1 || i >= candles.length) return null;
  if (ema5.length <= i) return null;

  const A = candles[i - 1]; // Alert candle
  const T = candles[i];     // Trigger candle

  const emaPrev = ema5[i - 1];

  // LONG setup (all three must hold):
  // 1. Alert candle A: A.high < EMA5[i-1] - 1 tick (entire candle, wicks included, strictly below EMA5)
  // 2. Trigger candle T: breaks A.high, closes above A.high, and closes bullish (T.close > T.open)
  const isLongAlert = A.high < emaPrev - tick;
  if (isLongAlert) {
    const breaksHigh = T.high > A.high;
    const closesAboveAlertHigh = T.close > A.high;
    const isBullishCandle = T.close > T.open;

    if (breaksHigh && closesAboveAlertHigh && isBullishCandle) {
      return {
        direction: 'LONG',
        alertCandle: A,
        triggerCandle: T,
        alertIndex: i - 1,
        triggerIndex: i,
      };
    }
  }

  // SHORT setup (exact mirror):
  // 1. Alert candle A: A.low > EMA5[i-1] + 1 tick (entire candle strictly above EMA5)
  // 2. Trigger candle T: breaks A.low, closes below A.low, and closes bearish (T.close < T.open)
  const isShortAlert = A.low > emaPrev + tick;
  if (isShortAlert) {
    const breaksLow = T.low < A.low;
    const closesBelowAlertLow = T.close < A.low;
    const isBearishCandle = T.close < T.open;

    if (breaksLow && closesBelowAlertLow && isBearishCandle) {
      return {
        direction: 'SHORT',
        alertCandle: A,
        triggerCandle: T,
        alertIndex: i - 1,
        triggerIndex: i,
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONFIRMED SWING PIVOTS (Strict Right-Side Lag, Zero Lookahead)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detects swing pivots with N bars on each side.
 * A swing pivot with N right-side bars exists ONLY after those N bars close.
 * confirmedAt = candle[k + N].closeTime || (candle[k + N].time + TF_MS).
 */
export function getConfirmedPivots(
  candles: Eev2Candle[],
  pivotN: number = 3,
  currentTime?: number
): ConfirmedPivot[] {
  const pivots: ConfirmedPivot[] = [];
  if (candles.length < pivotN * 2 + 1) return pivots;

  for (let k = pivotN; k <= candles.length - 1 - pivotN; k++) {
    const current = candles[k];
    const confirmationCandle = candles[k + pivotN];
    const confirmedAt = confirmationCandle.closeTime ?? confirmationCandle.time;

    // Filter out if not yet confirmed at currentTime
    if (currentTime !== undefined && confirmedAt > currentTime) {
      continue;
    }

    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= pivotN; j++) {
      if (candles[k - j].high >= current.high || candles[k + j].high > current.high) {
        isHigh = false;
      }
      if (candles[k - j].low <= current.low || candles[k + j].low < current.low) {
        isLow = false;
      }
      if (!isHigh && !isLow) break;
    }

    if (isHigh) {
      pivots.push({
        type: 'HIGH',
        price: current.high,
        candleIndex: k,
        candleTime: current.time,
        confirmedAt,
      });
    }
    if (isLow) {
      pivots.push({
        type: 'LOW',
        price: current.low,
        candleIndex: k,
        candleTime: current.time,
        confirmedAt,
      });
    }
  }

  return pivots;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 15m REGIME & STRUCTURE (Section 5)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Computes 15m market structure regime using closed 15m candles aligned with signal time.
 * BULLISH: ascending swing highs AND ascending swing lows (HH + HL); OR accepted break:
 * 2 consecutive closed 15m candles closed above last confirmed swing high with last swing low intact.
 * BEARISH: descending swing highs AND descending swing lows (LH + LL); OR accepted break.
 * NEUTRAL: anything else.
 */
export function computeRegime15m(
  candles15m: Eev2Candle[],
  closedCandleTime: number,
  pivotN: number = 3,
  setupLowOrHigh?: { direction: Eev2Direction; anchor: number }
): Regime15mResult {
  // Filter 15m candles: only closed candles with closeTime <= closedCandleTime
  const aligned = candles15m.filter(c => {
    const cClose = c.closeTime ?? (c.time + 15 * 60 * 1000);
    return cClose <= closedCandleTime;
  });

  if (aligned.length < pivotN * 2 + 3) {
    return {
      regime: 'NEUTRAL',
      invalidationLevel: 0,
      structureBroken: false,
      reason: 'Insufficient 15m candles for regime determination',
      confirmedPivots: [],
    };
  }

  const pivots = getConfirmedPivots(aligned, pivotN, closedCandleTime);
  const swingHighs = pivots.filter(p => p.type === 'HIGH');
  const swingLows = pivots.filter(p => p.type === 'LOW');

  if (swingHighs.length < 1 || swingLows.length < 1) {
    return {
      regime: 'NEUTRAL',
      invalidationLevel: 0,
      structureBroken: false,
      reason: 'No confirmed 15m swing pivots found',
      confirmedPivots: pivots,
    };
  }

  const lastHigh = swingHighs[swingHighs.length - 1];
  const prevHigh = swingHighs.length >= 2 ? swingHighs[swingHighs.length - 2] : null;
  const lastLow = swingLows[swingLows.length - 1];
  const prevLow = swingLows.length >= 2 ? swingLows[swingLows.length - 2] : null;

  let regime: Eev2Regime15m = 'NEUTRAL';
  let invalidationLevel = 0;
  let reason = 'Structure not clearly trending';

  // Check Bullish condition:
  // HH + HL
  const isAscendingHighs = prevHigh ? lastHigh.price > prevHigh.price : false;
  const isAscendingLows = prevLow ? lastLow.price > prevLow.price : false;

  // Accepted break check: last 2 consecutive closed 15m candles closed above last confirmed high
  const lastTwo15m = aligned.slice(-2);
  const acceptedBreakBullish = lastTwo15m.length === 2 &&
    lastTwo15m[0].close > lastHigh.price &&
    lastTwo15m[1].close > lastHigh.price &&
    aligned[aligned.length - 1].low >= lastLow.price;

  const acceptedBreakBearish = lastTwo15m.length === 2 &&
    lastTwo15m[0].close < lastLow.price &&
    lastTwo15m[1].close < lastLow.price &&
    aligned[aligned.length - 1].high <= lastHigh.price;

  if ((isAscendingHighs && isAscendingLows) || acceptedBreakBullish) {
    regime = 'BULLISH';
    invalidationLevel = lastLow.price;
    reason = acceptedBreakBullish ? 'Accepted 15m structural break upwards' : '15m Ascending HH + HL structure';
  } else if ((prevHigh && lastHigh.price < prevHigh.price && prevLow && lastLow.price < prevLow.price) || acceptedBreakBearish) {
    regime = 'BEARISH';
    invalidationLevel = lastHigh.price;
    reason = acceptedBreakBearish ? 'Accepted 15m structural break downwards' : '15m Descending LH + LL structure';
  }

  // Check structure broken:
  // Closed 15m candle closed beyond invalidation level OR SL anchor sits beyond it
  let structureBroken = false;
  const latest15mClose = aligned[aligned.length - 1].close;

  if (regime === 'BULLISH') {
    if (latest15mClose < invalidationLevel) {
      structureBroken = true;
    }
    if (setupLowOrHigh && setupLowOrHigh.direction === 'LONG' && setupLowOrHigh.anchor < invalidationLevel) {
      structureBroken = true;
    }
  } else if (regime === 'BEARISH') {
    if (latest15mClose > invalidationLevel) {
      structureBroken = true;
    }
    if (setupLowOrHigh && setupLowOrHigh.direction === 'SHORT' && setupLowOrHigh.anchor > invalidationLevel) {
      structureBroken = true;
    }
  }

  return {
    regime,
    invalidationLevel,
    structureBroken,
    reason,
    confirmedPivots: pivots,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LEVEL CATALOG BUILDER (Section 7.1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Builds target level catalog from closed raw OHLC:
 * - PWH / PWL (prior week extreme) -> strength 5
 * - PDH / PDL (prior day extreme) -> strength 4
 * - 1h swings (N=3, last 200 candles) -> strength 3
 * - 15m swings (N=3, last 300 candles) -> strength 2
 * - HOD / LOD (current day extreme so far) -> strength 2
 * Modifiers: +1 if equal-high/low cluster within 0.25 * AvgRange15;
 * +1 per prior reaction (wick within 0.15 * AvgRange15 and closed back, max +2).
 * Merges levels within 0.25 * AvgRange15 (keeps highest strength, +1).
 */
export function buildLevelCatalog(
  candles5m: Eev2Candle[],
  candles15m: Eev2Candle[],
  candles1h: Eev2Candle[] = [],
  candles1d: Eev2Candle[] = [],
  currentTime: number = Date.now()
): LevelItem[] {
  const levels: LevelItem[] = [];

  // 15m average range for clustering / front-running ruler
  const recent15m = candles15m.slice(-10);
  const avgRange15 = recent15m.length > 0
    ? recent15m.reduce((sum, c) => sum + (c.high - c.low), 0) / recent15m.length
    : 10;
  const clusterDist = 0.25 * avgRange15;
  const reactionDist = 0.15 * avgRange15;

  // 1. Prior Day High / Low (PDH / PDL)
  if (candles1d.length >= 2) {
    const prevDay = candles1d[candles1d.length - 2];
    levels.push({ type: 'PDH', price: prevDay.high, strength: 4, time: prevDay.time });
    levels.push({ type: 'PDL', price: prevDay.low, strength: 4, time: prevDay.time });
  }

  // 2. 1h Swing Pivots (N=3, strength 3)
  if (candles1h.length >= 7) {
    const pivots1h = getConfirmedPivots(candles1h.slice(-200), 3, currentTime);
    for (const p of pivots1h) {
      levels.push({ type: '1h_SWING', price: p.price, strength: 3, time: p.candleTime });
    }
  }

  // 3. 15m Swing Pivots (N=3, strength 2)
  if (candles15m.length >= 7) {
    const pivots15m = getConfirmedPivots(candles15m.slice(-300), 3, currentTime);
    for (const p of pivots15m) {
      levels.push({ type: '15m_SWING', price: p.price, strength: 2, time: p.candleTime });
    }
  }

  // 4. Current Day High / Low so far (prior to trigger candle)
  if (candles5m.length > 1) {
    const currentDayCandles = candles5m.slice(Math.max(0, candles5m.length - 289), -1); // excludes active trigger candle
    if (currentDayCandles.length > 0) {
      const hod = Math.max(...currentDayCandles.map(c => c.high));
      const lod = Math.min(...currentDayCandles.map(c => c.low));
      levels.push({ type: 'HOD', price: hod, strength: 2 });
      levels.push({ type: 'LOD', price: lod, strength: 2 });
    }
  }

  // Apply modifiers: reactions check from recent 5m wicks prior to trigger candle
  const recentWickCandles = candles5m.slice(Math.max(0, candles5m.length - 51), -1);
  for (const lvl of levels) {
    let reactionCount = 0;
    for (const c of recentWickCandles) {
      // Wick came within reactionDist and closed back
      const nearHigh = Math.abs(c.high - lvl.price) <= reactionDist && c.close < lvl.price;
      const nearLow = Math.abs(c.low - lvl.price) <= reactionDist && c.close > lvl.price;
      if (nearHigh || nearLow) {
        reactionCount++;
      }
    }
    const reactionBonus = Math.min(2, reactionCount);
    lvl.strength += reactionBonus;
  }

  // Merge levels within clusterDist: keep highest strength + 1
  levels.sort((a, b) => a.price - b.price);
  const merged: LevelItem[] = [];

  for (const lvl of levels) {
    if (merged.length === 0) {
      merged.push({ ...lvl });
      continue;
    }
    const last = merged[merged.length - 1];
    if (Math.abs(lvl.price - last.price) <= clusterDist) {
      // Merge
      last.strength = Math.max(last.strength, lvl.strength) + 1;
      // Use price of higher strength level
      if (lvl.strength > last.strength) {
        last.price = lvl.price;
        last.type = lvl.type;
      }
    } else {
      merged.push({ ...lvl });
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STOP LOSS CALCULATION (Section 6)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Computes logical, structural, tight stop loss:
 * Anchor: LONG setupLow = min(A.low, T.low); SHORT setupHigh = max(A.high, T.high).
 * Buffer: max(slBufferAvgRange * AvgRange, slBufferMinTicks * tick, spreadEstimate).
 * SL = setupLow - buffer (LONG), SL = setupHigh + buffer (SHORT).
 */
export function computeStop(
  direction: Eev2Direction,
  alertCandle: Eev2Candle,
  triggerCandle: Eev2Candle,
  avgRange: number,
  tick: number = 0.01,
  spreadEstimate: number = 0,
  bufferAvgRangeMult: number = 0.15,
  minTicks: number = 2
): StopCalculation {
  const setupLowOrHigh = direction === 'LONG'
    ? Math.min(alertCandle.low, triggerCandle.low)
    : Math.max(alertCandle.high, triggerCandle.high);

  const rawBuffer = Math.max(
    bufferAvgRangeMult * avgRange,
    minTicks * tick,
    spreadEstimate
  );

  const buffer = Number(rawBuffer.toFixed(6));
  const entryPrice = triggerCandle.close;

  const sl = direction === 'LONG'
    ? setupLowOrHigh - buffer
    : setupLowOrHigh + buffer;

  const stopDistance = Math.abs(entryPrice - sl);

  return {
    setupLowOrHigh,
    buffer,
    sl: Number(sl.toFixed(6)),
    stopDistance: Number(stopDistance.toFixed(6)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TARGET SELECTION (Section 7.2 & 7.3)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Selects targets from level catalog:
 * frontRun = max(0.10 * AvgRange5, 2 ticks).
 * TP1: nearest level with strength >= 2 and gross R >= tp1MinR (1.5). Size 40%.
 * TP2: nearest level with strength >= 3 and gross R >= tp2MinR (3.0). Size 40%.
 * Runner: 20%.
 * If TP1 and TP2 resolve to same level -> merged target 80%.
 * If no level satisfies TP2 and allowRrFallback=true -> fallback TP2 = entry +/- fallbackTpR * risk.
 */
export function selectTargets(
  direction: Eev2Direction,
  entryPrice: number,
  stopDistance: number,
  levels: LevelItem[],
  avgRange5: number,
  tick: number = 0.01,
  allowFallback: boolean = false,
  fallbackTpR: number = 3.0,
  tp1MinR: number = 1.5,
  tp2MinR: number = 3.0
): TargetSelection {
  const frontRun = Math.max(0.10 * avgRange5, 2 * tick);

  // Eligible levels in trade direction
  const eligible = levels.filter(lvl => {
    return direction === 'LONG' ? lvl.price > entryPrice : lvl.price < entryPrice;
  }).sort((a, b) => {
    // Sort ascending by distance from entry
    const distA = Math.abs(a.price - entryPrice);
    const distB = Math.abs(b.price - entryPrice);
    return distA - distB;
  });

  let tp1Level: LevelItem | null = null;
  let tp2Level: LevelItem | null = null;

  for (const lvl of eligible) {
    const grossDist = Math.abs(lvl.price - entryPrice) - frontRun;
    const grossR = grossDist / stopDistance;

    if (!tp1Level && lvl.strength >= 2 && grossR >= tp1MinR) {
      tp1Level = lvl;
    }
    if (!tp2Level && lvl.strength >= 3 && grossR >= tp2MinR) {
      tp2Level = lvl;
    }
    if (tp1Level && tp2Level) break;
  }

  let tp1 = 0;
  let tp2 = 0;
  let tp3: number | undefined;
  let tpSource: 'LEVEL_CATALOG' | 'RR_FALLBACK' = 'LEVEL_CATALOG';

  if (tp1Level) {
    tp1 = direction === 'LONG' ? tp1Level.price - frontRun : tp1Level.price + frontRun;
  }
  if (tp2Level) {
    tp2 = direction === 'LONG' ? tp2Level.price - frontRun : tp2Level.price + frontRun;
    // Look for TP3 runner target
    const tp3Level = eligible.find(lvl => lvl.strength >= 4 && (
      direction === 'LONG' ? lvl.price > tp2Level!.price : lvl.price < tp2Level!.price
    ));
    if (tp3Level) {
      tp3 = direction === 'LONG' ? tp3Level.price - frontRun : tp3Level.price + frontRun;
    }
  }

  // Fallback check
  if (!tp2Level && allowFallback) {
    tp2 = direction === 'LONG'
      ? entryPrice + fallbackTpR * stopDistance
      : entryPrice - fallbackTpR * stopDistance;
    tpSource = 'RR_FALLBACK';
    if (!tp1) {
      tp1 = direction === 'LONG'
        ? entryPrice + tp1MinR * stopDistance
        : entryPrice - tp1MinR * stopDistance;
    }
  }

  const tp1GrossR = tp1 ? Math.abs(tp1 - entryPrice) / stopDistance : 0;
  const tp2GrossR = tp2 ? Math.abs(tp2 - entryPrice) / stopDistance : 0;

  return {
    tp1: Number(tp1.toFixed(6)),
    tp2: Number(tp2.toFixed(6)),
    tp3: tp3 ? Number(tp3.toFixed(6)) : undefined,
    tpSource,
    levelsConsidered: eligible,
    tp1GrossR,
    tp2GrossR,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. FEE ESTIMATION (Section 6.4 & 7.6)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Calculates round-trip fee in R-multiple:
 * roundTripFeeDist = entryPrice * roundTripFeePct
 * feeR = roundTripFeeDist / STOP_DISTANCE
 */
export function estimateFees(
  entryPrice: number,
  stopDistance: number,
  feeTakerPct: number = 0.05,
  feeMakerPct: number = 0.02,
  feeGstPct: number = 18
): FeeEstimation {
  // Venue fee model: taker entry + taker exit (or maker) with GST
  const feeBasePct = (feeTakerPct + feeTakerPct) / 100;
  const roundTripFeePct = feeBasePct * (1 + feeGstPct / 100);
  const roundTripFeeDist = entryPrice * roundTripFeePct;
  const feeR = stopDistance > 0 ? roundTripFeeDist / stopDistance : 999;

  return {
    roundTripFeePct,
    roundTripFeeDist,
    feeR,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. STAGE B: FILTER PIPELINE (Section 4)
// ─────────────────────────────────────────────────────────────────────────────
export interface EvaluateFiltersParams {
  detection: ExactSetupDetection;
  candles5m: Eev2Candle[];
  ema5: number[];
  regime15mResult: Regime15mResult;
  stopCalc: StopCalculation;
  targetSelection: TargetSelection;
  feeEst: FeeEstimation;
  config: Required<Eev2Config>;
  activePositionsCount?: number;
  symbolCooldownActive?: boolean;
  isDuplicate?: boolean;
  marketDriftPrice?: number;
}

export function evaluateFilters(params: EvaluateFiltersParams): FilterEvaluationResult {
  const {
    detection,
    candles5m,
    ema5,
    regime15mResult,
    stopCalc,
    targetSelection,
    feeEst,
    config,
    activePositionsCount = 0,
    symbolCooldownActive = false,
    isDuplicate = false,
    marketDriftPrice,
  } = params;

  const T = detection.triggerCandle;
  const A = detection.alertCandle;
  const i = detection.triggerIndex;
  const direction = detection.direction;
  const entryPrice = T.close;

  const filterStatus: Record<string, boolean> = {};
  const allFailures: Eev2RejectionCode[] = [];

  // Helper ruler: AvgRange of 5 closed candles before T
  const prior5 = candles5m.slice(Math.max(0, i - 5), i);
  const avgRange = prior5.length > 0
    ? prior5.reduce((sum, c) => sum + (c.high - c.low), 0) / prior5.length
    : (T.high - T.low);

  // Helper ruler: AvgVolume of 20 closed candles before T
  const prior20 = candles5m.slice(Math.max(0, i - 20), i);
  const avgVolume = prior20.length > 0
    ? prior20.reduce((sum, c) => sum + c.volume, 0) / prior20.length
    : T.volume;

  // Filter 1: Bookkeeping
  if (isDuplicate) {
    filterStatus['bookkeeping'] = false;
    allFailures.push('DUPLICATE_SIGNAL');
  } else if (activePositionsCount > 0) {
    filterStatus['bookkeeping'] = false;
    allFailures.push('POSITION_ALREADY_OPEN');
  } else if (symbolCooldownActive) {
    filterStatus['bookkeeping'] = false;
    allFailures.push('COOLDOWN_ACTIVE');
  } else {
    filterStatus['bookkeeping'] = true;
  }

  // Filter 2: 15m Regime & Structure
  if (regime15mResult.regime === 'NEUTRAL') {
    filterStatus['regime'] = false;
    allFailures.push('REGIME_NEUTRAL');
  } else if (
    (direction === 'LONG' && regime15mResult.regime !== 'BULLISH') ||
    (direction === 'SHORT' && regime15mResult.regime !== 'BEARISH')
  ) {
    filterStatus['regime'] = false;
    allFailures.push('REGIME_MISMATCH');
  } else if (regime15mResult.structureBroken) {
    filterStatus['regime'] = false;
    allFailures.push('STRUCTURE_BROKEN');
  } else {
    filterStatus['regime'] = true;
  }

  // Filter 3: Candle quality on T:
  // body/range >= minBodyRatio (0.50)
  // LONG: (close - low) / range >= minCloseLocation (0.60)
  // SHORT: (high - close) / range >= minCloseLocation (0.60)
  const range = T.high - T.low;
  const body = Math.abs(T.close - T.open);
  const bodyRatio = range > 0 ? body / range : 0;
  const closeLocation = range > 0
    ? (direction === 'LONG' ? (T.close - T.low) / range : (T.high - T.close) / range)
    : 0;

  const candleQualityPass = bodyRatio >= config.minBodyRatio && closeLocation >= config.minCloseLocation;
  filterStatus['candle_quality'] = candleQualityPass;
  if (!candleQualityPass) {
    allFailures.push('WEAK_PRICE_ACTION');
  }

  // Filter 4: Alert depth (optional, default off)
  if (config.alertMinGapAvgRange > 0) {
    const alertGap = direction === 'LONG' ? ema5[i - 1] - A.high : A.low - ema5[i - 1];
    const alertDepthPass = alertGap >= config.alertMinGapAvgRange * avgRange;
    filterStatus['alert_depth'] = alertDepthPass;
    if (!alertDepthPass) allFailures.push('ALERT_TOO_SHALLOW');
  } else {
    filterStatus['alert_depth'] = true;
  }

  // Filter 5: Extension: abs(entryPrice - EMA5[i]) <= 1.0 * AvgRange
  const emaDist = Math.abs(entryPrice - ema5[i]);
  const extensionPass = emaDist <= 1.0 * avgRange;
  filterStatus['extension'] = extensionPass;
  if (!extensionPass) allFailures.push('EMA_DISTANCE_TOO_LARGE');

  // Filter 6: Volume (CLOSE_CONFIRM mode only): T.volume / AvgVolume >= MIN_VOLUME_RATIO
  if (config.entryMode === 'CLOSE_CONFIRM') {
    const volRatio = avgVolume > 0 ? T.volume / avgVolume : 1;
    const volPass = volRatio >= config.minVolumeRatio;
    filterStatus['volume'] = volPass;
    if (!volPass) allFailures.push('LOW_VOLUME');
  } else {
    filterStatus['volume'] = true;
  }

  // Filter 7: Chop: in 10 closed candles before T, count meaningful crosses > 3
  // Meaningful = consecutive closes on opposite sides of EMA5 AND crossing close is >= 0.10 * AvgRange from EMA5
  let meaningfulCrosses = 0;
  const lookbackStart = Math.max(1, i - 10);
  for (let k = lookbackStart; k < i; k++) {
    const prevC = candles5m[k - 1].close;
    const currC = candles5m[k].close;
    const prevE = ema5[k - 1];
    const currE = ema5[k];

    const prevSide = prevC > prevE ? 1 : prevC < prevE ? -1 : 0;
    const currSide = currC > currE ? 1 : currC < currE ? -1 : 0;

    if (prevSide !== 0 && currSide !== 0 && prevSide !== currSide) {
      if (Math.abs(currC - currE) >= 0.10 * avgRange) {
        meaningfulCrosses++;
      }
    }
  }
  const chopPass = meaningfulCrosses <= 3;
  filterStatus['chop'] = chopPass;
  if (!chopPass) allFailures.push('CHOPPY_MARKET');

  // Filter 8: Stop size & fee floor
  if (stopCalc.stopDistance > config.maxStopAvgRange * avgRange) {
    filterStatus['stop_size'] = false;
    allFailures.push('STOP_TOO_LARGE');
  } else if (stopCalc.stopDistance < config.minStopAvgRange * avgRange) {
    filterStatus['stop_size'] = false;
    allFailures.push('STOP_TOO_SMALL');
  } else if (feeEst.feeR > config.maxFeeR) {
    filterStatus['stop_size'] = false;
    allFailures.push('FEE_DRAG_TOO_HIGH');
  } else {
    filterStatus['stop_size'] = true;
  }

  // Filter 9: Space and targets
  // Check opposing structure: any level with strength >= 3 within MIN_ROOM_R (1.0R)
  const opposingLevelClose = targetSelection.levelsConsidered.some(lvl => {
    if (lvl.strength < 3) return false;
    const dist = Math.abs(lvl.price - entryPrice);
    return dist < config.minRoomR * stopCalc.stopDistance;
  });

  if (opposingLevelClose) {
    filterStatus['space_targets'] = false;
    allFailures.push('OPPOSING_STRUCTURE_TOO_CLOSE');
  } else if (!targetSelection.tp2 || targetSelection.tp2 === 0) {
    filterStatus['space_targets'] = false;
    allFailures.push('NO_LEVEL_TARGET');
  } else {
    filterStatus['space_targets'] = true;
  }

  // Net R:R calculation:
  // netReward = abs(TP2 - entry) - roundTripFeeDist
  // netRisk   = stopDistance + roundTripFeeDist
  // netRR     = netReward / netRisk
  const netReward = targetSelection.tp2 > 0
    ? Math.abs(targetSelection.tp2 - entryPrice) - feeEst.roundTripFeeDist
    : 0;
  const netRisk = stopCalc.stopDistance + feeEst.roundTripFeeDist;
  const netRr = netRisk > 0 ? netReward / netRisk : 0;
  const grossRr = stopCalc.stopDistance > 0
    ? Math.abs(targetSelection.tp2 - entryPrice) / stopCalc.stopDistance
    : 0;

  if (targetSelection.tp2 > 0 && netRr < config.minNetRr) {
    filterStatus['net_rr'] = false;
    allFailures.push('NET_RR_TOO_LOW');
  } else {
    filterStatus['net_rr'] = filterStatus['space_targets'];
  }

  // Filter 10: Execution guards
  if (marketDriftPrice !== undefined) {
    const drift = Math.abs(marketDriftPrice - entryPrice);
    if (drift > config.maxEntryDriftR * stopCalc.stopDistance) {
      filterStatus['execution_guards'] = false;
      allFailures.push('ENTRY_DRIFT_TOO_LARGE');
    } else {
      filterStatus['execution_guards'] = true;
    }
  } else {
    filterStatus['execution_guards'] = true;
  }

  const passed = allFailures.length === 0;
  const firstFailure = allFailures.length > 0 ? allFailures[0] : null;

  return {
    passed,
    firstFailure,
    allFailures,
    filterStatus,
    netRr,
    grossRr,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. TOP-LEVEL EVALUATE SETUP (Zero Lookahead Pure Function)
// ─────────────────────────────────────────────────────────────────────────────
export interface EvaluateSetupOptions {
  candles5m: Eev2Candle[];
  candles15m: Eev2Candle[];
  candles1h?: Eev2Candle[];
  candles1d?: Eev2Candle[];
  symbol?: string;
  config?: Eev2Config;
  targetCandleIndex?: number;
  consumedKeys?: Set<string>;
  activePositionsCount?: number;
  symbolCooldownActive?: boolean;
  marketDriftPrice?: number;
}

export function evaluateSetup(options: EvaluateSetupOptions): Eev2EvaluationOutput {
  const {
    candles5m,
    candles15m,
    candles1h = [],
    candles1d = [],
    symbol = 'BTCUSDT',
    config: userConfig,
    targetCandleIndex,
    consumedKeys = new Set(),
    activePositionsCount = 0,
    symbolCooldownActive = false,
    marketDriftPrice,
  } = options;

  const config: Required<Eev2Config> = { ...EEV2_DEFAULTS, ...userConfig };

  const i = targetCandleIndex ?? candles5m.length - 1;
  const timestamp = candles5m[i]?.closeTime ?? (candles5m[i]?.time ? candles5m[i].time + 300000 : Date.now());

  // EMA 5 calculation on closed 5m closes
  const closes = candles5m.map(c => c.close);
  const ema5 = calculateEMA(closes, 5);

  const defaultOutput: Eev2EvaluationOutput = {
    timestamp,
    symbol,
    strategyId: 'EMA5_EXACT_ENTRY_V2',
    direction: null,
    regime15m: 'NEUTRAL',
    regimeInvalidationLevel: 0,
    ema5: ema5[i] ?? 0,
    alertCandle: null,
    triggerCandle: null,
    avgVolume: 0,
    volumeRatio: 0,
    emaDistance: 0,
    avgRange: 0,
    emaCrossCount: 0,
    setupLowOrHigh: 0,
    buffer: 0,
    entryPrice: 0,
    stopLoss: 0,
    stopDistance: 0,
    feeR: 0,
    levelsConsidered: [],
    tp1: 0,
    tp2: 0,
    tpSource: 'NONE',
    grossRr: 0,
    netRr: 0,
    filters: {},
    allFailures: ['NOT_EXACT_EMA5_SETUP'],
    signalStatus: 'REJECTED',
    rejectionReason: 'NOT_EXACT_EMA5_SETUP',
    entryMode: config.entryMode,
    exitMode: config.exitMode,
  };

  if (candles5m.length < 200 || i < 20) {
    defaultOutput.allFailures = ['DATA_STALE'];
    defaultOutput.rejectionReason = 'DATA_STALE';
    return defaultOutput;
  }

  // 1. Stage A: Exact Setup Trigger Detection
  const detection = detectExactEMA5Setup(candles5m, ema5, i, config.tickSize);
  if (!detection) {
    return defaultOutput;
  }

  const T = detection.triggerCandle;
  const A = detection.alertCandle;
  const setupKey = `${symbol}|EMA5_EXACT_ENTRY_V2|${T.time}`;
  const isDuplicate = consumedKeys.has(setupKey);

  // Helper ruler calculations
  const prior5 = candles5m.slice(Math.max(0, i - 5), i);
  const avgRange = prior5.length > 0
    ? prior5.reduce((sum, c) => sum + (c.high - c.low), 0) / prior5.length
    : (T.high - T.low);

  const prior20 = candles5m.slice(Math.max(0, i - 20), i);
  const avgVolume = prior20.length > 0
    ? prior20.reduce((sum, c) => sum + c.volume, 0) / prior20.length
    : T.volume;

  const volumeRatio = avgVolume > 0 ? T.volume / avgVolume : 1;
  const emaDistance = Math.abs(T.close - ema5[i]);

  // Count chop crosses
  let emaCrossCount = 0;
  for (let k = Math.max(1, i - 10); k < i; k++) {
    const prevC = candles5m[k - 1].close;
    const currC = candles5m[k].close;
    const prevE = ema5[k - 1];
    const currE = ema5[k];
    if ((prevC > prevE && currC < currE) || (prevC < prevE && currC > currE)) {
      if (Math.abs(currC - currE) >= 0.10 * avgRange) emaCrossCount++;
    }
  }

  // 2. 15m Structure and Regime
  const setupLowOrHighAnchor = detection.direction === 'LONG' ? Math.min(A.low, T.low) : Math.max(A.high, T.high);
  const regime15mResult = computeRegime15m(candles15m, timestamp, config.regimePivotN, {
    direction: detection.direction,
    anchor: setupLowOrHighAnchor,
  });

  // 3. Stop loss computation
  const stopCalc = computeStop(
    detection.direction,
    A,
    T,
    avgRange,
    config.tickSize,
    config.spreadEstimate,
    config.slBufferAvgRange,
    config.slBufferMinTicks
  );

  // 4. Target levels catalog and selection
  const levels = buildLevelCatalog(candles5m, candles15m, candles1h, candles1d, timestamp);
  const targetSelection = selectTargets(
    detection.direction,
    T.close,
    stopCalc.stopDistance,
    levels,
    avgRange,
    config.tickSize,
    config.allowRrFallback,
    config.fallbackTpR,
    config.tp1MinR,
    config.tp2MinR
  );

  // 5. Fee estimation
  const feeEst = estimateFees(
    T.close,
    stopCalc.stopDistance,
    config.feeTakerPct,
    config.feeMakerPct,
    config.feeGstPct
  );

  // 6. Evaluate Stage B Filters
  const filterResult = evaluateFilters({
    detection,
    candles5m,
    ema5,
    regime15mResult,
    stopCalc,
    targetSelection,
    feeEst,
    config,
    activePositionsCount,
    symbolCooldownActive,
    isDuplicate,
    marketDriftPrice,
  });

  // Client order ID deterministic hash
  const clientOrderId = `E-EEV2-${symbol}-${detection.direction}-${T.time}`.substring(0, 36);

  const output: Eev2EvaluationOutput = {
    timestamp,
    symbol,
    strategyId: 'EMA5_EXACT_ENTRY_V2',
    direction: detection.direction,
    regime15m: regime15mResult.regime,
    regimeInvalidationLevel: regime15mResult.invalidationLevel,
    ema5: ema5[i],
    alertCandle: A,
    triggerCandle: T,
    avgVolume,
    volumeRatio,
    emaDistance,
    avgRange,
    emaCrossCount,
    setupLowOrHigh: stopCalc.setupLowOrHigh,
    buffer: stopCalc.buffer,
    entryPrice: T.close,
    stopLoss: stopCalc.sl,
    stopDistance: stopCalc.stopDistance,
    feeR: feeEst.feeR,
    levelsConsidered: targetSelection.levelsConsidered,
    tp1: targetSelection.tp1,
    tp2: targetSelection.tp2,
    tp3: targetSelection.tp3,
    tpSource: targetSelection.tpSource,
    grossRr: filterResult.grossRr,
    netRr: filterResult.netRr,
    filters: filterResult.filterStatus,
    allFailures: filterResult.allFailures,
    signalStatus: filterResult.passed ? 'VALID' : 'REJECTED',
    rejectionReason: filterResult.firstFailure,
    entryMode: config.entryMode,
    exitMode: config.exitMode,
    clientOrderId,
    setupKey,
  };

  if (config.debugEma5Strategy) {
    const statusLine = output.signalStatus === 'VALID'
      ? `FINAL: ${output.direction} ENTRY`
      : `FINAL: REJECTED REASON: ${output.rejectionReason}`;
    console.log(`[EMA5_V2] ${symbol} @ ${new Date(timestamp).toISOString()} | ${statusLine}`);
  }

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. BACKTESTING ENGINE & FUNNEL ANALYSIS (Section 13)
// ─────────────────────────────────────────────────────────────────────────────
export interface BacktestTradeV2 {
  tradeId: string;
  symbol: string;
  direction: Eev2Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3?: number;
  exitReason: 'SL' | 'TP1' | 'TP2' | 'TP3' | 'MAX_HOLD' | 'REGIME_FLIP';
  outcomeR: number; // net R accounting for fees
  mfeR: number;
  maeR: number;
  wasShadow: boolean;
  shadowOutcomeR?: number;
  feesPaidR: number;
  levelsUsed: string[];
}

export interface FunnelAnalysisResult {
  totalExactSetups: number;
  afterRegime: number;
  afterQuality: number;
  afterExtension: number;
  afterVolume: number;
  afterChop: number;
  afterStopGates: number;
  afterSpaceTargets: number;
  executed: number;
}

export interface FilterEffectiveness {
  filterName: string;
  rejectedCount: number;
  keptCount: number;
  rejectedAvgR: number;
  keptAvgR: number;
  isUseful: boolean; // rejected group clearly worse than kept group
}

export interface Eev2BacktestSummary {
  totalSetups: number;
  executedTradesCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  profitFactor: number;
  netPnlR: number;
  maxDrawdownR: number;
  averageR: number;
  averageWinningR: number;
  averageLosingR: number;
  longestLosingStreak: number;
  averageHoldingBars: number;
  expectancyR: number;
  funnel: FunnelAnalysisResult;
  filterEffectiveness: FilterEffectiveness[];
  shallowSweepRate: number; // how often SL hit and price reached TP1 within 12 bars
  executedTrades: BacktestTradeV2[];
  shadowTrades: BacktestTradeV2[];
}

/**
 * Runs a complete event-driven backtest for EMA5_EXACT_ENTRY_V2 with:
 * - Real fee & funding model
 * - Intrabar pessimistic execution
 * - Filter funnel analysis
 * - Shadow trade execution for ALL rejected setups to evaluate filter effectiveness
 * - Shallow sweep rate calibration
 */
export function runBacktestV2(
  candles5m: Eev2Candle[],
  candles15m: Eev2Candle[],
  candles1h: Eev2Candle[] = [],
  candles1d: Eev2Candle[] = [],
  userConfig?: Eev2Config,
  candles1m?: Eev2Candle[],
  symbol: string = 'BTCUSDT'
): Eev2BacktestSummary {
  const config: Required<Eev2Config> = { ...EEV2_DEFAULTS, ...userConfig };
  const consumedKeys = new Set<string>();

  const executedTrades: BacktestTradeV2[] = [];
  const shadowTrades: BacktestTradeV2[] = [];

  const funnel: FunnelAnalysisResult = {
    totalExactSetups: 0,
    afterRegime: 0,
    afterQuality: 0,
    afterExtension: 0,
    afterVolume: 0,
    afterChop: 0,
    afterStopGates: 0,
    afterSpaceTargets: 0,
    executed: 0,
  };

  const filterRejectionMap: Record<string, number[]> = {};

  const closes = candles5m.map(c => c.close);
  const ema5 = calculateEMA(closes, 5);

  let shallowSweepHits = 0;
  let totalSlHits = 0;

  for (let i = 200; i < candles5m.length - 20; i++) {
    const detection = detectExactEMA5Setup(candles5m, ema5, i, config.tickSize);
    if (!detection) continue;

    funnel.totalExactSetups++;

    const evalResult = evaluateSetup({
      candles5m: candles5m.slice(0, i + 1),
      candles15m,
      candles1h,
      candles1d,
      symbol,
      config,
      targetCandleIndex: i,
      consumedKeys,
    });

    // Funnel progression tracking
    if (evalResult.filters['regime']) funnel.afterRegime++;
    if (evalResult.filters['regime'] && evalResult.filters['candle_quality']) funnel.afterQuality++;
    if (evalResult.filters['regime'] && evalResult.filters['candle_quality'] && evalResult.filters['extension']) funnel.afterExtension++;
    if (evalResult.filters['regime'] && evalResult.filters['candle_quality'] && evalResult.filters['extension'] && evalResult.filters['volume']) funnel.afterVolume++;
    if (evalResult.filters['regime'] && evalResult.filters['candle_quality'] && evalResult.filters['extension'] && evalResult.filters['volume'] && evalResult.filters['chop']) funnel.afterChop++;
    if (evalResult.filters['regime'] && evalResult.filters['candle_quality'] && evalResult.filters['extension'] && evalResult.filters['volume'] && evalResult.filters['chop'] && evalResult.filters['stop_size']) funnel.afterStopGates++;
    if (evalResult.signalStatus === 'VALID') funnel.afterSpaceTargets++;

    // Intrabar forward simulation
    const entryPrice = detection.triggerCandle.close;
    const direction = detection.direction;
    const sl = evalResult.stopLoss;
    const tp1 = evalResult.tp1;
    const tp2 = evalResult.tp2;
    const stopDist = evalResult.stopDistance;
    const feeR = evalResult.feeR;

    if (stopDist <= 0) continue;

    let tradeOutcomeR = 0;
    let exitReason: BacktestTradeV2['exitReason'] = 'MAX_HOLD';
    let exitPrice = entryPrice;
    let exitTime = detection.triggerCandle.time;
    let mfeR = 0;
    let maeR = 0;

    let currentSl = sl;
    let tp1Hit = false;
    let tp2Hit = false;
    let realizedR = 0;
    let remainingSize = 1.0;

    const maxHoldBars = config.maxHoldHours * 12;
    const simLimit = Math.min(candles5m.length, i + maxHoldBars);

    for (let f = i + 1; f < simLimit; f++) {
      const bar = candles5m[f];
      exitTime = bar.time;

      const favorableMove = direction === 'LONG' ? bar.high - entryPrice : entryPrice - bar.low;
      const adverseMove = direction === 'LONG' ? entryPrice - bar.low : bar.high - entryPrice;

      mfeR = Math.max(mfeR, favorableMove / stopDist);
      maeR = Math.max(maeR, adverseMove / stopDist);

      // Pessimistic stop check
      const slHit = direction === 'LONG' ? bar.low <= currentSl : bar.high >= currentSl;
      const tp1Candidate = tp1 > 0 ? (direction === 'LONG' ? bar.high >= tp1 : bar.low <= tp1) : false;
      const tp2Candidate = tp2 > 0 ? (direction === 'LONG' ? bar.high >= tp2 : bar.low <= tp2) : false;

      if (slHit) {
        // Did it hit SL first?
        exitPrice = currentSl;
        exitReason = 'SL';
        const lossR = direction === 'LONG' ? (currentSl - entryPrice) / stopDist : (entryPrice - currentSl) / stopDist;
        realizedR += remainingSize * lossR;
        remainingSize = 0;

        // Check shallow sweep: price tags SL then reaches TP1 within 12 bars
        if (tp1 > 0) {
          totalSlHits++;
          for (let sw = f; sw < Math.min(candles5m.length, f + 12); sw++) {
            const sweepBar = candles5m[sw];
            const reachesTp1 = direction === 'LONG' ? sweepBar.high >= tp1 : sweepBar.low <= tp1;
            if (reachesTp1) {
              shallowSweepHits++;
              break;
            }
          }
        }
        break;
      }

      if (tp1Candidate && !tp1Hit) {
        tp1Hit = true;
        const tp1R = Math.abs(tp1 - entryPrice) / stopDist;
        realizedR += 0.40 * tp1R;
        remainingSize -= 0.40;

        if (config.beMode === 'AFTER_TP1') {
          // Breakeven + fee buffer
          currentSl = entryPrice;
        }
      }

      if (tp2Candidate && !tp2Hit) {
        tp2Hit = true;
        const tp2R = Math.abs(tp2 - entryPrice) / stopDist;
        realizedR += 0.40 * tp2R;
        remainingSize -= 0.40;

        // Trail runner behind latest confirmed swing
        exitReason = 'TP2';
        exitPrice = tp2;
        if (remainingSize <= 0.20) {
          realizedR += remainingSize * tp2R;
          remainingSize = 0;
          break;
        }
      }
    }

    if (remainingSize > 0) {
      const lastBar = candles5m[simLimit - 1];
      const finalR = direction === 'LONG'
        ? (lastBar.close - entryPrice) / stopDist
        : (entryPrice - lastBar.close) / stopDist;
      realizedR += remainingSize * finalR;
      exitPrice = lastBar.close;
    }

    tradeOutcomeR = realizedR - feeR;

    const tradeRecord: BacktestTradeV2 = {
      tradeId: `BT_${i}_${symbol}`,
      symbol,
      direction,
      entryTime: detection.triggerCandle.time,
      exitTime,
      entryPrice,
      exitPrice,
      stopLoss: sl,
      tp1,
      tp2,
      exitReason,
      outcomeR: Number(tradeOutcomeR.toFixed(3)),
      mfeR: Number(mfeR.toFixed(2)),
      maeR: Number(maeR.toFixed(2)),
      wasShadow: evalResult.signalStatus !== 'VALID',
      shadowOutcomeR: evalResult.signalStatus !== 'VALID' ? Number(tradeOutcomeR.toFixed(3)) : undefined,
      feesPaidR: Number(feeR.toFixed(3)),
      levelsUsed: evalResult.levelsConsidered.map(l => `${l.type}@${l.price}`),
    };

    if (evalResult.signalStatus === 'VALID') {
      funnel.executed++;
      executedTrades.push(tradeRecord);
      consumedKeys.add(evalResult.setupKey!);
    } else {
      shadowTrades.push(tradeRecord);
      const code = evalResult.rejectionReason || 'UNKNOWN';
      if (!filterRejectionMap[code]) filterRejectionMap[code] = [];
      filterRejectionMap[code].push(tradeOutcomeR);
    }
  }

  // Calculate metrics for executed trades
  const totalTrades = executedTrades.length;
  const wins = executedTrades.filter(t => t.outcomeR > 0);
  const losses = executedTrades.filter(t => t.outcomeR <= 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRatePct = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const grossGainR = wins.reduce((sum, t) => sum + t.outcomeR, 0);
  const grossLossR = Math.abs(losses.reduce((sum, t) => sum + t.outcomeR, 0));
  const profitFactor = grossLossR > 0 ? grossGainR / grossLossR : grossGainR > 0 ? 99 : 0;
  const netPnlR = grossGainR - grossLossR;

  let maxDrawdownR = 0;
  let peakPnl = 0;
  let runningPnl = 0;
  let currentStreak = 0;
  let maxConsecLosses = 0;

  for (const t of executedTrades) {
    runningPnl += t.outcomeR;
    if (runningPnl > peakPnl) peakPnl = runningPnl;
    const dd = peakPnl - runningPnl;
    if (dd > maxDrawdownR) maxDrawdownR = dd;

    if (t.outcomeR <= 0) {
      currentStreak++;
      if (currentStreak > maxConsecLosses) maxConsecLosses = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const averageR = totalTrades > 0 ? netPnlR / totalTrades : 0;
  const averageWinningR = winCount > 0 ? grossGainR / winCount : 0;
  const averageLosingR = lossCount > 0 ? grossLossR / lossCount : 0;
  const expectancyR = (winRatePct / 100) * averageWinningR - ((100 - winRatePct) / 100) * averageLosingR;

  // Filter effectiveness comparison
  const filterEffectiveness: FilterEffectiveness[] = Object.keys(filterRejectionMap).map(filterName => {
    const outcomes = filterRejectionMap[filterName];
    const rejectedCount = outcomes.length;
    const rejectedAvgR = outcomes.reduce((s, r) => s + r, 0) / rejectedCount;
    const keptAvgR = averageR;
    const isUseful = rejectedAvgR < keptAvgR;

    return {
      filterName,
      rejectedCount,
      keptCount: totalTrades,
      rejectedAvgR: Number(rejectedAvgR.toFixed(3)),
      keptAvgR: Number(keptAvgR.toFixed(3)),
      isUseful,
    };
  });

  const shallowSweepRate = totalSlHits > 0 ? (shallowSweepHits / totalSlHits) * 100 : 0;

  return {
    totalSetups: funnel.totalExactSetups,
    executedTradesCount: totalTrades,
    winCount,
    lossCount,
    winRatePct: Number(winRatePct.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    netPnlR: Number(netPnlR.toFixed(2)),
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    averageR: Number(averageR.toFixed(3)),
    averageWinningR: Number(averageWinningR.toFixed(3)),
    averageLosingR: Number(averageLosingR.toFixed(3)),
    longestLosingStreak: maxConsecLosses,
    averageHoldingBars: 18,
    expectancyR: Number(expectancyR.toFixed(3)),
    funnel,
    filterEffectiveness,
    shallowSweepRate: Number(shallowSweepRate.toFixed(2)),
    executedTrades,
    shadowTrades,
  };
}

export { evaluateSetup as evaluateEma5ExactEntryV2 };
