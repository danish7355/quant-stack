// src/utils/strategies/ema5ExactEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// EMA 5 EXACT PRICE ACTION ENTRY (EMA5_EXACT_ENTRY_V1)
// ─────────────────────────────────────────────────────────────────────────────
// Replicates strictly the exact EMA 5 price-action entry pattern.
//
// Core Rules:
// 1. Timeframe: 5m setup trigger, 15m market structure regime filter.
// 2. Indicators: ONLY EMA 5, raw OHLC price action, raw candle volume.
// 3. Stage A: Exact price-action setup detection around EMA 5.
// 4. Stage B: Filter pipeline (15m structure, volume, chop, extension, stop).
// 5. No delayed entry: entry generated immediately upon setup candle close.
// 6. Never enter simply because price crosses EMA 5.
// ─────────────────────────────────────────────────────────────────────────────

import { calculateEMA } from '../indicators.js';

export type EeeDirection = 'LONG' | 'SHORT';
export type EeeRegime15m = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type EeeStateName = 'IDLE' | 'SETUP_DETECTED' | 'ENTRY_READY' | 'IN_POSITION' | 'COOLDOWN';

export type EeeRejectionCode =
  | 'REGIME_MISMATCH'
  | 'REGIME_NEUTRAL'
  | 'NOT_EXACT_EMA5_SETUP'
  | 'WEAK_PRICE_ACTION'
  | 'EMA_DISTANCE_TOO_LARGE'
  | 'LOW_VOLUME'
  | 'CHOPPY_MARKET'
  | 'OPPOSING_STRUCTURE_TOO_CLOSE'
  | 'OVEREXTENDED'
  | 'STOP_TOO_LARGE'
  | 'DUPLICATE_SIGNAL'
  | 'POSITION_ALREADY_OPEN'
  | 'COOLDOWN_ACTIVE';

export interface EeeCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EeeConfig {
  emaLength?: number;              // default: 5
  minVolumeRatio?: number;         // default: 1.05
  minBodyRatio?: number;           // default: 0.50 (Body / Range >= 50%)
  minClosePosition?: number;       // default: 0.60 (Upper/lower 60% of candle range)
  maxEmaDistanceRatio?: number;    // default: 1.2 (abs(Close - EMA5) <= 1.2 * AVG_RANGE)
  maxStopRangeRatio?: number;      // default: 2.0 (STOP_DISTANCE <= 2.0 * AVG_RANGE)
  maxEmaCrosses?: number;          // default: 3 in previous 10 candles
  riskReward?: number;             // default: 1.5
  exitMode?: 'RR' | 'STRUCTURE';   // default: 'RR'
  breakevenEnabled?: boolean;      // default: true
  breakevenTriggerR?: number;      // default: 1.0
  cooldownCandles?: number;        // default: 2
  debugMode?: boolean;             // default: false
  slBufferPct?: number;            // default: 0.0005 (0.05% price buffer)
  requireOpposingSpace?: boolean;  // default: true
}

export interface EeeState {
  state: EeeStateName;
  direction: EeeDirection | null;
  lastTradedCandleTime: number;
  cooldownRemaining: number;
  lastCandidate: any | null;
}

export interface ExactSetupResult {
  direction: EeeDirection;
  candleIndex: number;
  entryCandle: EeeCandle;
  currentEma5: number;
  emaDistance: number;
  recentAvgRange: number;
  setupSwingLow: number;
  setupSwingHigh: number;
  interactionType: 'REJECTION' | 'CONTINUATION' | 'TURN';
  bodyRatio: number;
  closePosition: number;
}

export interface EeeSignal {
  strategySignalId: string;
  symbol: string;
  direction: EeeDirection;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  setupScore: number;
  candleTime: number;
  rejectionReason: EeeRejectionCode | null;
  reason: string;
  regime15m: EeeRegime15m;
  metrics: {
    ema5: number;
    emaDistance: number;
    recentAverageRange: number;
    volumeRatio: number;
    averageVolume: number;
    bodyRatio: number;
    closePosition: number;
    emaCrossCount: number;
    stopDistance: number;
    interactionType: string;
    riskReward: number;
  };
}

export interface FilterFunnelStats {
  totalBars: number;
  exactSetupsDetected: number;
  exactLongSetups: number;
  exactShortSetups: number;
  passedRegime: number;
  passedVolume: number;
  passedChop: number;
  passedExtension: number;
  passedOpposingSpace: number;
  passedStopDistance: number;
  executedTrades: number;
  rejectionCounts: Record<EeeRejectionCode, number>;
}

export interface EeeBacktestSummary {
  funnel: FilterFunnelStats;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  netPnLR: number;
  maxDrawdownR: number;
  averageR: number;
  averageWinningR: number;
  averageLosingR: number;
  longestLosingStreak: number;
  averageHoldingCandles: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Factory
// ─────────────────────────────────────────────────────────────────────────────
export function createEeeState(): EeeState {
  return {
    state: 'IDLE',
    direction: null,
    lastTradedCandleTime: 0,
    cooldownRemaining: 0,
    lastCandidate: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (Raw OHLC only, zero external indicator dependencies)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates raw average volume over the previous N candles (excluding the candle at targetIdx).
 */
export function calculateAverageVolume(
  candles: EeeCandle[],
  lookback = 20,
  targetIdx?: number
): number {
  const endIdx = targetIdx !== undefined ? targetIdx : candles.length - 1;
  const startIdx = Math.max(0, endIdx - lookback);
  const slice = candles.slice(startIdx, endIdx);
  if (slice.length === 0) return 0;
  const total = slice.reduce((sum, c) => sum + (c.volume || 0), 0);
  return total / slice.length;
}

/**
 * Calculates average High - Low range over the previous N candles (excluding the target candle).
 */
export function calculateAverageRange(
  candles: EeeCandle[],
  lookback = 5,
  targetIdx?: number
): number {
  const endIdx = targetIdx !== undefined ? targetIdx : candles.length - 1;
  const startIdx = Math.max(0, endIdx - lookback);
  const slice = candles.slice(startIdx, endIdx);
  if (slice.length === 0) return 0;
  const total = slice.reduce((sum, c) => sum + Math.max(0.000001, c.high - c.low), 0);
  return total / slice.length;
}

/**
 * Counts price/EMA5 crossings in the previous N completed candles.
 */
export function countEmaCrossings(
  candles: EeeCandle[],
  ema5Series: number[],
  lookback = 10,
  targetIdx?: number
): number {
  const endIdx = targetIdx !== undefined ? targetIdx : candles.length - 1;
  const startIdx = Math.max(1, endIdx - lookback);
  let crosses = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const prevDiff = candles[i - 1].close - ema5Series[i - 1];
    const currDiff = candles[i].close - ema5Series[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      crosses++;
    }
  }

  return crosses;
}

/**
 * Determines 15-minute market structure regime from raw price action swings.
 * BULLISH: Higher Highs + Higher Lows, or break of prior resistance swing high.
 * BEARISH: Lower Highs + Lower Lows, or break of prior support swing low.
 * NEUTRAL: Ranging / conflicting structure.
 */
export function determine15mStructure(candles15m: EeeCandle[]): EeeRegime15m {
  if (!candles15m || candles15m.length < 5) {
    return 'NEUTRAL';
  }

  // 1. Check local swing pivots (left=1, right=1 for 15m pivots)
  const swingHighs: { price: number; index: number }[] = [];
  const swingLows: { price: number; index: number }[] = [];

  for (let i = 1; i < candles15m.length - 1; i++) {
    const c = candles15m[i];
    if (c.high > candles15m[i - 1].high && c.high >= candles15m[i + 1].high) {
      swingHighs.push({ price: c.high, index: i });
    }
    if (c.low < candles15m[i - 1].low && c.low <= candles15m[i + 1].low) {
      swingLows.push({ price: c.low, index: i });
    }
  }

  const lastCandle = candles15m[candles15m.length - 1];

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const hLast = swingHighs[swingHighs.length - 1].price;
    const hPrev = swingHighs[swingHighs.length - 2].price;
    const lLast = swingLows[swingLows.length - 1].price;
    const lPrev = swingLows[swingLows.length - 2].price;

    if (hLast > hPrev && lLast > lPrev) return 'BULLISH';
    if (hLast < hPrev && lLast < lPrev) return 'BEARISH';
    if (lastCandle.close > hLast) return 'BULLISH';
    if (lastCandle.close < lLast) return 'BEARISH';
  } else if (swingHighs.length >= 1 && swingLows.length >= 1) {
    const hLast = swingHighs[swingHighs.length - 1].price;
    const lLast = swingLows[swingLows.length - 1].price;
    if (lastCandle.close > hLast) return 'BULLISH';
    if (lastCandle.close < lLast) return 'BEARISH';
  }

  // 2. Consecutive directional closes / higher lows or lower highs check
  const checkBars = Math.min(8, candles15m.length);
  const recent = candles15m.slice(-checkBars);
  let upCount = 0;
  let downCount = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].close >= recent[i - 1].close && recent[i].low >= recent[i - 1].low) upCount++;
    if (recent[i].close <= recent[i - 1].close && recent[i].high <= recent[i - 1].high) downCount++;
  }
  if (upCount >= checkBars - 2 && recent[recent.length - 1].close > recent[0].open) return 'BULLISH';
  if (downCount >= checkBars - 2 && recent[recent.length - 1].close < recent[0].open) return 'BEARISH';

  return 'NEUTRAL';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A: Exact EMA 5 Price Action Setup Detector
// ─────────────────────────────────────────────────────────────────────────────

export interface SetupDetectionResult {
  setup: ExactSetupResult | null;
  rejectionReason: EeeRejectionCode | null;
  candidateDirection: EeeDirection | null;
  currentEma5: number;
  recentAvgRange: number;
}

export function detectExactEMA5DetailedSetup(
  candles5m: EeeCandle[],
  config: EeeConfig = {},
  targetIdx?: number
): SetupDetectionResult {
  const minBars = 25;
  if (!candles5m || candles5m.length < minBars) {
    return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: null, currentEma5: 0, recentAvgRange: 0 };
  }

  const idx = targetIdx !== undefined ? targetIdx : candles5m.length - 1;
  if (idx < 5 || idx >= candles5m.length) {
    return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: null, currentEma5: 0, recentAvgRange: 0 };
  }

  const currentCandle = candles5m[idx];
  const prevCandle = candles5m[idx - 1];

  const minBodyRatio = config.minBodyRatio ?? 0.50;
  const minClosePosition = config.minClosePosition ?? 0.60;
  const maxEmaDistanceRatio = config.maxEmaDistanceRatio ?? 1.2;

  // Calculate EMA 5
  const closes = candles5m.map((c) => c.close);
  const ema5Series = calculateEMA(closes, config.emaLength ?? 5);
  const currentEma5 = ema5Series[idx];
  const prevEma5 = ema5Series[idx - 1];

  const range = Math.max(0.000001, currentCandle.high - currentCandle.low);
  const body = Math.abs(currentCandle.close - currentCandle.open);
  const bodyRatio = body / range;

  // Recent 5-candle average range
  const recentAvgRange = calculateAverageRange(candles5m, 5, idx);
  const emaDistance = Math.abs(currentCandle.close - currentEma5);

  // ── Candidate Direction Check ──────────────────────────────────────────────
  const isGreen = currentCandle.close > currentCandle.open;
  const isRed = currentCandle.close < currentCandle.open;

  if (!isGreen && !isRed) {
    return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: null, currentEma5, recentAvgRange };
  }

  const candidateDir: EeeDirection = isGreen ? 'LONG' : 'SHORT';

  // ── Extension / Overextended check on candle range ─────────────────────────
  if (range > recentAvgRange * 2.0) {
    return { setup: null, rejectionReason: 'OVEREXTENDED', candidateDirection: candidateDir, currentEma5, recentAvgRange };
  }

  // ── Proximity filter ───────────────────────────────────────────────────────
  if (emaDistance > recentAvgRange * maxEmaDistanceRatio) {
    return { setup: null, rejectionReason: 'EMA_DISTANCE_TOO_LARGE', candidateDirection: candidateDir, currentEma5, recentAvgRange };
  }

  // ── EVALUATE LONG SETUP ──────────────────────────────────────────────────
  if (candidateDir === 'LONG') {
    if (currentCandle.close < currentEma5) {
      return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: 'LONG', currentEma5, recentAvgRange };
    }

    // 1. Bullish directional control
    if (bodyRatio < minBodyRatio) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'LONG', currentEma5, recentAvgRange };
    }

    const closePos = (currentCandle.close - currentCandle.low) / range;
    if (closePos < minClosePosition) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'LONG', currentEma5, recentAvgRange };
    }

    const upperWick = currentCandle.high - currentCandle.close;
    if (upperWick / range > 0.40) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'LONG', currentEma5, recentAvgRange };
    }

    // 2. EMA 5 Interaction check
    let interactionType: 'REJECTION' | 'CONTINUATION' | 'TURN' | null = null;
    const lowTestedEma = currentCandle.low <= currentEma5;
    const openNearEma = Math.abs(currentCandle.open - currentEma5) <= 0.40 * range;
    const prevInteracted =
      prevCandle.low <= prevEma5 ||
      prevCandle.close <= prevEma5 ||
      Math.abs(prevCandle.close - prevEma5) <= 0.40 * recentAvgRange;

    if (lowTestedEma) {
      interactionType = 'REJECTION';
    } else if (openNearEma) {
      interactionType = 'CONTINUATION';
    } else if (prevInteracted && currentCandle.low <= prevCandle.high) {
      interactionType = 'TURN';
    }

    if (!interactionType) {
      return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: 'LONG', currentEma5, recentAvgRange };
    }

    const setupSwingLow = Math.min(currentCandle.low, prevCandle.low);
    const setupSwingHigh = Math.max(currentCandle.high, prevCandle.high);

    return {
      setup: {
        direction: 'LONG',
        candleIndex: idx,
        entryCandle: currentCandle,
        currentEma5,
        emaDistance,
        recentAvgRange,
        setupSwingLow,
        setupSwingHigh,
        interactionType,
        bodyRatio,
        closePosition: closePos,
      },
      rejectionReason: null,
      candidateDirection: 'LONG',
      currentEma5,
      recentAvgRange,
    };
  }

  // ── EVALUATE SHORT SETUP ─────────────────────────────────────────────────
  if (candidateDir === 'SHORT') {
    if (currentCandle.close > currentEma5) {
      return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: 'SHORT', currentEma5, recentAvgRange };
    }

    // 1. Bearish directional control
    if (bodyRatio < minBodyRatio) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'SHORT', currentEma5, recentAvgRange };
    }

    const closePos = (currentCandle.high - currentCandle.close) / range;
    if (closePos < minClosePosition) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'SHORT', currentEma5, recentAvgRange };
    }

    const lowerWick = currentCandle.close - currentCandle.low;
    if (lowerWick / range > 0.40) {
      return { setup: null, rejectionReason: 'WEAK_PRICE_ACTION', candidateDirection: 'SHORT', currentEma5, recentAvgRange };
    }

    // 2. EMA 5 Interaction check
    let interactionType: 'REJECTION' | 'CONTINUATION' | 'TURN' | null = null;
    const highTestedEma = currentCandle.high >= currentEma5;
    const openNearEma = Math.abs(currentCandle.open - currentEma5) <= 0.40 * range;
    const prevInteracted =
      prevCandle.high >= prevEma5 ||
      prevCandle.close >= prevEma5 ||
      Math.abs(prevCandle.close - prevEma5) <= 0.40 * recentAvgRange;

    if (highTestedEma) {
      interactionType = 'REJECTION';
    } else if (openNearEma) {
      interactionType = 'CONTINUATION';
    } else if (prevInteracted && currentCandle.high >= prevCandle.low) {
      interactionType = 'TURN';
    }

    if (!interactionType) {
      return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: 'SHORT', currentEma5, recentAvgRange };
    }

    const setupSwingLow = Math.min(currentCandle.low, prevCandle.low);
    const setupSwingHigh = Math.max(currentCandle.high, prevCandle.high);

    return {
      setup: {
        direction: 'SHORT',
        candleIndex: idx,
        entryCandle: currentCandle,
        currentEma5,
        emaDistance,
        recentAvgRange,
        setupSwingLow,
        setupSwingHigh,
        interactionType,
        bodyRatio,
        closePosition: closePos,
      },
      rejectionReason: null,
      candidateDirection: 'SHORT',
      currentEma5,
      recentAvgRange,
    };
  }

  return { setup: null, rejectionReason: 'NOT_EXACT_EMA5_SETUP', candidateDirection: null, currentEma5, recentAvgRange };
}

/**
 * Standard Stage A function returning setup or null.
 */
export function detectExactEMA5Setup(
  candles5m: EeeCandle[],
  config: EeeConfig = {},
  targetIdx?: number
): ExactSetupResult | null {
  return detectExactEMA5DetailedSetup(candles5m, config, targetIdx).setup;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE B: Filter Pipeline & Signal Evaluator
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Complete evaluation of EMA 5 Exact Price Action Entry:
 * Evaluates Stage A (Setup) then applies Stage B Filters:
 * - 15m Market Structure Regime Filter
 * - Volume Ratio Filter (20-bar lookback, default >= 1.05x)
 * - Chop Filter (EMA 5 crosses <= 3 in 10 bars)
 * - Extension Filter (Range <= 2.0x 5-bar average range)
 * - Opposing Structure / Liquidity Space Filter
 * - Stop Loss Distance Filter (Stop Distance <= 2.0x 5-bar average range)
 */
export function evaluateEma5ExactEntry(
  candles5m: EeeCandle[],
  candles15m: EeeCandle[] = [],
  config: EeeConfig = {},
  state?: EeeState,
  symbol = 'UNKNOWN',
  targetIdx?: number
): EeeSignal | null {
  const minBars = 25;
  if (!candles5m || candles5m.length < minBars) return null;

  const idx = targetIdx !== undefined ? targetIdx : candles5m.length - 1;
  const currentCandle = candles5m[idx];
  const currentState = state ?? createEeeState();

  // 1. Deduplication / Cooldown Guard
  if (currentState.lastTradedCandleTime === currentCandle.time) {
    if (config.debugMode) {
      console.log(`[EMA5][${symbol}] Duplicate signal on candle ${currentCandle.time} → REJECTED`);
    }
    return buildRejectedSignal(symbol, 'DUPLICATE_SIGNAL', 'LONG', currentCandle, 0, 0, 'NEUTRAL');
  }

  if (currentState.cooldownRemaining > 0) {
    currentState.cooldownRemaining--;
    if (config.debugMode) {
      console.log(`[EMA5][${symbol}] Cooldown active (${currentState.cooldownRemaining} remaining) → REJECTED`);
    }
    return buildRejectedSignal(symbol, 'COOLDOWN_ACTIVE', 'LONG', currentCandle, 0, 0, 'NEUTRAL');
  }

  // 2. Stage A: Detect Exact Setup
  const detailed = detectExactEMA5DetailedSetup(candles5m, config, idx);
  if (!detailed.setup) {
    if (detailed.rejectionReason === 'OVEREXTENDED' || detailed.rejectionReason === 'EMA_DISTANCE_TOO_LARGE') {
      const regime15m = determine15mStructure(candles15m);
      return buildRejectedSignal(
        symbol,
        detailed.rejectionReason,
        detailed.candidateDirection ?? 'LONG',
        currentCandle,
        detailed.currentEma5,
        detailed.recentAvgRange,
        regime15m
      );
    }
    return null;
  }

  const setup = detailed.setup;

  const dir = setup.direction;
  const entryPrice = currentCandle.close;

  // 3. Stage B: Filter Pipeline

  // ── Filter 1: 15m Market Structure Regime Filter ───────────────────────────
  const regime15m = determine15mStructure(candles15m);
  if (dir === 'LONG') {
    if (regime15m === 'BEARISH') {
      if (config.debugMode) console.log(`[EMA5][${symbol}] Long rejected: 15m regime is BEARISH`);
      return buildRejectedSignal(symbol, 'REGIME_MISMATCH', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m);
    }
    if (regime15m === 'NEUTRAL') {
      if (config.debugMode) console.log(`[EMA5][${symbol}] Long rejected: 15m regime is NEUTRAL/Unclear`);
      return buildRejectedSignal(symbol, 'REGIME_NEUTRAL', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m);
    }
  } else {
    if (regime15m === 'BULLISH') {
      if (config.debugMode) console.log(`[EMA5][${symbol}] Short rejected: 15m regime is BULLISH`);
      return buildRejectedSignal(symbol, 'REGIME_MISMATCH', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m);
    }
    if (regime15m === 'NEUTRAL') {
      if (config.debugMode) console.log(`[EMA5][${symbol}] Short rejected: 15m regime is NEUTRAL/Unclear`);
      return buildRejectedSignal(symbol, 'REGIME_NEUTRAL', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m);
    }
  }

  // ── Filter 2: Volume Filter ────────────────────────────────────────────────
  const avgVol20 = calculateAverageVolume(candles5m, 20, idx);
  const minVolRatio = config.minVolumeRatio ?? 1.05;
  const volRatio = avgVol20 > 0 ? currentCandle.volume / avgVol20 : 1.0;

  if (volRatio < minVolRatio) {
    if (config.debugMode) console.log(`[EMA5][${symbol}] Volume ratio ${volRatio.toFixed(2)}x < ${minVolRatio}x → REJECTED: LOW_VOLUME`);
    return buildRejectedSignal(symbol, 'LOW_VOLUME', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20);
  }

  // ── Filter 3: Chop Filter ──────────────────────────────────────────────────
  const closes = candles5m.map((c) => c.close);
  const ema5Series = calculateEMA(closes, config.emaLength ?? 5);
  const emaCrossCount = countEmaCrossings(candles5m, ema5Series, 10, idx);
  const maxCrosses = config.maxEmaCrosses ?? 3;

  if (emaCrossCount > maxCrosses) {
    if (config.debugMode) console.log(`[EMA5][${symbol}] Chop count ${emaCrossCount} > ${maxCrosses} → REJECTED: CHOPPY_MARKET`);
    return buildRejectedSignal(symbol, 'CHOPPY_MARKET', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20, emaCrossCount);
  }

  // ── Filter 4: Extension Filter ─────────────────────────────────────────────
  const candleRange = currentCandle.high - currentCandle.low;
  if (candleRange > setup.recentAvgRange * 2.0) {
    if (config.debugMode) console.log(`[EMA5][${symbol}] Candle range ${candleRange.toFixed(4)} > 2.0x avg ${setup.recentAvgRange.toFixed(4)} → REJECTED: OVEREXTENDED`);
    return buildRejectedSignal(symbol, 'OVEREXTENDED', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20, emaCrossCount);
  }

  // ── Stop Loss & Distance Calculation ───────────────────────────────────────
  const slBuffer = (config.slBufferPct ?? 0.0005) * entryPrice;
  let sl = dir === 'LONG' ? setup.setupSwingLow - slBuffer : setup.setupSwingHigh + slBuffer;

  // Never use EMA5 itself as stop loss
  if (dir === 'LONG' && sl >= entryPrice) {
    sl = entryPrice - Math.max(slBuffer, setup.recentAvgRange * 0.5);
  } else if (dir === 'SHORT' && sl <= entryPrice) {
    sl = entryPrice + Math.max(slBuffer, setup.recentAvgRange * 0.5);
  }

  const stopDistance = Math.abs(entryPrice - sl);

  // ── Filter 5: Stop Distance Filter ─────────────────────────────────────────
  const maxStopRatio = config.maxStopRangeRatio ?? 2.0;
  if (stopDistance > setup.recentAvgRange * maxStopRatio || stopDistance <= 0) {
    if (config.debugMode) console.log(`[EMA5][${symbol}] Stop distance ${stopDistance.toFixed(4)} > ${maxStopRatio}x avg → REJECTED: STOP_TOO_LARGE`);
    return buildRejectedSignal(symbol, 'STOP_TOO_LARGE', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20, emaCrossCount, stopDistance);
  }

  // ── Filter 6: Opposing Structure / Space Filter ────────────────────────────
  if (config.requireOpposingSpace !== false) {
    const requiredRoom = stopDistance * 1.5;
    const lookbackBars = 20;
    const startScan = Math.max(0, idx - lookbackBars);

    if (dir === 'LONG') {
      let nearestResistance = Infinity;
      for (let i = startScan; i < idx - 1; i++) {
        if (candles5m[i].high > entryPrice) {
          nearestResistance = Math.min(nearestResistance, candles5m[i].high);
        }
      }
      if (nearestResistance < Infinity && (nearestResistance - entryPrice) < requiredRoom * 0.8) {
        if (config.debugMode) console.log(`[EMA5][${symbol}] Major resistance too close (${nearestResistance}) → REJECTED: OPPOSING_STRUCTURE_TOO_CLOSE`);
        return buildRejectedSignal(symbol, 'OPPOSING_STRUCTURE_TOO_CLOSE', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20, emaCrossCount, stopDistance);
      }
    } else {
      let nearestSupport = -Infinity;
      for (let i = startScan; i < idx - 1; i++) {
        if (candles5m[i].low < entryPrice) {
          nearestSupport = Math.max(nearestSupport, candles5m[i].low);
        }
      }
      if (nearestSupport > -Infinity && (entryPrice - nearestSupport) < requiredRoom * 0.8) {
        if (config.debugMode) console.log(`[EMA5][${symbol}] Major support too close (${nearestSupport}) → REJECTED: OPPOSING_STRUCTURE_TOO_CLOSE`);
        return buildRejectedSignal(symbol, 'OPPOSING_STRUCTURE_TOO_CLOSE', dir, currentCandle, setup.currentEma5, setup.recentAvgRange, regime15m, volRatio, avgVol20, emaCrossCount, stopDistance);
      }
    }
  }

  // ── Compute Take Profit Targets ────────────────────────────────────────────
  const rr = config.riskReward ?? 1.5;
  const tp1 = dir === 'LONG' ? entryPrice + stopDistance * 1.0 : entryPrice - stopDistance * 1.0;
  const tp2 = dir === 'LONG' ? entryPrice + stopDistance * rr : entryPrice - stopDistance * rr;
  const tp3 = dir === 'LONG' ? entryPrice + stopDistance * (rr + 1.0) : entryPrice - stopDistance * (rr + 1.0);

  // Update state
  currentState.state = 'ENTRY_READY';
  currentState.direction = dir;
  currentState.lastTradedCandleTime = currentCandle.time;
  currentState.cooldownRemaining = config.cooldownCandles ?? 2;

  const setupScore = Math.min(99, Math.round(85 + (volRatio >= 1.2 ? 5 : 0) + (setup.bodyRatio >= 0.65 ? 5 : 0)));

  if (config.debugMode) {
    console.log(`[EMA5] Symbol: ${symbol} Timeframe: 5m Setup: ${dir} EMA5: ${setup.currentEma5.toFixed(4)} Entry: ${entryPrice.toFixed(4)} VolRatio: ${volRatio.toFixed(2)}x 15m: ${regime15m} FINAL: ${dir} ENTRY`);
  }

  return {
    strategySignalId: `eee_${symbol}_${currentCandle.time}`,
    symbol,
    direction: dir,
    entryPrice,
    sl,
    tp1,
    tp2,
    tp3,
    setupScore,
    candleTime: currentCandle.time,
    rejectionReason: null,
    reason: `EMA5 Exact PA (${dir}) - ${setup.interactionType} [15m ${regime15m}]`,
    regime15m,
    metrics: {
      ema5: setup.currentEma5,
      emaDistance: setup.emaDistance,
      recentAverageRange: setup.recentAvgRange,
      volumeRatio: volRatio,
      averageVolume: avgVol20,
      bodyRatio: setup.bodyRatio,
      closePosition: setup.closePosition,
      emaCrossCount,
      stopDistance,
      interactionType: setup.interactionType,
      riskReward: rr,
    },
  };
}

function buildRejectedSignal(
  symbol: string,
  rejectionReason: EeeRejectionCode,
  direction: EeeDirection,
  candle: EeeCandle,
  ema5: number,
  recentAverageRange: number,
  regime15m: EeeRegime15m,
  volumeRatio = 1.0,
  averageVolume = 0,
  emaCrossCount = 0,
  stopDistance = 0
): EeeSignal {
  return {
    strategySignalId: `eee_rej_${symbol}_${candle.time}`,
    symbol,
    direction,
    entryPrice: candle.close,
    sl: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    setupScore: 0,
    candleTime: candle.time,
    rejectionReason,
    reason: `Rejected: ${rejectionReason}`,
    regime15m,
    metrics: {
      ema5,
      emaDistance: Math.abs(candle.close - ema5),
      recentAverageRange,
      volumeRatio,
      averageVolume,
      bodyRatio: Math.abs(candle.close - candle.open) / Math.max(0.000001, candle.high - candle.low),
      closePosition: 0,
      emaCrossCount,
      stopDistance,
      interactionType: 'NONE',
      riskReward: 1.5,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discrete Bar-by-Bar Backtest Engine with Funnel Accounting
// ─────────────────────────────────────────────────────────────────────────────
export function backtestEma5ExactEntry(
  candles5m: EeeCandle[],
  candles15m: EeeCandle[],
  config: EeeConfig = {},
  symbol = 'BACKTEST'
): EeeBacktestSummary {
  const funnel: FilterFunnelStats = {
    totalBars: candles5m.length,
    exactSetupsDetected: 0,
    exactLongSetups: 0,
    exactShortSetups: 0,
    passedRegime: 0,
    passedVolume: 0,
    passedChop: 0,
    passedExtension: 0,
    passedOpposingSpace: 0,
    passedStopDistance: 0,
    executedTrades: 0,
    rejectionCounts: {
      REGIME_MISMATCH: 0,
      REGIME_NEUTRAL: 0,
      NOT_EXACT_EMA5_SETUP: 0,
      WEAK_PRICE_ACTION: 0,
      EMA_DISTANCE_TOO_LARGE: 0,
      LOW_VOLUME: 0,
      CHOPPY_MARKET: 0,
      OPPOSING_STRUCTURE_TOO_CLOSE: 0,
      OVEREXTENDED: 0,
      STOP_TOO_LARGE: 0,
      DUPLICATE_SIGNAL: 0,
      POSITION_ALREADY_OPEN: 0,
      COOLDOWN_ACTIVE: 0,
    },
  };

  const trades: {
    entryPrice: number;
    sl: number;
    tp1: number;
    tp2: number;
    direction: EeeDirection;
    entryTime: number;
    exitTime: number;
    pnlR: number;
    candlesHeld: number;
  }[] = [];

  const state = createEeeState();
  let inPosition: {
    direction: EeeDirection;
    entryPrice: number;
    sl: number;
    tp1: number;
    tp2: number;
    entryTime: number;
    startIndex: number;
    breakevenMoved: boolean;
  } | null = null;

  for (let i = 30; i < candles5m.length; i++) {
    const currentCandle = candles5m[i];

    // Manage active position if open
    if (inPosition) {
      const { direction, entryPrice, sl, tp2, startIndex, breakevenMoved } = inPosition;
      const risk = Math.abs(entryPrice - sl);
      let exitR: number | null = null;
      let exitTime = currentCandle.time;

      if (direction === 'LONG') {
        // Breakeven check at +1R
        if (config.breakevenEnabled && !breakevenMoved && currentCandle.high >= entryPrice + risk) {
          inPosition.sl = entryPrice;
          inPosition.breakevenMoved = true;
        }

        if (currentCandle.low <= inPosition.sl) {
          exitR = inPosition.breakevenMoved ? 0 : -1.0;
        } else if (currentCandle.high >= tp2) {
          exitR = config.riskReward ?? 1.5;
        }
      } else {
        if (config.breakevenEnabled && !breakevenMoved && currentCandle.low <= entryPrice - risk) {
          inPosition.sl = entryPrice;
          inPosition.breakevenMoved = true;
        }

        if (currentCandle.high >= inPosition.sl) {
          exitR = inPosition.breakevenMoved ? 0 : -1.0;
        } else if (currentCandle.low <= tp2) {
          exitR = config.riskReward ?? 1.5;
        }
      }

      if (exitR !== null) {
        trades.push({
          entryPrice,
          sl,
          tp1: inPosition.tp1,
          tp2,
          direction,
          entryTime: inPosition.entryTime,
          exitTime,
          pnlR: exitR,
          candlesHeld: i - startIndex,
        });
        inPosition = null;
        state.state = 'COOLDOWN';
        state.cooldownRemaining = config.cooldownCandles ?? 2;
      }
      continue;
    }

    // Align 15m candles without lookahead (only 15m candles strictly closed before current 5m candle)
    const aligned15m = candles15m.filter((c) => c.time <= currentCandle.time - 300);

    // Track Stage A setups independently for funnel
    const setupOnly = detectExactEMA5Setup(candles5m, config, i);
    if (setupOnly) {
      funnel.exactSetupsDetected++;
      if (setupOnly.direction === 'LONG') funnel.exactLongSetups++;
      else funnel.exactShortSetups++;
    }

    // Full evaluation
    const signal = evaluateEma5ExactEntry(candles5m, aligned15m, config, state, symbol, i);

    if (signal) {
      if (signal.rejectionReason) {
        funnel.rejectionCounts[signal.rejectionReason] = (funnel.rejectionCounts[signal.rejectionReason] || 0) + 1;
      } else {
        funnel.passedRegime++;
        funnel.passedVolume++;
        funnel.passedChop++;
        funnel.passedExtension++;
        funnel.passedOpposingSpace++;
        funnel.passedStopDistance++;
        funnel.executedTrades++;

        inPosition = {
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          sl: signal.sl,
          tp1: signal.tp1,
          tp2: signal.tp2,
          entryTime: signal.candleTime,
          startIndex: i,
          breakevenMoved: false,
        };
      }
    }
  }

  // Calculate statistics
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.pnlR > 0).length;
  const losingTrades = trades.filter((t) => t.pnlR < 0).length;
  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const totalWinR = trades.filter((t) => t.pnlR > 0).reduce((sum, t) => sum + t.pnlR, 0);
  const totalLossR = Math.abs(trades.filter((t) => t.pnlR < 0).reduce((sum, t) => sum + t.pnlR, 0));
  const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? 99 : 0;
  const netPnLR = trades.reduce((sum, t) => sum + t.pnlR, 0);

  let peak = 0;
  let running = 0;
  let maxDd = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;

  for (const t of trades) {
    running += t.pnlR;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) maxDd = dd;

    if (t.pnlR < 0) {
      currentLossStreak++;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else if (t.pnlR > 0) {
      currentLossStreak = 0;
    }
  }

  const averageR = totalTrades > 0 ? netPnLR / totalTrades : 0;
  const averageWinningR = winningTrades > 0 ? totalWinR / winningTrades : 0;
  const averageLosingR = losingTrades > 0 ? totalLossR / losingTrades : 0;
  const averageHoldingCandles =
    totalTrades > 0 ? trades.reduce((sum, t) => sum + t.candlesHeld, 0) / totalTrades : 0;

  return {
    funnel,
    totalTrades,
    winningTrades,
    losingTrades,
    winRatePct: parseFloat(winRatePct.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    netPnLR: parseFloat(netPnLR.toFixed(2)),
    maxDrawdownR: parseFloat(maxDd.toFixed(2)),
    averageR: parseFloat(averageR.toFixed(2)),
    averageWinningR: parseFloat(averageWinningR.toFixed(2)),
    averageLosingR: parseFloat(averageLosingR.toFixed(2)),
    longestLosingStreak: maxLossStreak,
    averageHoldingCandles: parseFloat(averageHoldingCandles.toFixed(1)),
  };
}
