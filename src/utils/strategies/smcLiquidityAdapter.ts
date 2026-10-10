// src/utils/strategies/smcLiquidityAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adapter for Liquidity Sweep Reversal strategy conforming to core/StrategySignal.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluateLiquiditySweepReversal } from './liquiditySweep/index.js';
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

  const symbol = settings.symbol || 'UNKNOWN';
  const timeframe = settings.timeframe || '15m';

  // 1. Evaluate primary Liquidity Sweep Reversal 8-stage pipeline
  const reversalRes = evaluateLiquiditySweepReversal({
    symbol,
    execCandles: candles,
    directionCandles: htfCandles,
    liquidityCandles1D: settings.liquidityCandles1D || [],
    currentPrice,
    mode: settings.liquiditySweepMode || 'balanced',
    regimeLabel: settings.coindcxActiveRegime || settings.marketRegime || 'RANGE',
    regimeConfidence: settings.regimeConfidence ?? 70,
    regimeStableBars: settings.regimeStableBars ?? 3,
    uiOverrides: settings.liquiditySweepConfig,
    symbolRank: settings.symbolRank ?? 1,
    btcEthMacro: settings.btcEthMacro,
    symbolDailyTrades: settings.symbolDailyTrades ?? 0,
    symbolInCooldown: settings.symbolInCooldown ?? false,
    appFeeSettings: {
      feeTakerPct: settings.feeTakerPct,
      feeGstPct: settings.feeGstPct,
      feeRoundTripPct: settings.feeRoundTripPct
    }
  });

  if (reversalRes.status === 'ACTIVE') {
    const sig = reversalRes.signal;
    const direction: 'long' | 'short' = sig.direction.toLowerCase() === 'long' ? 'long' : 'short';
    const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
    const signalId = `${symbol}:${timeframe}:liquiditySweepReversal:${direction}:${sig.signalTime}`;
    const riskQualityScore = computeRiskQualityScore(sig.rrRatio, sig.config.risk.minRR);

    const signal: StrategySignal = {
      signalId,
      direction,
      entry: sig.entryPrice,
      sl: sig.sl,
      tp1: sig.tp1,
      tp2: sig.tp2,
      tp3: sig.tp3,
      riskPerUnit: sig.risk,
      rr1: sig.risk > 0 ? Math.abs(sig.tp1 - sig.entryPrice) / sig.risk : 1.0,
      rr2: sig.rrRatio,
      rr3: sig.risk > 0 ? Math.abs(sig.tp3 - sig.entryPrice) / sig.risk : 3.0,
      bufferApplied: sig.config.risk.stopBufferATR * (sig.risk / (sig.config.risk.stopBufferATR || 0.2)),
      setupScore: sig.score,
      regimeConfidence: context.confidence,
      riskQualityScore,
      strategy: 'LIQUIDITY_SWEEP_REVERSAL',
      reason: sig.reason,
      candleTime: sig.signalTime,
      symbol,
      timeframe,
      atr: sig.risk / (sig.config.risk.stopBufferATR || 0.2),
      context,
      rejectionReason: null,
    };

    logger.info({
      strategy: 'liquiditySweepReversal',
      symbol,
      timeframe,
      direction,
      entry: signal.entry,
      sl: signal.sl,
      tp1: signal.tp1,
      setupScore: signal.setupScore,
      rejectionReason: null,
    });

    return signal;
  }

  // Log rejection reason transparently per Rule 3
  if (reversalRes.status === 'STANDBY') {
    logger.warn({
      strategy: 'liquiditySweepReversal',
      symbol,
      timeframe,
      rejectionReason: reversalRes.reason,
      details: reversalRes.details
    });
  }

  // 2. Fallback to legacy evaluateSmc if backward-compatibility is required
  const price = currentPrice || candles[candles.length - 1].close;
  const legacyResult = evaluateSmc(candles, htfCandles, price, settings);
  if (!legacyResult) return null;

  const {
    direction: rawDir,
    score = 75,
    entryPrice: entry,
    sl,
    tp1,
    signalTime = candles[candles.length - 1].time || Date.now(),
    reason = 'SMC Liquidity Sweep',
  } = legacyResult;

  if (!rawDir || entry === undefined || sl === undefined) return null;

  const atr = settings.atr || Math.abs(entry - sl);
  const direction: 'long' | 'short' = rawDir.toLowerCase() === 'long' ? 'long' : 'short';

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
    strategy: 'SMC_LIQUIDITY_SWEEP',
    reason,
    candleTime: signalTime,
    symbol,
    timeframe,
    atr,
    context,
    rejectionReason: null,
  };

  return signal;
}
