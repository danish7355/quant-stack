// src/utils/strategies/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Barrel export for all strategy modules, adapters, and core utilities.
// ─────────────────────────────────────────────────────────────────────────────

export * from './core/index.js';
export {
  evaluateStrictGapPullback,
  formatSignalOutput,
  evaluateTradeManagement,
  type ValidSignal,
  type NoTradeSignal,
  type StrategyOutput,
  type StrictGapSettings,
  type BtcRegime,
  type ManagementAction,
  type TradeState,
  type ManagementResult,
} from './strictGapPullback/index.js';

// Adapters
export { evaluateEmaGapPullbackAdapter } from './emaGapPullbackAdapter.js';
export { evaluateTrendPullbackAdapter } from './trendPullbackAdapter.js';
export { evaluateVolatilityCompressionAdapter } from './volatilityCompressionAdapter.js';
export { evaluateEarlyCoilBreakoutAdapter } from './earlyCoilBreakoutAdapter.js';
export { evaluateTwoSidedCoilBreakoutAdapter } from './twoSidedCoilBreakoutAdapter.js';
export { evaluateMacroRangeAdapter } from './macroRangeAdapter.js';
export { evaluateRangeMeanReversionAdapter } from './rangeMeanReversionAdapter.js';
export { evaluateSmcLiquidityAdapter } from './smcLiquidityAdapter.js';
export {
  evaluateStrategyRegimeFiltersAdapter,
  evaluateStrategyRegimeFiltersSignal,
} from './strategyRegimeFiltersAdapter.js';
export { evaluateEma5PaVolumeAdapter } from './ema5PaVolumeAdapter.js';
export { evaluateTrendPullbackRetestAdapter } from './trendPullbackRetestAdapter.js';
export {
  evaluateTrendPullbackRetest,
  backtestTrendPullbackRetest,
  createTprState,
  calcTrendScore as calcTprTrendScore,
  type TprConfig,
  type TprSignal,
  type TprState,
  type TprStateName,
  type TprDirection,
} from './trendPullbackRetest.js';
export {
  evaluateEma5PaVolume,
  backtestEma5PaVolume,
  compareEma5PaVolumeVersions,
  determine15mRegime,
  findConfirmedSwings,
  calculateEma5,
  type Ema5PaVolumeConfig,
  type Ema5PaVolumeSignal,
  type BacktestSummary,
  type BacktestTrade,
  type MarketRegime15m,
  type StrategyVersion,
} from './ema5PaVolume.js';

// Core entry logic
export { determineEmaGapEntry, calcEma, findSwingLow, findSwingHigh } from './commonEntry.js';
