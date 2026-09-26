// src/utils/strategies/volatilityCompressionAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Volatility Compression Breakout strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import {
  evaluateVcbDetailed,
  calculateATR,
  detectCompression,
  detectBreakout,
  determineStopLoss,
  calculateVcbTargets,
} from './volatilityCompression.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateVolatilityCompressionAdapter(
  candles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!candles || candles.length < 30) return null;

  const price = currentPrice || candles[candles.length - 1].close;
  const decision = evaluateVcbDetailed(candles, htfCandles, price, settings);

  if (!decision || decision.decision !== 'TRADE_ALLOWED' || !decision.direction) {
    return null;
  }

  const direction: 'long' | 'short' = decision.direction.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  const atrs = calculateATR(candles, 14);
  const atr = atrs[atrs.length - 1] || price * 0.015;

  const previousCandles = candles.slice(0, -1);
  const compression = detectCompression(previousCandles, atr, atr, settings);
  const rawSl = determineStopLoss(decision.direction, compression, atr, settings, candles, price);
  const rawTargets = calculateVcbTargets(price, decision.direction, Math.abs(price - rawSl), compression);

  const riskAdjusted = applyRiskBuffer(price, rawSl, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'volatilityCompression',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const candleTime = candles[candles.length - 1].time || Date.now();
  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:volatilityCompression:${direction}:${candleTime}`;
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
    setupScore: Math.min(100, Math.max(0, decision.score || 75)),
    regimeConfidence: context.confidence,
    riskQualityScore,
    strategy: 'volatilityCompression',
    reason: decision.outcomeReason || 'Volatility Compression Breakout',
    candleTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'volatilityCompression',
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
