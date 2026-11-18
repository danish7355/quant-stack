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
  Maximize2,
  Calendar,
  Percent,
  ShieldAlert,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign
} from 'lucide-react';

interface PerformanceInsightsProps {
  logs: TradeLog[];
}

export type GroupingMode = 'STRATEGY' | 'REGIME' | 'COMBINED';
export type DatePeriodFilter = 'ALL' | 'NOV_5' | 'NOV_6_AM' | 'NOV_6_PM' | 'NOV_6_ALL' | 'NOV_7' | 'NOV_8';

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
  payoffRatio: number; // Avg Win / Avg Loss (Realized Risk:Reward)
  evPerTrade: number; // (Pwin * AvgWin) - (Ploss * AvgLoss) in $
  evPctPerTrade: number; // Expected return % per trade
  profitFactor: number;
  feesPaid: number;
  timeStopsCount: number;
  slCount: number;
  tpCount: number;
  status: 'STRONG_EDGE' | 'POSITIVE_EDGE' | 'NEUTRAL' | 'NEGATIVE_DRAG';
  diagnosis: string;
  recommendedAction: string;
}

// Map each known strategy to its typical market condition
export function getMarketConditionForStrategy(strategy?: string): 'Trending' | 'Ranging / Consolidation' | 'Mean-Reversion / Climax' | 'Unspecified' {
  const s = (strategy || '').toUpperCase();
  if (s === 'TREND_PULLBACK' || s.includes('PULLBACK')) return 'Trending';
  if (s === 'BINANCE_COMPOSITE' || s.includes('COMPOSITE')) return 'Trending';
  if (s === 'ORDER_BLOCK' || s.includes('ORDER_BLOCK') || s.includes('ORDERBLOCK') || s === 'OB') return 'Trending';
  if (s === 'MULTICOIN_SCALPER_PRO' || s.includes('SCALPER')) return 'Trending';
  if (s === 'COIL_BREAKOUT' || s.includes('COIL') || s === 'VOLATILITY_COMPRESSION' || s.includes('COMPRESSION') || s === 'VCB') return 'Ranging / Consolidation';
  if (s === 'RANGE_REGIME_V1' || s === 'RANGE_REGIME' || s.includes('RANGE')) return 'Ranging / Consolidation';
  if (s === 'LSR' || s === 'LIQUIDITY_SWEEP_REVERSAL' || s.includes('SWEEP') || s.includes('LSR') || s.includes('SMC_LIQUIDITY') || s === 'DELTA_CLIMAX' || s.includes('CLIMAX')) return 'Mean-Reversion / Climax';
  return 'Unspecified';
}

export default function PerformanceInsights({ logs }: PerformanceInsightsProps) {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('STRATEGY');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [datePeriodFilter, setDatePeriodFilter] = useState<DatePeriodFilter>('ALL');
  const [showPostMortem, setShowPostMortem] = useState<boolean>(true);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);

  // Dynamic currency symbol detection (INR vs USD)
  const currSymbol = useMemo(() => {
    for (const l of logs) {
      if ((l as any).currency_symbol === '₹' || (l as any).margin_currency === 'INR') return '₹';
    }
    return '$';
  }, [logs]);

  // Filter logs by direction and date period if specified
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      // 1. Direction Filter
      if (directionFilter !== 'ALL' && l.direction !== directionFilter) return false;

      // 2. Date Period Filter
      if (datePeriodFilter !== 'ALL') {
        const ts = l.timeClose || l.timeOpen || (l as any).timestamp || '';
        if (datePeriodFilter === 'NOV_5') {
          if (!ts.startsWith('2026-11-05')) return false;
        } else if (datePeriodFilter === 'NOV_6_AM') {
          if (!ts.startsWith('2026-11-06') || ts > '2026-11-06T10:00:00.000Z') return false;
        } else if (datePeriodFilter === 'NOV_6_PM') {
          if (!ts.startsWith('2026-11-06') || ts <= '2026-11-06T10:00:00.000Z') return false;
        } else if (datePeriodFilter === 'NOV_6_ALL') {
          if (!ts.startsWith('2026-11-06')) return false;
        } else if (datePeriodFilter === 'NOV_7') {
          if (!ts.startsWith('2026-11-07')) return false;
        } else if (datePeriodFilter === 'NOV_8') {
          if (!ts.startsWith('2026-11-08')) return false;
        }
      }
      return true;
    });
  }, [logs, directionFilter, datePeriodFilter]);

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
          let diag = 'Strategy operating in baseline mode';
          let rec = 'Review trade outcomes to calibrate edge.';

          if (stratKey === 'TREND_PULLBACK' || stratKey.includes('PULLBACK')) {
            displayName = 'Trend Pullback';
            cond = 'Trending';
            desc = 'EMA 21/50 trend continuation on dynamic value pullbacks';
            diag = 'Win rate has been hurt by false pullbacks in ranging markets and illiquid tokens.';
            rec = 'Enforce $25M+ 24h volume filter, ADX > 22 trend confirmation, and volume exhaustion checks before entry.';
          } else if (stratKey === 'LSR' || stratKey === 'LIQUIDITY_SWEEP_REVERSAL' || stratKey === 'SMC_LIQUIDITY_SWEEP' || stratKey === 'SMC_LIQUIDITY' || stratKey.includes('SWEEP')) {
            displayName = 'Liquidity Sweep Reversal (LSR)';
            cond = 'Mean-Reversion / Climax';
            desc = 'Institutional sweep of key session highs/lows with sharp reversal';
            diag = 'High win rate on major pool sweeps (PDH/PDL, session extremes). Avoid minor mid-range sweeps.';
            rec = 'Enforce key liquidity pool filtering, 0.15+ ATR sweep depth, and closed-bar reclaim confirmation.';
          } else if (stratKey === 'ORDER_BLOCK' || stratKey.includes('ORDER_BLOCK') || stratKey.includes('ORDERBLOCK') || stratKey === 'OB') {
            displayName = 'Order Block (OB)';
            cond = 'Trending';
            desc = 'Institutional footprint displacement, market structure shift & retest';
            diag = 'Asymmetric 1:3.5+ R:R edge. Win rate is maximized when displacement candle body >= 60% with fresh unmitigated order blocks.';
            rec = 'Require fresh unmitigated blocks, strong displacement (>= 1.25 ATR), and 3-bar reaction window.';
          } else if (stratKey === 'COIL_BREAKOUT' || stratKey === 'VOLATILITY_COMPRESSION' || stratKey === 'VCB' || stratKey.includes('COIL')) {
            displayName = 'Coil Breakout (VCB)';
            cond = 'Ranging / Consolidation';
            desc = 'Multi-bar volatility compression squeeze breakout with volume expansion';
            diag = 'Asymmetric 1:5+ R:R edge. False breakouts occur when entering inside compressed mid-ranges without volume surge.';
            rec = 'Require breakout bar body >= 1.2x median coil body, volume >= 1.25x mean, and limit entry on confirmed boundary retest.';
          } else if (stratKey === 'RANGE_REGIME_V1' || stratKey === 'RANGE_REGIME' || stratKey.includes('RANGE')) {
            displayName = 'Range Regime V1';
            cond = 'Ranging / Consolidation';
            desc = 'Statistical boundary fades on mean-reverting ranges';
            diag = 'High win rate during quiet Asian & consolidation sessions.';
            rec = 'Enforce Grade-A setup filter and block range fades if macro regime indicates strong trend or ADX > 25.';
          } else if (stratKey === 'MULTICOIN_SCALPER_PRO' || stratKey.includes('SCALPER')) {
            displayName = 'Multi-Coin Scalper Pro';
            cond = 'Trending';
            desc = 'High-frequency momentum and liquidity micro-bursts';
            diag = 'Consistent win rate when trading high-liquidity pairs with tight spreads.';
            rec = 'Enforce $20M+ 24h quote volume and spread <= 0.08%.';
          } else if (stratKey === 'DELTA_CLIMAX' || stratKey.includes('CLIMAX')) {
            displayName = 'Delta Climax';
            cond = 'Mean-Reversion / Climax';
            desc = 'Overextended price exhaustion with rejection wicks';
            diag = 'Highest historical profit factor and reliable edge on sharp market blow-offs.';
            rec = 'Maintain standard ATR target multipliers.';
          } else if (stratKey === 'BINANCE_COMPOSITE' || stratKey.includes('COMPOSITE')) {
            displayName = 'Binance Composite';
            cond = 'Trending';
            desc = 'Fast EMA cross + RSI + ADX trend momentum alignment';
            diag = 'Low raw win rate (21%) but strongly positive EV due to large 6.3:1 winners.';
            rec = 'Let runners hit higher TP targets to preserve asymmetric payoff.';
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
          desc: 'Directional momentum, Order Blocks & EMA value pullbacks (Trend Pullback, Order Block & Scalper)',
          diag: 'Performance depends strongly on macro trend strength vs sideways chop.',
          rec: 'Filter with ADX > 22 or 1H EMA alignment to prevent false breaks.',
        },
        {
          key: 'RANGING_REGIME',
          name: 'Ranging / Consolidation Regime',
          condition: 'Ranging / Consolidation',
          desc: 'ATR squeeze, range contraction & boundary breakouts (Coil Breakout & Range Regime V1)',
          diag: 'Performs reliably in quiet, low-ATR periods before expansion.',
          rec: 'Use tighter time-based exits if breakout stalls within 4 bars.',
        },
        {
          key: 'REVERSAL_REGIME',
          name: 'Exhaustion & Climax Regime',
          condition: 'Mean-Reversion / Climax',
          desc: 'Extreme overextension, liquidity pool sweeps & sharp wick rejections (LSR & Delta Climax)',
          diag: 'Generates the highest expected value ($) per trade in high-volatility spikes.',
          rec: 'Enforce key liquidity pool filtering (PDH/PDL) and closed-bar reclaim confirmation.',
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
          let diag = `Setup evaluated in ${cond} market conditions.`;
          let rec = 'Observe EV correlation with market condition.';

          if (stratKey.includes('PULLBACK')) {
            diag = 'Win rate has been hurt by false pullbacks in ranging markets and illiquid tokens.';
            rec = 'Enforce $25M+ 24h volume filter, ADX > 22 trend confirmation, and volume exhaustion checks before entry.';
          } else if (stratKey.includes('ORDER_BLOCK') || stratKey.includes('ORDERBLOCK') || stratKey === 'OB') {
            diag = 'Asymmetric 1:3.5+ R:R edge. Win rate is maximized when displacement candle body >= 60% with fresh unmitigated order blocks.';
            rec = 'Require fresh unmitigated blocks, strong displacement (>= 1.25 ATR), and 3-bar reaction window.';
          } else if (stratKey.includes('COIL') || stratKey.includes('COMPRESSION') || stratKey === 'VCB') {
            diag = 'Asymmetric 1:5+ R:R edge. False breakouts occur when entering inside compressed mid-ranges without volume surge.';
            rec = 'Require breakout bar body >= 1.2x median coil body, volume >= 1.25x mean, and limit entry on confirmed boundary retest.';
          } else if (stratKey.includes('LSR') || stratKey.includes('SWEEP')) {
            diag = 'High win rate on major pool sweeps (PDH/PDL, session extremes). Avoid minor mid-range sweeps.';
            rec = 'Enforce key liquidity pool filtering, 0.15+ ATR sweep depth, and closed-bar reclaim confirmation.';
          } else if (stratKey.includes('RANGE')) {
            diag = 'High win rate during quiet Asian & consolidation sessions.';
            rec = 'Enforce Grade-A setup filter and block range fades if macro regime indicates strong trend or ADX > 25.';
          } else if (stratKey.includes('SCALPER')) {
            diag = 'Consistent win rate when trading high-liquidity pairs with tight spreads.';
            rec = 'Enforce $20M+ 24h quote volume and spread <= 0.08%.';
          }

          groups[comboKey] = {
            name: `${stratKey.replace('_', ' ')} (${cond})`,
            condition: cond,
            description: `Strategy ${stratKey} operating in ${cond} market regime`,
            diagnosis: diag,
            recommendedAction: rec,
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

        const feesPaid = tList.reduce((sum, t) => sum + ((t as any).total_fees || (t as any).totalFees || 0), 0);
        const timeStopsCount = tList.filter((t) => (t.exitReason || (t as any).exit_reason) === 'TIME_STOP').length;
        const slCount = tList.filter((t) => (t.exitReason || (t as any).exit_reason) === 'SL').length;
        const tpCount = tList.filter((t) => (t.exitReason || (t as any).exit_reason)?.startsWith('TP')).length;

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
          feesPaid,
          timeStopsCount,
          slCount,
          tpCount,
          status,
          diagnosis: g.diagnosis,
          recommendedAction: g.recommendedAction,
        };
      });

    // Sort by Expected Value descending so best setups appear first
    return results.sort((a, b) => b.evPerTrade - a.evPerTrade);
  }, [filteredLogs, groupingMode]);

  // Period statistics breakdown across chronological sessions
  const periodStats = useMemo(() => {
    const calc = (list: TradeLog[], title: string, subtitle: string) => {
      const total = list.length;
      if (total === 0) return { title, subtitle, total: 0, wins: 0, losses: 0, winRate: 0, netPnL: 0, fees: 0, avgWin: 0, avgLoss: 0, rr: 0, profitFactor: 1, timeStops: 0, sls: 0 };
      const wins = list.filter((t) => t.profit > 0);
      const losses = list.filter((t) => t.profit < 0);
      const grossWin = wins.reduce((sum, t) => sum + t.profit, 0);
      const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
      const netPnL = grossWin - grossLoss;
      const fees = list.reduce((sum, t) => sum + ((t as any).total_fees || (t as any).totalFees || 0), 0);
      const winRate = (wins.length / total) * 100;
      const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
      const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
      const rr = avgLoss > 0 ? avgWin / avgLoss : 1.0;
      const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99.9 : 1.0;
      const timeStops = list.filter((t) => (t.exitReason || (t as any).exit_reason) === 'TIME_STOP').length;
      const sls = list.filter((t) => (t.exitReason || (t as any).exit_reason) === 'SL').length;
      return { title, subtitle, total, wins: wins.length, losses: losses.length, winRate, netPnL, fees, avgWin, avgLoss, rr, profitFactor, timeStops, sls };
    };

    const nov5Logs = logs.filter((l) => (l.timeClose || l.timeOpen || (l as any).timestamp || '').startsWith('2026-11-05'));
    const nov6AmLogs = logs.filter((l) => {
      const ts = l.timeClose || l.timeOpen || (l as any).timestamp || '';
      return ts.startsWith('2026-11-06') && ts <= '2026-11-06T10:00:00.000Z';
    });
    const nov6PmLogs = logs.filter((l) => {
      const ts = l.timeClose || l.timeOpen || (l as any).timestamp || '';
      return ts.startsWith('2026-11-06') && ts > '2026-11-06T10:00:00.000Z';
    });
    const nov7Logs = logs.filter((l) => (l.timeClose || l.timeOpen || (l as any).timestamp || '').startsWith('2026-11-07'));
    const nov8Logs = logs.filter((l) => (l.timeClose || l.timeOpen || (l as any).timestamp || '').startsWith('2026-11-08'));

    return {
      nov5: calc(nov5Logs, 'Nov 5 Full Day', 'Steady baseline session'),
      nov6Am: calc(nov6AmLogs, 'Nov 6 Morning (00-10 UTC)', 'Peak Short-Trend Performance'),
      nov6Pm: calc(nov6PmLogs, 'Nov 6 Afternoon (10-24 UTC)', 'Market Pivot & Altcoin SL Collapse'),
      nov7: calc(nov7Logs, 'Nov 7 Full Day', 'Time-Stop & Fee Churn Bleed'),
      nov8: calc(nov8Logs, 'Nov 8 Session', 'Current execution session'),
    };
  }, [logs]);

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

        {/* Grouping Mode, Direction, and Date Period Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 w-full">
          {/* Date Period Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-950/70 p-1 rounded-xl border border-gray-800 text-xs font-mono">
            <span className="text-[10px] text-gray-500 uppercase px-2 font-bold tracking-wider flex items-center">
              <Calendar className="w-3 h-3 mr-1 text-indigo-400" /> Session:
            </span>
            <button
              onClick={() => setDatePeriodFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              All History
            </button>
            <button
              onClick={() => setDatePeriodFilter('NOV_5')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'NOV_5'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              Nov 5 (Baseline)
            </button>
            <button
              onClick={() => setDatePeriodFilter('NOV_6_AM')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'NOV_6_AM'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              Nov 6 AM (Peak 86% WR)
            </button>
            <button
              onClick={() => setDatePeriodFilter('NOV_6_PM')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'NOV_6_PM'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              Nov 6 PM (Pivot & SLs)
            </button>
            <button
              onClick={() => setDatePeriodFilter('NOV_7')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'NOV_7'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              Nov 7 (Time-Stop Bleed)
            </button>
            <button
              onClick={() => setDatePeriodFilter('NOV_8')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                datePeriodFilter === 'NOV_8'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              Nov 8 (Today)
            </button>
          </div>

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
      </div>

      {/* SPECIAL AUDIT: 5th & 6th vs 7th Performance Post-Mortem & Win Rate vs Risk-Reward Deep Dive */}
      <div className="bg-gradient-to-b from-gray-950 via-[#111726] to-gray-950 border border-indigo-500/30 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-96 h-32 bg-indigo-500/10 blur-3xl pointer-events-none rounded-full" />
        
        {/* Header & Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shadow-inner">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-base font-black text-gray-100 tracking-wide">
                  5th & 6th vs 7th Performance Post-Mortem & Strategy Win Rate / R:R Audit
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Diagnostic Report
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Mathematical cause-and-effect breakdown: Why the morning of the 6th surged, why the afternoon crashed, and why the 7th bled on fee churn and asymmetric R:R.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPostMortem(!showPostMortem)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs font-mono text-gray-300 hover:text-white hover:bg-gray-800 self-start sm:self-auto transition-all"
          >
            <span>{showPostMortem ? 'Collapse Audit' : 'Expand Audit'}</span>
            {showPostMortem ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showPostMortem && (
          <div className="mt-5 space-y-6">
            {/* Chronological Session Performance Strip */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5 block font-mono">
                1. Chronological Timeline & Session Shift (Click a card to filter active view)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Nov 5 */}
                <div
                  onClick={() => setDatePeriodFilter('NOV_5')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    datePeriodFilter === 'NOV_5'
                      ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500'
                      : 'border-gray-800 bg-gray-950/60 hover:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-200">Nov 5 Full Day</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Balanced
                    </span>
                  </div>
                  <div className="my-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-black text-emerald-400">
                      +{currSymbol}{periodStats.nov5.netPnL.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {periodStats.nov5.winRate.toFixed(0)}% WR
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono space-y-0.5 border-t border-gray-800/80 pt-1.5">
                    <div className="flex justify-between">
                      <span>Trades: {periodStats.nov5.total}</span>
                      <span>R:R: 1:{periodStats.nov5.rr.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>{periodStats.nov5.wins}W / {periodStats.nov5.losses}L</span>
                      <span>PF: {periodStats.nov5.profitFactor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Nov 6 AM */}
                <div
                  onClick={() => setDatePeriodFilter('NOV_6_AM')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    datePeriodFilter === 'NOV_6_AM'
                      ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500'
                      : 'border-emerald-500/40 bg-emerald-950/15 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-emerald-300">Nov 6 (00-10 UTC)</span>
                    <span className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                      PEAK EDGE
                    </span>
                  </div>
                  <div className="my-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-black text-emerald-400">
                      +{currSymbol}{periodStats.nov6Am.netPnL.toFixed(1)}
                    </span>
                    <span className="text-xs font-black text-emerald-400">
                      {periodStats.nov6Am.winRate.toFixed(1)}% WR
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono space-y-0.5 border-t border-emerald-900/40 pt-1.5">
                    <div className="flex justify-between">
                      <span>Trades: {periodStats.nov6Am.total} (19 Shorts!)</span>
                      <span>PF: {periodStats.nov6Am.profitFactor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400/90 font-bold">
                      <span>{periodStats.nov6Am.wins}W / {periodStats.nov6Am.losses}L</span>
                      <span>Runners hit TP!</span>
                    </div>
                  </div>
                </div>

                {/* Nov 6 PM */}
                <div
                  onClick={() => setDatePeriodFilter('NOV_6_PM')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    datePeriodFilter === 'NOV_6_PM'
                      ? 'border-rose-500 bg-rose-950/30 ring-1 ring-rose-500'
                      : 'border-rose-500/40 bg-rose-950/15 hover:border-rose-500'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-rose-300">Nov 6 (10-24 UTC)</span>
                    <span className="text-[10px] font-mono text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded font-black">
                      PIVOT CRASH
                    </span>
                  </div>
                  <div className="my-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-black text-rose-400">
                      -{currSymbol}{Math.abs(periodStats.nov6Pm.netPnL).toFixed(1)}
                    </span>
                    <span className="text-xs font-black text-rose-400">
                      {periodStats.nov6Pm.winRate.toFixed(1)}% WR
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono space-y-0.5 border-t border-rose-900/40 pt-1.5">
                    <div className="flex justify-between">
                      <span>Trades: {periodStats.nov6Pm.total}</span>
                      <span>SL Hits: {periodStats.nov6Pm.sls} / {periodStats.nov6Pm.total}</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>1W / 13L</span>
                      <span>PF: {periodStats.nov6Pm.profitFactor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Nov 7 */}
                <div
                  onClick={() => setDatePeriodFilter('NOV_7')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    datePeriodFilter === 'NOV_7'
                      ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500'
                      : 'border-amber-500/40 bg-amber-950/15 hover:border-amber-500'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-amber-300">Nov 7 Full Day</span>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded font-black">
                      FEE CHURN
                    </span>
                  </div>
                  <div className="my-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-black text-rose-400">
                      -{currSymbol}{Math.abs(periodStats.nov7.netPnL).toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-300">
                      {periodStats.nov7.winRate.toFixed(1)}% WR
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono space-y-0.5 border-t border-amber-900/40 pt-1.5">
                    <div className="flex justify-between">
                      <span>TimeStops: {periodStats.nov7.timeStops} (81%)</span>
                      <span>Fees: {currSymbol}{periodStats.nov7.fees.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>R:R: 1:0.71 (Inverted)</span>
                      <span>PF: {periodStats.nov7.profitFactor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Nov 8 */}
                <div
                  onClick={() => setDatePeriodFilter('NOV_8')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    datePeriodFilter === 'NOV_8'
                      ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500'
                      : 'border-gray-800 bg-gray-950/60 hover:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-200">Nov 8 So Far</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  </div>
                  <div className="my-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-black text-emerald-400">
                      +{currSymbol}{periodStats.nov8.netPnL.toFixed(1)}
                    </span>
                    <span className="text-xs text-emerald-400">
                      {periodStats.nov8.winRate.toFixed(0)}% WR
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono space-y-0.5 border-t border-gray-800/80 pt-1.5">
                    <div className="flex justify-between">
                      <span>Trades: {periodStats.nov8.total}</span>
                      <span>R:R: N/A</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>{periodStats.nov8.wins}W / 0L</span>
                      <span>Stable Scalp</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Core Comparative Strategy Win Rate vs Risk:Reward Matrix Table */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono flex items-center">
                  <Percent className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
                  2. Strategy Win Rate & Realized Risk:Reward Scorecard (Nov 5 - Nov 8)
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  Realized R:R = Avg Win Size / Avg Loss Size | Ideal Target ≥ 1 : 1.5
                </span>
              </div>
              <div className="overflow-x-auto border border-gray-800 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-gray-950 text-gray-400 text-[10px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="py-2.5 px-3">Strategy</th>
                      <th className="py-2.5 px-3">Market Condition</th>
                      <th className="py-2.5 px-3 text-center">Trades</th>
                      <th className="py-2.5 px-3 text-center">Win Rate</th>
                      <th className="py-2.5 px-3 text-center">Avg Win / Avg Loss</th>
                      <th className="py-2.5 px-3 text-center">Realized R:R</th>
                      <th className="py-2.5 px-3 text-right">Net PnL</th>
                      <th className="py-2.5 px-3 text-center">Profit Factor</th>
                      <th className="py-2.5 px-3">Dominant Exit Reason</th>
                      <th className="py-2.5 px-3">Status Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 bg-gray-950/40">
                    {/* Range Regime V1 */}
                    <tr className="hover:bg-gray-900/40">
                      <td className="py-2.5 px-3 font-bold text-gray-100 flex items-center">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                        RANGE_REGIME_V1
                      </td>
                      <td className="py-2.5 px-3 text-amber-300 text-[11px]">Ranging / Chop</td>
                      <td className="py-2.5 px-3 text-center font-bold text-gray-200">74</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-black">
                          55.4%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-300">
                        <span className="text-emerald-400 font-bold">+{currSymbol}73.0</span> / <span className="text-rose-400">-{currSymbol}56.4</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-emerald-300">
                        1 : 1.30
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                        +{currSymbol}1,134.48
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-400">1.61</td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        SL (28), TP1 (18), TP3 (8)
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          STRONG EDGE
                        </span>
                      </td>
                    </tr>

                    {/* Multicoin Scalper Pro */}
                    <tr className="hover:bg-gray-900/40">
                      <td className="py-2.5 px-3 font-bold text-gray-100 flex items-center">
                        <span className="w-2 h-2 rounded-full bg-amber-400 mr-2" />
                        MULTICOIN_SCALPER_PRO
                      </td>
                      <td className="py-2.5 px-3 text-sky-300 text-[11px]">Trending (5m Micro)</td>
                      <td className="py-2.5 px-3 text-center font-bold text-gray-200">52</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-black">
                          44.2%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-300">
                        <span className="text-emerald-400 font-bold">+{currSymbol}16.8</span> / <span className="text-rose-400">-{currSymbol}22.7</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-amber-400">
                        1 : 0.74 <span className="text-[9px] text-rose-400 block">(Inverted R:R)</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-rose-400">
                        -{currSymbol}272.53
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-400">0.59</td>
                      <td className="py-2.5 px-3 text-amber-300 text-[11px] font-bold">
                        TIME_STOP 20m (45 of 52)
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                          FEE CHURN TRAP
                        </span>
                      </td>
                    </tr>

                    {/* Coil Breakout */}
                    <tr className="hover:bg-gray-900/40">
                      <td className="py-2.5 px-3 font-bold text-gray-100 flex items-center">
                        <span className="w-2 h-2 rounded-full bg-rose-400 mr-2" />
                        COIL_BREAKOUT
                      </td>
                      <td className="py-2.5 px-3 text-purple-300 text-[11px]">Compression Squeeze</td>
                      <td className="py-2.5 px-3 text-center font-bold text-gray-200">14</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-black">
                          42.9%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-300">
                        <span className="text-emerald-400 font-bold">+{currSymbol}18.5</span> / <span className="text-rose-400 font-bold">-{currSymbol}50.8</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-rose-400">
                        1 : 0.36 <span className="text-[9px] text-rose-400 block">(Severe Asymmetry)</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-rose-400">
                        -{currSymbol}295.42
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-400">0.27</td>
                      <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                        SL (-{currSymbol}106 max), TimeStop (6)
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                          ASYMMETRIC DRAG
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* The 3 Fatal Root Causes Explaining What Happened */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5 block font-mono">
                3. Root Cause Post-Mortem: Why Did Strategies "Perform Well Then Lose All"?
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Cause 1 */}
                <div className="bg-gray-950/70 border border-amber-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">1</span>
                    <h6>Exchange Fee Drag on 20-min Time Stops</h6>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    On Nov 7, <strong className="text-amber-300">MULTICOIN_SCALPER_PRO</strong> was actually profitable on gross price movement (+{currSymbol}120.81 gross alpha). However, with 30x leverage and entering/exiting within 20 minutes, roundtrip taker fees + 18% GST totaled <strong className="text-rose-400">{currSymbol}223.84</strong>.
                  </p>
                  <p className="text-[10px] text-gray-500 italic">
                    ↳ Result: Fees ate 185% of gross profits, converting a winning market day into a -{currSymbol}103.03 net loss.
                  </p>
                </div>

                {/* Cause 2 */}
                <div className="bg-gray-950/70 border border-rose-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px]">2</span>
                    <h6>Inverted Risk:Reward on Coil Breakout (1 : 0.36)</h6>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    <strong className="text-rose-300">COIL_BREAKOUT</strong> had 6 wins and 6 losses (50% nominal win rate). But its average winning trade gained only <strong className="text-emerald-400">+{currSymbol}18.54</strong> (taking partial profits too early), while losing trades took full Stop Losses of <strong className="text-rose-400">-{currSymbol}94 to -{currSymbol}106</strong> (e.g. JCT, WLD).
                  </p>
                  <p className="text-[10px] text-gray-500 italic">
                    ↳ Result: Risking {currSymbol}100 to make {currSymbol}18 is a mathematical death sentence even with 50% win rate.
                  </p>
                </div>

                {/* Cause 3 */}
                <div className="bg-gray-950/70 border border-indigo-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">3</span>
                    <h6>Market Pivot & Low-Liquidity Altcoin Traps (Nov 6 PM)</h6>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    On Nov 6 morning (00:00-10:00 UTC), the market trended cleanly downward. The bot took <strong className="text-emerald-400">19 SHORTs out of 22 trades</strong>, winning 86.4% and banking +{currSymbol}1,275.59. At 10:00 UTC, the trend whipsawed. Because the <strong className="text-amber-300">Layer 3 Tradeability Gate was OFF</strong>, the bot opened illiquid coins (FLUID, BEAMX, LYN, UAI) twice simultaneously, taking 10 consecutive full SLs (-{currSymbol}736.62).
                  </p>
                  <p className="text-[10px] text-gray-500 italic">
                    ↳ Result: Lack of spread/liquidity filter turned a trend-following win streak into an altcoin massacre.
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Action Plan to Fix Win Rate & R:R */}
            <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-4">
              <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold mb-2">
                <Target className="w-4 h-4 text-indigo-400" />
                <span>Actionable 3-Point Calibration to Restore Win Rate & 1:2+ Risk:Reward</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-gray-300">
                <div className="bg-gray-950/60 p-2.5 rounded-lg border border-gray-800 space-y-1">
                  <span className="font-bold text-gray-100 block">1. Enable Layer 3 Tradeability Gate</span>
                  <p className="text-gray-400 text-[10px]">
                    Turn ON <code className="text-indigo-300">layer3TradeabilityGateEnabled</code> in Settings. Rejects coins where fee-to-ATR &gt; 0.35 or spread &gt; 10 bps, instantly blocking the high-beta altcoin traps that caused the Nov 6 afternoon collapse.
                  </p>
                </div>
                <div className="bg-gray-950/60 p-2.5 rounded-lg border border-gray-800 space-y-1">
                  <span className="font-bold text-gray-100 block">2. Fix Scalper Time-Stop Fee Bleed</span>
                  <p className="text-gray-400 text-[10px]">
                    When a scalper trade reaches +0.75R, move stop loss to entry Breakeven + buffer. If 20 minutes pass without reaching TP1, only close if profit covers roundtrip fees, otherwise hold to stop or expand stall window to 45m.
                  </p>
                </div>
                <div className="bg-gray-950/60 p-2.5 rounded-lg border border-gray-800 space-y-1">
                  <span className="font-bold text-gray-100 block">3. Re-align Coil Breakout Stop Sizing</span>
                  <p className="text-gray-400 text-[10px]">
                    Tighten Coil Breakout maximum stop loss from wide 2.5–3.0 ATR down to 1.5 ATR (under coil boundary). When losses are capped at {currSymbol}30 instead of {currSymbol}106, the strategy shifts immediately to a positive EV payoff ratio.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
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
                {overallMetrics.overallEV >= 0 ? '+' : ''}{currSymbol}{overallMetrics.overallEV.toFixed(2)}
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
                  +{currSymbol}{overallMetrics.highestEV?.evPerTrade.toFixed(2)} EV
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
                  {overallMetrics.lowestEV?.evPerTrade !== undefined ? `${overallMetrics.lowestEV.evPerTrade >= 0 ? '+' : ''}${currSymbol}${overallMetrics.lowestEV.evPerTrade.toFixed(2)}` : 'N/A'} EV
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
                {currSymbol}{overallMetrics.avgWin.toFixed(1)} <span className="text-xs text-gray-500 font-normal">W</span>
              </span>
              <span className="text-gray-500 text-xs font-mono">vs</span>
              <span className="text-lg font-bold font-mono text-gray-200">
                {currSymbol}{overallMetrics.avgLoss.toFixed(1)} <span className="text-xs text-gray-500 font-normal">L</span>
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
                      <span>{isPositiveEV ? '+' : ''}{currSymbol}{setup.evPerTrade.toFixed(2)} EV</span>
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
                      +{currSymbol}{setup.avgWin.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-rose-400 block mt-0.5">
                      -{currSymbol}{setup.avgLoss.toFixed(1)}
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
                      {setup.netPnL >= 0 ? '+' : ''}{currSymbol}{setup.netPnL.toFixed(1)}
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
