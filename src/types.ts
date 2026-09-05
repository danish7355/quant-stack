/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '2H' | '4H' | '1D';

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export type CoinStatus = 'STRONG_TREND' | 'WEAK_TREND' | 'TRANSITION' | 'RANGE' | 'UNSAFE' | 'TRENDING' | 'RANGING' | 'CHOPPY';

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
  candles: {
    time: number; // UTC timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
}

export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strategy?: string; // e.g. 'BINANCE_COMPOSITE', 'DELTA_CLIMAX', 'VOLATILITY_COMPRESSION', 'TREND_PULLBACK'
  marketRegime?: string; // e.g. 'Trending [EMA Pullback]', 'Exhaustion Climax', 'Consolidation Squeeze'
  isAutoRegime?: boolean;
  frequencyPreset?: 'LOW' | 'MEDIUM' | 'HIGH';
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
  scoreAtEntry: number;
  unrealizedPnl: number;
  realizedPnl: number;
  sizeRemainingPct: number; // 100 on start, drops to 60 then 20 after TPs
  lastUpdated?: number;
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
  isAutoRegime?: boolean;
  frequencyPreset?: 'LOW' | 'MEDIUM' | 'HIGH';
  entryPrice: number;
  closePrice: number;
  leverage: number;
  profit: number;
  pctReturn: number;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TS' | 'MANUAL' | 'TIME_EXIT' | 'DECAY';
  timeOpen: string;
  timeClose: string;
  scoreAtEntry: number;
  scoreAtClose?: number;
}

export interface AppSettings {
  // Strategy Selection
  activeStrategy: 'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'VOLATILITY_COMPRESSION' | 'TREND_PULLBACK' | 'AUTO_REGIME';
  // Trade Frequency Preset (LOW = Strict, MEDIUM = Balanced/Recommended, HIGH = Aggressive)
  tradeFrequency: 'LOW' | 'MEDIUM' | 'HIGH';

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
  positionSizePct: number; // % of total balance per trade
  accountRiskPct: number; // % account risk per trade
  leverage: number;
  maxConcurrentTrades: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  
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

  // Gate Management & Strategy-Wise Bypasses
  disabledGates?: Record<string, boolean>;

  // GitHub Integration
  githubPat?: string;
  githubRepoUrl?: string;
}

export interface EquitySnapshot {
  time: string; // YYYY-MM-DD HH:MM
  balance: number;
}
