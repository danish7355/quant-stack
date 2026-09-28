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
export { evaluateEma5RejectionReclaimAdapter } from './ema5RejectionReclaimAdapter.js';
export { evaluateEma5ExactEntryAdapter } from './ema5ExactEntryAdapter.js';
export { evaluateEma5ExactEntryV2Adapter } from './ema5ExactEntryV2Adapter.js';
export {
  evaluateEma5ExactEntry,
  detectExactEMA5Setup,
  detectExactEMA5DetailedSetup,
  backtestEma5ExactEntry,
  createEeeState,
  determine15mStructure,
  type EeeConfig,
  type EeeSignal,
  type EeeState,
  type EeeDirection,
  type EeeRegime15m,
  type EeeRejectionCode,
  type EeeCandle,
  type ExactSetupResult,
  type SetupDetectionResult,
  type EeeBacktestSummary,
} from './ema5ExactEntry.js';
export {
  evaluateEma5RejectionReclaim,
  backtestEma5RejectionReclaim,
  createErrState,
  type ErrConfig,
  type ErrSignal,
  type ErrState,
  type ErrPhase,
  type ErrDirection,
  type ErrCandle,
  type ErrBacktestSummary,
} from './ema5RejectionReclaim.js';
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
export {
  evaluateEma5ExactEntryV2,
  detectExactEMA5Setup as detectExactEMA5SetupV2,
  computeRegime15m,
  getConfirmedPivots,
  buildLevelCatalog,
  computeStop,
  selectTargets,
  estimateFees,
  evaluateFilters,
  evaluateSetup,
  runBacktestV2,
  type Eev2Config,
  type Eev2Signal,
  type Eev2Candle,
  type Eev2Direction,
  type Eev2Regime15m,
  type Eev2RejectionCode,
  type LevelTarget,
} from './ema5ExactEntryV2.js';

// Core entry logic
export { determineEmaGapEntry, calcEma, findSwingLow, findSwingHigh } from './commonEntry.js';

// Enhanced Strategy Detection Functions
export {
  detectTrendPullback,
  type TrendPullbackConfig,
  type TrendPullbackSignal,
} from './trendPullback.js';
export {
  detectEmaGapPullback,
  calculateHtfTrendScore,
  type GapPullbackConfig,
  type GapPullbackSignal,
} from './strictGapPullback/emaGapPullback.js';
export {
  detectEma5PaVolume,
  type DetectEma5PaVolumeConfig,
  type DetectEma5PaVolumeSignal,
} from './ema5PaVolume.js';
export {
  detectRangeMeanReversion,
  type RangeMeanReversionConfig,
  type RangeMeanReversionSignalResult,
} from './rangeMeanReversion.js';
export {
  detectEarlyCoilBreakout,
  type EarlyCoilConfig,
  type EarlyCoilSignal,
} from './earlyCoilBreakout.js';
export {
  detectMacroRangeBreakout,
  type MacroRangeConfig,
  type MacroRangeSignal,
} from './macroRange.js';
export {
  CorrelationGuard,
  type CorrelationConfig,
} from '../risk/CorrelationGuard.js';
