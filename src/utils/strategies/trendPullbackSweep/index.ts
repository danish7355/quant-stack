/**
 * TREND PULLBACK SWEEP REVERSAL (TPSR): Public Strategy API
 */

export * from './schema.js';
export * from './engine.js';

import { TpsrEvaluationResult, TpsrSignal } from './engine.js';
import { TrendPullbackResult } from '../trendPullback.js';
import { StrategySignal } from '../core/StrategySignal.js';

/**
 * Converts a TpsrSignal into a standard TrendPullbackResult for seamless compatibility
 * with AutoTrader.ts, StrategyChecklistPanel, and performance tracking.
 */
export function tpsrToTrendPullbackResult(
  evalRes: TpsrEvaluationResult,
  symbol: string,
  timeframe: string,
  htfTimeframe: string
): TrendPullbackResult | null {
  if (evalRes.status !== 'ACTIVE') return null;
  const sig = evalRes.signal;

  const result: TrendPullbackResult = {
    direction: sig.direction,
    score: sig.score,
    rawScore: Math.round(sig.score / 10),
    stage: 'STAGE_5_CONTINUATION' as any,
    entryMode: 'RETEST_CONTINUATION',
    atr: sig.riskPerUnit / (sig.stopDistanceATR || 1),
    entryPrice: sig.entryPrice,
    sl: sig.sl,
    tp1: sig.tp1,
    tp2: sig.tp2,
    tp3: sig.tp3,
    tradeTimeframe: timeframe,
    htfTimeframe,
    signalTime: sig.signalTime,
    signalId: `${symbol}:${timeframe}:TPSR:${sig.direction}:${sig.signalTime}`,
    reason: sig.reason,
    status: 'TRADE CONFIRMED' as any,
    marketRegime: (sig.direction === 'LONG' ? 'TRENDING_UP' : 'TRENDING_DOWN') as any,
    stopType: 'LOCAL_EXECUTION_STOP',
    stopDistance: sig.riskPerUnit,
    stopATRMultiple: sig.stopDistanceATR,
    entryDistanceATR: 0.1,
    volumeConfirmed: true,
    confidence: sig.score >= 75 ? 'HIGH' : sig.score >= 60 ? 'MEDIUM' : 'LOWER',
    details: {
      htfTrendStatus: sig.direction === 'LONG' ? 'BULLISH' : 'BEARISH',
      regimeDetails: {
        regime: (sig.direction === 'LONG' ? 'TRENDING_UP' : 'TRENDING_DOWN') as any,
        isTrending: true,
        direction: sig.direction,
        emaSlope: 1.0,
        emaSeparation: 1.5,
        adx: 25,
        higherHighs: true,
        higherLows: true,
        lowerHighs: false,
        lowerLows: false
      } as any,
      pullbackStatus: 'VALID_PULLBACK',
      priceActionPattern: 'SWEEP_REJECTION_ENGULF',
      volumeRatio: 1.5,
      volumeSma: 1000,
      confirmationScore: sig.score,
      breakdown: {
        trendAlignmentScore: 2.5,
        emaPullbackScore: 2.5,
        priceActionScore: 2.5,
        volumeProfileScore: 2.5
      } as any
    }
  };

  return result;
}

/**
 * Adapts TpsrSignal directly to core/StrategySignal.
 */
export function tpsrToStrategySignal(sig: TpsrSignal, symbol: string, timeframe: string): StrategySignal {
  const signalId = `${symbol}:${timeframe}:TPSR:${sig.direction.toLowerCase()}:${sig.signalTime}`;
  const rr1 = sig.riskPerUnit > 0 ? Math.abs(sig.tp1 - sig.entryPrice) / sig.riskPerUnit : 1.0;
  const rr2 = sig.riskPerUnit > 0 ? Math.abs(sig.tp2 - sig.entryPrice) / sig.riskPerUnit : 2.0;
  const rr3 = sig.riskPerUnit > 0 ? Math.abs(sig.tp3 - sig.entryPrice) / sig.riskPerUnit : 3.0;

  return {
    signalId,
    direction: sig.direction.toLowerCase() as 'long' | 'short',
    entry: sig.entryPrice,
    sl: sig.sl,
    tp1: sig.tp1,
    tp2: sig.tp2,
    tp3: sig.tp3,
    riskPerUnit: sig.riskPerUnit,
    rr1,
    rr2,
    rr3,
    bufferApplied: 0.2,
    setupScore: sig.score,
    regimeConfidence: sig.regimeSnapshot.confidence,
    riskQualityScore: sig.score,
    strategy: 'trendPullback',
    reason: sig.reason,
    candleTime: sig.signalTime,
    symbol,
    timeframe,
    atr: sig.riskPerUnit / (sig.stopDistanceATR || 1),
    context: {
      regime: 'trend',
      trendDirection: sig.direction === 'LONG' ? 'bullish' : 'bearish',
      volatility: 'normal',
      confidence: sig.regimeSnapshot.confidence,
      htfAgreement: true
    },
    rejectionReason: null
  };
}
