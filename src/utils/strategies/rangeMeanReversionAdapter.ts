// src/utils/strategies/rangeMeanReversionAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Range Mean Reversion strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateRangeMeanReversion } from './rangeMeanReversion.js';
import { evaluateRangeRegimeV1, RangeRegimeSignal } from './rangeRegime/index.js';
import { StrategySignal } from './core/StrategySignal.js';
import { applyRiskBuffer, computeRiskQualityScore } from './core/riskManager.js';
import { detectRegime } from './core/regimeDetector.js';
import { logger } from './core/logger.js';

export function evaluateRangeMeanReversionAdapter(
  candles: any[],
  htfCandles: any[] = [],
  currentPrice: number = 0,
  settings: any = {}
): StrategySignal | null {
  if (!candles || candles.length < 35) return null;

  const price = currentPrice || candles[candles.length - 1].close;
  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';
  const candleTime = candles[candles.length - 1].time || Date.now();

  // Prefer Range Regime V1 when HTF (direction) candles are available
  if (htfCandles && htfCandles.length >= 30) {
    const v1Result = evaluateRangeRegimeV1(candles, htfCandles, price, settings.rangeConfig || settings);
    if (v1Result && !v1Result.rejectionReason) {
      const sig = v1Result as RangeRegimeSignal;
      const direction: 'long' | 'short' = sig.direction.toLowerCase() === 'long' ? 'long' : 'short';
      const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
      const signalId = `${symbol}:${timeframe}:rangeRegimeV1:${direction}:${candleTime}`;

      return {
        signalId,
        direction,
        entry: sig.entryPrice,
        sl: sig.sl,
        tp1: sig.tp1,
        tp2: sig.tp2,
        tp3: sig.tp3,
        riskPerUnit: sig.riskPerUnit,
        rr1: sig.r1,
        rr2: sig.r2,
        rr3: sig.r2 * 1.5,
        bufferApplied: 0,
        setupScore: Math.min(100, Math.max(0, sig.score)),
        regimeConfidence: sig.regimeScore,
        riskQualityScore: sig.grade === 'GRADE_A' ? 90 : 70,
        strategy: 'rangeMeanReversion',
        reason: `RANGE_REGIME_V1 (${sig.setupType}): ${sig.reason}`,
        candleTime,
        symbol,
        timeframe,
        atr: (sig as any).atr || (candles[candles.length - 1].close * 0.015),
        context,
        rejectionReason: null,
      };
    }
  }

  const result = evaluateRangeMeanReversion(candles, price, settings);
  if (!result) return null;

  const {
    direction: rawDir,
    score = 70,
    entryPrice: entry,
    sl,
    tp1,
    atr = candles[candles.length - 1].close * 0.015,
    reason = 'Range Mean Reversion',
  } = result;

  if (!rawDir || entry === undefined || sl === undefined) return null;

  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';

  const riskAdjusted = applyRiskBuffer(entry, sl, atr, direction, {
    bufferMultiplier: settings.bufferMultiplier ?? 0.2,
    minRR: settings.minRR ?? 1.0,
  });

  if (!riskAdjusted) {
    logger.warn({
      strategy: 'rangeMeanReversion',
      symbol,
      timeframe,
      direction,
      rejectionReason: 'risk_buffer_rejection: minRR or risk floor failed',
    });
    return null;
  }

  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  const signalId = `${symbol}:${timeframe}:rangeMeanReversion:${direction}:${candleTime}`;
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
    strategy: 'rangeMeanReversion',
    reason,
    candleTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  logger.info({
    strategy: 'rangeMeanReversion',
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
