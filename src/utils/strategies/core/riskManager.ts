// src/utils/strategies/core/riskManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Centralised risk-buffer + RR validation.
// Returns a fully-auditable RiskAdjustedSignal so callers know exactly what
// was changed and why. Does NOT silently mutate entry, SL, or TPs without
// returning the new values explicitly.
// ─────────────────────────────────────────────────────────────────────────────
import { RiskAdjustedSignal } from "./StrategySignal";

export interface RiskSettings {
  /** Multiplier for ATR-based SL buffer (default 0.2) */
  bufferMultiplier?: number;
  /** Minimum acceptable RR for tp1 (default 1.5) */
  minRR?: number;
  /** tp1 R-multiple (default 1.0) */
  tp1RMultiple?: number;
  /** tp2 R-multiple (default 1.5) */
  tp2RMultiple?: number;
  /** tp3 R-multiple (default 2.5, optional) */
  tp3RMultiple?: number;
}

/**
 * Apply an ATR-based buffer to the stop-loss, then recalculate targets so
 * the R-multiples remain constant relative to the adjusted risk.
 *
 * This avoids the anti-pattern of:
 *   1. Move stop → wider risk
 *   2. Keep original TPs → lower RR
 *   3. Reject for failing RR
 *   (which silently alters the strategy's signal distribution)
 *
 * Instead we:
 *   1. Move stop by buffer
 *   2. Recalculate TPs from the new risk
 *   3. Report all changes in the returned object
 *
 * @returns null if the resulting riskPerUnit ≤ 0 or below minRisk floor
 */
export function applyRiskBuffer(
  entry: number,
  rawSl: number,
  atr: number,
  direction: "long" | "short",
  settings: RiskSettings = {}
): RiskAdjustedSignal | null {
  const bufferMult = settings.bufferMultiplier ?? 0.2;
  const minRR = settings.minRR ?? 1.5;
  const tp1Mult = settings.tp1RMultiple ?? 1.0;
  const tp2Mult = settings.tp2RMultiple ?? 1.5;
  const tp3Mult = settings.tp3RMultiple ?? 2.5;

  const buffer = bufferMult * atr;

  // Push the stop further away in the direction of the trade
  const sl = direction === "long" ? rawSl - buffer : rawSl + buffer;
  const riskPerUnit = Math.abs(entry - sl);

  if (riskPerUnit <= 0) return null;

  // Minimum risk floor: at least 15% of ATR (avoid micro-stops)
  if (riskPerUnit < 0.15 * atr) return null;

  // Recalculate TPs from the adjusted risk so R-multiples are preserved
  const sign = direction === "long" ? 1 : -1;
  const tp1 = entry + sign * riskPerUnit * tp1Mult;
  const tp2 = entry + sign * riskPerUnit * tp2Mult;
  const tp3 = entry + sign * riskPerUnit * tp3Mult;

  const rr1 = (tp1Mult * riskPerUnit) / riskPerUnit; // = tp1Mult
  const rr2 = (tp2Mult * riskPerUnit) / riskPerUnit; // = tp2Mult
  const rr3 = (tp3Mult * riskPerUnit) / riskPerUnit; // = tp3Mult

  // Reject if even tp1 RR is below the minimum
  if (rr1 < minRR) return null;

  return {
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    riskPerUnit,
    rr1,
    rr2,
    rr3,
    bufferApplied: buffer,
  };
}

/**
 * Compute a 0–100 risk-quality score from the RR ratios.
 * Higher is better; capped so a 4R+ setup scores 100.
 */
export function computeRiskQualityScore(rr1: number, minRR: number): number {
  if (rr1 < minRR) return 0;
  return Math.min(100, Math.round(((rr1 - minRR) / (4 - minRR)) * 100));
}
