// src/utils/strategies/macroRangeAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Macro Range Breakout strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { detectMacroRangeBreakout } from './macroRange.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateMacroRangeAdapter(
  candles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!candles || candles.length < 45) return null;

  const price = currentPrice || candles[candles.length - 1].close;
  const atr = settings.atr || price * 0.015;

  const result = detectMacroRangeBreakout(candles, price, atr);
  if (!result) return null;

  const {
    direction: rawDir,
    score = 80,
    sl,
    tp1,
    tp2,
    tp3,
  } = result;

  if (!rawDir || sl === undefined) return null;

  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  const riskAdjusted = applyRiskBuffer(price, sl, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'macroRange',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const candleTime = candles[candles.length - 1].time || Date.now();
  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:macroRange:${direction}:${candleTime}`;
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
    strategy: 'macroRange',
    reason: `Macro Range Breakout (${direction}) box [${result.boxLow?.toFixed(2)} - ${result.boxHigh?.toFixed(2)}]`,
    candleTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'macroRange',
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
