// src/utils/strategies/smcLiquidityAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for SMC Liquidity Sweep strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateSmc } from './smcLiquidity.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateSmcLiquidityAdapter(
  candles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!candles || candles.length < 35) return null;

  const price = currentPrice || candles[candles.length - 1].close;
  const result = evaluateSmc(candles, htfCandles, price, settings);
  if (!result) return null;

  const {
    direction: rawDir,
    score = 75,
    entryPrice: entry,
    sl,
    tp1,
    signalTime = candles[candles.length - 1].time || Date.now(),
    reason = 'SMC Liquidity Sweep',
  } = result;

  if (!rawDir || entry === undefined || sl === undefined) return null;

  const atr = settings.atr || Math.abs(entry - sl);
  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  const riskAdjusted = applyRiskBuffer(entry, sl, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.5,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'smcLiquidity',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:smcLiquidity:${direction}:${signalTime}`;
  const riskQualityScore = computeRiskQualityScore(riskAdjusted.rr1, settings.minRR ?? 1.5);

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
    strategy: 'smcLiquidity',
    reason,
    candleTime: signalTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'smcLiquidity',
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
