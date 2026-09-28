// src/utils/strategies/core/SignalPriority.ts
// ─────────────────────────────────────────────────────────────────────────────
// Architectural Enhancement 2: Signal Priority Queue & Multi-Strategy Arbitration
// ─────────────────────────────────────────────────────────────────────────────

import { StrategySignal } from './StrategySignal.js';

export enum SignalPriority {
  CRITICAL = 1,  // Highest
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4        // Lowest
}

export interface PrioritizedSignal {
  signal: StrategySignal;
  priority: SignalPriority;
  timestamp: number;
  setupScore: number;
}

// === STRATEGY → PRIORITY MAPPING ===
export const STRATEGY_PRIORITY_MAP: Record<string, SignalPriority> = {
  'SMC_LIQUIDITY_SWEEP': SignalPriority.CRITICAL,
  'VOLATILITY_COMPRESSION': SignalPriority.CRITICAL,
  'MACRO_RANGE_BREAKOUT': SignalPriority.CRITICAL,

  'EMA5_EXACT_ENTRY_V2': SignalPriority.HIGH,
  'TREND_PULLBACK_RETEST': SignalPriority.HIGH,
  'EARLY_COIL_BREAKOUT': SignalPriority.HIGH,

  'EMA5_REJECTION_RECLAIM': SignalPriority.MEDIUM,
  'EMA5_REJECTION_RECLAIM_V1': SignalPriority.MEDIUM,
  'TREND_PULLBACK': SignalPriority.MEDIUM,
  'EMA_GAP_PULLBACK': SignalPriority.MEDIUM,

  'EMA5_EXACT_ENTRY_V1': SignalPriority.LOW,
  'EMA5_PA_VOLUME_V1': SignalPriority.LOW,
  'RANGE_MEAN_REVERSION': SignalPriority.LOW,
  'BINANCE_COMPOSITE': SignalPriority.LOW,
};

export function calculateSetupScore(signal: StrategySignal | any): number {
  // Weighted composite: volume, confidence, R:R, structure strength
  let score = 0;

  const confidence = signal.confidence ?? (signal.setupScore ? signal.setupScore / 100 : 0.65);
  score += confidence * 40;  // 40% weight

  const riskPerUnit = signal.riskPerUnit ?? (signal.entry && signal.sl ? Math.abs(signal.entry - signal.sl) : 1);
  const targetDist = signal.tp2 && signal.entry ? Math.abs(signal.tp2 - signal.entry) : (riskPerUnit * 2.5);
  const expectedRR = signal.expectedRR ?? (riskPerUnit > 0 ? targetDist / riskPerUnit : 2.5);
  score += Math.min(expectedRR / 5, 1) * 30;  // 30% weight

  const volumeRatio = signal.volumeRatio ?? 1.10;
  score += Math.min(volumeRatio / 2, 1) * 20;  // 20% weight

  const structureStrength = signal.structureStrength ?? (signal.regimeConfidence ?? 0.70);
  score += structureStrength * 10;  // 10% weight

  return Math.round(score * 100) / 100;
}

// === ARBITRATION LOGIC ===
export function arbitrateSignals(
  signals: (StrategySignal | any)[],
  maxConcurrent: number = 3
): PrioritizedSignal[] {
  // Add priority metadata
  const prioritized: PrioritizedSignal[] = signals.map(signal => {
    const stratKey = signal.strategy || signal.setupType || signal.strategyId || 'UNKNOWN';
    const priority = STRATEGY_PRIORITY_MAP[stratKey] || SignalPriority.LOW;
    return {
      signal,
      priority,
      timestamp: signal.timestamp || signal.signalTime || Date.now(),
      setupScore: calculateSetupScore(signal)
    };
  });

  // Sort by priority (ascending = CRITICAL first), then by setupScore (descending)
  prioritized.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.setupScore - a.setupScore;
  });

  // Return top N signals
  return prioritized.slice(0, maxConcurrent);
}
