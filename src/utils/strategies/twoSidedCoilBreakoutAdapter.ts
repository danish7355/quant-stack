// src/utils/strategies/twoSidedCoilBreakoutAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Two-Sided Coil Breakout strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateTwoSidedCoilBreakout } from './twoSidedCoilBreakout.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateTwoSidedCoilBreakoutAdapter(
  candles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!candles || candles.length < 30) return null;

  const result = evaluateTwoSidedCoilBreakout(candles, htfCandles, {
    symbol: settings.symbol || 'UNKNOWN',
    timeframe: settings.timeframe || '15m',
    minRrRatio: settings.minRR ?? 2.0,
    aggressiveBreakoutMode: settings.aggressiveBreakoutMode ?? true,
    ...settings,
  });

  if (!result || !result.status.startsWith('VALID')) return null;

  const rawDir = result.side;
  const entry = result.entry || currentPrice || candles[candles.length - 1].close;
  const stop = result.stop;
  const atr = result.coil?.atrAtCoil || (entry * 0.015);
  const score = result.score || 70;

  if (!rawDir || stop === undefined) return null;

  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  const riskAdjusted = applyRiskBuffer(entry, stop, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'twoSidedCoilBreakout',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const candleTime = candles[candles.length - 1].time || Date.now();
  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:twoSidedCoilBreakout:${direction}:${candleTime}`;
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
    strategy: 'twoSidedCoilBreakout',
    reason: `${result.setup} (${result.status})`,
    candleTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'twoSidedCoilBreakout',
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
