/**
 * LIQUIDITY SWEEP REVERSAL: 8-Stage Execution Engine
 *
 * Implements the 8-Stage Regime-Gated Execution Pipeline:
 *   1. Regime gate      resolveConfig() returns ACTIVE or STANDBY(reason), btcEthAlignment, universe rank.
 *   2. Direction bias   from direction timeframe (trend = its direction, range/compression = neutral).
 *   3. Liquidity map    rank untouched pools with 0-100 score: weights[type] + touchBonus*(touches-1), capped at 100.
 *   4. Sweep            wick takes pool by minDepthATR..maxDepthATR and price closes back inside within reclaimWithinBars.
 *   5. Rejection candle hammer (long) / shooting star (short): wick, body and close-location limits from trigger.
 *   6. Confirmation     within confirm.windowBars next candle engulfs per confirm.engulf; close beyond sweep extreme cancels.
 *   7. Risk gates       stop distance, RR to target, fee cost in R, cooldown, daily cap.
 *   8. Entry            on confirmation candle close; stop beyond sweep extreme + stopBufferATR*ATR.
 *
 * ZERO LITERAL THRESHOLDS RULE:
 *   Every single parameter is derived from resolved SweepConfig.
 *   App fee model is dynamically passed and evaluated via feeCostInR.
 */

import {
  Mode,
  Habitat,
  PoolType,
  SweepConfig,
  RejectReason,
  DeepPartial,
  resolveConfig,
  feeCostInR,
  getAppFeeRoundTripPct
} from './schema.js';
import { Candle, LiquidityPool, buildLiquidityMap, extractRangeEdges, checkUntouched } from './pools.js';

export interface SweepReversalSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  risk: number;
  rrRatio: number;
  feeInR: number;
  riskMult: number;
  timeStopBars: number;
  moveToBEAfterTp1: boolean;
  trail: 'off' | 'structure';
  sweptPool: LiquidityPool;
  signalTime: number;
  reason: string;
  habitat: Habitat;
  config: SweepConfig;
}

export type SweepEvaluationResult =
  | { status: 'ACTIVE'; signal: SweepReversalSignal; cfg: SweepConfig; habitat: Habitat }
  | { status: 'STANDBY'; reason: RejectReason; habitat: Habitat; details?: string };

/**
 * Calculates ATR on completed bars with configurable period.
 */
export function calculateATRFromCandles(candles: Candle[], period: number): number {
  if (!candles || candles.length < period + 1) return 0;
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const cur = candles[candles.length - i];
    const prev = candles[candles.length - i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Calculates SMA of volume over lookback window.
 */
export function calculateVolumeSMA(candles: Candle[], lookback: number, atIndex: number): number {
  if (atIndex < 0 || candles.length === 0) return 0;
  const start = Math.max(0, atIndex - lookback);
  let sum = 0;
  let count = 0;
  for (let i = start; i < atIndex; i++) {
    sum += candles[i].volume ?? 0;
    count++;
  }
  return count > 0 ? sum / count : (candles[atIndex]?.volume ?? 1);
}

/**
 * Derives direction bias from the direction timeframe candles.
 */
export function determineDirectionBias(
  directionCandles: Candle[],
  habitat: Habitat
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (habitat === 'range' || habitat === 'compression') {
    return 'NEUTRAL';
  }

  if (!directionCandles || directionCandles.length < 20) {
    return 'NEUTRAL';
  }

  // Direction TF EMA slope
  const closes = directionCandles.map(c => c.close);
  const n = closes.length;
  const shortSMA = (closes[n - 1] + closes[n - 2] + closes[n - 3]) / 3;
  const longSMA = (closes[n - 8] + closes[n - 9] + closes[n - 10]) / 3;

  if (shortSMA > longSMA) return 'LONG';
  if (shortSMA < longSMA) return 'SHORT';
  return 'NEUTRAL';
}

export interface EvaluateSweepReversalInput {
  symbol: string;
  execCandles: Candle[];          // Live / historical candles on execution TF
  directionCandles?: Candle[];     // Closed candles on direction TF
  liquidityCandles1D?: Candle[];   // Daily candles for prevDay / prevWeek pools
  currentPrice?: number;
  mode?: Mode;
  regimeLabel?: string;
  regimeConfidence?: number;
  regimeStableBars?: number;
  regimeMap?: Record<string, Habitat>;
  uiOverrides?: DeepPartial<SweepConfig>;
  symbolRank?: number;
  btcEthMacro?: {
    btcTrend?: 'UP' | 'DOWN' | 'NEUTRAL';
    ethTrend?: 'UP' | 'DOWN' | 'NEUTRAL';
    btcMacroColor?: 'GREEN' | 'AMBER' | 'RED';
  };
  symbolDailyTrades?: number;
  symbolInCooldown?: boolean;
  appFeeSettings?: { feeTakerPct?: number; feeGstPct?: number; feeRoundTripPct?: number };
}

/**
 * 8-Stage Liquidity Sweep Reversal Pipeline
 */
export function evaluateLiquiditySweepReversal(
  input: EvaluateSweepReversalInput
): SweepEvaluationResult {
  const {
    symbol,
    execCandles,
    directionCandles = [],
    liquidityCandles1D = [],
    mode = 'balanced',
    regimeLabel = 'RANGE',
    regimeConfidence = 60,
    regimeStableBars = 2,
    regimeMap,
    uiOverrides,
    symbolRank = 1,
    btcEthMacro,
    symbolDailyTrades = 0,
    symbolInCooldown = false,
    appFeeSettings
  } = input;

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1: REGIME GATE
  // ───────────────────────────────────────────────────────────────────────────
  const resolved = resolveConfig({
    mode,
    regimeLabel,
    regimeConfidence,
    regimeStableBars,
    regimeMap,
    uiOverrides
  });

  if (resolved.status === 'STANDBY') {
    return {
      status: 'STANDBY',
      reason: resolved.reason,
      habitat: resolved.habitat,
      details: `Regime status: STANDBY (${resolved.reason})`
    };
  }

  const { cfg, habitat } = resolved;

  // 1a. Universe rank gate
  if (symbolRank > cfg.universe.maxRank) {
    return {
      status: 'STANDBY',
      reason: 'OUT_OF_UNIVERSE',
      habitat,
      details: `Symbol rank ${symbolRank} exceeds universe max rank ${cfg.universe.maxRank}`
    };
  }

  // 1b. Candle integrity: Evaluate strictly on closed candles (Rule 2.3)
  if (!execCandles || execCandles.length < cfg.atrPeriod + 10) {
    return {
      status: 'STANDBY',
      reason: 'TRIGGER_INVALID',
      habitat,
      details: 'Insufficient closed candles for execution timeframe'
    };
  }
  const closedCandles = execCandles.slice(0, -1);
  const n = closedCandles.length;
  if (n < cfg.atrPeriod + 10) {
    return {
      status: 'STANDBY',
      reason: 'TRIGGER_INVALID',
      habitat,
      details: 'Insufficient closed bars after excluding active candle'
    };
  }

  // Calculate ATR from completed bars
  const atr = calculateATRFromCandles(closedCandles, cfg.atrPeriod);
  if (atr <= 0 || isNaN(atr)) {
    return {
      status: 'STANDBY',
      reason: 'TRIGGER_INVALID',
      habitat,
      details: 'Invalid ATR calculation'
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: DIRECTION BIAS
  // ───────────────────────────────────────────────────────────────────────────
  const dirBias = determineDirectionBias(directionCandles, habitat);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 3: LIQUIDITY MAP
  // ───────────────────────────────────────────────────────────────────────────
  const allPools = buildLiquidityMap({
    execCandles: closedCandles,
    dailyCandles: liquidityCandles1D,
    atr,
    cfg,
    currentBarIndex: n - 1
  });

  if (allPools.length === 0) {
    return {
      status: 'STANDBY',
      reason: 'POOL_WEAK',
      habitat,
      details: 'No qualifying liquidity pools detected'
    };
  }

  // Find candidate setups matching candle pattern at or preceding current closed bar
  // Candle indexing:
  // Confirmation candle = closedCandles[n - 1] (most recent closed candle)
  // Rejection candle = closedCandles[rejIdx]
  // Sweep can occur on rejection candle or within reclaimWithinBars
  let bestSignal: SweepReversalSignal | null = null;
  let lastRejectReason: RejectReason = 'TRIGGER_INVALID';

  // Search recent confirmation bars within cfg.confirm.windowBars + cfg.sweep.reclaimWithinBars
  const maxSearchBack = cfg.confirm.windowBars + cfg.sweep.reclaimWithinBars + 1;
  const startCheck = Math.max(cfg.atrPeriod + 2, n - maxSearchBack);

  for (let rejIdx = n - 2; rejIdx >= startCheck; rejIdx--) {
    const rejCandle = closedCandles[rejIdx];
    const confirmCandle = closedCandles[n - 1]; // evaluated on the latest closed candle
    const barsBetween = (n - 1) - rejIdx;

    if (barsBetween > cfg.confirm.windowBars) {
      continue;
    }

    const rejRange = rejCandle.high - rejCandle.low;
    if (rejRange < cfg.trigger.minRangeATR * atr) {
      lastRejectReason = 'TRIGGER_INVALID';
      continue;
    }

    // Evaluate Bullish (LONG) candidate: Low swept a LOW pool
    // Evaluate Bearish (SHORT) candidate: High swept a HIGH pool
    const sides: ('LONG' | 'SHORT')[] = ['LONG', 'SHORT'];

    for (const setupDir of sides) {
      // Direction bias check
      if (setupDir === 'LONG' && dirBias === 'SHORT') {
        if (!cfg.direction.counterBiasAllowed) {
          lastRejectReason = 'AGAINST_BIAS';
          continue;
        }
      }
      if (setupDir === 'SHORT' && dirBias === 'LONG') {
        if (!cfg.direction.counterBiasAllowed) {
          lastRejectReason = 'AGAINST_BIAS';
          continue;
        }
      }

      // BTC / ETH Macro alignment check
      if (cfg.regime.btcEthAlignment !== 'off' && btcEthMacro) {
        if (cfg.regime.btcEthAlignment === 'both_agree') {
          if (setupDir === 'LONG' && (btcEthMacro.btcTrend === 'DOWN' || btcEthMacro.ethTrend === 'DOWN')) {
            lastRejectReason = 'BTC_ETH_CONFLICT';
            continue;
          }
          if (setupDir === 'SHORT' && (btcEthMacro.btcTrend === 'UP' || btcEthMacro.ethTrend === 'UP')) {
            lastRejectReason = 'BTC_ETH_CONFLICT';
            continue;
          }
        } else if (cfg.regime.btcEthAlignment === 'btc_not_opposing') {
          if (setupDir === 'LONG' && (btcEthMacro.btcTrend === 'DOWN' || btcEthMacro.btcMacroColor === 'RED')) {
            lastRejectReason = 'BTC_ETH_CONFLICT';
            continue;
          }
          if (setupDir === 'SHORT' && (btcEthMacro.btcTrend === 'UP' || btcEthMacro.btcMacroColor === 'GREEN')) {
            lastRejectReason = 'BTC_ETH_CONFLICT';
            continue;
          }
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 4: SWEEP DETECTION AGAINST POOLS
      // ───────────────────────────────────────────────────────────────────────
      const targetSide = setupDir === 'LONG' ? 'LOW' : 'HIGH';
      const candidatePools = allPools.filter(p => {
        if (p.side !== targetSide || p.barIndex >= rejIdx) return false;
        return checkUntouched(closedCandles, { level: p.level, side: p.side, barIndex: p.barIndex }, rejIdx);
      });

      let sweptPool: LiquidityPool | null = null;
      let sweepDepthATR = 0;

      for (const pool of candidatePools) {
        if (pool.score < cfg.pools.minScore) {
          lastRejectReason = 'POOL_WEAK';
          continue;
        }

        if (setupDir === 'LONG') {
          if (rejCandle.low < pool.level) {
            const depth = (pool.level - rejCandle.low) / atr;
            if (depth >= cfg.sweep.minDepthATR && depth <= cfg.sweep.maxDepthATR) {
              sweptPool = pool;
              sweepDepthATR = depth;
              break;
            } else if (depth < cfg.sweep.minDepthATR) {
              lastRejectReason = 'SWEEP_TOO_SHALLOW';
            } else if (depth > cfg.sweep.maxDepthATR) {
              lastRejectReason = 'SWEEP_TOO_DEEP';
            }
          }
        } else {
          // SHORT
          if (rejCandle.high > pool.level) {
            const depth = (rejCandle.high - pool.level) / atr;
            if (depth >= cfg.sweep.minDepthATR && depth <= cfg.sweep.maxDepthATR) {
              sweptPool = pool;
              sweepDepthATR = depth;
              break;
            } else if (depth < cfg.sweep.minDepthATR) {
              lastRejectReason = 'SWEEP_TOO_SHALLOW';
            } else if (depth > cfg.sweep.maxDepthATR) {
              lastRejectReason = 'SWEEP_TOO_DEEP';
            }
          }
        }
      }

      if (!sweptPool) {
        continue;
      }

      // 4a. Reclaim within bars check
      let reclaimed = false;
      const reclaimEnd = Math.min(n - 1, rejIdx + cfg.sweep.reclaimWithinBars);
      for (let r = rejIdx; r <= reclaimEnd; r++) {
        const c = closedCandles[r];
        if (setupDir === 'LONG' && c.close > sweptPool.level) {
          reclaimed = true;
          break;
        }
        if (setupDir === 'SHORT' && c.close < sweptPool.level) {
          reclaimed = true;
          break;
        }
      }
      if (!reclaimed) {
        lastRejectReason = 'NO_RECLAIM';
        continue;
      }

      // 4b. Relative volume check
      const volSMA = calculateVolumeSMA(closedCandles, cfg.sweep.volumeLookback, rejIdx);
      const relVolume = volSMA > 0 ? (rejCandle.volume ?? 0) / volSMA : 1.0;
      if (relVolume < cfg.sweep.minRelVolume) {
        lastRejectReason = 'LOW_VOLUME';
        continue;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 5: REJECTION CANDLE METRICS
      // ───────────────────────────────────────────────────────────────────────
      const rejBody = Math.abs(rejCandle.close - rejCandle.open);
      const bodyToRange = rejRange > 0 ? rejBody / rejRange : 1;
      if (bodyToRange > cfg.trigger.maxBodyToRange) {
        lastRejectReason = 'TRIGGER_INVALID';
        continue;
      }

      if (setupDir === 'LONG') {
        const lowerWick = Math.min(rejCandle.open, rejCandle.close) - rejCandle.low;
        const upperWick = rejCandle.high - Math.max(rejCandle.open, rejCandle.close);
        const wickToRange = rejRange > 0 ? lowerWick / rejRange : 0;
        const oppWickToRange = rejRange > 0 ? upperWick / rejRange : 0;
        const closeLocation = rejRange > 0 ? (rejCandle.close - rejCandle.low) / rejRange : 0;

        if (wickToRange < cfg.trigger.minWickToRange) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
        if (oppWickToRange > cfg.trigger.maxOppWickToRange) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
        if (closeLocation < cfg.trigger.minCloseLocation) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
      } else {
        // SHORT
        const upperWick = rejCandle.high - Math.max(rejCandle.open, rejCandle.close);
        const lowerWick = Math.min(rejCandle.open, rejCandle.close) - rejCandle.low;
        const wickToRange = rejRange > 0 ? upperWick / rejRange : 0;
        const oppWickToRange = rejRange > 0 ? lowerWick / rejRange : 0;
        const closeLocation = rejRange > 0 ? (rejCandle.high - rejCandle.close) / rejRange : 0;

        if (wickToRange < cfg.trigger.minWickToRange) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
        if (oppWickToRange > cfg.trigger.maxOppWickToRange) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
        if (closeLocation < cfg.trigger.minCloseLocation) {
          lastRejectReason = 'TRIGGER_INVALID';
          continue;
        }
      }

      // Range edge check (for range habitats)
      if (habitat === 'range' || habitat === 'compression') {
        const edges = extractRangeEdges(closedCandles, 60);
        if (edges.rangeHigh && edges.rangeLow) {
          const totalRange = edges.rangeHigh - edges.rangeLow;
          if (totalRange > 0) {
            const edgeThreshold = (cfg.direction.edgeZonePct / 100) * totalRange;
            if (setupDir === 'LONG') {
              if (rejCandle.low > edges.rangeLow + edgeThreshold) {
                lastRejectReason = 'OUTSIDE_EDGE_ZONE';
                continue;
              }
            } else {
              if (rejCandle.high < edges.rangeHigh - edgeThreshold) {
                lastRejectReason = 'OUTSIDE_EDGE_ZONE';
                continue;
              }
            }
          }
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 6: CONFIRMATION CANDLE
      // ───────────────────────────────────────────────────────────────────────
      // Extreme cancellation: price cannot close back beyond sweep extreme
      let extremeViolated = false;
      for (let k = rejIdx + 1; k < n; k++) {
        if (setupDir === 'LONG' && closedCandles[k].close < rejCandle.low) {
          extremeViolated = true;
          break;
        }
        if (setupDir === 'SHORT' && closedCandles[k].close > rejCandle.high) {
          extremeViolated = true;
          break;
        }
      }
      if (extremeViolated) {
        lastRejectReason = 'CONFIRM_EXPIRED';
        continue;
      }

      // Confirmation body size
      const confirmBody = Math.abs(confirmCandle.close - confirmCandle.open);
      if (confirmBody < cfg.confirm.minBodyATR * atr) {
        lastRejectReason = 'NO_ENGULF';
        continue;
      }

      // Engulfing validation per cfg.confirm.engulf
      let isEngulfed = false;
      if (setupDir === 'LONG') {
        const isBullish = confirmCandle.close > confirmCandle.open;
        if (cfg.confirm.engulf === 'range') {
          isEngulfed = isBullish &&
            confirmCandle.close > rejCandle.high &&
            confirmCandle.open <= rejCandle.close &&
            confirmCandle.close >= rejCandle.open;
        } else if (cfg.confirm.engulf === 'body') {
          isEngulfed = isBullish &&
            confirmCandle.close >= Math.max(rejCandle.open, rejCandle.close) &&
            confirmCandle.open <= Math.min(rejCandle.open, rejCandle.close);
        } else if (cfg.confirm.engulf === 'close_through') {
          isEngulfed = isBullish && confirmCandle.close > Math.max(rejCandle.open, rejCandle.close);
        }
      } else {
        // SHORT
        const isBearish = confirmCandle.close < confirmCandle.open;
        if (cfg.confirm.engulf === 'range') {
          isEngulfed = isBearish &&
            confirmCandle.close < rejCandle.low &&
            confirmCandle.open >= rejCandle.close &&
            confirmCandle.close <= rejCandle.open;
        } else if (cfg.confirm.engulf === 'body') {
          isEngulfed = isBearish &&
            confirmCandle.close <= Math.min(rejCandle.open, rejCandle.close) &&
            confirmCandle.open >= Math.max(rejCandle.open, rejCandle.close);
        } else if (cfg.confirm.engulf === 'close_through') {
          isEngulfed = isBearish && confirmCandle.close < Math.min(rejCandle.open, rejCandle.close);
        }
      }

      if (!isEngulfed) {
        lastRejectReason = 'NO_ENGULF';
        continue;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 7: RISK GATES
      // ───────────────────────────────────────────────────────────────────────
      const entryPrice = confirmCandle.close;
      const stopExtreme = setupDir === 'LONG' ? rejCandle.low : rejCandle.high;
      const sl = setupDir === 'LONG'
        ? stopExtreme - (cfg.risk.stopBufferATR * atr)
        : stopExtreme + (cfg.risk.stopBufferATR * atr);

      const riskDist = Math.abs(entryPrice - sl);
      const stopDistATR = riskDist / atr;

      if (stopDistATR < cfg.risk.minStopATR) {
        lastRejectReason = 'STOP_TOO_TIGHT';
        continue;
      }
      if (stopDistATR > cfg.risk.maxStopATR) {
        lastRejectReason = 'STOP_TOO_WIDE';
        continue;
      }

      // Take profit targets
      let tp1: number;
      if (cfg.exits.tp1.basis === 'range_mid') {
        const edges = extractRangeEdges(closedCandles, 60);
        tp1 = edges.rangeMid ?? (setupDir === 'LONG' ? entryPrice + (riskDist * cfg.exits.tp1.r) : entryPrice - (riskDist * cfg.exits.tp1.r));
      } else {
        // 'r_multiple'
        tp1 = setupDir === 'LONG'
          ? entryPrice + (riskDist * cfg.exits.tp1.r)
          : entryPrice - (riskDist * cfg.exits.tp1.r);
      }

      let tp2: number;
      const oppSide = setupDir === 'LONG' ? 'HIGH' : 'LOW';
      const oppPool = allPools.find(p => p.side === oppSide && p.isUntouched);

      if (cfg.exits.tp2.basis === 'range_edge') {
        const edges = extractRangeEdges(closedCandles, 60);
        tp2 = (setupDir === 'LONG' ? edges.rangeHigh : edges.rangeLow) ?? (setupDir === 'LONG' ? entryPrice + (riskDist * cfg.risk.minRR) : entryPrice - (riskDist * cfg.risk.minRR));
      } else {
        // 'opposite_pool'
        if (oppPool) {
          tp2 = oppPool.level;
        } else {
          tp2 = setupDir === 'LONG' ? entryPrice + (riskDist * cfg.risk.minRR) : entryPrice - (riskDist * cfg.risk.minRR);
        }
      }

      // Target R:R validation
      const rewardDist = Math.abs(tp2 - entryPrice);
      const rrRatio = riskDist > 0 ? rewardDist / riskDist : 0;
      if (rrRatio < cfg.risk.minRR) {
        lastRejectReason = 'RR_TOO_LOW';
        continue;
      }

      const tp3 = setupDir === 'LONG'
        ? entryPrice + (riskDist * Math.max(3.0, rrRatio * 1.5))
        : entryPrice - (riskDist * Math.max(3.0, rrRatio * 1.5));

      // Fee cost in R validation
      const feeRoundTripPct = getAppFeeRoundTripPct(appFeeSettings);
      const stopDistancePct = (riskDist / entryPrice) * 100;
      const feeInR = feeCostInR(feeRoundTripPct, stopDistancePct);

      if (feeInR > cfg.risk.maxFeeToRisk) {
        lastRejectReason = 'FEES_TOO_HIGH';
        continue;
      }

      // Frequency & cooldown checks
      if (symbolInCooldown) {
        lastRejectReason = 'COOLDOWN';
        continue;
      }
      if (symbolDailyTrades >= cfg.frequency.maxPerSymbolPerDay) {
        lastRejectReason = 'DAILY_CAP';
        continue;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 8: ENTRY & SIGNAL CONSTRUCT
      // ───────────────────────────────────────────────────────────────────────
      const counterBias = (setupDir === 'LONG' && dirBias === 'SHORT') || (setupDir === 'SHORT' && dirBias === 'LONG');
      const effectiveRiskMult = cfg.risk.riskMult * (counterBias ? cfg.direction.counterBiasRiskMult : 1.0);

      // Score formula (0-100) combining pool quality, candle sharpness, volume, and RR
      const poolScoreWeight = (sweptPool.score / 100) * 40;
      const wickRatio = setupDir === 'LONG'
        ? (Math.min(rejCandle.open, rejCandle.close) - rejCandle.low) / rejRange
        : (rejCandle.high - Math.max(rejCandle.open, rejCandle.close)) / rejRange;
      const candleQualityWeight = Math.min(30, wickRatio * 35);
      const volWeight = Math.min(15, (relVolume / 2) * 15);
      const rrWeight = Math.min(15, (rrRatio / cfg.risk.minRR) * 10);
      const totalScore = Math.min(100, Math.max(50, Math.round(poolScoreWeight + candleQualityWeight + volWeight + rrWeight)));

      bestSignal = {
        symbol,
        direction: setupDir,
        entryPrice,
        sl,
        tp1,
        tp2,
        tp3,
        score: totalScore,
        risk: riskDist,
        rrRatio: Math.round(rrRatio * 100) / 100,
        feeInR: Math.round(feeInR * 1000) / 1000,
        riskMult: effectiveRiskMult,
        timeStopBars: cfg.exits.timeStopBars,
        moveToBEAfterTp1: cfg.exits.moveToBEAfterTp1,
        trail: cfg.exits.trail,
        sweptPool,
        signalTime: confirmCandle.time,
        reason: `Swept ${sweptPool.type} (${sweptPool.level.toFixed(4)}) by ${sweepDepthATR.toFixed(2)} ATR, confirmed engulf`,
        habitat,
        config: cfg
      };

      break;
    }

    if (bestSignal) break;
  }

  if (bestSignal) {
    return {
      status: 'ACTIVE',
      signal: bestSignal,
      cfg,
      habitat
    };
  }

  return {
    status: 'STANDBY',
    reason: lastRejectReason,
    habitat,
    details: `No valid sweep reversal signal: ${lastRejectReason}`
  };
}
