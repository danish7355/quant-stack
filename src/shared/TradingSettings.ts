import { StrategyBucketItem, Timeframe } from '../types.js';

export type TradingMode = 'PAPER' | 'TESTNET' | 'LIVE';

export interface TradingSettings {
  // Identity & Metadata
  userId?: string;
  accountId?: string;
  settingsVersion: number;
  updatedAt: string;
  updatedBy?: string;
  tradingMode: TradingMode;
  autoTradeEnabled: boolean;

  // Risk Management
  accountRiskPct: number;          // % account risk per trade (e.g., 1.0)
  positionSizePct: number;         // % total balance per trade margin (e.g., 10.0)
  leverage: number;                // Max leverage (1 - 125)
  maxConcurrentTrades: number;     // Max open trades (1 - 50)
  bypassMaxPositions?: boolean;    // Bypass maximum simultaneous positions limit
  maxConsecutiveLosses?: number;   // Max consecutive losses before cooling down (1 - 20)
  bypassMaxConsecutiveLosses?: boolean; // Bypass max consecutive losses limit
  dailyLossLimitPct: number;       // Max daily loss % before circuit breaker (0.5 - 50)
  bypassDailyLossLimit?: boolean;  // Bypass daily loss limit circuit breaker
  maxPortfolioExposurePct?: number; // Max total portfolio exposure % (10 - 1000, default 100)
  bypassExposureLimit?: boolean;   // Bypass total portfolio exposure limit
  minLiquidationBuffer?: number;   // Minimum ratio between liq distance and stop distance (1.01 - 3.0, default 1.3)
  bypassLiquidationBuffer?: boolean; // Bypass strict liquidation buffer and fallback to 1x leverage
  maxSinglePositionExposureMult?: number; // Max single trade notional multiple of account (1 - 50, default 5)
  minStopDistancePct?: number;     // Minimum stop distance % used for sizing (0.0005 - 0.05, default 0.005)
  tradeCooldownSeconds?: number;   // Cooldown duration in seconds after skip/rejection (0 - 600, default 60)
  bypassTradeCooldown?: boolean;   // Bypass cooldown timer after skipped/rejected trades
  allowFractionalContracts?: boolean; // Allow sub-unit contract sizing for high-value coins
  killSwitchActive?: boolean;      // Emergency manual kill switch
  maxDrawdownPct: number;          // Max portfolio drawdown % (1 - 50)
  startingBalance: number;         // Starting demo/paper balance
  demoBalance?: number;            // Current virtual balance
  equitySnapshots?: { time: string; balance: number }[];

  // Execution & Strategy Engine
  activeStrategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'MACRO_RANGE_BREAKOUT' | 'EARLY_COIL_BREAKOUT' | 'AUTO_REGIME' | 'SMC_LIQUIDITY_SWEEP' | 'LIQUIDITY_SWEEP_REVERSAL';
  enabledStrategies?: ('BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'MACRO_RANGE_BREAKOUT' | 'EARLY_COIL_BREAKOUT' | 'SMC_LIQUIDITY_SWEEP' | 'LIQUIDITY_SWEEP_REVERSAL')[];
  strategyBucket?: StrategyBucketItem[];
  tradeFrequency: 'LOW' | 'MEDIUM' | 'HIGH';
  autoTradeThreshold: number;      // Confidence score threshold (50 - 100)
  timeframe: Timeframe;
  coinCount: number;               // Pairs to scan (5 - 100)
  scanInterval: number;            // Scan cycle seconds (5 - 3600)
  theme: 'dark' | 'light';

  // Filters & Gates
  min24hVolume: number;            // Minimum 24h volume in USDT
  maxFundingRate: number;          // Max funding rate % (e.g., 0.15)
  maxSpread: number;               // Max bid/ask spread % (e.g., 0.3)
  useGlobalBtcFilter?: boolean;    // Global macro regime gate
  globalFilterSymbol?: 'BTCUSDT' | 'BTC_ETH';
  disabledGates?: Record<string, boolean>;
  scanOnlyWatchlist?: boolean;
  customWatchlist?: string;

  // Technical Indicators
  emaFastPeriod: number;
  emaSlowPeriod: number;
  emaTrendPeriod: number;
  emaCrossLookback: number;
  rsiPeriod: number;
  rsiLongMin: number;
  rsiLongMax: number;
  rsiShortMin: number;
  rsiShortMax: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  adxPeriod: number;
  adxTrendThreshold: number;
  superTrendPeriod: number;
  superTrendMultiplier: number;
  volumeMultiplier: number;
  fibLookback: number;
  atrPeriod: number;

  // Exit & Take Profit Parameters
  tp1AtrMultiple: number;
  tp2AtrMultiple: number;
  tp3FibLevel: number;
  slAtrMultiple: number;
  minRRRatio: number;
  trailingStopActivation: 'TP1' | 'TP2' | 'NEVER';
  trailActivationR: number;
  timeBasedExitEnabled: boolean;
  timeBasedExitCandles: number;

  // Mean Reversion Strategy
  bbPeriod?: number;
  bbStdDev?: number;
  rangeSmaPct?: number;
  rangeMaxSmaSlope?: number;
  rangeStopMult?: number;
  rangeTargetRr?: number;
  rmrBbPeriod?: number;
  rmrBbStdDev?: number;
  rmrRsiOversold?: number;
  rmrRsiOverbought?: number;
  rmrRiskRewardRatio?: number;
  rmrStopBufferPct?: number;
  rmrMaxAdx?: number;
  rmrMaxAtrRatio?: number;
  rmrMinScore?: number;
  rmrOuterRangePct?: number;
  rmrMinRrRatio?: number;

  forceClearCredentials?: boolean;

  // Climax Reversal Strategy
  crEnabled: boolean;
  crClimaxLookback: number;
  crEmaFast: number;
  crEmaContext: number;
  crEmaBaseline: number;
  crAtrPeriod: number;
  crMinOverextensionAtr: number;
  crMinAtrVsAverage: number;
  crAtrAveragePeriod: number;
  crMinRejectionWickRatio: number;
  crMinClimaxRangeRatio: number;
  crMinStopDistanceAtr: number;
  crMinRewardRisk: number;
  crVolumeSpikeMultiplier?: number;
  crMinWickRatio?: number;
  crMinAtrDistance?: number;

  // Volatility Compression Breakout (VCB) Strategy
  vcbCompressionLookback: number;
  vcbCompressionAtrRatioMax: number;
  vcbWindowAtrMult: number;
  vcbBoundaryBufferAtr: number;
  vcbRangeExpansionMin: number;
  vcbVolumeExpansionMin: number;
  vcbCloseStrengthMin: number;
  vcbHtfBonus: number;
  vcbSlBufferAtrMult: number;
  useMtfAlignment: boolean;
  useVpvrFilter: boolean;
  useAtrTrailingStop: boolean;
  trailingStopAtrMultiplier: number;
  vcbInitialTpAtrMult: number;
  vcbInitialTpClosePct: number;
  vcbChandelierAtrMult: number;
  vcbStallCheckBar: number;
  vcbStallMinProgressAtr: number;
  vcbSqueezeLookback?: number;
  vcbMinSqueezeRatio?: number;
  vcbVolumeSurgeTrigger?: number;

  // VCB Strategy Final Gate Checklist Settings
  vcbChecklistMinScore?: number; // Minimum checklist score required (default 8 out of 11)
  vcbRequireSweep?: boolean;      // Mandatory liquidity sweep of stops before entry
  vcbRequireRetest?: boolean;     // Mandatory retest into OB / FVG / 50-79% zone
  vcbMinRrRatio?: number;         // Minimum R:R ratio (default 2.0, target 3.0)
  vcbEnforceKillZone?: boolean;   // Active session / kill zone enforcement

  // Notifications & Credentials
  telegramBotToken: string;
  telegramChatId: string;
  alertOnNewSignal: boolean;
  alertOnTradeExecuted: boolean;
  alertOnTpHit: boolean;
  alertOnSlHit: boolean;
  alertOnTsMoved: boolean;
  alertOnDailyLossLimit: boolean;
  alertOnRangingDetected: boolean;
  alertSilentMode?: boolean;
  alertFormat?: 'Verbose' | 'Minimal';

  // Trend Pullback Strategy
  tpbEmaFast?: number;
  tpbEmaSlow?: number;
  tpbAdxMin?: number;
  tpbVolumeSmaPeriod?: number;
  tpbMinVolumeRatio?: number;
  tpbRequireVolume?: boolean;
  tpbMaxEntryDistanceAtr?: number;
  tpbMinRrRatio?: number;
  tpbMinScore?: number;
  tpbAtrBuffer?: number;

  // SMC High-Probability Strategy Settings
  smcHtfResolution?: string;
  smcStructureLen?: number;
  smcWickRatio?: number;
  smcMinSweepWickPct?: number;
  smcDispAtrMult?: number;
  smcSweepConfirmWindow?: number;
  smcVolMult?: number;
  smcFvgAfterMssWindow?: number;
  smcObLookback?: number;
  smcUseKillZone?: boolean;
  smcAtrStopMult?: number;
  smcRrRatio?: number;
  smcStrictHtfRegime?: boolean;

  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceTestnet?: boolean;

  githubPat?: string;
  githubRepoUrl?: string;
}

export type SettingsLoadState = 'loading' | 'loaded' | 'saving' | 'saved' | 'error';

export const NUMERIC_BOUNDS: Record<string, { min: number; max: number; step?: number; label: string; highRisk?: boolean }> = {
  accountRiskPct: { min: 0.1, max: 10, step: 0.1, label: 'Account Risk per Trade (%)', highRisk: true },
  positionSizePct: { min: 0.1, max: 100, step: 1, label: 'Position Margin per Trade (%)' },
  leverage: { min: 1, max: 125, step: 1, label: 'Leverage Multiplier', highRisk: true },
  maxConcurrentTrades: { min: 1, max: 50, step: 1, label: 'Max Open Trades' },
  maxConsecutiveLosses: { min: 1, max: 20, step: 1, label: 'Max Consecutive Losses' },
  dailyLossLimitPct: { min: 0.5, max: 25, step: 0.5, label: 'Daily Max Loss (%)', highRisk: true },
  maxPortfolioExposurePct: { min: 10, max: 1000, step: 10, label: 'Max Portfolio Exposure (%)', highRisk: true },
  minLiquidationBuffer: { min: 1.01, max: 3.0, step: 0.05, label: 'Min Liquidation Safety Buffer' },
  maxSinglePositionExposureMult: { min: 1, max: 50, step: 0.5, label: 'Max Single Position Multiplier' },
  minStopDistancePct: { min: 0.0005, max: 0.05, step: 0.0005, label: 'Min Stop Distance (%)' },
  tradeCooldownSeconds: { min: 0, max: 600, step: 5, label: 'Trade Rejection Cooldown (s)' },
  maxDrawdownPct: { min: 1, max: 50, step: 1, label: 'Max Drawdown (%)' },
  autoTradeThreshold: { min: 50, max: 100, step: 1, label: 'Min Score Threshold' },
  scanInterval: { min: 5, max: 3600, step: 5, label: 'Scan Interval (s)' },
  coinCount: { min: 5, max: 100, step: 5, label: 'Coins to Scan' },
  min24hVolume: { min: 100000, max: 1000000000, step: 500000, label: 'Min 24h Volume (USDT)' },
  maxFundingRate: { min: 0.01, max: 2.0, step: 0.01, label: 'Max Funding Rate (%)' },
  maxSpread: { min: 0.01, max: 5.0, step: 0.01, label: 'Max Bid/Ask Spread (%)' },
  tp1AtrMultiple: { min: 0.5, max: 10, step: 0.1, label: 'TP1 ATR Multiple' },
  tp2AtrMultiple: { min: 1.0, max: 10, step: 0.1, label: 'TP2 ATR Multiple' },
  tp3FibLevel: { min: 1.0, max: 5.0, step: 0.1, label: 'TP3 Fib Level' },
  slAtrMultiple: { min: 0.3, max: 5.0, step: 0.1, label: 'SL ATR Multiple' },
  minRRRatio: { min: 1.0, max: 10.0, step: 0.1, label: 'Minimum Risk/Reward Ratio' },
  trailActivationR: { min: 0.5, max: 5.0, step: 0.1, label: 'Trail Activation R' },
  tpbEmaFast: { min: 5, max: 100, step: 1, label: 'Trend Pullback Fast EMA' },
  tpbEmaSlow: { min: 20, max: 200, step: 5, label: 'Trend Pullback Slow EMA' },
  tpbAdxMin: { min: 10, max: 50, step: 1, label: 'Trend Pullback Min ADX' },
  tpbMinVolumeRatio: { min: 0.5, max: 5.0, step: 0.1, label: 'Trend Pullback Min Volume Ratio' },
  tpbMaxEntryDistanceAtr: { min: 0.1, max: 3.0, step: 0.05, label: 'Trend Pullback Max Entry Distance (ATR)' },
  tpbMinScore: { min: 5, max: 10, step: 1, label: 'Trend Pullback Min Confirmation Score' },
  vcbChecklistMinScore: { min: 5, max: 11, step: 1, label: 'VCB Checklist Min Score' },
  vcbMinRrRatio: { min: 1.5, max: 5.0, step: 0.1, label: 'VCB Min Risk-to-Reward Ratio' },
  rmrMaxAdx: { min: 10, max: 40, step: 1, label: 'Ranging MR Max ADX' },
  rmrMaxAtrRatio: { min: 1.0, max: 2.0, step: 0.05, label: 'Ranging MR Max ATR Ratio' },
  rmrMinScore: { min: 5, max: 11, step: 1, label: 'Ranging MR Min Score' },
  rmrOuterRangePct: { min: 0.10, max: 0.35, step: 0.01, label: 'Ranging MR Outer Boundary Zone' },
  rmrMinRrRatio: { min: 1.0, max: 5.0, step: 0.1, label: 'Ranging MR Min Risk/Reward Ratio' },
  smcStructureLen: { min: 3, max: 50, step: 1, label: 'SMC Structure Pivot Length' },
  smcWickRatio: { min: 0.2, max: 2.0, step: 0.1, label: 'SMC Min Sweep Wick/Body Ratio' },
  smcMinSweepWickPct: { min: 0.0005, max: 0.02, step: 0.0005, label: 'SMC Min Sweep Wick Extension (%)' },
  smcDispAtrMult: { min: 0.2, max: 3.0, step: 0.1, label: 'SMC MSS Displacement ATR Multiplier' },
  smcSweepConfirmWindow: { min: 3, max: 30, step: 1, label: 'SMC Sweep-to-MSS Max Bars Window' },
  smcVolMult: { min: 1.0, max: 4.0, step: 0.1, label: 'SMC MSS Volume Confirmation Multiplier' },
  smcFvgAfterMssWindow: { min: 2, max: 15, step: 1, label: 'SMC MSS-to-FVG Max Bars Window' },
  smcObLookback: { min: 10, max: 100, step: 5, label: 'SMC Order Block Lookback Bars' },
  smcAtrStopMult: { min: 0.5, max: 4.0, step: 0.1, label: 'SMC ATR Stop Multiplier' },
  smcRrRatio: { min: 1.5, max: 10.0, step: 0.5, label: 'SMC Take-Profit Risk:Reward Ratio' },
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized: Partial<TradingSettings>;
}

export function validateTradingSettings(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized: Record<string, any> = {};

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Settings payload must be a non-null object'], warnings: [], sanitized: {} };
  }

  const raw = input as Record<string, any>;

  // Validate & clamp all numeric bounds
  for (const [key, bounds] of Object.entries(NUMERIC_BOUNDS)) {
    if (raw[key] !== undefined && raw[key] !== null) {
      const val = Number(raw[key]);
      if (isNaN(val)) {
        errors.push(`Field '${bounds.label}' (${key}) must be a valid number`);
      } else if (val < bounds.min) {
        warnings.push(`'${bounds.label}' clamped from ${val} to minimum ${bounds.min}`);
        sanitized[key] = bounds.min;
      } else if (val > bounds.max) {
        warnings.push(`'${bounds.label}' clamped from ${val} to maximum ${bounds.max}`);
        sanitized[key] = bounds.max;
      } else {
        sanitized[key] = val;
      }
    }
  }

  // Validate boolean flags
  const booleanKeys = [
    'autoTradeEnabled', 'useGlobalBtcFilter', 'timeBasedExitEnabled',
    'crEnabled', 'useMtfAlignment', 'useVpvrFilter', 'useAtrTrailingStop',
    'vcbRequireSweep', 'vcbRequireRetest', 'vcbEnforceKillZone',
    'smcUseKillZone', 'smcStrictHtfRegime', 'tpbRequireVolume',
    'bypassMaxPositions', 'bypassMaxConsecutiveLosses', 'bypassDailyLossLimit',
    'bypassExposureLimit', 'bypassLiquidationBuffer', 'bypassTradeCooldown',
    'allowFractionalContracts', 'killSwitchActive',
    'alertOnNewSignal', 'alertOnTradeExecuted', 'alertOnTpHit', 'alertOnSlHit',
    'alertOnTsMoved', 'alertOnDailyLossLimit', 'alertOnRangingDetected',
    'alertSilentMode', 'binanceTestnet', 'scanOnlyWatchlist'
  ];
  for (const bKey of booleanKeys) {
    if (raw[bKey] !== undefined) {
      sanitized[bKey] = Boolean(raw[bKey]);
    }
  }

  // Validate enums
  if (raw.tradingMode !== undefined) {
    if (['PAPER', 'TESTNET', 'LIVE'].includes(raw.tradingMode)) {
      sanitized.tradingMode = raw.tradingMode;
    } else {
      errors.push(`Invalid tradingMode: ${raw.tradingMode}`);
    }
  }

  if (raw.tradeFrequency !== undefined) {
    if (['LOW', 'MEDIUM', 'HIGH'].includes(raw.tradeFrequency)) {
      sanitized.tradeFrequency = raw.tradeFrequency;
    } else {
      errors.push(`Invalid tradeFrequency: ${raw.tradeFrequency}`);
    }
  }

  if (raw.trailingStopActivation !== undefined) {
    if (['TP1', 'TP2', 'NEVER'].includes(raw.trailingStopActivation)) {
      sanitized.trailingStopActivation = raw.trailingStopActivation;
    } else {
      errors.push(`Invalid trailingStopActivation: ${raw.trailingStopActivation}`);
    }
  }

  // Pass-through other known fields
  const stringKeys = [
    'activeStrategy', 'timeframe', 'theme', 'globalFilterSymbol',
    'telegramBotToken', 'telegramChatId', 'binanceApiKey', 'binanceApiSecret',
    'githubPat', 'githubRepoUrl', 'customWatchlist', 'alertFormat',
    'smcHtfResolution'
  ];
  for (const sKey of stringKeys) {
    if (raw[sKey] !== undefined && typeof raw[sKey] === 'string') {
      sanitized[sKey] = raw[sKey];
    }
  }

  // Complex objects
  if (raw.enabledStrategies && Array.isArray(raw.enabledStrategies)) {
    sanitized.enabledStrategies = raw.enabledStrategies.filter((s: any) => typeof s === 'string');
    if (sanitized.enabledStrategies.length > 0) {
      sanitized.activeStrategy = sanitized.enabledStrategies[0] as any;
    }
  } else if (sanitized.activeStrategy) {
    sanitized.enabledStrategies = [sanitized.activeStrategy as any];
  }
  if (raw.strategyBucket && Array.isArray(raw.strategyBucket)) {
    sanitized.strategyBucket = raw.strategyBucket;
  }
  if (raw.disabledGates && typeof raw.disabledGates === 'object') {
    sanitized.disabledGates = raw.disabledGates;
  }
  if (raw.equitySnapshots && Array.isArray(raw.equitySnapshots)) {
    sanitized.equitySnapshots = raw.equitySnapshots;
  }

  // Version and timestamps
  if (raw.settingsVersion !== undefined) sanitized.settingsVersion = Number(raw.settingsVersion);
  if (raw.updatedAt !== undefined) sanitized.updatedAt = String(raw.updatedAt);
  if (raw.updatedBy !== undefined) sanitized.updatedBy = String(raw.updatedBy);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized: sanitized as Partial<TradingSettings>
  };
}

export const CANONICAL_DEFAULT_SETTINGS: TradingSettings = {
  settingsVersion: 1,
  updatedAt: new Date().toISOString(),
  tradingMode: 'PAPER',
  activeStrategy: 'VOLATILITY_COMPRESSION',
  enabledStrategies: ['VOLATILITY_COMPRESSION'],
  tradeFrequency: 'LOW',
  timeframe: '5m',
  autoTradeThreshold: 75,
  coinCount: 100,
  autoTradeEnabled: true,
  scanInterval: 300,
  theme: 'dark',

  min24hVolume: 25000000,
  maxFundingRate: 0.15,
  maxSpread: 0.3,
  useGlobalBtcFilter: true,
  globalFilterSymbol: 'BTCUSDT',

  emaFastPeriod: 9,
  emaSlowPeriod: 55,
  emaTrendPeriod: 200,
  emaCrossLookback: 3,

  rsiPeriod: 14,
  rsiLongMin: 30,
  rsiLongMax: 65,
  rsiShortMin: 30,
  rsiShortMax: 55,

  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  adxPeriod: 14,
  adxTrendThreshold: 20,
  superTrendPeriod: 10,
  superTrendMultiplier: 3.0,
  volumeMultiplier: 1.5,
  fibLookback: 100,
  atrPeriod: 14,

  startingBalance: 10000,
  positionSizePct: 10,
  accountRiskPct: 1,
  leverage: 1,
  maxConcurrentTrades: 10,
  bypassMaxPositions: false,
  maxConsecutiveLosses: 4,
  bypassMaxConsecutiveLosses: false,
  dailyLossLimitPct: 3,
  bypassDailyLossLimit: false,
  maxPortfolioExposurePct: 100,
  bypassExposureLimit: false,
  minLiquidationBuffer: 1.3,
  bypassLiquidationBuffer: false,
  maxSinglePositionExposureMult: 5,
  minStopDistancePct: 0.005,
  tradeCooldownSeconds: 60,
  bypassTradeCooldown: false,
  allowFractionalContracts: true,
  killSwitchActive: false,
  maxDrawdownPct: 10,

  tp1AtrMultiple: 2.0,
  tp2AtrMultiple: 3.5,
  tp3FibLevel: 1.618,
  slAtrMultiple: 1.5,
  minRRRatio: 1.5,

  trailingStopActivation: 'TP1',
  trailActivationR: 1,
  timeBasedExitEnabled: true,
  timeBasedExitCandles: 3,

  telegramBotToken: '',
  telegramChatId: '',
  binanceApiKey: '',
  binanceApiSecret: '',
  binanceTestnet: true,

  alertOnNewSignal: true,
  alertOnTradeExecuted: true,
  alertOnTpHit: true,
  alertOnSlHit: true,
  alertOnTsMoved: true,
  alertOnDailyLossLimit: true,
  alertOnRangingDetected: false,

  crEnabled: false,
  crClimaxLookback: 20,
  crEmaFast: 5,
  crEmaContext: 55,
  crEmaBaseline: 200,
  crAtrPeriod: 14,
  crMinOverextensionAtr: 2.0,
  crMinAtrVsAverage: 1.0,
  crAtrAveragePeriod: 50,
  crMinRejectionWickRatio: 0.45,
  crMinClimaxRangeRatio: 1.3,
  crMinStopDistanceAtr: 0.5,
  crMinRewardRisk: 1.5,

  vcbCompressionLookback: 10,
  vcbCompressionAtrRatioMax: 0.70,
  vcbWindowAtrMult: 3.0,
  vcbBoundaryBufferAtr: 0.25,
  vcbRangeExpansionMin: 1.5,
  vcbVolumeExpansionMin: 1.5,
  vcbCloseStrengthMin: 0.60,
  vcbHtfBonus: 10,
  vcbSlBufferAtrMult: 0.15,
  vcbInitialTpAtrMult: 1.5,
  vcbInitialTpClosePct: 0.25,
  vcbChandelierAtrMult: 3.0,
  vcbStallCheckBar: 8,
  vcbStallMinProgressAtr: 1.0,
  useMtfAlignment: true,
  useVpvrFilter: false,
  useAtrTrailingStop: true,
  trailingStopAtrMultiplier: 3.0,

  vcbChecklistMinScore: 8,
  vcbRequireSweep: true,
  vcbRequireRetest: true,
  vcbMinRrRatio: 2.0,
  vcbEnforceKillZone: false,

  tpbEmaFast: 20,
  tpbEmaSlow: 50,
  tpbAdxMin: 18,
  tpbVolumeSmaPeriod: 20,
  tpbMinVolumeRatio: 1.0,
  tpbRequireVolume: true,
  tpbMaxEntryDistanceAtr: 0.25,
  tpbMinRrRatio: 1.5,
  tpbMinScore: 8,
  tpbAtrBuffer: 0.3,

  rmrMaxAdx: 22,
  rmrMaxAtrRatio: 1.25,
  rmrMinScore: 8,
  rmrOuterRangePct: 0.20,
  rmrRsiOversold: 35,
  rmrRsiOverbought: 65,
  rmrMinRrRatio: 1.5,

  smcHtfResolution: '1h',
  smcStructureLen: 10,
  smcWickRatio: 0.6,
  smcMinSweepWickPct: 0.0015,
  smcDispAtrMult: 0.5,
  smcSweepConfirmWindow: 10,
  smcVolMult: 1.5,
  smcFvgAfterMssWindow: 5,
  smcObLookback: 30,
  smcUseKillZone: false,
  smcAtrStopMult: 1.5,
  smcRrRatio: 3.0,
  smcStrictHtfRegime: false,
};

