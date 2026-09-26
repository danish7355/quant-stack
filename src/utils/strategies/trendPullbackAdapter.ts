// src/utils/strategies/trendPullbackAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Trend Pullback strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateTrendPullback } from './trendPullback.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateTrendPullbackAdapter(
  tradeCandles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!tradeCandles || tradeCandles.length < 30) return null;

  const price = currentPrice || tradeCandles[tradeCandles.length - 1].close;
  const result = evaluateTrendPullback(tradeCandles, htfCandles, price, settings);
  if (!result) return null;

  const {
    direction: rawDir,
    entryPrice: entry,
    sl,
    score = 70,
    atr = tradeCandles[tradeCandles.length - 1].close * 0.015,
    signalTime = tradeCandles[tradeCandles.length - 1].time || Date.now(),
    reason = 'Trend Pullback',
  } = result;

  if (!rawDir || entry === undefined || sl === undefined) return null;

  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.tradeTimeframe || settings.timeframe || '15m';

  const riskAdjusted = applyRiskBuffer(entry, sl, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'trendPullback',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const context = detectRegime(tradeCandles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:trendPullback:${direction}:${signalTime}`;
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
    strategy: 'trendPullback',
    reason,
    candleTime: signalTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'trendPullback',
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
