/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Award,
  DollarSign,
  LineChart as LineChartIcon,
  BarChart3
} from 'lucide-react';
import { EquitySnapshot, TradeLog } from '../types';
import { formatNumber } from '../utils/format';

interface DailyPnLGrowthChartProps {
  snapshots: EquitySnapshot[];
  logs?: TradeLog[];
  startingBalance: number;
  currentBalance: number;
}

export interface DailyPnLPoint {
  date: string;
  displayDate: string;
  timestamp: number;
  equity: number;
  dailyPnL: number;
  dailyGrowthPct: number;
  cumulativePnL: number;
  cumulativeGrowthPct: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  isPositive: boolean;
}

export default function DailyPnLGrowthChart({
  snapshots,
  logs = [],
  startingBalance = 10000,
  currentBalance = 10000,
}: DailyPnLGrowthChartProps) {
  const [viewMode, setViewMode] = useState<'combined' | 'daily' | 'equity'>('combined');
  const [timeframe, setTimeframe] = useState<'7D' | '14D' | '30D' | 'ALL'>('ALL');

  // Process and compute daily progression points from equitySnapshots & trade logs
  const processedDailyData = useMemo(() => {
    const dailyMap = new Map<string, {
      date: string;
      displayDate: string;
      timestamp: number;
      lastEquity: number;
      firstEquity: number;
      tradePnL: number;
      tradeCount: number;
      winCount: number;
      lossCount: number;
    }>();

    const formatDateKey = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formatDisplayDate = (d: Date): string => {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // 1. Process trade logs to get precise trade-level PnL per day
    const sortedLogs = [...logs].sort((a, b) => {
      const tA = new Date(a.timeClose || a.timeOpen || 0).getTime();
      const tB = new Date(b.timeClose || b.timeOpen || 0).getTime();
      return tA - tB;
    });

    sortedLogs.forEach((log) => {
      const timeStr = log.timeClose || log.timeOpen;
      if (!timeStr) return;
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return;

      const dateKey = formatDateKey(d);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          displayDate: formatDisplayDate(d),
          timestamp: d.getTime(),
          lastEquity: startingBalance,
          firstEquity: startingBalance,
          tradePnL: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
        });
      }

      const entry = dailyMap.get(dateKey)!;
      entry.tradePnL += log.profit || 0;
      entry.tradeCount += 1;
      if ((log.profit || 0) > 0) entry.winCount += 1;
      else entry.lossCount += 1;
      entry.timestamp = Math.max(entry.timestamp, d.getTime());
    });

    // 2. Process equity snapshots
    const validSnapshots = (snapshots || []).filter(s => s && typeof s.balance === 'number');

    if (validSnapshots.length > 0) {
      validSnapshots.forEach((snap) => {
        let d = new Date(snap.time);
        if (isNaN(d.getTime())) {
          // If time is "Start" or other label, use an estimated date or skip
          return;
        }
        const dateKey = formatDateKey(d);
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey,
            displayDate: formatDisplayDate(d),
            timestamp: d.getTime(),
            lastEquity: snap.balance,
            firstEquity: snap.balance,
            tradePnL: 0,
            tradeCount: 0,
            winCount: 0,
            lossCount: 0,
          });
        } else {
          const entry = dailyMap.get(dateKey)!;
          entry.lastEquity = snap.balance;
          entry.timestamp = Math.max(entry.timestamp, d.getTime());
        }
      });
    }

    // Convert map to sorted chronological list
    const sortedKeys = Array.from(dailyMap.keys()).sort();

    // If completely empty (no snapshots and no trade logs yet), create baseline point
    if (sortedKeys.length === 0) {
      const today = new Date();
      return [{
        date: formatDateKey(today),
        displayDate: 'Today',
        timestamp: today.getTime(),
        equity: currentBalance || startingBalance,
        dailyPnL: 0,
        dailyGrowthPct: 0,
        cumulativePnL: 0,
        cumulativeGrowthPct: 0,
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        isPositive: true,
      }];
    }

    // Compute cumulative equity and daily deltas step-by-step
    const points: DailyPnLPoint[] = [];
    let prevEquity = startingBalance;
    let runningBalance = startingBalance;

    sortedKeys.forEach((key, index) => {
      const item = dailyMap.get(key)!;
      
      let dayEquity: number;
      let dayPnL: number;

      if (validSnapshots.length >= 2 && item.lastEquity !== startingBalance) {
        // Snapshot-authoritative calculation
        dayEquity = item.lastEquity;
        dayPnL = (index === 0) ? (dayEquity - startingBalance) : (dayEquity - prevEquity);
      } else {
        // Trade-log authoritative calculation with running balance
        runningBalance += item.tradePnL;
        dayEquity = runningBalance;
        dayPnL = item.tradePnL;
      }

      const dailyGrowthPct = prevEquity > 0 ? (dayPnL / prevEquity) * 100 : 0;
      const cumulativePnL = dayEquity - startingBalance;
      const cumulativeGrowthPct = startingBalance > 0 ? (cumulativePnL / startingBalance) * 100 : 0;

      points.push({
        date: item.date,
        displayDate: item.displayDate,
        timestamp: item.timestamp,
        equity: Number(dayEquity.toFixed(2)),
        dailyPnL: Number(dayPnL.toFixed(2)),
        dailyGrowthPct: Number(dailyGrowthPct.toFixed(2)),
        cumulativePnL: Number(cumulativePnL.toFixed(2)),
        cumulativeGrowthPct: Number(cumulativeGrowthPct.toFixed(2)),
        tradeCount: item.tradeCount,
        winCount: item.winCount,
        lossCount: item.lossCount,
        isPositive: dayPnL >= 0,
      });

      prevEquity = dayEquity;
    });

    // If latest point is not today, ensure today's current live balance is reflected
    const todayKey = formatDateKey(new Date());
    const lastPoint = points[points.length - 1];
    if (lastPoint && lastPoint.date !== todayKey && currentBalance !== undefined && currentBalance !== lastPoint.equity) {
      const today = new Date();
      const diff = currentBalance - lastPoint.equity;
      const todayGrowth = lastPoint.equity > 0 ? (diff / lastPoint.equity) * 100 : 0;
      const totalCumPnL = currentBalance - startingBalance;
      const totalCumGrowth = startingBalance > 0 ? (totalCumPnL / startingBalance) * 100 : 0;

      points.push({
        date: todayKey,
        displayDate: 'Today',
        timestamp: today.getTime(),
        equity: Number(currentBalance.toFixed(2)),
        dailyPnL: Number(diff.toFixed(2)),
        dailyGrowthPct: Number(todayGrowth.toFixed(2)),
        cumulativePnL: Number(totalCumPnL.toFixed(2)),
        cumulativeGrowthPct: Number(totalCumGrowth.toFixed(2)),
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        isPositive: diff >= 0,
      });
    }

    return points;
  }, [snapshots, logs, startingBalance, currentBalance]);

  // Apply timeframe filter
  const filteredData = useMemo(() => {
    if (timeframe === 'ALL') return processedDailyData;
    const days = timeframe === '7D' ? 7 : timeframe === '14D' ? 14 : 30;
    return processedDailyData.slice(-days);
  }, [processedDailyData, timeframe]);

  // Performance metrics derived from the daily points
  const metrics = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        totalGrowthDollar: 0,
        totalGrowthPct: 0,
        profitableDays: 0,
        losingDays: 0,
        flatDays: 0,
        dayWinRate: 0,
        bestDayPnL: 0,
        worstDayPnL: 0,
        avgDailyPnL: 0,
        latestEquity: currentBalance || startingBalance,
      };
    }

    const firstPoint = filteredData[0];
    const lastPoint = filteredData[filteredData.length - 1];
    const totalGrowthDollar = lastPoint.equity - (firstPoint.equity - firstPoint.dailyPnL);
    const baseEquity = firstPoint.equity - firstPoint.dailyPnL;
    const totalGrowthPct = baseEquity > 0 ? (totalGrowthDollar / baseEquity) * 100 : 0;

    let profitableDays = 0;
    let losingDays = 0;
    let flatDays = 0;
    let bestDayPnL = -Infinity;
    let worstDayPnL = Infinity;
    let sumDailyPnL = 0;

    filteredData.forEach((pt) => {
      sumDailyPnL += pt.dailyPnL;
      if (pt.dailyPnL > 0) profitableDays++;
      else if (pt.dailyPnL < 0) losingDays++;
      else flatDays++;

      if (pt.dailyPnL > bestDayPnL) bestDayPnL = pt.dailyPnL;
      if (pt.dailyPnL < worstDayPnL) worstDayPnL = pt.dailyPnL;
    });

    const activeDays = profitableDays + losingDays;
    const dayWinRate = activeDays > 0 ? (profitableDays / activeDays) * 100 : 0;
    const avgDailyPnL = filteredData.length > 0 ? sumDailyPnL / filteredData.length : 0;

    return {
      totalGrowthDollar,
      totalGrowthPct,
      profitableDays,
      losingDays,
      flatDays,
      dayWinRate,
      bestDayPnL: bestDayPnL === -Infinity ? 0 : bestDayPnL,
      worstDayPnL: worstDayPnL === Infinity ? 0 : worstDayPnL,
      avgDailyPnL,
      latestEquity: lastPoint.equity,
    };
  }, [filteredData, currentBalance, startingBalance]);

  // Determine Y-axis domain boundaries for daily PnL
  const pnlExtent = useMemo(() => {
    if (filteredData.length === 0) return { min: -100, max: 100 };
    const maxVal = Math.max(...filteredData.map(d => Math.abs(d.dailyPnL)), 10);
    const rounded = Math.ceil(maxVal * 1.25);
    return { min: -rounded, max: rounded };
  }, [filteredData]);

  // Determine Y-axis domain boundaries for equity progression
  const equityExtent = useMemo(() => {
    if (filteredData.length === 0) return { min: startingBalance - 500, max: startingBalance + 500 };
    const equities = filteredData.map(d => d.equity);
    const minVal = Math.min(...equities, startingBalance);
    const maxVal = Math.max(...equities, startingBalance);
    const padding = Math.max((maxVal - minVal) * 0.15, 50);
    return {
      min: Math.floor(minVal - padding),
      max: Math.ceil(maxVal + padding),
    };
  }, [filteredData, startingBalance]);

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data: DailyPnLPoint = payload[0].payload;
    const isProfit = data.dailyPnL >= 0;

    return (
      <div className="bg-[#111827] border border-[#30363D] rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[210px]">
        <div className="flex items-center justify-between border-b border-[#30363D]/60 pb-2">
          <span className="font-bold text-gray-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            {data.date}
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            {data.displayDate}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Daily PnL:</span>
            <span className={`font-mono font-bold flex items-center gap-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {isProfit ? '+' : ''}${formatNumber(data.dailyPnL, 2)}
              <span className="text-[10px] font-normal ml-1">
                ({isProfit ? '+' : ''}{data.dailyGrowthPct.toFixed(2)}%)
              </span>
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Account Equity:</span>
            <span className="font-mono font-bold text-gray-100">
              ${formatNumber(data.equity, 2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Net Growth:</span>
            <span className={`font-mono font-medium ${data.cumulativePnL >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
              {data.cumulativePnL >= 0 ? '+' : ''}${formatNumber(data.cumulativePnL, 2)} ({data.cumulativeGrowthPct.toFixed(2)}%)
            </span>
          </div>

          {data.tradeCount > 0 && (
            <div className="flex justify-between items-center pt-1 border-t border-[#30363D]/40 text-[11px]">
              <span className="text-gray-500">Day Trades:</span>
              <span className="text-gray-300 font-mono">
                {data.tradeCount} trades ({data.winCount}W / {data.lossCount}L)
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 sm:p-6 space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
              Daily PnL Growth
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Tracking account equity progression, daily profit/loss deltas, and cumulative performance over time
          </p>
        </div>

        {/* View Mode & Timeframe Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg bg-gray-900/80 p-0.5 border border-[#30363D]">
            <button
              onClick={() => setViewMode('combined')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                viewMode === 'combined'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Combined
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                viewMode === 'daily'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Daily Net PnL
            </button>
            <button
              onClick={() => setViewMode('equity')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                viewMode === 'equity'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Equity Trajectory
            </button>
          </div>

          {/* Timeframe selector */}
          <div className="inline-flex rounded-lg bg-gray-900/80 p-0.5 border border-[#30363D]">
            {(['7D', '14D', '30D', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-all font-mono ${
                  timeframe === tf
                    ? 'bg-gray-800 text-teal-400 border border-teal-500/30'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Snapshot Performance Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Net PnL Growth */}
        <div className="bg-gray-950/40 border border-[#30363D]/60 rounded-lg p-2.5 sm:p-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Net Growth ({timeframe})</span>
          <div className="flex items-baseline space-x-1.5 mt-1 font-mono">
            <span className={`text-base sm:text-lg font-black ${metrics.totalGrowthDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {metrics.totalGrowthDollar >= 0 ? '+' : ''}${formatNumber(metrics.totalGrowthDollar, 2)}
            </span>
            <span className={`text-[10px] font-semibold ${metrics.totalGrowthPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              ({metrics.totalGrowthPct >= 0 ? '+' : ''}{metrics.totalGrowthPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Current Equity */}
        <div className="bg-gray-950/40 border border-[#30363D]/60 rounded-lg p-2.5 sm:p-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Current Equity</span>
          <div className="mt-1 font-mono">
            <span className="text-base sm:text-lg font-black text-gray-100">
              ${formatNumber(metrics.latestEquity, 2)}
            </span>
          </div>
        </div>

        {/* Profitable Days */}
        <div className="bg-gray-950/40 border border-[#30363D]/60 rounded-lg p-2.5 sm:p-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Daily Win Rate</span>
          <div className="flex items-baseline space-x-1.5 mt-1 font-mono">
            <span className="text-base sm:text-lg font-black text-teal-400">
              {metrics.dayWinRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-gray-400">
              ({metrics.profitableDays}W / {metrics.losingDays}L)
            </span>
          </div>
        </div>

        {/* Best Day */}
        <div className="bg-gray-950/40 border border-[#30363D]/60 rounded-lg p-2.5 sm:p-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Best Day</span>
          <div className="mt-1 font-mono">
            <span className="text-base sm:text-lg font-black text-emerald-400">
              {metrics.bestDayPnL > 0 ? '+' : ''}${formatNumber(metrics.bestDayPnL, 2)}
            </span>
          </div>
        </div>

        {/* Worst Day */}
        <div className="bg-gray-950/40 border border-[#30363D]/60 rounded-lg p-2.5 sm:p-3 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Worst Day / Avg</span>
          <div className="flex items-baseline justify-between sm:justify-start sm:space-x-2 mt-1 font-mono">
            <span className={`text-base sm:text-lg font-black ${metrics.worstDayPnL < 0 ? 'text-rose-400' : 'text-gray-300'}`}>
              {metrics.worstDayPnL > 0 ? '+' : ''}${formatNumber(metrics.worstDayPnL, 2)}
            </span>
            <span className="text-[10px] text-gray-400">
              avg: {metrics.avgDailyPnL >= 0 ? '+' : ''}${formatNumber(metrics.avgDailyPnL, 1)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="h-72 sm:h-80 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'combined' ? (
            <ComposedChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
              />
              {/* Left Y Axis for Daily PnL Bars */}
              <YAxis
                yAxisId="left"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                domain={[pnlExtent.min, pnlExtent.max]}
                tickFormatter={(val) => `$${val}`}
              />
              {/* Right Y Axis for Cumulative Equity Progression */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#38bdf8"
                fontSize={10}
                tickLine={false}
                domain={[equityExtent.min, equityExtent.max]}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="left" y={0} stroke="#4B5563" strokeDasharray="2 2" />
              
              {/* Daily PnL Bars */}
              <Bar
                yAxisId="left"
                dataKey="dailyPnL"
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              >
                {filteredData.map((entry, index) => (
                  <Cell
                    key={`bar-cell-${index}`}
                    fill={entry.dailyPnL >= 0 ? '#10B981' : '#F43F5E'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>

              {/* Equity Progression Line */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="equity"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#38bdf8', stroke: '#0E1117', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#38bdf8', stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            </ComposedChart>
          ) : viewMode === 'daily' ? (
            <BarChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                domain={[pnlExtent.min, pnlExtent.max]}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="2 2" />
              <Bar
                dataKey="dailyPnL"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              >
                {filteredData.map((entry, index) => (
                  <Cell
                    key={`daily-cell-${index}`}
                    fill={entry.dailyPnL >= 0 ? '#10B981' : '#F43F5E'}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="areaEquityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                domain={[equityExtent.min, equityExtent.max]}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={startingBalance} stroke="#6B7280" strokeDasharray="3 3" label={{ value: 'Start', fill: '#6B7280', fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10B981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#areaEquityGradient)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Chart Legend & Context Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#30363D]/50 text-[11px] text-gray-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span>Profitable Day (+$)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            <span>Loss / Drawdown Day (-$)</span>
          </div>
          {viewMode === 'combined' && (
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-sky-400 inline-block rounded" />
              <span className="text-sky-300">Equity Progression ($)</span>
            </div>
          )}
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          Baseline Starting Balance: ${formatNumber(startingBalance, 2)}
        </div>
      </div>
    </div>
  );
}
