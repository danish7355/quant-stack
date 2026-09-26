// src/utils/strategies/types.ts

/**
 * Unified interface for all strategy signals.
 * Each strategy should return an object adhering to this shape (or null if no signal).
 */
export interface StrategySignal {
  /** Direction of the trade */
  direction: 'LONG' | 'SHORT';
  /** Entry price */
  entry: number;
  /** Stop‑loss price */
  sl: number;
  /** First take‑profit level */
  tp1: number;
  /** Second take‑profit level */
  tp2: number;
  /** Optional third take‑profit level */
  tp3?: number;
  /** Score (0‑100) used for ranking signals */
  score: number;
  /** Human‑readable reason for the signal */
  reason: string;
}
