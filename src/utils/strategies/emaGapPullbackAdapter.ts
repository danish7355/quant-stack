// src/utils/strategies/emaGapPullbackAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for EMA Gap Pullback strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateEmaGapPullback } from './emaGapPullback.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateEmaGapPullbackAdapter(
  entryCandles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!entryCandles || entryCandles.length < 30) return null;

  const result = evaluateEmaGapPullback(entryCandles, htfCandles, currentPrice, settings);
  if (!result || result.status !== 'confirmed') return null;

  const {
    direction: rawDirection,
    entry,
    stop,
    score = 70,
    atr = entryCandles[entryCandles.length - 1].close * 0.01,
    signalTime = entryCandles[entryCandles.length - 1].time || Date.now(),
    reason = '5 EMA Gap Pullback',
  } = result as any;

  if (!rawDirection || entry === undefined || stop === undefined) return null;

  const direction: 'long' | 'short' = rawDirection.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  // Apply unified risk buffer & target recalculation
  const riskAdjusted = applyRiskBuffer(entry, stop, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'emaGapPullback',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const context = detectRegime(entryCandles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:emaGapPullback:${direction}:${signalTime}`;
  const riskQualityScore = computeRiskQualityScore(riskAdjusted.rr1, settings.minRR ?? 1.0);

  const signal: StrategySignal = {
    signalId,
    direction,
    entry: riskAdjusted.entry,
    sl: riskAdjusted.sl,
    tp1: riskAdjusted.tp1,
    tp2: riskAdjusted.tp2,
    tp3: riskAdjusted.tp3,
    riskPerUnit: riskAdjusted.riskPerUnit,
    rr1: riskAdjusted.rr1,
    rr2: riskAdjusted.rr2,
    rr3: riskAdjusted.rr3,
    bufferApplied: riskAdjusted.bufferApplied,
    setupScore: Math.min(100, Math.max(0, score)),
    regimeConfidence: context.confidence,
    riskQualityScore,
    strategy: 'emaGapPullback',
    reason,
    candleTime: signalTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'emaGapPullback',
    symbol,
    timeframe,
    direction,
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    atr,
    setupScore: signal.setupScore,
    rejectionReason: null,
  });

  return signal;
}
