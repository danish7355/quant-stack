// src/types/backtest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unified types and contracts for the Backtesting Engine and UI.
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestRiskSettings {
  positionSizePct: number; // e.g. 5 (%)
  accountRiskPct: number; // e.g. 1 (%)
  leverage: number; // e.g. 5 (x)
  maxConcurrentTrades: number; // e.g. 3
  dailyLossLimitPct: number; // e.g. 3 (%)
  maxDrawdownPct: number; // e.g. 10 (%)
  trailingStopActivation?: 'TP1' | '1R' | '2R' | 'OFF';
  trailAtrMultiple?: number;
  tp1Ratio?: number;
  tp2Ratio?: number;
}

export interface BacktestFeeSettings {
  takerPct: number; // e.g. 0.05 (%)
  gstPct: number; // e.g. 18 (%)
  makerPct?: number; // e.g. 0.02 (%)
}

export interface BacktestParams {
  strategies: string[]; // e.g. ['EMA_GAP_PULLBACK', 'VOLATILITY_COMPRESSION']
  symbols: string[]; // e.g. ['BTCUSDT', 'ETHUSDT']
  execTf: string; // e.g. '15m' or '5m'
  dirTf: string; // e.g. '1h' or '4h'
  from: number; // timestamp in ms
  to: number; // timestamp in ms
  capital: number; // e.g. 10000
  riskSettings?: Partial<BacktestRiskSettings>;
  strategyParams?: Record<string, any>;
  fees?: Partial<BacktestFeeSettings>;
  slippagePct?: number; // e.g. 0.05 (%)
  mode: 'single' | 'portfolio';
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  strategy: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number; // ms
  entryPrice: number;
  exitTime: number; // ms
  exitPrice: number;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TRAILING_STOP' | 'TIMEOUT' | 'END_OF_DATA';
  quantity: number;
  notional: number; // entryPrice * quantity
  initialSl: number;
  initialTp1: number;
  initialTp2?: number;
  initialTp3?: number;
  riskDollars: number; // |entryPrice - initialSl| * quantity
  riskPerUnit: number; // |entryPrice - initialSl|
  grossPnl: number;
  grossR: number; // grossPnl / riskDollars
  netPnl: number;
  netR: number; // netPnl / riskDollars
  fees: number; // total roundtrip fees with GST
  slippageCost: number;
  feeDragPct: number; // (fees / riskDollars) * 100
  holdingBars: number;
  holdingDurationMs: number;
  accountBalanceAfter: number;
}

export interface EquityPoint {
  time: number;
  balance: number;
  drawdownPct: number;
  tradeId?: string;
}

export interface RDistributionBin {
  bin: string; // e.g. '< -1R', '-1R to 0R', '0R to 1R', '1R to 2R', '2R to 3R', '> 3R'
  count: number;
  percentage: number;
}

export interface StrategyMetricSummary {
  strategy: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // %
  grossPnl: number;
  netPnl: number;
  netR: number;
  profitFactor: number;
  avgR: number;
  feeDragPct: number;
}

export interface SymbolMetricSummary {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // %
  grossPnl: number;
  netPnl: number;
  netR: number;
  profitFactor: number;
  avgR: number;
}

export interface BacktestSummaryMetrics {
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  netPnl: number;
  grossPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number; // %
  profitFactor: number;
  totalFees: number;
  totalSlippageCost: number;
  feeDragPct: number; // (totalFees / totalRiskDollars) * 100
  avgTradePnl: number;
  avgR: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number; // (winRate% * avgWinR) - (lossRate% * avgLossR)
  maxDrawdownDollars: number;
  maxDrawdownPct: number;
  signalsPerDay: number;
  avgHoldingBars: number;
  avgHoldingDurationHours: number;
  equityCurve: EquityPoint[];
  rDistribution: RDistributionBin[];
  byStrategy: Record<string, StrategyMetricSummary>;
  bySymbol: Record<string, SymbolMetricSummary>;
  rejectionCounts: Record<string, number>;
}

export interface BacktestResult {
  jobId: string;
  params: BacktestParams;
  startTime: number;
  endTime: number;
  durationMs: number;
  trades: BacktestTrade[];
  summary: BacktestSummaryMetrics;
}

export interface BacktestJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0 to 100
  message: string;
  currentStep?: string;
  result?: BacktestResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
