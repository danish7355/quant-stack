/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { TradeLog } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Calculator,
  Compass,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Filter,
  BarChart2,
  Activity,
  Zap,
  Target,
  Clock,
  Flame,
  Maximize2
} from 'lucide-react';

interface PerformanceInsightsProps {
  logs: TradeLog[];
}

export type GroupingMode = 'STRATEGY' | 'REGIME' | 'COMBINED';

interface SetupEVMetrics {
  id: string;
  name: string;
  marketCondition: 'Trending' | 'Ranging / Consolidation' | 'Mean-Reversion / Climax' | 'Unspecified';
  description: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnL: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  payoffRatio: number; // Avg Win / Avg Loss
  evPerTrade: number; // (Pwin * AvgWin) - (Ploss * AvgLoss) in $
  evPctPerTrade: number; // Expected return % per trade
  profitFactor: number;
  status: 'STRONG_EDGE' | 'POSITIVE_EDGE' | 'NEUTRAL' | 'NEGATIVE_DRAG';
  diagnosis: string;
  recommendedAction: string;
}

// Map each known strategy to its typical market condition
export function getMarketConditionForStrategy(strategy?: string): 'Trending' | 'Ranging / Consolidation' | 'Mean-Reversion / Climax' | 'Unspecified' {
  const s = (strategy || '').toUpperCase();
  if (s === 'TREND_PULLBACK' || s.includes('PULLBACK')) return 'Trending';
  if (s === 'BINANCE_COMPOSITE' || s.includes('COMPOSITE')) return 'Trending';
  if (s === 'VOLATILITY_COMPRESSION' || s.includes('COMPRESSION') || s === 'VCB') return 'Ranging / Consolidation';
  if (s === 'DELTA_CLIMAX' || s.includes('CLIMAX')) return 'Mean-Reversion / Climax';
  return 'Unspecified';
}

export default function PerformanceInsights({ logs }: PerformanceInsightsProps) {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('STRATEGY');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);

  // Filter logs by direction if specified
  const filteredLogs = useMemo(() => {
    if (directionFilter === 'ALL') return logs;
    return logs.filter((l) => l.direction === directionFilter);
  }, [logs, directionFilter]);

  // Group and compute EV metrics
  const setupMetricsList = useMemo<SetupEVMetrics[]>(() => {
    if (!filteredLogs || filteredLogs.length === 0) return [];

    const groups: { [key: string]: { name: string; condition: any; description: string; diagnosis: string; recommendedAction: string; trades: TradeLog[] } } = {};

    if (groupingMode === 'STRATEGY') {
      filteredLogs.forEach((trade) => {
        const stratKey = (trade.strategy || 'UNSPECIFIED').toUpperCase();
        if (!groups[stratKey]) {
          let displayName = stratKey;
          let cond: 'Trending' | 'Ranging / Consolidation' | 'Mean-Reversion / Climax' | 'Unspecified' = 'Unspecified';
          let desc = 'Trades without strategy tag';
          let diag = 'Review strategy mapping';
          let rec = 'Track strategy parameter in order placement.';

          if (stratKey === 'TREND_PULLBACK') {
            displayName = 'Trend Pullback';
            cond = 'Trending';
            desc = 'EMA 21/50 trend continuation on dynamic value pullbacks';
            diag = 'Win rate has been hurt by false pullbacks in ranging markets and illiquid tokens.';
            rec = 'Enforce $25M+ 24h volume filter and volume exhaustion checks.';
          } else if (stratKey === 'DELTA_CLIMAX') {
            displayName = 'Delta Climax';
            cond = 'Mean-Reversion / Climax';
            desc = 'Overextended price exhaustion with rejection wicks';
            diag = 'Highest historical profit factor and reliable edge on sharp market blow-offs.';
            rec = 'Maintain standard ATR target multipliers.';
          } else if (stratKey === 'BINANCE_COMPOSITE') {
            displayName = 'Binance Composite';
            cond = 'Trending';
            desc = 'Fast EMA cross + RSI + ADX trend momentum alignment';
            diag = 'Low raw win rate (21%) but strongly positive EV due to large 6.3:1 winners.';
            rec = 'Let runners hit higher TP targets to preserve asymmetric payoff.';
          } else if (stratKey === 'VOLATILITY_COMPRESSION' || stratKey === 'VCB') {
            displayName = 'Volatility Compression';
            cond = 'Ranging / Consolidation';
            desc = 'Squeeze consolidation breakout with expanding volume';
            diag = 'Consistent 50%+ win rate during sideways accumulation phases.';
            rec = 'Optimal during low-volatility Asian sessions.';
          }

          groups[stratKey] = {
            name: displayName,
            condition: cond,
            description: desc,
            diagnosis: diag,
            recommendedAction: rec,
            trades: [],
          };
        }
        groups[stratKey].trades.push(trade);
      });
    } else if (groupingMode === 'REGIME') {
      const regimeCategories: Array<{
        key: string;
        name: string;
        condition: 'Trending' | 'Ranging / Consolidation' | 'Mean-Reversion / Climax' | 'Unspecified';
        desc: string;
        diag: string;
        rec: string;
      }> = [
        {
          key: 'TRENDING_REGIME',
          name: 'Trending Market Regime',
          condition: 'Trending',
          desc: 'Directional momentum & EMA value pullbacks (Trend Pullback & Composite)',
          diag: 'Performance depends strongly on macro trend strength vs sideways chop.',
          rec: 'Filter with ADX > 22 or 1H EMA alignment to prevent false breaks.',
        },
        {
          key: 'RANGING_REGIME',
          name: 'Ranging / Consolidation Regime',
          condition: 'Ranging / Consolidation',
          desc: 'ATR squeeze, range contraction & boundary breakouts (Volatility Compression)',
          diag: 'Performs reliably in quiet, low-ATR periods before expansion.',
          rec: 'Use tighter time-based exits if breakout stalls within 4 bars.',
        },
        {
          key: 'REVERSAL_REGIME',
          name: 'Exhaustion & Climax Regime',
          condition: 'Mean-Reversion / Climax',
          desc: 'Extreme overextension, volume climaxes & sharp wick rejections (Delta Climax)',
          diag: 'Generates the highest expected value ($) per trade in high-volatility spikes.',
          rec: 'Target mean reversion to 20 EMA with strict stop at rejection wick peak.',
        },
        {
          key: 'UNSPECIFIED_REGIME',
          name: 'General / Legacy Trades',
          condition: 'Unspecified',
          desc: 'Unclassified manual or early system trades',
          diag: 'Legacy executions before dedicated strategy tagging.',
          rec: 'Ensure all new automated trades pass explicit strategy tag.',
        },
      ];

      regimeCategories.forEach((rc) => {
        groups[rc.key] = {
          name: rc.name,
          condition: rc.condition,
          description: rc.desc,
          diagnosis: rc.diag,
          recommendedAction: rc.rec,
          trades: [],
        };
      });

      filteredLogs.forEach((trade) => {
        const cond = getMarketConditionForStrategy(trade.strategy);
        if (cond === 'Trending') groups['TRENDING_REGIME'].trades.push(trade);
        else if (cond === 'Ranging / Consolidation') groups['RANGING_REGIME'].trades.push(trade);
        else if (cond === 'Mean-Reversion / Climax') groups['REVERSAL_REGIME'].trades.push(trade);
        else groups['UNSPECIFIED_REGIME'].trades.push(trade);
      });
    } else {
      // COMBINED: Strategy x Market Condition
      filteredLogs.forEach((trade) => {
        const stratKey = (trade.strategy || 'UNSPECIFIED').toUpperCase();
        const cond = getMarketConditionForStrategy(trade.strategy);
        const comboKey = `${stratKey}_${cond.replace(/\s+/g, '_')}`;

        if (!groups[comboKey]) {
          groups[comboKey] = {
            name: `${stratKey.replace('_', ' ')} (${cond})`,
            condition: cond,
            description: `Strategy ${stratKey} operating in ${cond} market regime`,
            diagnosis: 'Setup specific regime evaluation',
            recommendedAction: 'Observe EV correlation with market condition.',
            trades: [],
          };
        }
        groups[comboKey].trades.push(trade);
      });
    }

    // Now calculate Expected Value (EV) and performance metrics for each group
    const results: SetupEVMetrics[] = Object.entries(groups)
      .filter(([_, g]) => g.trades.length > 0)
      .map(([key, g]) => {
        const tList = g.trades;
        const total = tList.length;
        const wins = tList.filter((t) => t.profit > 0);
        const losses = tList.filter((t) => t.profit < 0);
        const be = tList.filter((t) => t.profit === 0);

        const winCount = wins.length;
        const lossCount = losses.length;
        const beCount = be.length;

        const winRate = (winCount / total) * 100;
        const pWin = winCount / total;
        const pLoss = lossCount / total;

        const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
        const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
        const netPnL = grossProfit - grossLoss;

        const avgWin = winCount > 0 ? grossProfit / winCount : 0;
        const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;

        const avgWinPct = winCount > 0 ? wins.reduce((sum, t) => sum + (t.pctReturn || 0), 0) / winCount : 0;
        const avgLossPct = lossCount > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.pctReturn || 0), 0) / lossCount) : 0;

        // Payoff Ratio = Avg Win / Avg Loss
        const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 10.0 : 1.0;

        // Expected Value per trade: EV = (P_win * Avg_Win) - (P_loss * Avg_Loss)
        const evPerTrade = (pWin * avgWin) - (pLoss * avgLoss);
        const evPctPerTrade = (pWin * avgWinPct) - (pLoss * avgLossPct);

        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 1.0;

        // Edge Status categorization
        let status: 'STRONG_EDGE' | 'POSITIVE_EDGE' | 'NEUTRAL' | 'NEGATIVE_DRAG' = 'NEUTRAL';
        if (evPerTrade >= 15 || (evPctPerTrade >= 3.0 && total >= 5)) {
          status = 'STRONG_EDGE';
        } else if (evPerTrade > 0.5) {
          status = 'POSITIVE_EDGE';
        } else if (evPerTrade < -1.0) {
          status = 'NEGATIVE_DRAG';
        } else {
          status = 'NEUTRAL';
        }

        return {
          id: key,
          name: g.name,
          marketCondition: g.condition,
          description: g.description,
          totalTrades: total,
          wins: winCount,
          losses: lossCount,
          breakeven: beCount,
          winRate,
          grossProfit,
          grossLoss,
          netPnL,
          avgWin,
          avgLoss,
          avgWinPct,
          avgLossPct,
          payoffRatio,
          evPerTrade,
          evPctPerTrade,
          profitFactor,
          status,
          diagnosis: g.diagnosis,
          recommendedAction: g.recommendedAction,
        };
      });

    // Sort by Expected Value descending so best setups appear first
    return results.sort((a, b) => b.evPerTrade - a.evPerTrade);
  }, [filteredLogs, groupingMode]);

  // Overall statistics for banner
  const overallMetrics = useMemo(() => {
    if (!filteredLogs || filteredLogs.length === 0) return null;
    const total = filteredLogs.length;
    const wins = filteredLogs.filter((t) => t.profit > 0);
    const losses = filteredLogs.filter((t) => t.profit < 0);
    const grossWin = wins.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
    const net = grossWin - grossLoss;
    const overallEV = total > 0 ? net / total : 0;
    const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const winRate = (wins.length / total) * 100;

    const highestEV = setupMetricsList.length > 0 ? setupMetricsList[0] : null;
    const lowestEV = setupMetricsList.length > 0 ? setupMetricsList[setupMetricsList.length - 1] : null;

    return {
      total,
      winRate,
      overallEV,
      avgWin,
      avgLoss,
      net,
      highestEV,
      lowestEV,
    };
  }, [filteredLogs, setupMetricsList]);

  if (!logs || logs.length === 0) {
    return (
      <div id="performance-insights" className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
        <div className="flex items-center space-x-2 mb-4">
          <Calculator className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-gray-100 uppercase tracking-wider">Performance Insights & Expected Value (EV)</h3>
        </div>
        <div className="text-center py-10 text-gray-500 text-sm">
          No trade history available yet to calculate Expected Value and Market Regime insights.
        </div>
      </div>
    );
  }

  return (
    <div id="performance-insights" className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider">
                  Performance Insights & Expected Value (EV)
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  Setup Diagnostics
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Quantifies mathematical edge <span className="font-mono text-gray-300">EV = (P(W) × Avg Win) - (P(L) × Avg Loss)</span> to identify if win rate issues stem from market regimes or specific setups.
              </p>
            </div>
          </div>
        </div>

        {/* Grouping Mode & Direction Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Direction Filter */}
          <div className="flex items-center bg-gray-950/60 p-0.5 rounded-lg border border-gray-800 text-xs">
            <button
              onClick={() => setDirectionFilter('ALL')}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                directionFilter === 'ALL' ? 'bg-gray-800 text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All Trades
            </button>
            <button
              onClick={() => setDirectionFilter('LONG')}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                directionFilter === 'LONG' ? 'bg-emerald-600/30 text-emerald-300 shadow-sm' : 'text-gray-400 hover:text-emerald-400'
              }`}
            >
              LONGs
            </button>
            <button
              onClick={() => setDirectionFilter('SHORT')}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                directionFilter === 'SHORT' ? 'bg-rose-600/30 text-rose-300 shadow-sm' : 'text-gray-400 hover:text-rose-400'
              }`}
            >
              SHORTs
            </button>
          </div>

          {/* Grouping Toggle */}
          <div className="flex items-center bg-gray-950/60 p-0.5 rounded-lg border border-gray-800 text-xs font-mono">
            <button
              onClick={() => setGroupingMode('STRATEGY')}
              className={`px-3 py-1 rounded font-semibold transition-all flex items-center space-x-1.5 ${
                groupingMode === 'STRATEGY' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>By Strategy</span>
            </button>
            <button
              onClick={() => setGroupingMode('REGIME')}
              className={`px-3 py-1 rounded font-semibold transition-all flex items-center space-x-1.5 ${
                groupingMode === 'REGIME' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>By Market Regime</span>
            </button>
            <button
              onClick={() => setGroupingMode('COMBINED')}
              className={`px-3 py-1 rounded font-semibold transition-all flex items-center space-x-1.5 ${
                groupingMode === 'COMBINED' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Combined</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Level Diagnostic Summary Cards */}
      {overallMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Overall EV */}
          <div className="bg-gray-950/50 border border-gray-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Overall Expected Value</span>
              <Calculator className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="my-1.5 flex items-baseline space-x-1.5">
              <span className={`text-2xl font-black font-mono ${overallMetrics.overallEV >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overallMetrics.overallEV >= 0 ? '+' : ''}${overallMetrics.overallEV.toFixed(2)}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">/ trade</span>
            </div>
            <span className="text-[10px] text-gray-500">
              Mathematical return across all {overallMetrics.total} recorded executions.
            </span>
          </div>

          {/* Highest EV Regime */}
          <div className="bg-gray-950/50 border border-emerald-900/30 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-emerald-400">
              <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center">
                <Sparkles className="w-3 h-3 mr-1" /> Highest EV Setup
              </span>
              <span className="text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-300">
                Top Edge
              </span>
            </div>
            <div className="my-1">
              <span className="text-sm font-bold text-gray-100 truncate block">
                {overallMetrics.highestEV?.name || 'N/A'}
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-base font-black font-mono text-emerald-400">
                  +${overallMetrics.highestEV?.evPerTrade.toFixed(2)} EV
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ({overallMetrics.highestEV?.winRate.toFixed(0)}% WR)
                </span>
              </div>
            </div>
            <span className="text-[10px] text-emerald-500/80 truncate">
              {overallMetrics.highestEV?.marketCondition} condition
            </span>
          </div>

          {/* Biggest Drag Setup */}
          <div className="bg-gray-950/50 border border-rose-900/30 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-rose-400">
              <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" /> Biggest Win Rate Drag
              </span>
              <span className="text-[10px] font-mono bg-rose-500/10 px-1.5 py-0.5 rounded text-rose-300">
                Needs Guardrail
              </span>
            </div>
            <div className="my-1">
              <span className="text-sm font-bold text-gray-100 truncate block">
                {overallMetrics.lowestEV?.name || 'N/A'}
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-base font-black font-mono text-rose-400">
                  {overallMetrics.lowestEV?.evPerTrade !== undefined ? `${overallMetrics.lowestEV.evPerTrade >= 0 ? '+' : ''}$${overallMetrics.lowestEV.evPerTrade.toFixed(2)}` : 'N/A'} EV
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ({overallMetrics.lowestEV?.winRate.toFixed(0)}% WR)
                </span>
              </div>
            </div>
            <span className="text-[10px] text-rose-400/80 truncate">
              {overallMetrics.lowestEV?.marketCondition} condition
            </span>
          </div>

          {/* Payoff Asymmetry Insight */}
          <div className="bg-gray-950/50 border border-gray-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Payoff vs. Win Rate</span>
              <Target className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="my-1 flex items-baseline space-x-2">
              <span className="text-lg font-bold font-mono text-gray-200">
                ${overallMetrics.avgWin.toFixed(1)} <span className="text-xs text-gray-500 font-normal">W</span>
              </span>
              <span className="text-gray-500 text-xs font-mono">vs</span>
              <span className="text-lg font-bold font-mono text-gray-200">
                ${overallMetrics.avgLoss.toFixed(1)} <span className="text-xs text-gray-500 font-normal">L</span>
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              {overallMetrics.avgLoss > 0 && (overallMetrics.avgWin / overallMetrics.avgLoss) >= 2.0
                ? 'High R:R compensates for lower win-rate setups.'
                : 'Balanced reward-to-risk distribution across closed trades.'}
            </span>
          </div>
        </div>
      )}

      {/* Expected Value & Market Condition Matrix Table / Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              {groupingMode === 'STRATEGY' && 'Strategy Breakdown & Expected Value Matrix'}
              {groupingMode === 'REGIME' && 'Market Condition Regimes & Edge Quantification'}
              {groupingMode === 'COMBINED' && 'Strategy × Market Condition Detailed Breakdown'}
            </h4>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">
            {setupMetricsList.length} setup groups identified
          </span>
        </div>

        {/* Breakdown Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {setupMetricsList.map((setup) => {
            const isSelected = selectedSetupId === setup.id;
            const isPositiveEV = setup.evPerTrade > 0;
            const isStrongEdge = setup.status === 'STRONG_EDGE';
            const isDrag = setup.status === 'NEGATIVE_DRAG';

            return (
              <div
                key={setup.id}
                onClick={() => setSelectedSetupId(isSelected ? null : setup.id)}
                className={`cursor-pointer transition-all border rounded-xl p-4.5 bg-gray-950/40 hover:bg-gray-950/70 ${
                  isStrongEdge
                    ? 'border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                    : isDrag
                    ? 'border-rose-500/30'
                    : isPositiveEV
                    ? 'border-indigo-500/30'
                    : 'border-gray-800'
                } ${isSelected ? 'ring-2 ring-indigo-500/50 bg-gray-950/90' : ''}`}
              >
                {/* Top Row: Name, Market Condition, EV Badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h5 className="text-sm font-bold text-gray-100">{setup.name}</h5>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono ${
                          setup.marketCondition === 'Trending'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : setup.marketCondition === 'Ranging / Consolidation'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : setup.marketCondition === 'Mean-Reversion / Climax'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-gray-800 text-gray-400'
                        }`}
                      >
                        {setup.marketCondition}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{setup.description}</p>
                  </div>

                  {/* EV Pill Badge */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-mono font-black ${
                        isPositiveEV
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isPositiveEV ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
                      <span>{isPositiveEV ? '+' : ''}${setup.evPerTrade.toFixed(2)} EV</span>
                    </div>
                    <span className="block text-[9px] text-gray-500 font-mono mt-0.5">
                      {setup.evPctPerTrade >= 0 ? '+' : ''}{setup.evPctPerTrade.toFixed(2)}% / trade
                    </span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-2 text-center py-2.5 my-2 border-y border-gray-800/70 font-mono text-xs">
                  {/* Win Rate */}
                  <div className="bg-gray-900/60 p-2 rounded border border-gray-800/50">
                    <span className="text-[10px] text-gray-500 block uppercase">Win Rate</span>
                    <span
                      className={`text-sm font-black ${
                        setup.winRate >= 50
                          ? 'text-emerald-400'
                          : setup.winRate >= 35
                          ? 'text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    >
                      {setup.winRate.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-gray-500 block mt-0.5">
                      {setup.wins}W / {setup.losses}L {setup.breakeven > 0 ? `(${setup.breakeven}BE)` : ''}
                    </span>
                  </div>

                  {/* Avg Win vs Avg Loss */}
                  <div className="bg-gray-900/60 p-2 rounded border border-gray-800/50">
                    <span className="text-[10px] text-gray-500 block uppercase">Avg Win / Loss</span>
                    <span className="text-xs font-bold text-gray-200 block">
                      +${setup.avgWin.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-rose-400 block mt-0.5">
                      -${setup.avgLoss.toFixed(1)}
                    </span>
                  </div>

                  {/* Payoff Ratio */}
                  <div className="bg-gray-900/60 p-2 rounded border border-gray-800/50">
                    <span className="text-[10px] text-gray-500 block uppercase">Payoff Ratio</span>
                    <span className="text-sm font-bold text-indigo-300">
                      {setup.payoffRatio.toFixed(2)}:1
                    </span>
                    <span className="text-[9px] text-gray-500 block mt-0.5">
                      R:R Multiple
                    </span>
                  </div>

                  {/* Net PnL */}
                  <div className="bg-gray-900/60 p-2 rounded border border-gray-800/50">
                    <span className="text-[10px] text-gray-500 block uppercase">Net PnL</span>
                    <span
                      className={`text-sm font-black ${
                        setup.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {setup.netPnL >= 0 ? '+' : ''}${setup.netPnL.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-gray-500 block mt-0.5">
                      PF: {setup.profitFactor.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Visual Win/Loss Distribution Bar */}
                <div className="space-y-1 my-2">
                  <div className="flex justify-between text-[10px] font-mono text-gray-400">
                    <span>Outcome Distribution ({setup.totalTrades} trades)</span>
                    <span>{setup.winRate.toFixed(0)}% Profitable</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 flex overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 transition-all"
                      style={{ width: `${setup.winRate}%` }}
                      title={`Wins: ${setup.wins} (${setup.winRate.toFixed(1)}%)`}
                    />
                    {setup.breakeven > 0 && (
                      <div
                        className="bg-gray-500 h-1.5 transition-all"
                        style={{ width: `${(setup.breakeven / setup.totalTrades) * 100}%` }}
                        title={`Breakeven: ${setup.breakeven}`}
                      />
                    )}
                    <div
                      className="bg-rose-500 h-1.5 transition-all"
                      style={{ width: `${(setup.losses / setup.totalTrades) * 100}%` }}
                      title={`Losses: ${setup.losses}`}
                    />
                  </div>
                </div>

                {/* Diagnosis & Regime Health Verdict */}
                <div className="mt-2.5 pt-2.5 border-t border-gray-800/60 flex items-start space-x-2 text-xs">
                  {isStrongEdge ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : isDrag ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Activity className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-semibold text-gray-300 mr-1">Regime Verdict:</span>
                    <span className="text-gray-400">{setup.diagnosis}</span>
                    <span className="block text-indigo-400 mt-0.5 font-mono text-[10px]">
                      ↳ Action: {setup.recommendedAction}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Educational Quant Note: How to use Expected Value to Diagnose Win Rate */}
      <div className="bg-gray-950/40 border border-gray-800/60 rounded-xl p-4 flex items-start space-x-3 text-xs">
        <HelpCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-gray-400 leading-relaxed text-[11px]">
          <span className="font-bold text-gray-200 block">
            How Quant Traders Interpret Expected Value (EV) vs. Win Rate:
          </span>
          <p>
            • A setup with a <strong className="text-gray-200">low win rate (e.g. 25-35%)</strong> can still be highly profitable if its payoff ratio is high (e.g. 3:1 or 4:1), yielding positive EV per trade.
          </p>
          <p>
            • Conversely, a setup with a <strong className="text-gray-200">high win rate (e.g. 65%)</strong> will lose money if its few losses are outsized due to wide stops or slippage on illiquid pairs, producing a negative EV drag.
          </p>
          <p>
            • If a strategy suffers in ranging regimes, pairing it with the <strong className="text-indigo-300">Volume Exhaustion</strong> and <strong className="text-indigo-300">Market Structure (ChoCh)</strong> filters protects the EV curve by vetoing false pullbacks before entry.
          </p>
        </div>
      </div>
    </div>
  );
}
