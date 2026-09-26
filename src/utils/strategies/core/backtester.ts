// src/utils/strategies/core/backtester.ts
// ─────────────────────────────────────────────────────────────────────────────
// Event-driven candle-close backtester.
// Evaluates ONLY information available at each candle close.
// Models realistic execution costs: spread, commission, slippage.
// Records every signal (accepted and rejected) for analysis.
// ─────────────────────────────────────────────────────────────────────────────
import { StrategySignal, MarketContext } from "./StrategySignal";
import { computePositionSize, AccountState, SizingSettings } from "./positionSizer";
import { detectRegime, Candle } from "./regimeDetector";
import { filterAndRankSignals, ValidationSettings, clearSignalDedup } from "./signalValidator";
import { logger } from "./logger";

// ── Cost model ─────────────────────────────────────────────────────────────

export interface CostModel {
  /** Fraction of entry price (e.g., 0.0002 = 0.02 %) */
  spreadFraction: number;
  /** Commission per unit */
  commissionPerUnit: number;
  /** Slippage as fraction of ATR (e.g., 0.1 = 10 % of ATR) */
  slippageAtrFraction: number;
}

// ── Trade record ───────────────────────────────────────────────────────────

export interface TradeRecord {
  signalId: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  direction: "long" | "short";
  entryTime: number;
  exitTime?: number;
  entryPrice: number;
  exitPrice?: number;
  sl: number;
  tp1: number;
  tp2: number;
  quantity: number;
  grossPnl?: number;
  costs?: number;
  netPnl?: number;
  exitReason?: "sl" | "tp1" | "tp2" | "tp3" | "end_of_data";
  regime: string;
  volatility: string;
  setupScore: number;
  rr1: number;
}

// ── Backtest result ────────────────────────────────────────────────────────

export interface BacktestResult {
  trades: TradeRecord[];
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  sharpeRatio: number;
  maxConsecutiveLosses: number;
  rejectedSignals: number;
}

// ── Strategy adapter type ──────────────────────────────────────────────────

export type StrategyFn = (
  candles: Candle[],
  htfCandles: Candle[],
  symbol: string,
  timeframe: string
) => StrategySignal | null;

// ── Backtest engine ────────────────────────────────────────────────────────

export interface BacktestConfig {
  strategies: StrategyFn[];
  candles: Candle[];
  htfCandles?: Candle[];
  symbol: string;
  timeframe: string;
  warmupBars?: number;
  costs: CostModel;
  sizing: SizingSettings;
  validation?: ValidationSettings;
  /** Starting account equity */
  startEquity?: number;
}

export function runBacktest(config: BacktestConfig): BacktestResult {
  const {
    strategies, candles, htfCandles = [], symbol, timeframe,
    warmupBars = 50, costs, sizing, validation = {},
    startEquity = 100_000,
  } = config;

  clearSignalDedup();

  const trades: TradeRecord[] = [];
  let equity = startEquity;
  let sessionPnl = 0;
  let openTrades: Array<{ trade: TradeRecord; qty: number }> = [];
  let rejectedSignals = 0;
  const equityCurve: number[] = [];
  let maxEquity = equity;
  let maxDrawdown = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;

  for (let i = warmupBars; i < candles.length; i++) {
    const visibleCandles = candles.slice(0, i + 1);
    const visibleHtf = htfCandles.slice(0, Math.min(i + 1, htfCandles.length));
    const currentCandle = candles[i];

    // ── 1. Check open trades for SL/TP hits on this candle ──────────────────
    const stillOpen: typeof openTrades = [];
    for (const { trade, qty } of openTrades) {
      const { high, low, close } = currentCandle;
      let exitPrice: number | undefined;
      let exitReason: TradeRecord["exitReason"];

      if (trade.direction === "long") {
        if (low <= trade.sl) { exitPrice = trade.sl; exitReason = "sl"; }
        else if (high >= trade.tp2) { exitPrice = trade.tp2; exitReason = "tp2"; }
        else if (high >= trade.tp1) { exitPrice = trade.tp1; exitReason = "tp1"; }
      } else {
        if (high >= trade.sl) { exitPrice = trade.sl; exitReason = "sl"; }
        else if (low <= trade.tp2) { exitPrice = trade.tp2; exitReason = "tp2"; }
        else if (low <= trade.tp1) { exitPrice = trade.tp1; exitReason = "tp1"; }
      }

      if (exitPrice !== undefined && exitReason) {
        const sign = trade.direction === "long" ? 1 : -1;
        const grossPnl = sign * (exitPrice - trade.entryPrice) * qty;
        const commission = costs.commissionPerUnit * qty * 2; // entry + exit
        const spread = costs.spreadFraction * trade.entryPrice * qty;
        const slippage = costs.slippageAtrFraction * (trade.sl ? Math.abs(trade.entryPrice - trade.sl) / 3 : 0) * qty;
        const totalCosts = commission + spread + slippage;
        const netPnl = grossPnl - totalCosts;

        trade.exitTime = currentCandle.time ?? Date.now();
        trade.exitPrice = exitPrice;
        trade.grossPnl = grossPnl;
        trade.costs = totalCosts;
        trade.netPnl = netPnl;
        trade.exitReason = exitReason;

        equity += netPnl;
        sessionPnl += netPnl;

        if (netPnl < 0) consecutiveLosses++;
        else { maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses); consecutiveLosses = 0; }

        maxEquity = Math.max(maxEquity, equity);
        maxDrawdown = Math.max(maxDrawdown, (maxEquity - equity) / maxEquity);
      } else {
        stillOpen.push({ trade, qty });
      }
    }
    openTrades = stillOpen;
    equityCurve.push(equity);

    // ── 2. Generate candidate signals ─────────────────────────────────────
    const context: MarketContext = detectRegime(visibleCandles, visibleHtf.length ? visibleHtf : undefined);
    const account: AccountState = {
      equity,
      sessionPnl,
      openPositions: openTrades.length,
      totalOpenNotional: openTrades.reduce((s, { trade, qty }) => s + trade.entryPrice * qty, 0),
      killSwitchActive: false,
    };

    const candidates = strategies.map(fn => {
      try { return fn(visibleCandles, visibleHtf, symbol, timeframe); }
      catch { return null; }
    });

    const validSignals = filterAndRankSignals(candidates, context, validation);

    // Count rejections
    rejectedSignals += candidates.filter(Boolean).length - validSignals.length;

    // ── 3. Enter top-ranked signal (one per candle) ────────────────────────
    for (const signal of validSignals.slice(0, 1)) {
      const sizeResult = computePositionSize(signal.entry, signal.riskPerUnit, account, sizing);
      if (sizeResult.quantity <= 0) { rejectedSignals++; continue; }

      const atr = signal.atr;
      const slipPrice = costs.slippageAtrFraction * atr * (signal.direction === "long" ? 1 : -1);
      const actualEntry = signal.entry + slipPrice;

      const trade: TradeRecord = {
        signalId: signal.signalId,
        strategy: signal.strategy,
        symbol,
        timeframe,
        direction: signal.direction,
        entryTime: currentCandle.time ?? Date.now(),
        entryPrice: actualEntry,
        sl: signal.sl,
        tp1: signal.tp1,
        tp2: signal.tp2,
        quantity: sizeResult.quantity,
        regime: context.regime,
        volatility: context.volatility,
        setupScore: signal.setupScore,
        rr1: signal.rr1,
      };
      openTrades.push({ trade, qty: sizeResult.quantity });
      trades.push(trade);

      logger.info({
        strategy: signal.strategy, symbol, timeframe,
        direction: signal.direction, entry: actualEntry,
        sl: signal.sl, tp1: signal.tp1, atr,
        setupScore: signal.setupScore, rejectionReason: null,
        regime: context.regime, volatility: context.volatility,
      });
    }
  }

  // ── 4. Close any remaining open trades at last close ──────────────────────
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  for (const { trade, qty } of openTrades) {
    const sign = trade.direction === "long" ? 1 : -1;
    const grossPnl = sign * (lastClose - trade.entryPrice) * qty;
    const costs2 = costs.commissionPerUnit * qty;
    trade.grossPnl = grossPnl; trade.costs = costs2;
    trade.netPnl = grossPnl - costs2; trade.exitReason = "end_of_data";
    trade.exitPrice = lastClose; trade.exitTime = candles[candles.length - 1].time ?? Date.now();
  }

  // ── 5. Aggregate stats ────────────────────────────────────────────────────
  const completedTrades = trades.filter(t => t.netPnl !== undefined);
  const wins = completedTrades.filter(t => (t.netPnl ?? 0) > 0);
  const losses = completedTrades.filter(t => (t.netPnl ?? 0) <= 0);
  const grossPnlTotal = completedTrades.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
  const costTotal = completedTrades.reduce((s, t) => s + (t.costs ?? 0), 0);
  const netPnlTotal = completedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const grossWins = wins.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : Infinity;
  const expectancy = completedTrades.length > 0 ? netPnlTotal / completedTrades.length : 0;

  // Sharpe: daily returns from equity curve
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const std = Math.sqrt(returns.map(r => (r - mean) ** 2).reduce((a, b) => a + b, 0) / (returns.length || 1));
  const sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  return {
    trades: completedTrades,
    totalTrades: completedTrades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: completedTrades.length > 0 ? wins.length / completedTrades.length : 0,
    grossPnl: grossPnlTotal,
    totalCosts: costTotal,
    netPnl: netPnlTotal,
    profitFactor,
    expectancy,
    maxDrawdown,
    sharpeRatio,
    maxConsecutiveLosses,
    rejectedSignals,
  };
}
