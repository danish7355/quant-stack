// src/utils/strategies/ema5PaVolumeAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for EMA5_PA_VOLUME_V1 conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateEma5PaVolume, Ema5PaVolumeConfig } from './ema5PaVolume.js';
import { StrategySignal } from './core/StrategySignal.js';
import { logger } from './core/logger.js';

export function evaluateEma5PaVolumeAdapter(
  candles5m: any[],
  candles15m: any[] = [],
  currentPrice = 0,
  settings: Ema5PaVolumeConfig & { symbol?: string; timeframe?: string } = {}
): StrategySignal | null {
  if (!candles5m || candles5m.length < 30) return null;

  const symbol = settings.symbol || 'UNKNOWN';
  const signal = evaluateEma5PaVolume(candles5m, candles15m, settings, symbol);

  if (!signal) return null;

  const direction: 'long' | 'short' = signal.direction.toLowerCase() === 'long' ? 'long' : 'short';
  const candleTime = signal.candleTime || candles5m[candles5m.length - 1]?.time || Date.now();

  if (signal.rejectionReason) {
    logger.warn({
      strategy: 'EMA5_PA_VOLUME_V1',
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
  const rr1 = riskPerUnit > 0 ? (signal.tp1 - entry) / riskPerUnit : 1.5;
  const rr2 = riskPerUnit > 0 ? (signal.tp2 - entry) / riskPerUnit : 2.5;
  const rr3 = riskPerUnit > 0 ? (signal.tp3 - entry) / riskPerUnit : 3.5;

  const unifiedSignal: StrategySignal = {
    signalId: signal.strategySignalId,
    direction,
    entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    riskPerUnit,
    rr1: Math.abs(rr1),
    rr2: Math.abs(rr2),
    rr3: Math.abs(rr3),
    bufferApplied: 0,
    setupScore: signal.setupScore,
    regimeConfidence: signal.regime15m === 'BULLISH' || signal.regime15m === 'BEARISH' ? 85 : 40,
    riskQualityScore: 85,
    strategy: 'EMA5_PA_VOLUME_V1',
    reason: `EMA5 PA Volume (${signal.direction}) — 15m ${signal.regime15m}, gap ${(signal.metrics.gapRangeRatio * 100).toFixed(0)}% range, vol ${signal.metrics.volumeRatio.toFixed(2)}x`,
    candleTime,
    symbol,
    timeframe: '5m',
    atr: signal.metrics.recentAvgRange,
    context: {
      regime: signal.regime15m === 'BULLISH' || signal.regime15m === 'BEARISH' ? 'trend' : 'neutral',
      trendDirection: signal.regime15m === 'BULLISH' ? 'bullish' : signal.regime15m === 'BEARISH' ? 'bearish' : 'mixed',
      volatility: 'normal',
      confidence: signal.regime15m === 'BULLISH' || signal.regime15m === 'BEARISH' ? 85 : 40,
      htfAgreement: true,
    },
    rejectionReason: null,
  };

  logger.info({
    strategy: 'EMA5_PA_VOLUME_V1',
    symbol,
    timeframe: '5m',
    direction,
    entry: unifiedSignal.entry,
    sl: unifiedSignal.sl,
    tp1: unifiedSignal.tp1,
    setupScore: unifiedSignal.setupScore,
    rejectionReason: null,
  });

  return unifiedSignal;
}
