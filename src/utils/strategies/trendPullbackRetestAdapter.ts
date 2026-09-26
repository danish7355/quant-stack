// src/utils/strategies/trendPullbackRetestAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for TREND_PULLBACK_RETEST strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateTrendPullbackRetest, createTprState, TprConfig, TprState } from './trendPullbackRetest.js';
import { StrategySignal } from './core/StrategySignal.js';
import { logger } from './core/logger.js';

export function evaluateTrendPullbackRetestAdapter(
  candles: any[],
  _htfCandles: any[] = [],
  currentPrice = 0,
  settings: TprConfig & { symbol?: string; timeframe?: string } = {},
  state?: TprState
): StrategySignal | null {
  if (!candles || candles.length < 60) return null;

  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  // Use caller-provided state (stateful per-symbol) or create a fresh one
  const resolvedState = state ?? createTprState();

  const signal = evaluateTrendPullbackRetest(candles, settings, resolvedState, symbol);

  if (!signal || signal.rejectionReason) {
    if (signal?.rejectionReason) {
      logger.warn({
        strategy: 'TREND_PULLBACK_RETEST',
        symbol,
        timeframe,
        direction: signal.direction,
        rejectionReason: signal.rejectionReason,
      });
    }
    return null;
  }

  const direction: 'long' | 'short' = signal.direction.toLowerCase() as 'long' | 'short';
  const entry = currentPrice > 0 ? currentPrice : signal.entryPrice;
  const riskPerUnit = Math.abs(entry - signal.sl);

  if (riskPerUnit <= 0) return null;

  const rr1 = Math.abs(signal.tp1 - entry) / riskPerUnit;
  const rr2 = Math.abs(signal.tp2 - entry) / riskPerUnit;
  const rr3 = signal.tp3 ? Math.abs(signal.tp3 - entry) / riskPerUnit : undefined;

  const signalId = `${symbol}:${timeframe}:trendPullbackRetest:${direction}:${signal.candleTime}`;

  const unifiedSignal: StrategySignal = {
    signalId,
    direction,
    entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    riskPerUnit,
    rr1,
    rr2,
    rr3,
    bufferApplied: 0,
    setupScore: signal.setupScore,
    regimeConfidence: Math.min(100, Math.round(55 + signal.trendScore * 7.5)),
    riskQualityScore: Math.min(100, Math.round(rr2 * 25)),
    strategy: 'TREND_PULLBACK_RETEST',
    reason: signal.reason,
    candleTime: signal.candleTime,
    symbol,
    timeframe,
    atr: signal.atr,
    context: {
      regime: 'trend',
      trendDirection: direction === 'long' ? 'bullish' : 'bearish',
      volatility: 'normal',
      confidence: Math.min(100, Math.round(55 + signal.trendScore * 7.5)),
      htfAgreement: signal.trendScore >= 5,
    },
    rejectionReason: null,
  };

  logger.info({
    strategy: 'TREND_PULLBACK_RETEST',
    symbol,
    timeframe,
    direction,
    entry: unifiedSignal.entry,
    sl: unifiedSignal.sl,
    tp1: unifiedSignal.tp1,
    setupScore: unifiedSignal.setupScore,
    trendScore: signal.trendScore,
    rejectionReason: null,
  });

  return unifiedSignal;
}
