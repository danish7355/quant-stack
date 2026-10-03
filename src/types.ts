/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '2H' | '4H' | '1D';

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export type CoinStatus = 'STRONG_TREND' | 'WEAK_TREND' | 'TRANSITION' | 'RANGE' | 'UNSAFE' | 'TRENDING' | 'RANGING' | 'CHOPPY' | 'ARMED';

export interface IndicatorDetails {
  emaFast: number;
  emaSlow: number;
  emaTrend: number;
  rsi: number;
  rsiDivergence: 'bullish' | 'bearish' | null;
  macd: { macd: number; signal: number; histogram: number };
  adx: { adx: number; plusDI: number; minusDI: number };
  superTrend: { direction: 'uptrend' | 'downtrend'; value: number };
  volume20Ma: number;
  volumeRatio: number;
  vwap: number;
  vwapDeviationPct: number;
  atr: number;
  fib: {
    swingHigh: number;
    swingLow: number;
    levels: { [key: string]: number };
  };
  supportResistance: {
    supports: number[];
    resistances: number[];
  };
  bollingerBands?: {
    middle: number;
    upper: number;
    lower: number;
  };
  sma200?: number;
}

export interface CoinDetail {
  symbol: string;
  price: number;
  change24h: number;
  score: number;
  direction: SignalDirection;
  status: CoinStatus;
  statusReason: string;
  fundingRate: number;
  indicators: IndicatorDetails;
  gates: {
    g1: boolean;
    g2: boolean;
    g3: boolean;
    g4: boolean;
    g1Reason: string;
    g2Reason: string;
    g3Reason: string;
    g4Reason: string;
    g5: boolean;
    g6: boolean;
    g7: boolean;
    g8: boolean;
    g9: boolean;
    g10: boolean;
    blockReasons: string[];
  };
  regime?: any;
  wmPattern: 'W_READY' | 'M_READY' | 'W_CONFIRMED' | 'M_CONFIRMED' | 'W_FORMING' | 'M_FORMING' | 'NONE';
  crSignal?: any;
  strategy?: string;
  detectedStrategy?: string;
  matchedStrategies?: string[];
  tpSignal?: any;
  candles: {
    time: number; // UTC timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  vcb?: {
    isCompressed: boolean;
    windowHigh: number;
    windowLow: number;
    startTime?: number;
    endTime?: number;
    priorTrend?: 'UPTREND' | 'DOWNTREND' | 'NEUTRAL';
    priorImpulseMove?: number;
    breakout?: {
      direction: 'LONG' | 'SHORT';
      entryPrice: number;
      sl: number;
      tp1: number;
      tp2: number;
      tp3?: number;
      rvol: number;
    };
  };
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  smcSignal?: SmcSignal;
  lsrSignal?: LiquiditySweepReversalSignal;
  trendPullbackSignal?: TrendPullbackSignal;
  multicoinScalperSignal?: MulticoinScalperSignal;
  coilBreakoutSignal?: CoilBreakoutSignal;
  orderBlockSignal?: OrderBlockSignal;
  rangeRegimeSignal?: any;
  isMultiConfluence?: boolean;
  confluenceCount?: number;
}

export type TrendPullbackRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'TRANSITION'
  | 'HIGH_VOLATILITY'
  | 'LOW_LIQUIDITY'
  | 'UNKNOWN';

export type TrendPullbackStopType =
  | 'LOCAL_EXECUTION_STOP'
  | 'BROAD_STRUCTURAL_STOP'
  | 'INVALID_STOP';

export type TrendPullbackStatus =
  | 'WAITING_FOR_TREND'
  | 'WAITING_FOR_PULLBACK'
  | 'WAITING_FOR_PRICE_ACTION'
  | 'WAITING_FOR_VOLUME'
  | 'WAITING_FOR_REGIME_CONFIRMATION'
  | 'WAITING_FOR_RETEST'
  | 'WAITING_FOR_CONTINUATION'
  | 'RETESTING'
  | 'STOP_TOO_WIDE'
  | 'STOP_TOO_TIGHT'
  | 'ENTRY_TOO_LATE'
  | 'SIGNAL_CONFIRMED'
  | 'TRADE_EXECUTED'
  | 'TRADE_REJECTED';

export type TrendPullbackLifecycleState =
  | 'NO_SETUP'
  | 'TREND_DETECTED'
  | 'PULLBACK_DETECTED'
  | 'CONFIRMATION_WAITING'
  | 'SIGNAL_CONFIRMED'
  | 'ENTRY_ACTIVE'
  | 'RETESTING'
  | 'CONTINUATION_CONFIRMED'
  | 'INVALIDATED'
  | 'STOPPED_OUT'
  | 'TARGET_REACHED'
  | 'SIGNAL_EXPIRED';

export type RetestClassification =
  | 'NONE'
  | 'HEALTHY_RETEST'
  | 'DANGEROUS_RETEST'
  | 'TRUE_INVALIDATION';

export type TrendPullbackOutcomeClassification =
  | 'CONTINUED_WITHOUT_RETEST'
  | 'HEALTHY_RETEST_THEN_CONTINUATION'
  | 'STOPPED_BY_NORMAL_NOISE'
  | 'STOPPED_BY_LIQUIDITY_SWEEP'
  | 'FAILED_CONFIRMATION'
  | 'TRUE_STRUCTURE_INVALIDATION'
  | 'LATE_ENTRY'
  | 'WRONG_MARKET_REGIME'
  | 'TARGET_REACHED'
  | 'IN_PROGRESS';

export type TrendPullbackRejectionReason =
  | 'INVALID_MARKET_DATA'
  | 'CANDLE_NOT_CLOSED'
  | 'TIMEFRAME_MISMATCH'
  | 'UNFAVORABLE_MARKET_REGIME'
  | 'INVALID_TREND_STRUCTURE'
  | 'NO_VALID_PULLBACK'
  | 'PULLBACK_INVALIDATED'
  | 'PRICE_ACTION_NOT_CONFIRMED'
  | 'VOLUME_NOT_CONFIRMED'
  | 'FAKE_BREAKOUT'
  | 'ENTRY_TOO_LATE'
  | 'FAILED_RETEST'
  | 'DANGEROUS_RETEST'
  | 'WAITING_FOR_RETEST'
  | 'WAITING_FOR_CONTINUATION'
  | 'INVALID_STOP_PLACEMENT'
  | 'STOP_TOO_WIDE_FOR_EXECUTION_TIMEFRAME'
  | 'STOP_TOO_TIGHT_FOR_MARKET_NOISE'
  | 'RISK_REWARD_TOO_LOW'
  | 'SPREAD_OR_SLIPPAGE_TOO_HIGH'
  | 'DUPLICATE_SIGNAL'
  | 'RISK_LIMIT_REACHED'
  | null;

export interface TrendPullbackSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  executionTimeframe: string;
  higherTimeframe: string;
  marketRegime: TrendPullbackRegime;
  trendStructure: string;
  pullbackZone: string;
  confirmationTimestamp: number;
  priceActionPattern: string;
  volumeRatio: number;
  atrValue: number;
  stopType: TrendPullbackStopType;
  stopDistancePrice: number;
  stopDistanceATR: number;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  riskRewardRatio: number;
  triggerLevel?: number;
  invalidationLevel?: number;
  pullbackSwingExtreme?: number; // Swing Low (for Long) or Swing High (for Short)
  retestTolerance?: number;
  retestArea?: { low: number; high: number; description: string };
  lifecycleState?: TrendPullbackLifecycleState;
  entryMode?: 'BREAK_RETEST' | 'BALANCED';
  retestClassification?: RetestClassification;
  retestDetails?: string;
  score: number; // 0 to 10
  scoreBreakdown: {
    htfAligned: number;
    trendStructure: number;
    validPullback: number;
    priceAction: number;
    volume: number;
    regimeFavorable: number;
    noOpposingLevel: number;
  };
  status: TrendPullbackStatus;
  finalDecision: 'EXECUTE' | 'REJECT' | 'WAIT';
  exactRejectionReason: TrendPullbackRejectionReason;
  rejectionDetails?: string;
  allowedRiskAmount?: number;
  positionSize?: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  regimeFavorable?: boolean;
}

export type MulticoinProfile = '5m_SCALP' | '15m_SWING';

export interface MulticoinScalperSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  profile: MulticoinProfile;
  entryPrice: number;
  stopLossPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskRewardRatio: number;
  atrValue: number;
  atrPct: number;
  emaFast: number;
  emaMid: number;
  emaSlow: number;
  vwap: number;
  rsi: number;
  volumeRatio: number;
  adx: number;
  score: number; // 0 to 100
  passedFilters: {
    stablecoinCheck: boolean;
    liquidityCheck: boolean;
    spreadCheck: boolean;
    volatilityCheck: boolean;
    extremeSpikeCheck: boolean;
    trendCheck: boolean;
    intradayBiasCheck: boolean;
    pullbackCheck: boolean;
    rsiCheck: boolean;
    volumeCheck: boolean;
  };
  rejectionReason?: string;
  exactRejectionReason?: string;
  finalDecision?: 'EXECUTE' | 'REJECT' | 'WAIT';
  pattern?: string;
  reason?: string;
  signalTime?: number;
  timestamp: number;
  status: 'ARMED' | 'TRIGGERED' | 'INVALIDATED' | 'WAITING';
  timeExitBars?: number;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  marketRegime?: string;
}

export type CoilBreakoutStatus =
  | 'WATCHLIST'
  | 'WAITING_FOR_RETEST'
  | 'TRIGGERED'
  | 'REJECTED'
  | 'INVALIDATED'
  | 'WAITING';

export interface CoilBreakoutSignal {
  symbol: string;
  setup: 'coil_breakout_long' | 'coil_breakdown_short' | 'coil_forming' | 'uncompressed';
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  direction: 'LONG' | 'SHORT';
  timeframe: string; // '15m'
  coilRange: {
    high: number;
    low: number;
    height: number;
    heightAtrRatio: number;
    length: number; // candle count (5-20)
  };
  entryType: 'limit_on_retest' | 'aggressive_breakout';
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  riskAmount: number;
  rewardAmount: number;
  riskRewardRatio: number; // minimum 5.0 (1:5 R:R)
  status: CoilBreakoutStatus;
  displayStatus: string;
  finalDecision: 'EXECUTE' | 'WAIT' | 'REJECT';
  marketFilter: string;
  coinFilter: string;
  retestStatus: 'HOLDING' | 'REJECTING' | 'PENDING' | 'FAILED' | 'SKIPPED';
  cancelCondition: string;
  score: number;
  atrValue: number;
  reason: string;
  exactRejectionReason?: string;
  timestamp: number;
  signalTime: number;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  marketRegime?: string;
  passedFilters: {
    compressionCheck: boolean;
    medianRangeCheck: boolean;
    atrDecliningCheck: boolean;
    bodyContainmentCheck: boolean;
    breakoutCandleCheck: boolean;
    volumeCheck: boolean;
    btcFilterCheck: boolean;
    relativeStrengthCheck: boolean;
    retestCheck: boolean;
    rrRatioCheck: boolean;
  };
}

export interface SmcLiquiditySweep {
  type: 'BULLISH' | 'BEARISH';
  level: number;
  sweepPrice: number;
  sweepTime: number;
  wickRatio: number;
  extensionPct: number;
  barIndex: number;
}

export interface SmcMarketStructureShift {
  type: 'BULLISH_MSS' | 'BEARISH_MSS';
  brokenLevel: number;
  displacementAtr: number;
  barIndex: number;
  time: number;
  volumeRatio: number;
}

export interface SmcFvgZone {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  time: number;
  barIndex: number;
  mitigated: boolean;
}

export interface SmcOrderBlock {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  barIndex: number;
}

export interface SmcSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  score: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  risk: number;
  htfRegime: 'BULL' | 'BEAR' | 'CHOP';
  sweep: SmcLiquiditySweep;
  mss: SmcMarketStructureShift;
  fvg: SmcFvgZone;
  orderBlock: SmcOrderBlock;
  hasConfluence: boolean;
  inKillZone: boolean;
  signalTime: number;
  status: 'PENDING_LIMIT' | 'ARMED' | 'TRIGGERED' | 'WAITING';
  reason: string;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  marketRegime?: string;
  strategyRegimeFavorable?: boolean;
}

export type LsrMarketRegime = 
  | 'STRONG_BULLISH' 
  | 'BULLISH' 
  | 'RANGE_NEUTRAL' 
  | 'BEARISH' 
  | 'STRONG_BEARISH' 
  | 'HIGH_VOLATILITY' 
  | 'TRANSITIONING';

export type LsrCoinRegime = 
  | 'STRONG_TREND_UP' 
  | 'TREND_UP' 
  | 'RANGE' 
  | 'TREND_DOWN' 
  | 'STRONG_TREND_DOWN' 
  | 'HIGH_VOLATILITY' 
  | 'LOW_LIQUIDITY' 
  | 'DISORDERLY';

export type LsrTrendStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTREME';
export type LsrLiquidityType = 'SWING_HIGH' | 'SWING_LOW' | 'EQUAL_HIGHS' | 'EQUAL_LOWS' | 'RANGE_HIGH' | 'RANGE_LOW' | 'CONSOLIDATION';
export type LsrSweepDepthClass = 'MICRO_SWEEP' | 'NORMAL_SWEEP' | 'DEEP_SWEEP' | 'EXCESSIVE_SWEEP';
export type LsrSetupGrade = 'A+' | 'A' | 'B' | 'NO_TRADE';
export type LsrCandleConfirmationType = 
  | 'PIN_BAR_HAMMER'
  | 'BULLISH_ENGULFING'
  | 'BEARISH_ENGULFING'
  | 'RETEST_HIGHER_LOW'
  | 'RETEST_LOWER_HIGH'
  | 'TWO_BAR_REVERSAL'
  | 'NONE';
export type LsrStateMachineState = 
  | 'STATE_0_NO_SETUP'
  | 'STATE_1_LIQUIDITY_IDENTIFIED'
  | 'STATE_2_SWEEP_DETECTED'
  | 'STATE_3_REJECTION_DETECTED'
  | 'STATE_4_RECLAIM_DETECTED'
  | 'STATE_5_MICRO_STRUCTURE_CONFIRMATION'
  | 'STATE_6_RISK_CHECK'
  | 'STATE_7_ENTRY'
  | 'STATE_8_TRADE_MANAGEMENT'
  | 'STATE_9_EXIT'
  | 'STATE_10_COOLDOWN';

export interface LiquiditySweepReversalSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  setupId: string;
  timeframe: string;
  state: LsrStateMachineState;
  stateNumber: number; // 0..10
  grade: LsrSetupGrade;
  finalDecision: 'EXECUTE' | 'READY' | 'WAIT' | 'REJECT';
  status: 'ARMED' | 'TRIGGERED' | 'WAITING' | 'INVALIDATED' | 'REJECTED';
  score: number; // 0 to 100
  
  // Market & Coin Regime
  marketRegime: LsrMarketRegime;
  coinRegime: LsrCoinRegime;
  trendStrength: LsrTrendStrength;
  marketAlignment: 'FAVORABLE' | 'NEUTRAL' | 'COUNTER_TREND' | 'OPPOSING';
  marketAlignmentScore: number;
  
  // Liquidity Info
  liquidityLevel: number;
  liquidityType: LsrLiquidityType;
  liquidityQualityScore: number; // 0 to 5
  liquidityTouches: number;
  liquiditySignificance?: 'MAJOR' | 'HIGH' | 'MEDIUM' | 'MINOR';
  isImportantLevel?: boolean;
  
  // Sweep Details
  sweepDetected: boolean;
  sweepPrice: number;
  sweepExtremePrice: number;
  sweepDepth: number; // in price
  sweepDepthPct: number; // in %
  sweepDepthClass: LsrSweepDepthClass;
  sweepCandleTime: number;
  
  // Rejection & Reclaim
  rejectionDetected: boolean;
  rejectionQuality: 'STRONG' | 'MODERATE' | 'WEAK';
  reclaimConfirmed: boolean;
  reclaimPrice: number;
  reclaimCandleIndex: number;
  reclaimSpeed: 'FAST' | 'MODERATE' | 'SLOW';
  
  // Micro-Structure
  microStructureShift: boolean;
  microStructureType: 'BULLISH' | 'BEARISH' | 'NOT_CONFIRMED';
  microBreakLevel: number;
  
  // Volume Condition
  volumeCondition: 'SUPPORTIVE' | 'NEUTRAL' | 'UNSUPPORTIVE';
  volumeSpikeRatio: number;
  
  // Execution & Risk
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  stopDistancePct: number;
  targetDistancePct: number;
  riskRewardRatio: number;
  minRequiredRR: number;
  
  // Anti-Chasing & Breakdown
  entryChased: boolean;
  rejectionReason: string | null;
  exactRejectionReason: string | null;
  structuredExplanation: string;
  explanation?: string;
  timestamp: number;
  signalTime?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  atrValue?: number;
  
  // Opposing liquidity details
  opposingLiquidityPrice: number;
  opposingLiquidityType: string;

  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';

  // Circled / Price Action Reversal Candlestick Confirmation
  candleConfirmationDetected?: boolean;
  candleConfirmationSetup?: LsrCandleConfirmationType;
  candleConfirmationReason?: string;
}

export type ObDirection = 'LONG' | 'SHORT';
export type ObMarketRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CHOPPY';
export type ObCoinRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CHOPPY';
export type ObFreshness = 'FRESH' | 'TESTED' | 'INVALIDATED';
export type ObSetupStatus = 'VALID' | 'WAITING' | 'INVALID';

export interface OrderBlockSignal {
  strategy: 'ORDER_BLOCK';
  direction: ObDirection;
  finalDecision: 'EXECUTE' | 'WAIT' | 'REJECT';
  setupStatus: ObSetupStatus;
  status: 'TRIGGERED' | 'ARMED' | 'WAITING_FOR_RETEST' | 'WAITING_FOR_PA' | 'REJECTED';
  score: number;

  // Regime Context
  marketRegime: ObMarketRegime;
  coinRegime: ObCoinRegime;
  marketRegimeScore: number;
  marketRegimeReason: string;
  coinRegimeReason: string;

  // Structural Elements
  liquidityEvent: 'DETECTED' | 'NOT_DETECTED';
  liquidityEventType?: 'SELL_SIDE_SWEEP' | 'BUY_SIDE_SWEEP' | 'EQUAL_LOWS' | 'EQUAL_HIGHS' | 'RANGE_EXTREME';
  liquidityLevelPrice?: number;
  sweepExtremePrice?: number;

  displacementValid: 'VALID' | 'INVALID';
  displacementMagnitudeAtr: number;
  displacementVolumeRatio: number;

  structureBreakValid: 'VALID' | 'INVALID';
  structureBreakType?: 'BOS' | 'CHOCH';
  structureBreakLevel?: number;

  // Order Block Zone
  obType: 'BULLISH' | 'BEARISH';
  obHigh: number;
  obLow: number;
  obMidpoint: number;
  obFreshness: ObFreshness;
  obTouchCount: number;
  obCandleTime?: number;

  // Execution & Risk Geometry
  entryPrice: number;
  stopLossPrice: number;
  slDistancePct: number;
  targetPrice: number;
  riskRewardRatio: number;
  logicalSl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;

  // Retest & Fast Reaction
  retestConfirmed: boolean;
  retestPrice?: number;
  fastReactionType?: 'REJECTION_WICK' | 'ENGULFING_RESPONSE' | 'ZONE_HOLD' | 'NONE';

  // Anti-Chasing & Rejection
  isChasing: boolean;
  reason: string;
  rejectionReason: string | null;
  exactRejectionReason: string | null;
  structuredExplanation: string;
  explanation: string;

  // Telemetry
  atrValue: number;
  signalTime: number;
  timestamp: number;
  opposingLiquidityPrice?: number;
}

export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strategy?: string; 
  marketRegime?: string; 
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  strategyRegimeFavorable?: boolean;
  strategyRegimeDetails?: string;
  isAutoRegime?: boolean;
  frequencyPreset?: 'LOW' | 'MEDIUM' | 'HIGH';
  macroColor?: 'GREEN' | 'AMBER' | 'RED';
  macroLabel?: string;
  regimeConfidence?: number;
  confidenceLevel?: 'High' | 'Medium' | 'Low';
  tradeQuality?: 'High' | 'Medium' | 'Low';
  strategyPriority?: 'P1' | 'P2' | 'P3';
  rrStruct?: string;
  structuralRR?: number;
  pnlReached1_3?: boolean;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  allocatedBalance: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  trailingStop: number | null;
  trailingStopActive: boolean;
  entryAtr: number;
  timeOpen: string;
  timestampMs?: number;
  scoreAtEntry: number;
  unrealizedPnl: number;
  realizedPnl: number;
  sizeRemainingPct: number; // 100 on start, drops to 60 then 20 after TPs
  lastUpdated?: number;
  stopStatus?: 'CONFIRMED' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';
  // MFE & MAE tracking for diagnostic post-trade analysis
  mfe?: number;
  mae?: number;
  regimeAtEntry?: string;
  regimeOneCandleLater?: string;
  regimeThreeCandlesLater?: string;
  signalCandleTime?: number;
  entryTimestamp?: number;
  // Trend Pullback specific state & retest tracking
  lifecycleState?: TrendPullbackLifecycleState;
  retestStatus?: RetestClassification;
  triggerLevel?: number;
  invalidationLevel?: number;
  retestTolerance?: number;
  outcomeClassification?: TrendPullbackOutcomeClassification;
  // VCB specific tracking
  initialTpHit?: boolean;
  extremeSinceEntry?: number;
  chandelierStop?: number;
  barsOpen?: number;
}

export interface TradeLog {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strategy?: string;
  marketRegime?: string;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  strategyRegimeFavorable?: boolean;
  strategyRegimeDetails?: string;
  isAutoRegime?: boolean;
  frequencyPreset?: 'LOW' | 'MEDIUM' | 'HIGH';
  macroColor?: 'GREEN' | 'AMBER' | 'RED';
  macroLabel?: string;
  regimeConfidence?: number;
  confidenceLevel?: 'High' | 'Medium' | 'Low';
  tradeQuality?: 'High' | 'Medium' | 'Low';
  strategyPriority?: 'P1' | 'P2' | 'P3';
  rrStruct?: string;
  structuralRR?: number;
  outcome?: 'Full 1:3' | 'Partial' | 'Scratch' | 'Loss';
  entryPrice: number;
  closePrice: number;
  leverage: number;
  profit: number;
  pctReturn: number;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TS' | 'MANUAL' | 'TIME_EXIT' | 'DECAY' | string;
  timeOpen: string;
  timeClose: string;
  scoreAtEntry: number;
  scoreAtClose?: number;
  mfe?: number;
  mae?: number;
  regimeAtEntry?: string;
  regimeOneCandleLater?: string;
  regimeThreeCandlesLater?: string;
  signalCandleTime?: number;
  lifecycleState?: TrendPullbackLifecycleState;
  retestStatus?: RetestClassification;
  outcomeClassification?: TrendPullbackOutcomeClassification;
  triggerLevel?: number;
  invalidationLevel?: number;
}

export type MarketRegimeType = 
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'EXHAUSTION_UP'
  | 'EXHAUSTION_DOWN'
  | 'BREAKOUT_UP'
  | 'BREAKOUT_DOWN'
  | 'TRANSITION'
  | 'UNCLEAR'
  | 'DEAD_VOLUME'
  | 'PANIC';

export interface StrategyBucketItem {
  id: string;
  name: string;
  description: string;
  direction?: 'LONG' | 'SHORT';
  priority: number;
  enabled: boolean;
}

export interface GlobalMarketRegime {
  regime: MarketRegimeType;
  label: string;
  details: string;
  symbol: string;
  timestamp: number;
  isTradable: boolean;
  macroColor: 'GREEN' | 'AMBER' | 'RED';
  recommendedDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
  directionBiasScore?: number;
  directionBiasLabel?: string;
  btcPrice?: number;
  ethPrice?: number;
  adx?: number;
  atrPercentile?: number;
}

export interface StrategyItem {
  id: string;
  name: string;
  badge: string;
  color: string;
  configTab?: string;
  desc: string;
  isCustom?: boolean;
}

export interface AppSettings {
  // Strategy Selection
  activeStrategy: 'NONE' | 'VCB' | 'SMC_LIQUIDITY' | 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'MACRO_RANGE_BREAKOUT' | 'EARLY_COIL_BREAKOUT' | 'AUTO_REGIME' | 'SMC_LIQUIDITY_SWEEP' | 'LIQUIDITY_SWEEP_REVERSAL' | 'MULTICOIN_SCALPER_PRO' | 'COIL_BREAKOUT' | 'ORDER_BLOCK' | 'RANGE_REGIME_V1' | 'RANGE_REGIME';
  // Quick-switch & Multi-Strategy Activation
  activeStrategies?: string[];
  deletedStrategies?: string[]; // IDs of strategies deleted/removed by the user
  customStrategies?: StrategyItem[]; // User-added custom strategies
  vcbParams?: any; // VcbParams for Volatility Compression Breakout
  rangeRegimeParams?: any; // RangeConfig for Range Regime V1 Strategy
  multiStrategyMode?: 'BEST_SIGNAL' | 'CONCURRENT_INDEPENDENT' | 'CONFLUENCE_BOOST';
  // User's Curated Strategy Bucket for Auto-Regime Selection
  strategyBucket?: StrategyBucketItem[];
  // Auto-activate strategies matching detected CoinDCX intraday regime
  autoRegimeStrategySync?: boolean;
  lastAutoRegimeApplied?: string;
  lastAutoRegimeSwitchTime?: number;
  // Hybrid Global Regime Filter Settings (BTC / BTC+ETH Macro Market Safety)
  useGlobalBtcFilter?: boolean;
  globalFilterSymbol?: 'BTCUSDT' | 'BTC_ETH';
  // Layer 3 Tradeability Gate (Fee Drag & Liquidity Gate)
  layer3TradeabilityGateEnabled?: boolean; // default true (when false, fee-drag lock / LOW_EDGE_DAY restriction is bypassed)
  maxFeeDragPctOf1R?: number; // default 15.0% of 1R threshold
  // Regime Direction Filter: Only trade in the recommended direction by regime
  regimeDirectionEnforced?: boolean; // default true (blocks counter-regime trades)
  // Trade Frequency Preset (LOW = Strict, MEDIUM = Balanced/Recommended, HIGH = Aggressive)
  tradeFrequency: 'LOW' | 'MEDIUM' | 'HIGH';

  // 3Commas / SwissAlgo Multicoin Scalper PRO parameters (Top 100 Volume Universe)
  multicoinProfile?: MulticoinProfile; // '5m_SCALP' or '15m_SWING'
  multicoinMin24hVolumeUsdt?: number; // default $20,000,000
  multicoinMaxSpreadPct?: number; // default 0.08%
  multicoinMinAtrPct?: number; // default 0.15% on 5m
  multicoinMaxAtrPct?: number; // default 2.5% on 5m
  multicoinMaxSingleBarPct?: number; // default 5.0%
  multicoinEmaFast?: number; // 9 for 5m, 20 for 15m
  multicoinEmaMid?: number; // 21 for 5m, 50 for 15m
  multicoinEmaSlow?: number; // 55 for 5m, 200 for 15m
  multicoinRsiPeriod?: number; // 7 for 5m, 14 for 15m
  multicoinRsiLongMin?: number; // 35 for 5m, 40 for 15m
  multicoinRsiLongMax?: number; // 55 for 5m, 50 for 15m
  multicoinRsiShortMin?: number; // 45 for 5m, 50 for 15m
  multicoinRsiShortMax?: number; // 65 for 5m, 60 for 15m
  multicoinMinVolRatio?: number; // default 0.8x
  multicoinRequireVwap?: boolean; // default true
  multicoinUseHtfFilter?: boolean; // default true (1H/4H trend filter for swing)
  multicoinHtfEmaFast?: number; // default 89
  multicoinHtfEmaSlow?: number; // default 200
  multicoinAdxThreshold?: number; // default 20
  multicoinTp1Pct?: number; // default 0.8% for scalp, 2.5% for swing
  multicoinTp2Pct?: number; // default 1.5% for scalp, 4.5% for swing
  multicoinSlAtrMult?: number; // default 1.5x ATR
  multicoinRiskPerTrade?: number; // default 0.5% for scalp, 1.0% for swing
  multicoinTimeExitMinutes?: number; // default 20 minutes (4 candles on 5m)
  multicoinFilterStables?: boolean; // default true
  multicoinFilterNewCoins?: boolean; // default true

  // Two-Sided Coil / Compression Breakout Strategy parameters (1:5+ R:R)
  coilMinLength?: number; // default 5 (min candles in coil)
  coilMaxLength?: number; // default 20 (max candles in coil)
  coilMaxHeightAtr?: number; // default 1.25 * ATR(14)
  coilMedianRangeAtr?: number; // default 0.70 * ATR(14)
  coilMinBodyContainment?: number; // default 0.70 (70% bodies within boundaries)
  coilBreakoutBodyMult?: number; // default 1.20 (>= 1.2x median coil body)
  coilBreakoutRangeMult?: number; // default 1.25 (>= 1.25x median coil range)
  coilBreakoutVolMult?: number; // default 1.25 (>= 1.25x mean coil volume)
  coilMinRewardRisk?: number; // default 5.0 (strict 1:5 R:R rule)
  coilEntryMode?: 'limit_on_retest' | 'aggressive_breakout'; // default 'limit_on_retest'
  coilSlAtrBuffer?: number; // default 0.20 (0.20 ATR buffer beyond coil boundary)
  coilRequireBtcFilter?: boolean; // default true (neutral-bullish for long, neutral-bearish for short)
  coilRequireRelStrength?: boolean; // default true (strong vs BTC for long, weak for short)

  // SMC High-Probability Strategy parameters (Legacy / Alias)
  smcHtfResolution?: '1H' | '4H' | '1D';
  smcStructureLen?: number;
  smcWickRatio?: number;
  smcMinSweepWickPct?: number;
  smcDispAtrMult?: number;
  smcAtrLen?: number;
  smcSweepConfirmWindow?: number;
  smcVolAvgLen?: number;
  smcVolMult?: number;
  smcFvgAfterMssWindow?: number;
  smcObLookback?: number;
  smcUseKillZone?: boolean;
  smcKillZoneStart?: string;
  smcKillZoneEnd?: string;
  smcAtrStopMult?: number;
  smcRrRatio?: number;
  smcRequireStrictOverlap?: boolean;

  // Liquidity Sweep Reversal (LSR) Strategy parameters
  lsrExecutionTimeframe?: string; // '5m' default
  lsrContextTimeframe?: string; // '15m' default
  lsrStructureLookback?: number; // 15 bars default
  lsrMinLiquidityScore?: number; // 2 (0..5)
  lsrMaxSweepDepthAtr?: number; // 1.5x ATR
  lsrMaxSweepDepthPct?: number; // 2.0%
  lsrMaxReclaimCandles?: number; // 4 candles max
  lsrMinRewardRisk?: number; // 2.0 default
  lsrSlBufferAtr?: number; // 0.15 ATR
  lsrAllowGradeB?: boolean; // false default (only execute A and A+ by default)
  lsrRejectMiddleOfRange?: boolean; // true default
  lsrMiddleRangeTolerancePct?: number; // 25% boundary distance filter
  lsrRequireVolumeSpike?: boolean; // false (volume is secondary confirmation)
  // Circled / Price Action Reversal Candlestick Confirmation (Wait for hammer/pin bar/engulfing/retest before execute)
  lsrRequireCandleConfirmation?: boolean; // true default (wait for circled / reversal setup before execute)
  lsrMinRejectionWickPct?: number; // 35% default minimum rejection wick percentage
  // High-Significance Liquidity Level Filtering (Focus on major boundaries, equal highs/lows, multi-touch key levels)
  lsrFocusImportantLevels?: boolean; // true default (filter out minor intraday 1-2 bar noise)
  lsrMinSwingProminenceAtr?: number; // 0.60 ATR default minimum prominence clearance
  lsrStrictMode?: boolean;
  lsrSweepMinAtr?: number;
  lsrSweepMaxAtr?: number;
  lsrMaxReacceptanceBars?: number;
  lsrVolMult?: number;
  lsrMinWickBodyRatio?: number;
  lsrMinWickRangeRatio?: number;
  lsrMaxOppositeWickRatio?: number;
  lsrConfirmationTrigger?: string;
  lsrConfirmWindowBars?: number;
  lsrEntryOrderTTL?: number;
  lsrTrackConsumedPools?: boolean;
  lsrMinRangeWidthAtr?: number;
  lsrMinRR?: number;
  lsrFeeStopFactor?: number;
  lsrRoundTripFeePct?: number;
  lsrMaxStopAtr?: number;

  // Order Block (ORDER_BLOCK) Strategy parameters (1:3.5+ R:R) — Spec v2
  obMinRr?: number; // Hard minimum Risk/Reward ratio, default 3.5
  obMaxSlPct?: number; // Maximum allowable stop loss distance %, default 3.5%
  obMinDisplacementAtr?: number; // Minimum displacement expansion in ATR, default 1.5x
  obStrongDispAtr?: number; // Strong displacement threshold in ATR, default 2.0x
  obDispBodyRatio?: number; // Minimum body/range ratio for displacement, default 0.55
  obRelvolSupportive?: number; // Supporting relative volume ratio, default 1.3
  obSlBufferAtr?: number; // Invalidation buffer beyond OB extreme, default 0.15 ATR
  obMaxRetestCandles?: number; // Max candles to wait for retest, default 25
  obMaxChasingAtr?: number; // Max distance allowed to move from OB before considering chased, default 0.5 ATR
  obLiquidityMode?: 'preferred' | 'required' | 'off'; // Liquidity sweep requirement mode, default 'preferred'
  obRequireLiquiditySweep?: boolean; // Convenience boolean matching liquidityMode !== 'off'
  obRequireBtcFilter?: boolean; // Enforce macro BTC trend alignment, default true
  obMinSlAtr?: number; // Minimum stop loss distance in ATR, default 0.6 ATR
  obMaxSlAtr?: number; // Maximum stop loss distance in ATR, default 3.0 ATR
  obMaxCostR?: number; // Max cost / fees ratio of risk (R), default 0.20R
  obBlockerZoneR?: number; // Blocker zone where major opposing swings invalidate TP, default 2.0R
  obChopErThreshold?: number; // Efficiency Ratio threshold for chop filter, default 0.30
  obMinSwingAtr?: number; // Minimum swing leg in ATR, default 1.0 ATR
  obMajorLegAtr?: number; // Major swing leg in ATR, default 2.0 ATR
  obTargetSearchMaxAtr?: number; // Max distance in ATR to look for structural targets, default 15.0 ATR
  obMaxCluster?: number; // Max consecutive candles in OB cluster, default 3
  obMaxWidthAtr?: number; // Max OB width in ATR, default 1.5 ATR
  obMaxAgeBars?: number; // Max age of OB in bars before expiry, default 40
  obMaxTouches?: number; // Max touches of OB before invalidation, default 2
  obWickTolAtr?: number; // Far edge wick tolerance in ATR, default 0.25 ATR
  obMaxBarsInsideZone?: number; // Max bars inside zone without reaction, default 4
  obReactionWindowBars?: number; // Max bars to confirm reaction on retest, default 3

  // Robust Trend-Pullback Strategy parameters
  tpExecutionTimeframe?: string; // '5m', '15m', etc.
  tpHigherTimeframe?: string; // '1H', '4H', '1D'
  tpOptionalLowerTriggerTimeframe?: string; // '1m', '3m', etc.
  tpFastEma?: number; // default 20
  tpSlowEma?: number; // default 50
  tpTrendEma?: number; // default 200
  tpAtrPeriod?: number; // default 14
  tpAdxPeriod?: number; // default 14
  tpAdxThreshold?: number; // default 25
  tpVolMaPeriod?: number; // default 20
  tpMinVolRatio?: number; // default 1.0
  tpMaxStopDistanceATR?: number; // default 3.0
  tpMinStopDistanceATR?: number; // default 0.5
  tpMinRiskRewardRatio?: number; // default 2.0
  tpMaxEntryDistanceATR?: number; // default 0.5
  tpMaxSpreadPct?: number; // default 0.08
  tpMaxSlippagePct?: number; // default 0.05
  tpSessionsEnabled?: boolean; // default false
  tpSessionStart?: string; // '07:00'
  tpSessionEnd?: string; // '20:00'
  tpMaxTradesPerSession?: number; // default 5
  tpMaxDailyLossPct?: number; // default 3.0
  tpRiskPctPerTrade?: number; // default 1.0
  tpMinSetupScore?: number; // default 7
  tpCooldownPeriodMin?: number; // default 15
  tpLongsEnabled?: boolean; // default true
  tpShortsEnabled?: boolean; // default true
  tpAllowNoVolume?: boolean; // default false
  tpAllowBroadStructuralStop?: boolean; // default false
  tpEntryMode?: 'BREAK_RETEST' | 'BALANCED' | 'EARLY_CONFIRMATION'; // 'BREAK_RETEST' (conservative) or 'BALANCED' / 'EARLY_CONFIRMATION' (closed confirmation + retest tolerance)
  tpRetestToleranceAtr?: number; // default 0.5 ATR tolerance for retest area
  tpStructuralStopBufferAtr?: number; // default 0.2 ATR buffer beyond swing low/high
  tpDangerousRetestEarlyExit?: boolean; // default true: exit early if strong opposing volume invalidates retest
  tpAllowBreakevenDuringRetest?: boolean; // default false: prevents moving stop to BE during normal retest phase

  // Climax Reversal Strategy settings
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

  // Volatility Compression Breakout parameters
  vcbCompressionLookback: number;
  vcbCompressionAtrRatioMax: number;
  vcbWindowAtrMult: number;
  vcbBoundaryBufferAtr: number;
  vcbRangeExpansionMin: number;
  vcbVolumeExpansionMin: number;
  vcbCloseStrengthMin: number;
  vcbHtfBonus: number;
  vcbSlBufferAtrMult: number;

  // Dynamic Enhancements
  useMtfAlignment: boolean;
  useVpvrFilter: boolean;
  useAtrTrailingStop: boolean;
  trailingStopAtrMultiplier: number;
  vcbInitialTpAtrMult: number;
  vcbInitialTpClosePct: number;
  vcbChandelierAtrMult: number;
  vcbStallCheckBar: number;
  vcbStallMinProgressAtr: number;

  // General System settings
  timeframe: Timeframe;
  autoTradeThreshold: number; // Minimum Score for Trade
  coinCount: number;
  autoTradeEnabled: boolean;
  scanInterval: number; // inside UI representation (seconds)
  theme: 'dark' | 'light';

  // Filters
  min24hVolume: number;
  maxFundingRate: number;
  maxSpread: number;

  // Range Mean-Reversion 1:3 R:R Strategy parameters
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

  // Climax Reversal fine tuners
  crVolumeSpikeMultiplier?: number;
  crMinWickRatio?: number;
  crMinAtrDistance?: number;

  // VCB fine tuners
  vcbSqueezeLookback?: number;
  vcbMinSqueezeRatio?: number;
  vcbVolumeSurgeTrigger?: number;

  // Indicators parameters
  emaFastPeriod: number;
  emaSlowPeriod: number;
  emaTrendPeriod: number;
  emaCrossLookback: number; // new
  
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
  
  // ATR
  atrPeriod: number;

  // Trading rules / risk
  startingBalance: number;
  demoBalance?: number;
  equitySnapshots?: { time: string, balance: number }[];
  positionSizePct: number; // % of total balance per trade
  accountRiskPct: number; // % account risk per trade
  leverage: number;
  maxConcurrentTrades: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  
  // Advanced Risk Management & Circuit Breakers (User-Configurable)
  maxExposurePct?: number; // Max total portfolio exposure % (e.g. 80%)
  maxAccountExposureMultiplier?: number; // Max total account notional multiplier (e.g. 5x)
  maxConsecutiveLosses?: number; // Consecutive losses before execution halt (e.g. 4)
  minLiqBuffer?: number; // Min buffer ratio between liquidation price & SL (e.g. 1.3)
  minStopDistancePct?: number; // Minimum valid stop-loss distance % (e.g. 0.5%)
  maxStopDistancePct?: number; // Maximum allowable stop-loss distance % (e.g. 4.0%)
  killSwitchActive?: boolean; // Emergency master stop switch
  enforceStrictSl?: boolean; // Reject trade execution if setup lacks valid SL
  maxTradesPerDay?: number; // Maximum trades quota per rolling 24h day (e.g. 25)
  tradeCooldownMinutes?: number; // Per-asset trade cooldown in minutes (e.g. 15)
  correlationFilterEnabled?: boolean; // Block positions highly correlated to active trades
  maxCorrelation?: number; // Maximum allowable correlation threshold (e.g. 0.75)
  btcMacroRegimeFilter?: boolean; // Block long/short entries against BTC macro trend
  
  tp1AtrMultiple: number; // Take Profit Multiplier
  tp2AtrMultiple: number; // Optional
  tp3FibLevel: number; 
  slAtrMultiple: number; // Stop Loss Multiplier
  minRRRatio: number;
  
  trailingStopActivation: 'TP1' | 'TP2' | 'NEVER';
  trailActivationR: number; // new
  timeBasedExitEnabled: boolean;
  timeBasedExitCandles: number;

  // Telegram alert settings
  telegramBotToken: string;
  telegramChatId: string;

  // Exchange Bot API Credentials
  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceTestnet?: boolean;

  alertOnNewSignal: boolean;
  alertOnTradeExecuted: boolean;
  alertOnTpHit: boolean;
  alertOnSlHit: boolean;
  alertOnTsMoved: boolean;
  alertOnDailyLossLimit: boolean;
  alertOnRangingDetected: boolean;
  alertSilentMode?: boolean;
  alertFormat?: 'Verbose' | 'Minimal';

  // Gate Management & Strategy-Wise Bypasses
  disabledGates?: Record<string, boolean>;

  // GitHub Integration
  githubPat?: string;
  githubRepoUrl?: string;
}

export type TradingMode = 'PAPER' | 'TESTNET' | 'LIVE';

export interface ExecutionGuardrail {
  id: string;
  label: string;
  passed: boolean;
  metric: string;
  reason?: string;
  actionType?: 'START_ENGINE' | 'ACTIVATE_STRATEGIES' | 'RESET_CIRCUIT_BREAKER' | 'RESET_KILL_SWITCH' | 'VIEW_POSITIONS' | 'ADJUST_MACRO' | 'ADD_CREDENTIALS' | 'RECONNECT_FEED' | 'BYPASS_TRADEABILITY_GATE' | 'NONE';
}

export interface ExecutionStatus {
  blocked: boolean;
  reason: string | null;
  code: string;
  actionType: 'START_ENGINE' | 'ACTIVATE_STRATEGIES' | 'RESET_CIRCUIT_BREAKER' | 'RESET_KILL_SWITCH' | 'VIEW_POSITIONS' | 'ADJUST_MACRO' | 'ADD_CREDENTIALS' | 'RECONNECT_FEED' | 'BYPASS_TRADEABILITY_GATE' | 'NONE';
  guardrails: ExecutionGuardrail[];
  summary?: {
    engineRunning: boolean;
    activeStrategies: string[];
    openPositionsCount: number;
    maxPositionsLimit: number;
    dailyLossPct: number;
    dailyLossLimit: number;
    consecutiveLosses: number;
    maxConsecutiveLosses: number;
    killSwitchActive: boolean;
    macroColor: string;
    isFeedStale: boolean;
    recommendedDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
    directionBiasLabel?: string;
    regimeDirectionEnforced?: boolean;
  };
}

export interface SystemHealth {
  engine: 'RUNNING' | 'PAUSED' | 'ERROR';
  marketData: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  userStream: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  lastReconciliationAt: string;
  tradingBlocked: boolean;
  blockReason?: string;
  blockCode?: string;
  blockAction?: 'START_ENGINE' | 'ACTIVATE_STRATEGIES' | 'RESET_CIRCUIT_BREAKER' | 'RESET_KILL_SWITCH' | 'VIEW_POSITIONS' | 'ADJUST_MACRO' | 'ADD_CREDENTIALS' | 'RECONNECT_FEED' | 'BYPASS_TRADEABILITY_GATE' | 'NONE';
  guardrails?: ExecutionGuardrail[];
  summary?: any;
  riskStatus?: RiskStatus;
}

export interface RiskStatus {
  killSwitchActive: boolean;
  currentDailyLossPct: number;
  dailyLossLimitPct: number;
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  currentExposure: number;
  maxExposurePct: number;
  remainingExposure: number;
  maxSimultaneousTrades: number;
  tradesToday: number;
  maxTradesPerDay: number;
  maxLeverage: number;
  minLiqBuffer: number;
  minStopDistancePct: number;
  maxStopDistancePct: number;
  minRRRatio: number;
  maxSpread: number;
  maxFundingRate: number;
  tradeCooldownMinutes: number;
  correlationFilterEnabled: boolean;
  maxCorrelation: number;
  btcMacroRegimeFilter: boolean;
  enforceStrictSl: boolean;
}

export interface TargetView {
  price: number;
  label: string;
  hit: boolean;
}

export interface PositionView {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  stopStatus: 'CONFIRMED' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';
  targets: TargetView[];
  sourceStrategy: string;
  updatedAt: string;
}

export interface SignalView {
  id: string;
  symbol: string;
  regime: string;
  confidence: number;
  strategy: string;
  decision: 'ENTER' | 'WATCH' | 'REJECT';
  rejectionReasons: string[];
  createdAt: string;
}

export interface EquitySnapshot {
  time: string; // YYYY-MM-DD HH:MM
  balance: number;
}
