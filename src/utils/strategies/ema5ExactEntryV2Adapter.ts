// src/utils/strategies/ema5ExactEntryV2Adapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for EMA5_EXACT_ENTRY_V2 conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import {
  evaluateEma5ExactEntryV2,
  Eev2Config,
} from './ema5ExactEntryV2.js';
import { StrategySignal } from './core/StrategySignal.js';
import { logger } from './core/logger.js';

export function evaluateEma5ExactEntryV2Adapter(
  candles5m: any[],
  candles15m: any[] = [],
  candles1hOrPrice: any[] | number = 0,
  candles1dOrSettings: any[] | (Eev2Config & { symbol?: string; timeframe?: string }) = {},
  currentPrice: number = 0,
  settings: Eev2Config & { symbol?: string; timeframe?: string } = {}
): StrategySignal | null {
  if (!candles5m || candles5m.length < 20) return null;

  let candles1h: any[] = [];
  let candles1d: any[] = [];
  let resolvedPrice = currentPrice;
  let resolvedSettings = settings;

  if (typeof candles1hOrPrice === 'number') {
    resolvedPrice = candles1hOrPrice;
    resolvedSettings = (candles1dOrSettings as any) || {};
  } else {
    candles1h = candles1hOrPrice;
    if (Array.isArray(candles1dOrSettings)) {
      candles1d = candles1dOrSettings;
    }
  }

  const symbol = resolvedSettings.symbol || 'UNKNOWN';

  const signal = evaluateEma5ExactEntryV2({
    candles5m,
    candles15m,
    candles1h,
    candles1d,
    symbol,
    config: resolvedSettings,
  });

  if (!signal || signal.signalStatus !== 'VALID' || !signal.direction) {
    if (signal && signal.rejectionReason) {
      logger.warn({
        strategy: 'EMA5_EXACT_ENTRY_V2',
        symbol,
        timeframe: '5m',
        rejectionReason: signal.rejectionReason,
      });
    }
    return null;
  }

  const direction: 'long' | 'short' = signal.direction.toLowerCase() === 'long' ? 'long' : 'short';
  const entry = currentPrice || signal.entryPrice;
  const riskPerUnit = Math.abs(entry - signal.stopLoss);
  const rr1 = riskPerUnit > 0 ? Math.abs(signal.tp1 - entry) / riskPerUnit : 1.5;
  const rr2 = riskPerUnit > 0 ? Math.abs(signal.tp2 - entry) / riskPerUnit : 3.0;
  const rr3 = riskPerUnit > 0 ? Math.abs(signal.tp3 - entry) / riskPerUnit : 4.5;

  const unifiedSignal: StrategySignal = {
    signalId: signal.setupKey || `${symbol}:5m:eev2:${direction}:${signal.timestamp}`,
    direction,
    entry,
    sl: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    riskPerUnit,
    rr1,
    rr2,
    rr3,
    bufferApplied: signal.avgRange * (settings.slBufferAvgRange ?? 0.15),
    setupScore: Math.min(100, Math.round(70 + signal.netRr * 5)),
    regimeConfidence: signal.regime15m === 'BULLISH' || signal.regime15m === 'BEARISH' ? 95 : 40,
    riskQualityScore: 95,
    strategy: 'EMA5_EXACT_ENTRY_V2',
    reason: `EMA5 V2 Alert-Break [15m ${signal.regime15m}] | Net R:R ${signal.netRr.toFixed(2)} | FeeR ${signal.feeR.toFixed(3)}R`,
    candleTime: signal.timestamp,
    symbol,
    timeframe: '5m',
    atr: signal.avgRange || 0,
    context: {
      regime: 'trend',
      trendDirection: direction === 'long' ? 'bullish' : 'bearish',
      volatility: 'normal',
      confidence: 95,
      htfAgreement: true,
    },
    rejectionReason: null,
  };

  logger.info({
    strategy: 'EMA5_EXACT_ENTRY_V2',
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
