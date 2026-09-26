// src/utils/strategies/strategyRegimeFiltersAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Utility adapter that runs the unified regime detector and exposes MarketContext.
// Used as a pre-filter by all other adapters; does not generate trade signals on its own.
// ─────────────────────────────────────────────────────────────────────────────
import { StrategySignal, MarketContext } from './core/StrategySignal.js';
import { detectRegime } from './core/regimeDetector.js';

export function evaluateStrategyRegimeFiltersAdapter(
  candles: any[],
  htfCandles: any[] = []
): { context: MarketContext } {
  const context = detectRegime(candles, htfCandles.length ? htfCandles : undefined);
  return { context };
}

/**
 * Signal adapter entry point — returns null because this is a utility filter, not a standalone signal.
 */
export function evaluateStrategyRegimeFiltersSignal(
  _candles: any[],
  _htfCandles: any[] = [],
  _currentPrice: number = 0,
  _settings: any = {}
): StrategySignal | null {
  return null;
}
