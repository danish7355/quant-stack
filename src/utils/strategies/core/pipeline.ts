// src/utils/strategies/core/pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Central evaluation pipeline exactly as recommended in the review:
//
//   evaluateAllStrategies(context)
//   → filter valid
//   → validate
//   → rank
//   → select non-conflicting
//   → size + create orders
//
// Import and call runPipeline() from your AutoTrader scan loop.
// ─────────────────────────────────────────────────────────────────────────────
import { StrategySignal } from "./StrategySignal";
import { detectRegime, Candle } from "./regimeDetector";
import { filterAndRankSignals, ValidatedSignal, ValidationSettings } from "./signalValidator";
import { computePositionSize, AccountState, SizingSettings } from "./positionSizer";
import { logger } from "./logger";

export type StrategyFn = (
  candles: Candle[],
  htfCandles: Candle[],
  symbol: string,
  timeframe: string
) => StrategySignal | null;

export interface OrderIntent {
  signal: ValidatedSignal;
  quantity: number;
  notional: number;
  riskAmount: number;
  compositeScore: number;
}

export interface PipelineContext {
  candles: Candle[];
  htfCandles?: Candle[];
  symbol: string;
  timeframe: string;
  account: AccountState;
}

export interface PipelineConfig {
  strategies: StrategyFn[];
  sizingSettings: SizingSettings;
  validationSettings?: ValidationSettings;
  /** Max signals to pass to the order layer per evaluation cycle */
  maxOrdersPerCycle?: number;
}

/**
 * Run the full evaluation → validation → ranking → sizing pipeline.
 * Returns a list of OrderIntents that are ready to be sent to the OMS.
 */
export function runPipeline(
  ctx: PipelineContext,
  cfg: PipelineConfig
): OrderIntent[] {
  const { candles, htfCandles = [], symbol, timeframe, account } = ctx;
  const { strategies, sizingSettings, validationSettings = {}, maxOrdersPerCycle = 2 } = cfg;

  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);

  // ── 1. Evaluate all strategies ──────────────────────────────────────────
  const candidates: Array<StrategySignal | null> = strategies.map(fn => {
    try { return fn(candles, htfCandles, symbol, timeframe); }
    catch (err) {
      logger.error({ strategy: "unknown", rejectionReason: `exception:${(err as Error).message}` });
      return null;
    }
  });

  // Log rejected raw candidates
  candidates.forEach((c, idx) => {
    if (c === null) {
      logger.info({
        strategy: `strategy_${idx}`, symbol, timeframe,
        rejectionReason: "strategy_returned_null",
      });
    }
  });

  // ── 2. Validate + rank ──────────────────────────────────────────────────
  const ranked = filterAndRankSignals(candidates, context, validationSettings);

  // ── 3. Select non-conflicting (one per symbol:direction) ────────────────
  const seen = new Set<string>();
  const selected: ValidatedSignal[] = [];
  for (const sig of ranked) {
    const key = `${symbol}:${sig.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(sig);
    if (selected.length >= maxOrdersPerCycle) break;
  }

  // ── 4. Size each signal ─────────────────────────────────────────────────
  const orders: OrderIntent[] = [];
  for (const sig of selected) {
    const sizeResult = computePositionSize(sig.entry, sig.riskPerUnit, account, sizingSettings);
    if (sizeResult.quantity <= 0) {
      logger.warn({
        strategy: sig.strategy, symbol, timeframe,
        direction: sig.direction,
        rejectionReason: `sizing_blocked:${sizeResult.capReason}`,
      });
      continue;
    }
    orders.push({
      signal: sig,
      quantity: sizeResult.quantity,
      notional: sizeResult.notional,
      riskAmount: sizeResult.riskAmount,
      compositeScore: sig.compositeScore,
    });
    logger.info({
      strategy: sig.strategy, symbol, timeframe, direction: sig.direction,
      entry: sig.entry, sl: sig.sl, tp1: sig.tp1, atr: sig.atr,
      setupScore: sig.setupScore, regimeConfidence: sig.regimeConfidence,
      riskQualityScore: sig.riskQualityScore,
      rejectionReason: null,
      regime: context.regime, volatility: context.volatility,
    });
  }

  return orders;
}
