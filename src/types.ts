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
  egpSignal?: any;
  crSignal?: any;
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
}

export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strategy?: string; 
  marketRegime?: string; 
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
  btcPrice?: number;
  ethPrice?: number;
}

import type { TradingSettings, TradingMode, SettingsLoadState, ValidationResult } from './shared/TradingSettings.js';
import { NUMERIC_BOUNDS, validateTradingSettings, CANONICAL_DEFAULT_SETTINGS } from './shared/TradingSettings.js';
export type { TradingSettings, TradingMode, SettingsLoadState, ValidationResult };
export { NUMERIC_BOUNDS, validateTradingSettings, CANONICAL_DEFAULT_SETTINGS };
export type AppSettings = TradingSettings;

export interface SystemHealth {
  engine: 'RUNNING' | 'PAUSED' | 'ERROR';
  marketData: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  userStream: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  lastReconciliationAt: string;
  tradingBlocked: boolean;
  blockReason?: string;
  globalFilterActive?: boolean;
  globalFilterReason?: string;
  dailyLossPct?: number;
  consecutiveLosses?: number;
  activePositions?: number;
  telegramConfigured?: boolean;
  timestamp?: string;
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
