// src/utils/strategies/ema5PaVolume.ts
// ─────────────────────────────────────────────────────────────────────────────
// EMA 5 Price Action Gap + Volume Strategy (ID: EMA5_PA_VOLUME_V1)
//
// Core Philosophy:
// - 5 EMA for short-term location and momentum.
// - Pure price action for candle behavior, rejection, and structure.
// - Volume participation vs recent 20-candle average.
// - 15m market structure (HH/HL or LH/LL) as regime filter.
// - Zero lagging indicators (no RSI, MACD, ADX, EMA20/50, Bollinger Bands).
// - Enters near the beginning of the expansion, not late.
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketRegime15m = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type StrategyVersion = 'A' | 'B' | 'C' | 'D';
// A: EMA5 + Price Action
// B: EMA5 + Price Action + Volume
// C: EMA5 + Price Action + Volume + 15m Regime (Canonical Default)
// D: EMA5 + Price Action + Volume + 15m Regime + 5m Structure Breakout

export type EntryMode = 'MOMENTUM' | 'RETEST';
export type TpMode = 'FIXED_RR' | 'STRUCTURE';

export type StrategyState =
  | 'IDLE'
  | 'SETUP_DETECTED'
  | 'WAITING_FOR_ENTRY'
  | 'IN_POSITION'
  | 'COOLDOWN';

export interface Ema5PaVolumeConfig {
  emaLength?: number;                 // Default: 5
  volumeLookback?: number;            // Default: 20 completed candles
  minVolumeRatio?: number;            // Default: 1.10 (at least 10% above 20-period avg)
  minGapRangeRatio?: number;          // Default: 0.20 (EMA gap >= 20% of recent avg range)
  maxGapRangeRatio?: number;          // Default: 1.00 (EMA gap <= 100% of recent avg range)
  recentRangeLookback?: number;       // Default: 5 completed candles
  maxEmaCrosses?: number;             // Default: 3 crosses in last 10 candles
  emaCrossLookback?: number;          // Default: 10 candles
  emaSlopeLookback?: number;          // Default: 2 completed candles
  minBodyRatio?: number;              // Default: 0.50 (real body >= 50% of total range)
  minClosePosition?: number;          // Default: 0.65 (close in top/bottom 35% of range)
  maxOppositeWickRatio?: number;      // Default: 1.50 (reject if opposite wick > 1.5 * body)
  maxSetupRangeRatio?: number;        // Default: 2.00 (reject if candle range > 2x avg range)
  maxStopRangeRatio?: number;         // Default: 2.00 (stop distance <= 2x avg range)
  slBufferRatio?: number;             // Default: 0.05 of recent range
  setupExpiryCandles?: number;        // Default: 2 candles
  retestExpiryCandles?: number;       // Default: 3 candles
  cooldownCandles?: number;           // Default: 2 candles
  requireStructureBreak?: boolean;    // Default: false
  entryMode?: EntryMode;              // Default: 'MOMENTUM'
  riskReward?: number;                // Default: 1.5
  tpMode?: TpMode;                    // Default: 'FIXED_RR'
  breakevenEnabled?: boolean;         // Default: true
  breakevenTriggerR?: number;         // Default: 1.0
  version?: StrategyVersion;          // Default: 'C'
}

export const DEFAULT_CONFIG: Required<Ema5PaVolumeConfig> = {
  emaLength: 5,
  volumeLookback: 20,
  minVolumeRatio: 1.10,
  minGapRangeRatio: 0.20,
  maxGapRangeRatio: 1.00,
  recentRangeLookback: 5,
  maxEmaCrosses: 3,
  emaCrossLookback: 10,
  emaSlopeLookback: 2,
  minBodyRatio: 0.50,
  minClosePosition: 0.65,
  maxOppositeWickRatio: 1.50,
  maxSetupRangeRatio: 2.00,
  maxStopRangeRatio: 2.00,
  slBufferRatio: 0.05,
  setupExpiryCandles: 2,
  retestExpiryCandles: 3,
  cooldownCandles: 2,
  requireStructureBreak: false,
  entryMode: 'MOMENTUM',
  riskReward: 1.5,
  tpMode: 'FIXED_RR',
  breakevenEnabled: true,
  breakevenTriggerR: 1.0,
  version: 'C',
};

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

export interface Ema5PaVolumeSignal {
  strategySignalId: string;
  strategyId: 'EMA5_PA_VOLUME_V1';
  symbol: string;
  timeframe: '5m';
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPerUnit: number;
  riskReward: number;
  setupScore: number;
  regime15m: MarketRegime15m;
  version: StrategyVersion;
  entryMode: EntryMode;
  candleTime: number;
  metrics: {
    ema5: number;
    emaGap: number;
    recentAvgRange: number;
    gapRangeRatio: number;
    volume: number;
    avgVolume20: number;
    volumeRatio: number;
    bodyRatio: number;
    closePosition: number;
    emaCrosses10: number;
    emaSlopePositive: boolean;
    setupCandleRange: number;
    recentSwingHigh?: number;
    recentSwingLow?: number;
  };
  rejectionReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONFIRMED MARKET STRUCTURE DETECTOR (15M) — ZERO LOOKAHEAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds confirmed swing points on 15m.
 * A swing high at index `i` is confirmed ONLY when 2 subsequent bars have closed
 * with lower highs. Never evaluates unconfirmed current/recent candles.
 */
export function findConfirmedSwings(
  candles: Candle[],
  leftBars = 2,
  rightBars = 2
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (candles.length < leftBars + rightBars + 1) {
    return { highs, lows };
  }

  // Last confirmed index is candles.length - 1 - rightBars
  const maxIdx = candles.length - 1 - rightBars;

  for (let i = leftBars; i <= maxIdx; i++) {
    const c = candles[i];

    // Check Swing High
    let isHigh = true;
    for (let l = 1; l <= leftBars; l++) {
      if (candles[i - l].high >= c.high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let r = 1; r <= rightBars; r++) {
        if (candles[i + r].high >= c.high) {
          isHigh = false;
          break;
        }
      }
    }
    if (isHigh) {
      highs.push({ index: i, time: c.time, price: c.high, type: 'HIGH' });
    }

    // Check Swing Low
    let isLow = true;
    for (let l = 1; l <= leftBars; l++) {
      if (candles[i - l].low <= c.low) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let r = 1; r <= rightBars; r++) {
        if (candles[i + r].low <= c.low) {
          isLow = false;
          break;
        }
      }
    }
    if (isLow) {
      lows.push({ index: i, time: c.time, price: c.low, type: 'LOW' });
    }
  }

  return { highs, lows };
}

/**
 * Classifies 15-minute market structure into BULLISH, BEARISH, or NEUTRAL.
 * - BULLISH: HH + HL OR broken major swing high and holding above it.
 * - BEARISH: LH + LL OR broken major swing low and holding below it.
 * - NEUTRAL: Unclear / overlapping / ranging.
 */
export function determine15mRegime(candles15m: Candle[]): {
  regime: MarketRegime15m;
  recentSwingHigh?: number;
  recentSwingLow?: number;
  reason: string;
} {
  if (!candles15m || candles15m.length < 15) {
    return { regime: 'NEUTRAL', reason: 'Insufficient 15m candles (<15)' };
  }

  const { highs, lows } = findConfirmedSwings(candles15m, 2, 2);
  const lastClose = candles15m[candles15m.length - 1].close;

  if (highs.length < 2 || lows.length < 2) {
    return { regime: 'NEUTRAL', reason: 'Insufficient confirmed swing points (<2)' };
  }

  const hLast = highs[highs.length - 1];
  const hPrev = highs[highs.length - 2];
  const lLast = lows[lows.length - 1];
  const lPrev = lows[lows.length - 2];

  const isHH = hLast.price > hPrev.price;
  const isHL = lLast.price > lPrev.price;
  const isLH = hLast.price < hPrev.price;
  const isLL = lLast.price < lPrev.price;

  // Bullish: HH + HL
  if (isHH && isHL && lastClose >= lLast.price) {
    return {
      regime: 'BULLISH',
      recentSwingHigh: hLast.price,
      recentSwingLow: lLast.price,
      reason: `Bullish structure: HH (${hPrev.price.toFixed(2)} -> ${hLast.price.toFixed(2)}) & HL (${lPrev.price.toFixed(2)} -> ${lLast.price.toFixed(2)})`,
    };
  }

  // Bullish break of prior high & holding above
  if (lastClose > hLast.price && lastClose > lLast.price) {
    return {
      regime: 'BULLISH',
      recentSwingHigh: hLast.price,
      recentSwingLow: lLast.price,
      reason: `Bullish structure: price broke above confirmed resistance ${hLast.price.toFixed(2)}`,
    };
  }

  // Bearish: LH + LL
  if (isLH && isLL && lastClose <= hLast.price) {
    return {
      regime: 'BEARISH',
      recentSwingHigh: hLast.price,
      recentSwingLow: lLast.price,
      reason: `Bearish structure: LH (${hPrev.price.toFixed(2)} -> ${hLast.price.toFixed(2)}) & LL (${lPrev.price.toFixed(2)} -> ${lLast.price.toFixed(2)})`,
    };
  }

  // Bearish break of prior low & holding below
  if (lastClose < lLast.price && lastClose < hLast.price) {
    return {
      regime: 'BEARISH',
      recentSwingHigh: hLast.price,
      recentSwingLow: lLast.price,
      reason: `Bearish structure: price broke below confirmed support ${lLast.price.toFixed(2)}`,
    };
  }

  return {
    regime: 'NEUTRAL',
    recentSwingHigh: hLast.price,
    recentSwingLow: lLast.price,
    reason: 'Neutral structure: overlapping swings / range bound',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INDICATOR UTILITIES (5 EMA ONLY)
// ─────────────────────────────────────────────────────────────────────────────

export function calculateEma5(closes: number[], period = 5): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateEma5Series(candles: Candle[], period = 5): number[] {
  return calculateEma5(candles.map(c => c.close), period);
}

export function calculateAverageRange(candles: Candle[], lookback = 5, endIdx?: number): number {
  const lastIdx = endIdx !== undefined ? endIdx : candles.length - 1;
  const rangeLookback = Math.min(lookback, lastIdx);
  let rangeSum = 0;
  for (let i = lastIdx - rangeLookback; i < lastIdx; i++) {
    rangeSum += candles[i].high - candles[i].low;
  }
  return rangeSum / (rangeLookback || 1);
}

export function calculateAverageVolume(candles: Candle[], lookback = 20, endIdx?: number): number {
  const lastIdx = endIdx !== undefined ? endIdx : candles.length - 1;
  const volLookback = Math.min(lookback, lastIdx);
  let volSum = 0;
  for (let i = lastIdx - volLookback; i < lastIdx; i++) {
    volSum += candles[i].volume || 0;
  }
  return volSum / (volLookback || 1);
}

export function countEmaCrosses(candles: Candle[], emaSeries: number[], lookback = 10, endIdx?: number): number {
  const lastIdx = endIdx !== undefined ? endIdx : candles.length - 1;
  const crossLookback = Math.min(lookback, lastIdx);
  let crosses = 0;
  for (let i = lastIdx - crossLookback; i < lastIdx; i++) {
    if (i <= 0) continue;
    const prevDiff = candles[i - 1].close - emaSeries[i - 1];
    const currDiff = candles[i].close - emaSeries[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      crosses++;
    }
  }
  return crosses;
}

export class Ema5PaVolumeStateMachine {
  private state: StrategyState = 'IDLE';
  private config: Required<Ema5PaVolumeConfig>;
  private pendingSetup: { direction: 'LONG' | 'SHORT'; entryPrice: number; sl: number; tp: number; candleTime: number } | null = null;
  private currentTrade: { entryTime: number; direction: 'LONG' | 'SHORT'; entryPrice: number; sl: number; tp: number; holdingCandles: number } | null = null;
  private completedTrades: BacktestTrade[] = [];
  private cooldownRemaining = 0;

  constructor(options: Ema5PaVolumeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  public getState(): StrategyState {
    return this.state;
  }

  public getCompletedTrades(): BacktestTrade[] {
    return this.completedTrades;
  }

  public onSetupDetected(setup: { direction: 'LONG' | 'SHORT'; entryPrice: number; sl: number; tp: number; candleTime: number }): void {
    if (this.state !== 'IDLE') return;
    this.pendingSetup = setup;
    this.state = 'WAITING_FOR_ENTRY';
  }

  public update(candle: Candle): void {
    if (this.state === 'COOLDOWN') {
      this.cooldownRemaining--;
      if (this.cooldownRemaining <= 0) {
        this.state = 'IDLE';
      }
      return;
    }

    if (this.state === 'WAITING_FOR_ENTRY' && this.pendingSetup) {
      this.state = 'IN_POSITION';
      this.currentTrade = {
        entryTime: candle.time,
        direction: this.pendingSetup.direction,
        entryPrice: candle.open,
        sl: this.pendingSetup.sl,
        tp: this.pendingSetup.tp,
        holdingCandles: 0,
      };
      this.pendingSetup = null;
    }

    if (this.state === 'IN_POSITION' && this.currentTrade) {
      this.currentTrade.holdingCandles++;
      const isLong = this.currentTrade.direction === 'LONG';
      const risk = Math.abs(this.currentTrade.entryPrice - this.currentTrade.sl);

      // Breakeven check
      if (this.config.breakevenEnabled) {
        if (isLong && candle.high >= this.currentTrade.entryPrice + risk * this.config.breakevenTriggerR) {
          this.currentTrade.sl = Math.max(this.currentTrade.sl, this.currentTrade.entryPrice);
        } else if (!isLong && candle.low <= this.currentTrade.entryPrice - risk * this.config.breakevenTriggerR) {
          this.currentTrade.sl = Math.min(this.currentTrade.sl, this.currentTrade.entryPrice);
        }
      }

      // Check TP / SL
      let closed = false;
      let exitPrice = 0;
      let result: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'LOSS';

      if (isLong) {
        if (candle.low <= this.currentTrade.sl) {
          closed = true;
          exitPrice = this.currentTrade.sl;
          result = exitPrice >= this.currentTrade.entryPrice ? (exitPrice === this.currentTrade.entryPrice ? 'BREAKEVEN' : 'WIN') : 'LOSS';
        } else if (candle.high >= this.currentTrade.tp) {
          closed = true;
          exitPrice = this.currentTrade.tp;
          result = 'WIN';
        }
      } else {
        if (candle.high >= this.currentTrade.sl) {
          closed = true;
          exitPrice = this.currentTrade.sl;
          result = exitPrice <= this.currentTrade.entryPrice ? (exitPrice === this.currentTrade.entryPrice ? 'BREAKEVEN' : 'WIN') : 'LOSS';
        } else if (candle.low <= this.currentTrade.tp) {
          closed = true;
          exitPrice = this.currentTrade.tp;
          result = 'WIN';
        }
      }

      if (closed) {
        const pnl = isLong ? exitPrice - this.currentTrade.entryPrice : this.currentTrade.entryPrice - exitPrice;
        const pnlR = risk > 0 ? pnl / risk : (result === 'WIN' ? 1.5 : -1);
        this.completedTrades.push({
          entryTime: this.currentTrade.entryTime,
          exitTime: candle.time,
          direction: this.currentTrade.direction,
          entryPrice: this.currentTrade.entryPrice,
          exitPrice,
          sl: this.currentTrade.sl,
          tp: this.currentTrade.tp,
          pnl,
          pnlR,
          result,
          holdingCandles: this.currentTrade.holdingCandles,
        });
        this.currentTrade = null;
        this.state = 'COOLDOWN';
        this.cooldownRemaining = this.config.cooldownCandles;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORE STRATEGY EVALUATION ENGINE (5M)
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateEma5PaVolume(
  candles5m: Candle[],
  candles15m: Candle[] = [],
  options: Ema5PaVolumeConfig = {},
  symbol = 'BTCUSDT'
): Ema5PaVolumeSignal | null {
  const cfg: Required<Ema5PaVolumeConfig> = { ...DEFAULT_CONFIG, ...options };

  if (!candles5m || candles5m.length < 30) {
    return null;
  }

  const lastIdx = candles5m.length - 1;
  const setupCandle = candles5m[lastIdx];
  const closes = candles5m.map(c => c.close);
  const ema5Series = calculateEma5(closes, cfg.emaLength);
  const currentEma5 = ema5Series[lastIdx];
  const prevEma5 = ema5Series[lastIdx - 1];

  // 1. Recent Average True Candle Range (previous 5 completed candles)
  const rangeLookback = Math.min(cfg.recentRangeLookback, lastIdx);
  let rangeSum = 0;
  for (let i = lastIdx - rangeLookback; i < lastIdx; i++) {
    rangeSum += candles5m[i].high - candles5m[i].low;
  }
  const recentAvgRange = rangeSum / (rangeLookback || 1);
  if (recentAvgRange <= 0) return null;

  // 2. Volume calculation: Average of previous 20 completed candles (EXCLUDING setup candle)
  const volLookback = Math.min(cfg.volumeLookback, lastIdx);
  let volSum = 0;
  for (let i = lastIdx - volLookback; i < lastIdx; i++) {
    volSum += candles5m[i].volume || 0;
  }
  const avgVolume20 = volSum / (volLookback || 1);
  const volumeRatio = avgVolume20 > 0 ? setupCandle.volume / avgVolume20 : 1.0;

  // 3. EMA5 Cross count in previous 10 completed candles (Chop filter)
  const crossLookback = Math.min(cfg.emaCrossLookback, lastIdx);
  let emaCrosses10 = 0;
  for (let i = lastIdx - crossLookback; i < lastIdx; i++) {
    if (i <= 0) continue;
    const prevDiff = candles5m[i - 1].close - ema5Series[i - 1];
    const currDiff = candles5m[i].close - ema5Series[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      emaCrosses10++;
    }
  }

  // 4. EMA5 Slope (compare current vs 2 candles ago)
  const slopeLookbackIdx = Math.max(0, lastIdx - cfg.emaSlopeLookback);
  const ema5SlopeDiff = currentEma5 - ema5Series[slopeLookbackIdx];
  const emaSlopePositive = ema5SlopeDiff > 0;
  const emaSlopeNegative = ema5SlopeDiff < 0;

  // 5. Setup Candle Price Action metrics
  const candleRange = setupCandle.high - setupCandle.low;
  const candleBody = Math.abs(setupCandle.close - setupCandle.open);
  const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0;
  const isBullishCandle = setupCandle.close > setupCandle.open;
  const isBearishCandle = setupCandle.close < setupCandle.open;

  // 6. 15m Market Structure Regime
  const regimeInfo = determine15mRegime(candles15m);
  const regime15m = regimeInfo.regime;

  // 7. Recent 5m swings for structure break & SL
  const swings5m = findConfirmedSwings(candles5m.slice(0, lastIdx), 2, 2);
  const recent5mSwingHigh = swings5m.highs.length > 0 ? swings5m.highs[swings5m.highs.length - 1].price : undefined;
  const recent5mSwingLow = swings5m.lows.length > 0 ? swings5m.lows[swings5m.lows.length - 1].price : undefined;

  // ─────────────────────────────────────────────────────────────────────────
  // EVALUATE LONG SETUP
  // ─────────────────────────────────────────────────────────────────────────
  if (isBullishCandle && setupCandle.close > currentEma5) {
    const emaGap = setupCandle.close - currentEma5;
    const gapRangeRatio = emaGap / recentAvgRange;
    const closePosition = candleRange > 0 ? (setupCandle.close - setupCandle.low) / candleRange : 0;
    const upperWick = setupCandle.high - Math.max(setupCandle.open, setupCandle.close);

    let rejectionReason: string | null = null;

    // Gate: 15m Regime (Version C & D)
    if ((cfg.version === 'C' || cfg.version === 'D') && regime15m !== 'BULLISH') {
      rejectionReason = regime15m === 'NEUTRAL' ? 'REGIME_NEUTRAL' : 'REGIME_MISMATCH';
    }
    // Gate: Previous candle location (must move from below/near EMA5)
    else if (candles5m[lastIdx - 1].close > prevEma5 + recentAvgRange * 0.5) {
      rejectionReason = 'OVEREXTENDED';
    }
    // Gate: Minimum Gap
    else if (gapRangeRatio < cfg.minGapRangeRatio) {
      rejectionReason = 'EMA_GAP_TOO_SMALL';
    }
    // Gate: Maximum Gap
    else if (gapRangeRatio > cfg.maxGapRangeRatio) {
      rejectionReason = 'EMA_GAP_TOO_LARGE';
    }
    // Gate: Candle Quality (Body ratio >= 0.50)
    else if (bodyRatio < cfg.minBodyRatio) {
      rejectionReason = 'WEAK_BULLISH_CANDLE';
    }
    // Gate: Close in upper 35%
    else if (closePosition < cfg.minClosePosition) {
      rejectionReason = 'WEAK_BULLISH_CANDLE';
    }
    // Gate: Strong opposite wick rejection
    else if (upperWick > candleBody * cfg.maxOppositeWickRatio) {
      rejectionReason = 'STRONG_OPPOSITE_WICK';
    }
    // Gate: Huge single candle
    else if (candleRange > recentAvgRange * cfg.maxSetupRangeRatio) {
      rejectionReason = 'HUGE_SETUP_CANDLE';
    }
    // Gate: Volume participation (Version B, C, D)
    else if (cfg.version !== 'A' && volumeRatio < cfg.minVolumeRatio) {
      rejectionReason = 'LOW_VOLUME';
    }
    // Gate: EMA5 Cross Count / Chop
    else if (emaCrosses10 > cfg.maxEmaCrosses) {
      rejectionReason = 'TOO_MANY_EMA_CROSSES';
    }
    // Gate: EMA5 Rising Slope
    else if (!emaSlopePositive) {
      rejectionReason = 'EMA_NOT_SLOPING';
    }
    // Gate: Structure Breakout (Version D or if configured)
    else if ((cfg.version === 'D' || cfg.requireStructureBreak) && recent5mSwingHigh && setupCandle.close <= recent5mSwingHigh) {
      rejectionReason = 'STRUCTURE_NOT_BROKEN';
    }

    // Stop Loss Placement (structure low - buffer)
    const swingLowCandidate = recent5mSwingLow ?? setupCandle.low;
    const slBuffer = recentAvgRange * cfg.slBufferRatio;
    const rawSl = Math.min(swingLowCandidate, setupCandle.low) - slBuffer;
    const entryPrice = setupCandle.close;
    const stopDistance = entryPrice - rawSl;

    if (!rejectionReason && stopDistance > recentAvgRange * cfg.maxStopRangeRatio) {
      rejectionReason = 'STOP_TOO_LARGE';
    }
    if (!rejectionReason && stopDistance <= 0) {
      rejectionReason = 'INVALID_STOP_DISTANCE';
    }

    // Quality Scoring
    let setupScore = 0;
    if (regime15m === 'BULLISH') setupScore += 1;
    if (setupCandle.close > currentEma5) setupScore += 1;
    if (bodyRatio >= 0.60) setupScore += 1;
    if (gapRangeRatio >= 0.30) setupScore += 1;
    if (volumeRatio >= 1.30) setupScore += 1;
    if (recent5mSwingHigh && setupCandle.close > recent5mSwingHigh) setupScore += 1;

    const riskReward = cfg.riskReward;
    const tp1 = entryPrice + stopDistance * riskReward;
    const tp2 = entryPrice + stopDistance * 2.5;
    const tp3 = entryPrice + stopDistance * 3.5;

    const signalId = `${symbol}:5m:EMA5_PA_VOLUME_V1:LONG:${setupCandle.time}`;

    const signal: Ema5PaVolumeSignal = {
      strategySignalId: signalId,
      strategyId: 'EMA5_PA_VOLUME_V1',
      symbol,
      timeframe: '5m',
      direction: 'LONG',
      entryPrice,
      sl: rawSl,
      tp1,
      tp2,
      tp3,
      riskPerUnit: stopDistance,
      riskReward,
      setupScore: Math.round((setupScore / 6) * 100),
      regime15m,
      version: cfg.version,
      entryMode: cfg.entryMode,
      candleTime: setupCandle.time,
      metrics: {
        ema5: currentEma5,
        emaGap,
        recentAvgRange,
        gapRangeRatio,
        volume: setupCandle.volume,
        avgVolume20,
        volumeRatio,
        bodyRatio,
        closePosition,
        emaCrosses10,
        emaSlopePositive,
        setupCandleRange: candleRange,
        recentSwingHigh: recent5mSwingHigh,
        recentSwingLow: recent5mSwingLow,
      },
      rejectionReason,
    };

    return signal;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVALUATE SHORT SETUP
  // ─────────────────────────────────────────────────────────────────────────
  if (isBearishCandle && setupCandle.close < currentEma5) {
    const emaGap = currentEma5 - setupCandle.close;
    const gapRangeRatio = emaGap / recentAvgRange;
    const closePosition = candleRange > 0 ? (setupCandle.high - setupCandle.close) / candleRange : 0;
    const lowerWick = Math.min(setupCandle.open, setupCandle.close) - setupCandle.low;

    let rejectionReason: string | null = null;

    // Gate: 15m Regime (Version C & D)
    if ((cfg.version === 'C' || cfg.version === 'D') && regime15m !== 'BEARISH') {
      rejectionReason = regime15m === 'NEUTRAL' ? 'REGIME_NEUTRAL' : 'REGIME_MISMATCH';
    }
    // Gate: Previous candle location (must move from above/near EMA5)
    else if (candles5m[lastIdx - 1].close < prevEma5 - recentAvgRange * 0.5) {
      rejectionReason = 'OVEREXTENDED';
    }
    // Gate: Minimum Gap
    else if (gapRangeRatio < cfg.minGapRangeRatio) {
      rejectionReason = 'EMA_GAP_TOO_SMALL';
    }
    // Gate: Maximum Gap
    else if (gapRangeRatio > cfg.maxGapRangeRatio) {
      rejectionReason = 'EMA_GAP_TOO_LARGE';
    }
    // Gate: Candle Quality (Body ratio >= 0.50)
    else if (bodyRatio < cfg.minBodyRatio) {
      rejectionReason = 'WEAK_BEARISH_CANDLE';
    }
    // Gate: Close in lower 35%
    else if (closePosition < cfg.minClosePosition) {
      rejectionReason = 'WEAK_BEARISH_CANDLE';
    }
    // Gate: Strong opposite wick rejection
    else if (lowerWick > candleBody * cfg.maxOppositeWickRatio) {
      rejectionReason = 'STRONG_OPPOSITE_WICK';
    }
    // Gate: Huge single candle
    else if (candleRange > recentAvgRange * cfg.maxSetupRangeRatio) {
      rejectionReason = 'HUGE_SETUP_CANDLE';
    }
    // Gate: Volume participation (Version B, C, D)
    else if (cfg.version !== 'A' && volumeRatio < cfg.minVolumeRatio) {
      rejectionReason = 'LOW_VOLUME';
    }
    // Gate: EMA5 Cross Count / Chop
    else if (emaCrosses10 > cfg.maxEmaCrosses) {
      rejectionReason = 'TOO_MANY_EMA_CROSSES';
    }
    // Gate: EMA5 Falling Slope
    else if (!emaSlopeNegative) {
      rejectionReason = 'EMA_NOT_SLOPING';
    }
    // Gate: Structure Breakout (Version D or if configured)
    else if ((cfg.version === 'D' || cfg.requireStructureBreak) && recent5mSwingLow && setupCandle.close >= recent5mSwingLow) {
      rejectionReason = 'STRUCTURE_NOT_BROKEN';
    }

    // Stop Loss Placement (structure high + buffer)
    const swingHighCandidate = recent5mSwingHigh ?? setupCandle.high;
    const slBuffer = recentAvgRange * cfg.slBufferRatio;
    const rawSl = Math.max(swingHighCandidate, setupCandle.high) + slBuffer;
    const entryPrice = setupCandle.close;
    const stopDistance = rawSl - entryPrice;

    if (!rejectionReason && stopDistance > recentAvgRange * cfg.maxStopRangeRatio) {
      rejectionReason = 'STOP_TOO_LARGE';
    }
    if (!rejectionReason && stopDistance <= 0) {
      rejectionReason = 'INVALID_STOP_DISTANCE';
    }

    // Quality Scoring
    let setupScore = 0;
    if (regime15m === 'BEARISH') setupScore += 1;
    if (setupCandle.close < currentEma5) setupScore += 1;
    if (bodyRatio >= 0.60) setupScore += 1;
    if (gapRangeRatio >= 0.30) setupScore += 1;
    if (volumeRatio >= 1.30) setupScore += 1;
    if (recent5mSwingLow && setupCandle.close < recent5mSwingLow) setupScore += 1;

    const riskReward = cfg.riskReward;
    const tp1 = Math.max(0.0001, entryPrice - stopDistance * riskReward);
    const tp2 = Math.max(0.0001, entryPrice - stopDistance * 2.5);
    const tp3 = Math.max(0.0001, entryPrice - stopDistance * 3.5);

    const signalId = `${symbol}:5m:EMA5_PA_VOLUME_V1:SHORT:${setupCandle.time}`;

    const signal: Ema5PaVolumeSignal = {
      strategySignalId: signalId,
      strategyId: 'EMA5_PA_VOLUME_V1',
      symbol,
      timeframe: '5m',
      direction: 'SHORT',
      entryPrice,
      sl: rawSl,
      tp1,
      tp2,
      tp3,
      riskPerUnit: stopDistance,
      riskReward,
      setupScore: Math.round((setupScore / 6) * 100),
      regime15m,
      version: cfg.version,
      entryMode: cfg.entryMode,
      candleTime: setupCandle.time,
      metrics: {
        ema5: currentEma5,
        emaGap,
        recentAvgRange,
        gapRangeRatio,
        volume: setupCandle.volume,
        avgVolume20,
        volumeRatio,
        bodyRatio,
        closePosition,
        emaCrosses10,
        emaSlopePositive,
        setupCandleRange: candleRange,
        recentSwingHigh: recent5mSwingHigh,
        recentSwingLow: recent5mSwingLow,
      },
      rejectionReason,
    };

    return signal;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BACKTESTING & FILTER COMPARISON ENGINE (VERSIONS A, B, C, D)
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp: number;
  pnl: number;
  pnlR: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  holdingCandles: number;
}

export interface BacktestSummary {
  version: StrategyVersion;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnL: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgR: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  longestLosingStreak: number;
  longTrades: number;
  shortTrades: number;
  avgHoldingCandles: number;
  totalSetupsEvaluated: number;
  totalSetupsRejected: number;
  rejectionBreakdown: Record<string, number>;
  trades: BacktestTrade[];
}

/**
 * Event-driven candle simulator for EMA5_PA_VOLUME_V1.
 * Tests without lookahead on historical 5m and 15m candle sequences.
 */
export function backtestEma5PaVolume(
  candles5m: Candle[],
  candles15m: Candle[] = [],
  options: Ema5PaVolumeConfig = {},
  symbol = 'BTCUSDT'
): BacktestSummary {
  const cfg = { ...DEFAULT_CONFIG, ...options };
  const rejectionBreakdown: Record<string, number> = {};
  const trades: BacktestTrade[] = [];

  let inPosition = false;
  let currentTrade: Partial<BacktestTrade> | null = null;
  let cooldownRemaining = 0;
  let peakEquity = 10000;
  let currentEquity = 10000;
  let maxDrawdownPct = 0;
  let totalSetupsEvaluated = 0;
  let totalSetupsRejected = 0;

  // We need at least 35 candles to begin evaluating
  for (let i = 35; i < candles5m.length - 1; i++) {
    const historical5m = candles5m.slice(0, i + 1);
    const currCandle = candles5m[i];
    const nextCandle = candles5m[i + 1];

    // Filter historical 15m up to current 5m candle timestamp (no lookahead)
    const historical15m = candles15m.filter(c => c.time <= currCandle.time);

    // Position Management
    if (inPosition && currentTrade) {
      currentTrade.holdingCandles = (currentTrade.holdingCandles || 0) + 1;

      if (currentTrade.direction === 'LONG') {
        // Breakeven check
        if (cfg.breakevenEnabled && currCandle.high >= currentTrade.entryPrice! + (currentTrade.entryPrice! - currentTrade.sl!) * cfg.breakevenTriggerR) {
          currentTrade.sl = Math.max(currentTrade.sl!, currentTrade.entryPrice!);
        }

        // Check SL hit
        if (currCandle.low <= currentTrade.sl!) {
          const exitPrice = currentTrade.sl!;
          const risk = currentTrade.entryPrice! - currentTrade.sl!;
          const pnl = exitPrice - currentTrade.entryPrice!;
          const pnlR = risk > 0 ? pnl / risk : -1;
          const result: 'WIN' | 'LOSS' | 'BREAKEVEN' = pnlR >= 0 ? (pnlR === 0 ? 'BREAKEVEN' : 'WIN') : 'LOSS';

          trades.push({
            entryTime: currentTrade.entryTime!,
            exitTime: currCandle.time,
            direction: 'LONG',
            entryPrice: currentTrade.entryPrice!,
            exitPrice,
            sl: currentTrade.sl!,
            tp: currentTrade.tp!,
            pnl,
            pnlR,
            result,
            holdingCandles: currentTrade.holdingCandles,
          });

          currentEquity += pnl * 10;
          peakEquity = Math.max(peakEquity, currentEquity);
          const dd = ((peakEquity - currentEquity) / peakEquity) * 100;
          maxDrawdownPct = Math.max(maxDrawdownPct, dd);

          inPosition = false;
          currentTrade = null;
          cooldownRemaining = cfg.cooldownCandles;
          continue;
        }

        // Check TP hit
        if (currCandle.high >= currentTrade.tp!) {
          const exitPrice = currentTrade.tp!;
          const risk = currentTrade.entryPrice! - currentTrade.sl!;
          const pnl = exitPrice - currentTrade.entryPrice!;
          const pnlR = risk > 0 ? pnl / risk : cfg.riskReward;

          trades.push({
            entryTime: currentTrade.entryTime!,
            exitTime: currCandle.time,
            direction: 'LONG',
            entryPrice: currentTrade.entryPrice!,
            exitPrice,
            sl: currentTrade.sl!,
            tp: currentTrade.tp!,
            pnl,
            pnlR,
            result: 'WIN',
            holdingCandles: currentTrade.holdingCandles,
          });

          currentEquity += pnl * 10;
          peakEquity = Math.max(peakEquity, currentEquity);

          inPosition = false;
          currentTrade = null;
          continue;
        }
      } else {
        // SHORT Trade Management
        // Breakeven check
        if (cfg.breakevenEnabled && currCandle.low <= currentTrade.entryPrice! - (currentTrade.sl! - currentTrade.entryPrice!) * cfg.breakevenTriggerR) {
          currentTrade.sl = Math.min(currentTrade.sl!, currentTrade.entryPrice!);
        }

        // Check SL hit
        if (currCandle.high >= currentTrade.sl!) {
          const exitPrice = currentTrade.sl!;
          const risk = currentTrade.sl! - currentTrade.entryPrice!;
          const pnl = currentTrade.entryPrice! - exitPrice;
          const pnlR = risk > 0 ? pnl / risk : -1;
          const result: 'WIN' | 'LOSS' | 'BREAKEVEN' = pnlR >= 0 ? (pnlR === 0 ? 'BREAKEVEN' : 'WIN') : 'LOSS';

          trades.push({
            entryTime: currentTrade.entryTime!,
            exitTime: currCandle.time,
            direction: 'SHORT',
            entryPrice: currentTrade.entryPrice!,
            exitPrice,
            sl: currentTrade.sl!,
            tp: currentTrade.tp!,
            pnl,
            pnlR,
            result,
            holdingCandles: currentTrade.holdingCandles,
          });

          currentEquity += pnl * 10;
          peakEquity = Math.max(peakEquity, currentEquity);
          const dd = ((peakEquity - currentEquity) / peakEquity) * 100;
          maxDrawdownPct = Math.max(maxDrawdownPct, dd);

          inPosition = false;
          currentTrade = null;
          cooldownRemaining = cfg.cooldownCandles;
          continue;
        }

        // Check TP hit
        if (currCandle.low <= currentTrade.tp!) {
          const exitPrice = currentTrade.tp!;
          const risk = currentTrade.sl! - currentTrade.entryPrice!;
          const pnl = currentTrade.entryPrice! - exitPrice;
          const pnlR = risk > 0 ? pnl / risk : cfg.riskReward;

          trades.push({
            entryTime: currentTrade.entryTime!,
            exitTime: currCandle.time,
            direction: 'SHORT',
            entryPrice: currentTrade.entryPrice!,
            exitPrice,
            sl: currentTrade.sl!,
            tp: currentTrade.tp!,
            pnl,
            pnlR,
            result: 'WIN',
            holdingCandles: currentTrade.holdingCandles,
          });

          currentEquity += pnl * 10;
          peakEquity = Math.max(peakEquity, currentEquity);

          inPosition = false;
          currentTrade = null;
          continue;
        }
      }
    }

    if (cooldownRemaining > 0) {
      cooldownRemaining--;
      continue;
    }

    if (inPosition) continue;

    // Evaluate setup at close of candle i
    const signal = evaluateEma5PaVolume(historical5m, historical15m, cfg, symbol);
    if (!signal) continue;

    totalSetupsEvaluated++;

    if (signal.rejectionReason) {
      totalSetupsRejected++;
      rejectionBreakdown[signal.rejectionReason] = (rejectionBreakdown[signal.rejectionReason] || 0) + 1;
      continue;
    }

    // Valid signal: Enter at open of NEXT candle (MOMENTUM mode)
    inPosition = true;
    currentTrade = {
      entryTime: nextCandle.time,
      direction: signal.direction,
      entryPrice: nextCandle.open,
      sl: signal.sl,
      tp: signal.tp1,
      holdingCandles: 0,
    };
  }

  // Calculate summary metrics
  const winningTrades = trades.filter(t => t.pnlR > 0).length;
  const losingTrades = trades.filter(t => t.pnlR < 0).length;
  const winRatePct = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const netPnL = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgR = trades.length > 0 ? trades.reduce((s, t) => s + t.pnlR, 0) / trades.length : 0;
  const avgWinningTrade = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLosingTrade = losingTrades > 0 ? grossLoss / losingTrades : 0;

  let longestLosingStreak = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.pnlR < 0) {
      currentStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const longTrades = trades.filter(t => t.direction === 'LONG').length;
  const shortTrades = trades.filter(t => t.direction === 'SHORT').length;
  const avgHoldingCandles = trades.length > 0 ? trades.reduce((s, t) => s + t.holdingCandles, 0) / trades.length : 0;

  return {
    version: cfg.version,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRatePct,
    grossProfit,
    grossLoss,
    netPnL,
    profitFactor,
    maxDrawdownPct,
    avgR,
    avgWinningTrade,
    avgLosingTrade,
    longestLosingStreak,
    longTrades,
    shortTrades,
    avgHoldingCandles,
    totalSetupsEvaluated,
    totalSetupsRejected,
    rejectionBreakdown,
    trades,
  };
}

/**
 * Runs comparative backtest across all four versions (A, B, C, D) on the exact same market data.
 */
export function compareEma5PaVolumeVersions(
  candles5m: Candle[],
  candles15m: Candle[] = [],
  baseConfig: Ema5PaVolumeConfig = {},
  symbol = 'BTCUSDT'
): Record<StrategyVersion, BacktestSummary> {
  const versions: StrategyVersion[] = ['A', 'B', 'C', 'D'];
  const results = {} as Record<StrategyVersion, BacktestSummary>;

  for (const v of versions) {
    results[v] = backtestEma5PaVolume(
      candles5m,
      candles15m,
      { ...baseConfig, version: v },
      symbol
    );
  }

  return results;
}
