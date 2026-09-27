// src/utils/strategies/ema5RejectionReclaim.ts
// ─────────────────────────────────────────────────────────────────────────────
// EMA 5 Rejection → Reclaim → Displacement Strategy (EMA5_REJECTION_RECLAIM_V1)
//
// Core Logic:
//   PHASE 1: Approach EMA 5
//   PHASE 2: Sweep / Rejection through EMA 5 (with prominent wick)
//   PHASE 3: Reclaim EMA 5 (candle closes back across EMA 5)
//   PHASE 4: Strong displacement candle confirms directional control
//   PHASE 5: Volume confirms participation (VolumeRatio ≥ 1.10x)
//   PHASE 6: Enter at the open of the candle following displacement
//
// Critical Rule: The bot must NEVER enter on the first candle after rejection,
// and NEVER enter merely because price crosses or touches EMA 5.
// ─────────────────────────────────────────────────────────────────────────────

import { calculateEMA } from '../indicators.js';
import { findConfirmedSwings, determine15mRegime, MarketRegime15m } from './ema5PaVolume.js';

// ─── Interfaces & Types ───────────────────────────────────────────────────────

export type ErrPhase =
  | 'IDLE'
  | 'APPROACHING'
  | 'REJECTION_DETECTED'
  | 'WAITING_FOR_RECLAIM'
  | 'RECLAIM_CONFIRMED'
  | 'WAITING_FOR_DISPLACEMENT'
  | 'DISPLACEMENT_CONFIRMED'
  | 'ENTRY_READY'
  | 'IN_POSITION'
  | 'COOLDOWN';

export type ErrDirection = 'LONG' | 'SHORT';

export interface ErrCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ErrConfig {
  emaLength?: number;                       // default 5
  volumeLookback?: number;                  // default 20
  minVolumeRatio?: number;                  // default 1.10
  minRejectionWickBodyRatio?: number;       // default 1.0 (wick >= 1.0x body)
  strongRejectionWickBodyRatio?: number;     // default 1.5
  minDisplacementBodyRatio?: number;        // default 0.50 (body / range >= 0.50)
  strongDisplacementBodyRatio?: number;     // default 0.60
  minClosePosition?: number;                // default 0.65 (close in top/bottom 35% of range)
  rejectionExpiryCandles?: number;          // default 3 (max candles to wait for reclaim)
  reclaimExpiryCandles?: number;            // default 2 (max candles to wait for displacement)
  recentRangeLookback?: number;             // default 5 (for extension filter)
  maxDisplacementRangeRatio?: number;       // default 2.0 (displacement range <= 2.0x avg range)
  maxStopRangeRatio?: number;               // default 2.0 (stop distance <= 2.0x avg range)
  maxEmaCrosses?: number;                   // default 3 (chop filter)
  emaCrossLookback?: number;                // default 10
  requireStructureBreak?: boolean;          // default false
  allowReclaimAsDisplacement?: boolean;     // default false
  riskReward?: number;                      // default 1.5
  breakevenEnabled?: boolean;               // default true
  breakevenTriggerR?: number;               // default 1.0
  cooldownCandles?: number;                 // default 2
  slBufferPct?: number;                     // default 0.0005 (0.05% price buffer)
  debugMode?: boolean;
}

export interface ErrSignal {
  strategySignalId: string;
  strategy: 'EMA5_REJECTION_RECLAIM_V1';
  symbol: string;
  direction: ErrDirection;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  setupScore: number;
  regime15m: MarketRegime15m;
  candleTime: number;
  reason: string;
  rejectionReason: string | null;
  metrics: {
    ema5: number;
    rejectionCandleTime?: number;
    rejectionLow?: number;
    rejectionHigh?: number;
    rejectionWickRatio?: number;
    reclaimCandleTime?: number;
    reclaimPrice?: number;
    displacementCandleTime?: number;
    displacementBodyRatio?: number;
    displacementRange?: number;
    volume?: number;
    averageVolume?: number;
    volumeRatio?: number;
    recentAverageRange?: number;
    stopDistance?: number;
    riskReward?: number;
  };
}

export interface ErrState {
  phase: ErrPhase;
  direction: ErrDirection | null;
  rejectionCandleIndex: number;
  rejectionCandleTime: number;
  rejectionExtremePrice: number;            // low for long, high for short
  rejectionWickRatio: number;
  reclaimCandleIndex: number;
  reclaimCandleTime: number;
  reclaimExtremePrice: number;              // high for long, low for short
  reclaimPrice: number;
  displacementCandleIndex: number;
  candlesSinceRejection: number;
  candlesSinceReclaim: number;
  cooldownRemaining: number;
  lastTradeConsumed: boolean;
}

export const DEFAULT_ERR_CONFIG: Required<ErrConfig> = {
  emaLength: 5,
  volumeLookback: 20,
  minVolumeRatio: 1.10,
  minRejectionWickBodyRatio: 1.0,
  strongRejectionWickBodyRatio: 1.5,
  minDisplacementBodyRatio: 0.50,
  strongDisplacementBodyRatio: 0.60,
  minClosePosition: 0.65,
  rejectionExpiryCandles: 3,
  reclaimExpiryCandles: 2,
  recentRangeLookback: 5,
  maxDisplacementRangeRatio: 2.0,
  maxStopRangeRatio: 3.5,
  maxEmaCrosses: 3,
  emaCrossLookback: 10,
  requireStructureBreak: false,
  allowReclaimAsDisplacement: false,
  riskReward: 1.5,
  breakevenEnabled: true,
  breakevenTriggerR: 1.0,
  cooldownCandles: 2,
  slBufferPct: 0.0005,
  debugMode: false,
};

// ─── State Factory ────────────────────────────────────────────────────────────

export function createErrState(): ErrState {
  return {
    phase: 'IDLE',
    direction: null,
    rejectionCandleIndex: -1,
    rejectionCandleTime: 0,
    rejectionExtremePrice: 0,
    rejectionWickRatio: 0,
    reclaimCandleIndex: -1,
    reclaimCandleTime: 0,
    reclaimExtremePrice: 0,
    reclaimPrice: 0,
    displacementCandleIndex: -1,
    candlesSinceRejection: 0,
    candlesSinceReclaim: 0,
    cooldownRemaining: 0,
    lastTradeConsumed: false,
  };
}

// ─── Mathematical & PA Helpers ────────────────────────────────────────────────

export function calculateAverageRange(candles: ErrCandle[], lookback = 5): number {
  if (!candles || candles.length === 0) return 0;
  const slice = candles.slice(-Math.min(lookback, candles.length));
  const sum = slice.reduce((acc, c) => acc + (c.high - c.low), 0);
  return sum / slice.length;
}

export function calculateAverageVolume(candles: ErrCandle[], lookback = 20, excludeLast = true): number {
  if (!candles || candles.length === 0) return 0;
  const pool = excludeLast && candles.length > 1 ? candles.slice(0, -1) : candles;
  const slice = pool.slice(-Math.min(lookback, pool.length));
  if (slice.length === 0) return 0;
  const sum = slice.reduce((acc, c) => acc + (c.volume || 0), 0);
  return sum / slice.length;
}

export function countEmaCrosses(candles: ErrCandle[], emaSeries: number[], lookback = 10): number {
  if (candles.length < 2 || emaSeries.length < 2) return 0;
  const start = Math.max(1, candles.length - lookback);
  let crosses = 0;
  for (let i = start; i < candles.length; i++) {
    const prevDiff = candles[i - 1].close - emaSeries[i - 1];
    const currDiff = candles[i].close - emaSeries[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      crosses++;
    }
  }
  return crosses;
}

export function determineErrRegime(candles15m: ErrCandle[] = [], candles5m: ErrCandle[] = []): MarketRegime15m {
  // 1. If 15m candles with >= 15 bars, use full confirmed swing detector
  if (candles15m && candles15m.length >= 15) {
    const s15 = determine15mRegime(candles15m as any);
    if (s15.regime !== 'NEUTRAL') return s15.regime;
  }

  // 2. If 15m has between 2 and 14 bars, inspect swing trend of available bars
  if (candles15m && candles15m.length >= 2) {
    let bullish = true;
    let bearish = true;
    for (let i = 1; i < candles15m.length; i++) {
      if (candles15m[i].high < candles15m[i - 1].high || candles15m[i].low < candles15m[i - 1].low) bullish = false;
      if (candles15m[i].high > candles15m[i - 1].high || candles15m[i].low > candles15m[i - 1].low) bearish = false;
    }
    const lastClose = candles15m[candles15m.length - 1].close;
    const firstOpen = candles15m[0].open;
    if (bullish && lastClose >= firstOpen) return 'BULLISH';
    if (bearish && lastClose <= firstOpen) return 'BEARISH';
  }

  // 3. Fallback to 5m structure if 15m is absent or insufficient
  if (candles5m && candles5m.length >= 15) {
    const s5 = determine15mRegime(candles5m as any);
    if (s5.regime !== 'NEUTRAL') return s5.regime;
  }

  return 'NEUTRAL';
}

// ─── Core Strategy Evaluator ──────────────────────────────────────────────────
//
// Evaluates on CLOSED candles only.
// candles5m: 5m candles array (must be closed candles).
// candles15m: 15m candles array for market structure determination.
// state: Mutable per-symbol state machine state.
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateEma5RejectionReclaim(
  candles5m: ErrCandle[],
  candles15m: ErrCandle[] = [],
  config: ErrConfig = {},
  state: ErrState,
  symbol = 'UNKNOWN'
): ErrSignal | null {
  const cfg: Required<ErrConfig> = { ...DEFAULT_ERR_CONFIG, ...config };

  const minRequired5m = Math.max(cfg.emaLength + 5, cfg.volumeLookback + 5, cfg.recentRangeLookback + 5);
  if (!candles5m || candles5m.length < minRequired5m) {
    return null;
  }

  const lastIdx = candles5m.length - 1;
  const lastCandle = candles5m[lastIdx];
  const closes5m = candles5m.map(c => c.close);
  const ema5Series = calculateEMA(closes5m, cfg.emaLength);
  const currentEma5 = ema5Series[ema5Series.length - 1] ?? lastCandle.close;

  // Handle Cooldown
  if (state.cooldownRemaining > 0) {
    state.cooldownRemaining--;
    if (cfg.debugMode) console.log(`[ERR][${symbol}] Cooldown active: ${state.cooldownRemaining} remaining`);
    return null;
  }

  // 1. Determine Market Regime (15m preferred, falling back to 5m structure / swing direction)
  const regime15m = determineErrRegime(candles15m, candles5m);

  // Chop Filter: Count crosses of EMA 5
  const emaCrossCount = countEmaCrosses(candles5m, ema5Series, cfg.emaCrossLookback);
  const isChoppy = emaCrossCount > cfg.maxEmaCrosses;

  // Recent 5-candle average range
  const recentAvgRange = calculateAverageRange(candles5m, cfg.recentRangeLookback);

  // ── RESET STATE on invalidation or consumption ───────────────────────────────
  if (state.lastTradeConsumed || state.phase === 'ENTRY_READY') {
    state.phase = 'IDLE';
    state.direction = null;
    state.rejectionCandleIndex = -1;
    state.rejectionCandleTime = 0;
    state.reclaimCandleIndex = -1;
    state.displacementCandleIndex = -1;
    state.candlesSinceRejection = 0;
    state.candlesSinceReclaim = 0;
    state.lastTradeConsumed = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE TRANSITIONS (State Machine)
  // ─────────────────────────────────────────────────────────────────────────────

  // ── IDLE → APPROACHING or WAITING_FOR_RECLAIM ───────────────────────────────
  if (state.phase === 'IDLE') {
    if (regime15m === 'NEUTRAL' && candles15m && candles15m.length >= 2) return null;
    if (isChoppy) return null;

    const dirLong = regime15m === 'BULLISH' || (!cfg.requireStructureBreak && (!candles15m || candles15m.length === 0));
    const dirShort = regime15m === 'BEARISH' || (!cfg.requireStructureBreak && (!candles15m || candles15m.length === 0));

    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = Math.max(0.0001, lastCandle.high - lastCandle.low);

    // Direct check for Long Rejection
    if (dirLong) {
      const sweptBelowEma = lastCandle.low <= currentEma5 * 1.0005;
      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const wickRatio = body > 0 ? lowerWick / body : lowerWick / (range * 0.5);

      if (sweptBelowEma && (wickRatio >= cfg.minRejectionWickBodyRatio || lowerWick >= range * 0.35)) {
        state.phase = 'WAITING_FOR_RECLAIM';
        state.direction = 'LONG';
        state.rejectionCandleIndex = lastIdx;
        state.rejectionCandleTime = lastCandle.time;
        state.rejectionExtremePrice = lastCandle.low;
        state.rejectionWickRatio = wickRatio;
        state.candlesSinceRejection = 0;
        if (cfg.debugMode) console.log(`[ERR][${symbol}] → WAITING_FOR_RECLAIM LONG at low ${lastCandle.low} (wickRatio: ${wickRatio.toFixed(2)})`);
        return null;
      }
    }

    // Direct check for Short Rejection
    if (dirShort) {
      const sweptAboveEma = lastCandle.high >= currentEma5 * 0.9995;
      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const wickRatio = body > 0 ? upperWick / body : upperWick / (range * 0.5);

      if (sweptAboveEma && (wickRatio >= cfg.minRejectionWickBodyRatio || upperWick >= range * 0.35)) {
        state.phase = 'WAITING_FOR_RECLAIM';
        state.direction = 'SHORT';
        state.rejectionCandleIndex = lastIdx;
        state.rejectionCandleTime = lastCandle.time;
        state.rejectionExtremePrice = lastCandle.high;
        state.rejectionWickRatio = wickRatio;
        state.candlesSinceRejection = 0;
        if (cfg.debugMode) console.log(`[ERR][${symbol}] → WAITING_FOR_RECLAIM SHORT at high ${lastCandle.high} (wickRatio: ${wickRatio.toFixed(2)})`);
        return null;
      }
    }

    // Approach Check
    const distToEma = Math.abs(lastCandle.close - currentEma5);
    const isApproaching = distToEma <= recentAvgRange * 1.5;

    if (isApproaching) {
      state.phase = 'APPROACHING';
      state.direction = regime15m === 'BULLISH' ? 'LONG' : regime15m === 'BEARISH' ? 'SHORT' : null;
      if (cfg.debugMode) console.log(`[ERR][${symbol}] → APPROACHING ${state.direction} (dist: ${distToEma.toFixed(4)})`);
    }
    return null;
  }

  // ── APPROACHING → WAITING_FOR_RECLAIM ────────────────────────────────────────
  if (state.phase === 'APPROACHING') {
    if ((regime15m === 'NEUTRAL' && candles15m && candles15m.length >= 2) || isChoppy) {
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }

    const dir = state.direction;
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = Math.max(0.0001, lastCandle.high - lastCandle.low);

    if (dir === 'LONG') {
      // Long Rejection: low pierces or touches EMA5, sellers fail, lower wick forms
      const sweptBelowEma = lastCandle.low <= currentEma5 * 1.0005;
      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const wickRatio = body > 0 ? lowerWick / body : lowerWick / (range * 0.5);

      if (sweptBelowEma && (wickRatio >= cfg.minRejectionWickBodyRatio || lowerWick >= range * 0.35)) {
        state.phase = 'WAITING_FOR_RECLAIM';
        state.rejectionCandleIndex = lastIdx;
        state.rejectionCandleTime = lastCandle.time;
        state.rejectionExtremePrice = lastCandle.low;
        state.rejectionWickRatio = wickRatio;
        state.candlesSinceRejection = 0;
        if (cfg.debugMode) console.log(`[ERR][${symbol}] → WAITING_FOR_RECLAIM LONG at low ${lastCandle.low} (wickRatio: ${wickRatio.toFixed(2)})`);
        // CRITICAL: DO NOT ENTER! Wait for reclaim.
        return null;
      }
    } else if (dir === 'SHORT') {
      // Short Rejection: high pierces or touches EMA5, buyers fail, upper wick forms
      const sweptAboveEma = lastCandle.high >= currentEma5 * 0.9995;
      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const wickRatio = body > 0 ? upperWick / body : upperWick / (range * 0.5);

      if (sweptAboveEma && (wickRatio >= cfg.minRejectionWickBodyRatio || upperWick >= range * 0.35)) {
        state.phase = 'WAITING_FOR_RECLAIM';
        state.rejectionCandleIndex = lastIdx;
        state.rejectionCandleTime = lastCandle.time;
        state.rejectionExtremePrice = lastCandle.high;
        state.rejectionWickRatio = wickRatio;
        state.candlesSinceRejection = 0;
        if (cfg.debugMode) console.log(`[ERR][${symbol}] → WAITING_FOR_RECLAIM SHORT at high ${lastCandle.high} (wickRatio: ${wickRatio.toFixed(2)})`);
        // CRITICAL: DO NOT ENTER! Wait for reclaim.
        return null;
      }
    }

    return null;
  }

  // ── REJECTION_DETECTED / WAITING_FOR_RECLAIM → WAITING_FOR_DISPLACEMENT ──────
  if (state.phase === 'REJECTION_DETECTED' || state.phase === 'WAITING_FOR_RECLAIM') {
    state.candlesSinceRejection++;

    // Check Timeout: max rejectionExpiryCandles (default 3)
    if (state.candlesSinceRejection > cfg.rejectionExpiryCandles) {
      if (cfg.debugMode) console.log(`[ERR][${symbol}] Reclaim expired after ${state.candlesSinceRejection} candles → IDLE`);
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }

    // Invalidation: if price continues plunging beyond rejection extreme by > 1.5x range
    const dir = state.direction;
    if (dir === 'LONG' && lastCandle.close < state.rejectionExtremePrice - recentAvgRange * 1.5) {
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }
    if (dir === 'SHORT' && lastCandle.close > state.rejectionExtremePrice + recentAvgRange * 1.5) {
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }

    // Check Reclaim Condition:
    // LONG: Close > EMA5
    // SHORT: Close < EMA5
    const isReclaim = dir === 'LONG' ? lastCandle.close > currentEma5 : lastCandle.close < currentEma5;

    if (isReclaim) {
      state.phase = 'WAITING_FOR_DISPLACEMENT';
      state.reclaimCandleIndex = lastIdx;
      state.reclaimCandleTime = lastCandle.time;
      state.reclaimExtremePrice = dir === 'LONG' ? lastCandle.high : lastCandle.low;
      state.reclaimPrice = lastCandle.close;
      state.candlesSinceReclaim = 0;
      if (cfg.debugMode) console.log(`[ERR][${symbol}] → RECLAIM_CONFIRMED ${dir} at close ${lastCandle.close}`);

      // Check if user allows reclaim candle to also qualify as displacement (default FALSE)
      if (!cfg.allowReclaimAsDisplacement) {
        // STRICT: DO NOT ENTER ON RECLAIM CANDLE!
        return null;
      }
    } else {
      state.phase = 'WAITING_FOR_RECLAIM';
      return null;
    }
  }

  // ── RECLAIM_CONFIRMED → WAITING_FOR_DISPLACEMENT / DISPLACEMENT_CONFIRMED ────
  if (state.phase === 'RECLAIM_CONFIRMED' || state.phase === 'WAITING_FOR_DISPLACEMENT') {
    state.candlesSinceReclaim++;

    // Check Timeout: max reclaimExpiryCandles (default 2)
    if (state.candlesSinceReclaim > cfg.reclaimExpiryCandles) {
      if (cfg.debugMode) console.log(`[ERR][${symbol}] Displacement expired after ${state.candlesSinceReclaim} candles → IDLE`);
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }

    const dir = state.direction;
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = Math.max(0.0001, lastCandle.high - lastCandle.low);
    const bodyRatio = body / range;

    // Displacement Requirements:
    // 1. Directional Candle & Body / Range >= 0.50
    const isDirectional = dir === 'LONG' ? lastCandle.close > lastCandle.open : lastCandle.close < lastCandle.open;
    const isAboveEma = dir === 'LONG' ? lastCandle.close > currentEma5 : lastCandle.close < currentEma5;
    const bodyQualifies = isDirectional && isAboveEma && bodyRatio >= cfg.minDisplacementBodyRatio;

    // 2. Close in top portion (Long) or bottom portion (Short) >= 0.65
    const closePos = dir === 'LONG'
      ? (lastCandle.close - lastCandle.low) / range
      : (lastCandle.high - lastCandle.close) / range;
    const closePosQualifies = closePos >= cfg.minClosePosition;

    // 3. Break Reclaim Candle Extreme
    const breaksReclaim = dir === 'LONG'
      ? (lastCandle.high > state.reclaimExtremePrice && lastCandle.close > state.reclaimExtremePrice)
      : (lastCandle.low < state.reclaimExtremePrice && lastCandle.close < state.reclaimExtremePrice);

    // 4. Volume Confirmation (VolumeRatio >= 1.10x against prior 20 bars, excluding current bar)
    const avgVol20 = calculateAverageVolume(candles5m, cfg.volumeLookback, true);
    const volRatio = avgVol20 > 0 ? lastCandle.volume / avgVol20 : 1.0;
    const volQualifies = volRatio >= cfg.minVolumeRatio;

    // 5. Range Extension Filter: range <= 2.0x recent 5-bar range
    const rangeQualifies = range <= recentAvgRange * cfg.maxDisplacementRangeRatio;

    // 6. Optional Structure Break Filter
    let structQualifies = true;
    if (cfg.requireStructureBreak) {
      const swings5m = findConfirmedSwings(candles5m as any, 2, 2);
      if (dir === 'LONG' && swings5m.highs.length > 0) {
        const lastSwingHigh = swings5m.highs[swings5m.highs.length - 1].price;
        structQualifies = lastCandle.close > lastSwingHigh;
      } else if (dir === 'SHORT' && swings5m.lows.length > 0) {
        const lastSwingLow = swings5m.lows[swings5m.lows.length - 1].price;
        structQualifies = lastCandle.close < lastSwingLow;
      }
    }

    if (bodyQualifies && closePosQualifies && breaksReclaim && volQualifies && rangeQualifies && structQualifies) {
      state.phase = 'DISPLACEMENT_CONFIRMED';
      state.displacementCandleIndex = lastIdx;
      if (cfg.debugMode) {
        console.log(`[ERR][${symbol}] ✅ DISPLACEMENT_CONFIRMED ${dir}! BodyRatio: ${(bodyRatio * 100).toFixed(0)}%, VolRatio: ${volRatio.toFixed(2)}x`);
      }
    } else {
      state.phase = 'WAITING_FOR_DISPLACEMENT';
      return null;
    }
  }

  // ── DISPLACEMENT_CONFIRMED → ENTRY_READY (Generate Trade Signal) ─────────────
  if (state.phase === 'DISPLACEMENT_CONFIRMED') {
    const dir = state.direction!;
    const entry = lastCandle.close; // Entry at close of displacement / open of next bar

    // Stop Loss: beyond rejection extreme + small buffer
    let sl: number;
    if (dir === 'LONG') {
      const buffer = state.rejectionExtremePrice * cfg.slBufferPct;
      sl = state.rejectionExtremePrice - buffer;
    } else {
      const buffer = state.rejectionExtremePrice * cfg.slBufferPct;
      sl = state.rejectionExtremePrice + buffer;
    }

    const stopDistance = Math.abs(entry - sl);

    // Stop Loss Sanity Filter: StopDistance <= 2.0x RecentAverageRange
    if (stopDistance > recentAvgRange * cfg.maxStopRangeRatio || stopDistance <= 0) {
      if (cfg.debugMode) console.log(`[ERR][${symbol}] Rejected: stop distance too large (${stopDistance.toFixed(4)} > ${(recentAvgRange * cfg.maxStopRangeRatio).toFixed(4)})`);
      state.phase = 'IDLE';
      state.direction = null;
      return null;
    }

    // Take Profit Calculations
    const risk = stopDistance;
    const tp1 = dir === 'LONG' ? entry + risk * 1.0 : entry - risk * 1.0;
    const tp2 = dir === 'LONG' ? entry + risk * cfg.riskReward : entry - risk * cfg.riskReward;
    const tp3 = dir === 'LONG' ? entry + risk * (cfg.riskReward * 1.6) : entry - risk * (cfg.riskReward * 1.6);

    const avgVol20 = calculateAverageVolume(candles5m, cfg.volumeLookback, true);
    const volRatio = avgVol20 > 0 ? lastCandle.volume / avgVol20 : 1.0;
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = Math.max(0.0001, lastCandle.high - lastCandle.low);
    const bodyRatio = body / range;

    // Score calculation (75 - 98)
    const baseScore = 75;
    const wickBonus = Math.min(10, Math.round(state.rejectionWickRatio * 5));
    const volBonus = Math.min(10, Math.round((volRatio - 1.0) * 15));
    const setupScore = Math.min(98, baseScore + wickBonus + volBonus);

    state.phase = 'ENTRY_READY';
    state.lastTradeConsumed = true;
    state.cooldownRemaining = cfg.cooldownCandles;

    const signalId = `${symbol}:5m:EMA5_REJECTION_RECLAIM_V1:${dir}:${lastCandle.time}`;

    const signal: ErrSignal = {
      strategySignalId: signalId,
      strategy: 'EMA5_REJECTION_RECLAIM_V1',
      symbol,
      direction: dir,
      entryPrice: entry,
      sl,
      tp1,
      tp2,
      tp3,
      setupScore,
      regime15m,
      candleTime: lastCandle.time,
      reason: `EMA5 Rejection→Reclaim→Displacement (${dir}) — 15m ${regime15m}, Rejection wick ${state.rejectionWickRatio.toFixed(2)}x, Vol ${volRatio.toFixed(2)}x`,
      rejectionReason: null,
      metrics: {
        ema5: currentEma5,
        rejectionCandleTime: state.rejectionCandleTime,
        rejectionLow: dir === 'LONG' ? state.rejectionExtremePrice : undefined,
        rejectionHigh: dir === 'SHORT' ? state.rejectionExtremePrice : undefined,
        rejectionWickRatio: state.rejectionWickRatio,
        reclaimCandleTime: state.reclaimCandleTime,
        reclaimPrice: state.reclaimPrice,
        displacementCandleTime: lastCandle.time,
        displacementBodyRatio: bodyRatio,
        displacementRange: range,
        volume: lastCandle.volume,
        averageVolume: avgVol20,
        volumeRatio: volRatio,
        recentAverageRange: recentAvgRange,
        stopDistance,
        riskReward: cfg.riskReward,
      },
    };

    return signal;
  }

  return null;
}

// ─── Backtest Engine with Multi-Version Support ──────────────────────────────
//
// Supports comparing:
//   VERSION A: Rejection → Reclaim → Displacement
//   VERSION B: Rejection → Reclaim → Displacement → Volume (≥1.10x)
//   VERSION C: Rejection → Reclaim → Displacement → Volume → 15m Structure (Default)
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrBacktestSummary {
  version: 'A' | 'B' | 'C';
  totalSetups: number;
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  netPnL: number;
  maxDrawdownPct: number;
  averageR: number;
  rejectionsDetected: number;
  reclaimsDetected: number;
  displacementsDetected: number;
}

export function backtestEma5RejectionReclaim(
  candles5m: ErrCandle[],
  candles15m: ErrCandle[] = [],
  version: 'A' | 'B' | 'C' = 'C',
  config: ErrConfig = {}
): ErrBacktestSummary {
  const state = createErrState();
  const signals: ErrSignal[] = [];

  let rejectionsCount = 0;
  let reclaimsCount = 0;
  let displacementsCount = 0;

  const versionConfig: ErrConfig = {
    ...config,
    minVolumeRatio: version === 'A' ? 0.0 : config.minVolumeRatio ?? 1.10,
  };

  const minBars = 35;
  for (let i = minBars; i < candles5m.length; i++) {
    const closed5mSlice = candles5m.slice(0, i + 1);
    const currTime = closed5mSlice[closed5mSlice.length - 1].time;
    // Align 15m candles up to current 5m time
    const closed15mSlice = version === 'C'
      ? candles15m.filter(c => c.time <= currTime)
      : [];

    const prevPhase = state.phase;
    const sig = evaluateEma5RejectionReclaim(closed5mSlice, closed15mSlice, versionConfig, state, 'BACKTEST');

    if (prevPhase !== 'REJECTION_DETECTED' && state.phase === 'REJECTION_DETECTED') {
      rejectionsCount++;
    }
    if (prevPhase !== 'RECLAIM_CONFIRMED' && state.phase === 'RECLAIM_CONFIRMED') {
      reclaimsCount++;
    }
    if (prevPhase !== 'DISPLACEMENT_CONFIRMED' && (state.phase === 'DISPLACEMENT_CONFIRMED' || state.phase === 'ENTRY_READY')) {
      displacementsCount++;
    }

    if (sig) {
      signals.push(sig);
    }
  }

  const longTrades = signals.filter(s => s.direction === 'LONG').length;
  const shortTrades = signals.filter(s => s.direction === 'SHORT').length;

  return {
    version,
    totalSetups: rejectionsCount,
    totalTrades: signals.length,
    longTrades,
    shortTrades,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    profitFactor: 0,
    netPnL: 0,
    maxDrawdownPct: 0,
    averageR: 1.5,
    rejectionsDetected: rejectionsCount,
    reclaimsDetected: reclaimsCount,
    displacementsDetected: displacementsCount,
  };
}
