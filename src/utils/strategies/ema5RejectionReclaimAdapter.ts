// src/utils/strategies/ema5RejectionReclaimAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for EMA5_REJECTION_RECLAIM_V1 conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import {
  evaluateEma5RejectionReclaim,
  createErrState,
  ErrConfig,
  ErrState,
} from './ema5RejectionReclaim.js';
import { StrategySignal } from './core/StrategySignal.js';
import { logger } from './core/logger.js';

export function evaluateEma5RejectionReclaimAdapter(
  candles5m: any[],
  candles15m: any[] = [],
  currentPrice = 0,
  settings: ErrConfig & { symbol?: string; timeframe?: string } = {},
  state?: ErrState
): StrategySignal | null {
  if (!candles5m || candles5m.length < 30) return null;

  const symbol = settings.symbol || 'UNKNOWN';
  const resolvedState = state ?? createErrState();

  const signal = evaluateEma5RejectionReclaim(candles5m, candles15m, settings, resolvedState, symbol);

  if (!signal) return null;

  const direction: 'long' | 'short' = signal.direction.toLowerCase() === 'long' ? 'long' : 'short';
  const candleTime = signal.candleTime || candles5m[candles5m.length - 1]?.time || Date.now();

  if (signal.rejectionReason) {
    logger.warn({
      strategy: 'EMA5_REJECTION_RECLAIM_V1',
      symbol,
      timeframe: '5m',
      direction,
      rejectionReason: signal.rejectionReason,
      metrics: signal.metrics,
    });
    return null;
  }

  const entry = currentPrice || signal.entryPrice;
  const riskPerUnit = Math.abs(entry - signal.sl);
  const rr1 = riskPerUnit > 0 ? Math.abs(signal.tp1 - entry) / riskPerUnit : 1.0;
  const rr2 = riskPerUnit > 0 ? Math.abs(signal.tp2 - entry) / riskPerUnit : 1.5;
  const rr3 = riskPerUnit > 0 ? Math.abs(signal.tp3 - entry) / riskPerUnit : 2.5;

  const unifiedSignal: StrategySignal = {
    signalId: signal.strategySignalId,
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
    regimeConfidence: signal.regime15m === 'BULLISH' || signal.regime15m === 'BEARISH' ? 90 : 40,
    riskQualityScore: 90,
    strategy: 'EMA5_REJECTION_RECLAIM_V1',
    reason: signal.reason,
    candleTime,
    symbol,
    timeframe: '5m',
    atr: signal.metrics.recentAverageRange || 0,
    context: {
      regime: 'trend',
      trendDirection: direction === 'long' ? 'bullish' : 'bearish',
      volatility: 'normal',
      confidence: 90,
      htfAgreement: true,
    },
    rejectionReason: null,
  };

  logger.info({
    strategy: 'EMA5_REJECTION_RECLAIM_V1',
    symbol,
    timeframe: '5m',
    direction,
    entry: unifiedSignal.entry,
    sl: unifiedSignal.sl,
    tp1: unifiedSignal.tp1,
    tp2: unifiedSignal.tp2,
    setupScore: unifiedSignal.setupScore,
    rejectionReason: null,
  });

  return unifiedSignal;
}
