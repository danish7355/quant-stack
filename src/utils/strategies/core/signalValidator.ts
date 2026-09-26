// src/utils/strategies/core/signalValidator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Layered signal validation pipeline.
// Every filter can independently reject a signal with a specific reason.
// Regime filtering is deliberately NOT the only gate.
// ─────────────────────────────────────────────────────────────────────────────
import { StrategySignal, MarketContext, computeCompositeScore } from "./StrategySignal";

export interface ValidationSettings {
  /** Allowed regimes for this strategy ("any" = skip check) */
  allowedRegimes?: Array<"trend" | "range" | "neutral" | "any">;
  /** Require HTF and entry-frame regime to agree */
  requireHtfAgreement?: boolean;
  /** Minimum regime confidence 0–100 */
  minRegimeConfidence?: number;
  /** Min ATR-normalised spread to allow the trade (0 = skip) */
  maxSpreadAtr?: number;
  /** Min volume multiplier vs 20-bar average (0 = skip) */
  minVolumeMult?: number;
  /** Min composite score (0 = skip) */
  minCompositeScore?: number;
  /** Volatility states the signal is allowed to fire in */
  allowedVolatility?: Array<"compressed" | "normal" | "expanded">;
  /** Allowed trendDirections ("any" = skip) */
  allowedTrendDirections?: Array<"bullish" | "bearish" | "mixed" | "any">;
}

export interface ValidatedSignal extends StrategySignal {
  compositeScore: number;
  isValid: boolean;
}

const seenSignalIds = new Set<string>();

/**
 * Clear the deduplication store (call at session start or test teardown).
 */
export function clearSignalDedup(): void {
  seenSignalIds.clear();
}

/**
 * Run the full layered validation pipeline on one candidate signal.
 * Returns a ValidatedSignal – check .isValid and .rejectionReason.
 */
export function validateSignal(
  signal: StrategySignal,
  context: MarketContext,
  settings: ValidationSettings = {}
): ValidatedSignal {
  let rejectionReason: string | null = null;

  const reject = (reason: string): ValidatedSignal => ({
    ...signal,
    rejectionReason: reason,
    compositeScore: 0,
    isValid: false,
  });

  // ── 1. Deduplication ───────────────────────────────────────────────────────
  if (seenSignalIds.has(signal.signalId)) {
    return reject("duplicate_signal_id");
  }

  // ── 2. Regime filter ───────────────────────────────────────────────────────
  const allowedRegimes = settings.allowedRegimes ?? ["any"];
  if (!allowedRegimes.includes("any") && !allowedRegimes.includes(context.regime)) {
    return reject(`regime_mismatch:${context.regime}`);
  }

  // ── 3. HTF agreement ───────────────────────────────────────────────────────
  if (settings.requireHtfAgreement && !context.htfAgreement) {
    return reject("htf_regime_disagreement");
  }

  // ── 4. Regime confidence ──────────────────────────────────────────────────
  const minConf = settings.minRegimeConfidence ?? 0;
  if (context.confidence < minConf) {
    return reject(`regime_confidence_too_low:${context.confidence}`);
  }

  // ── 5. Volatility state ────────────────────────────────────────────────────
  if (settings.allowedVolatility && !settings.allowedVolatility.includes(context.volatility)) {
    return reject(`volatility_mismatch:${context.volatility}`);
  }

  // ── 6. Trend direction ─────────────────────────────────────────────────────
  const allowedDirs = settings.allowedTrendDirections ?? ["any"];
  if (!allowedDirs.includes("any") && !allowedDirs.includes(context.trendDirection)) {
    return reject(`trend_direction_mismatch:${context.trendDirection}`);
  }

  // ── 7. Minimum composite score ─────────────────────────────────────────────
  const composite = computeCompositeScore(signal);
  if (settings.minCompositeScore && composite < settings.minCompositeScore) {
    return reject(`composite_score_too_low:${composite.toFixed(1)}`);
  }

  // ── 8. Basic sanity ────────────────────────────────────────────────────────
  if (!isFinite(signal.entry) || !isFinite(signal.sl) || !isFinite(signal.tp1)) {
    return reject("non_finite_levels");
  }
  if (signal.riskPerUnit <= 0) {
    return reject("non_positive_risk");
  }

  // ── All checks passed ──────────────────────────────────────────────────────
  seenSignalIds.add(signal.signalId);

  return {
    ...signal,
    rejectionReason: null,
    compositeScore: composite,
    isValid: true,
  };
}

/**
 * Validate an array of candidate signals and return only valid ones,
 * sorted descending by compositeScore.
 */
export function filterAndRankSignals(
  candidates: Array<StrategySignal | null>,
  context: MarketContext,
  settings: ValidationSettings = {}
): ValidatedSignal[] {
  return candidates
    .filter((s): s is StrategySignal => s !== null)
    .map(s => validateSignal(s, context, settings))
    .filter(s => s.isValid)
    .sort((a, b) => b.compositeScore - a.compositeScore);
}
