// src/utils/strategies/core/StrategySignal.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unified signal contract for all strategies.
// Sub-scores carry semantic meaning; the final composite ranking is computed
// by the portfolio layer, not individual adapters.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fully-resolved, risk-adjusted set of levels for one trade candidate.
 * Returned by applyRiskBuffer() so every level is traceable.
 */
export interface RiskAdjustedSignal {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3?: number;
  riskPerUnit: number;
  /** Risk-reward ratio to tp1 */
  rr1: number;
  /** Risk-reward ratio to tp2 */
  rr2: number;
  /** Risk-reward ratio to tp3 (if present) */
  rr3?: number;
  /** ATR × bufferMultiplier actually applied to the stop */
  bufferApplied: number;
}

/**
 * Enriched market-context passed alongside a signal.
 * Replaces the coarse "trend | range | neutral" with a richer state.
 */
export interface MarketContext {
  regime: "trend" | "range" | "neutral";
  trendDirection: "bullish" | "bearish" | "mixed";
  volatility: "compressed" | "normal" | "expanded";
  /** 0–1 confidence in the detected regime */
  confidence: number;
  /** HTF and entry-frame agreement flag */
  htfAgreement: boolean;
  /** e.g. "london" | "new_york" | "asia" | "off_hours" */
  session?: string;
}

/**
 * The canonical output of every strategy adapter.
 * score is NOT a single opaque number – use the three sub-scores.
 * The portfolio layer computes the final composite rank.
 */
export interface StrategySignal {
  /** Unique, stable identity for deduplication */
  signalId: string;

  direction: "long" | "short";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3?: number;

  riskPerUnit: number;
  rr1: number;
  rr2: number;
  rr3?: number;
  bufferApplied: number;

  /**
   * Setup-quality score: how well this bar matches the pattern rules (0–100).
   * Each strategy defines this consistently within its own domain.
   */
  setupScore: number;

  /**
   * Historical-edge score: estimated expectancy based on back-tested data.
   * Populated by the validator layer once historical stats are available.
   * Optional at signal-creation time.
   */
  historicalEdgeScore?: number;

  /**
   * How confident is the regime detector that this signal fires in the
   * correct market regime (0–100)?
   */
  regimeConfidence: number;

  /**
   * Quality of the risk/reward structure after buffer application (0–100).
   * 100 = RR exactly at target, 0 = barely passing minimum.
   */
  riskQualityScore: number;

  /** Strategy that generated the signal */
  strategy: string;

  /** Human-readable description of the trigger */
  reason: string;

  /** ISO-8601 timestamp of the triggering candle's close */
  candleTime: number;

  /** Symbol this signal is for */
  symbol?: string;

  /** Timeframe of the entry candles */
  timeframe?: string;

  /** ATR at the time of signal generation */
  atr: number;

  /** Full market context at the time of signal generation */
  context?: MarketContext;

  /** If null = not rejected; otherwise the rejection reason string */
  rejectionReason: string | null;

  /** Data version for reproducibility */
  dataVersion?: string;
}

/** Helper to compute the composite rank used in the portfolio layer */
export function computeCompositeScore(signal: StrategySignal): number {
  const w = { setup: 0.4, regime: 0.35, risk: 0.25 };
  return (
    signal.setupScore * w.setup +
    signal.regimeConfidence * w.regime +
    signal.riskQualityScore * w.risk
  );
}
