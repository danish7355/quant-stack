/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { TradeLog } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  Flame,
  Target,
  BarChart2,
  Award
} from 'lucide-react';

interface DailyTradeFrequencyWidgetProps {
  logs: TradeLog[];
}

type TimeRangeOption = 7 | 14 | 30;

interface DayData {
  dateKey: string;     // YYYY-MM-DD
  displayDate: string; // e.g. "Aug 30"
  fullDate: string;    // e.g. "30 Aug 2026"
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  profit: number;
  grossProfit: number;
  grossLoss: number;
}

export default function DailyTradeFrequencyWidget({ logs }: DailyTradeFrequencyWidgetProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>(30);
  const [hoveredBar, setHoveredBar] = useState<DayData | null>(null);

  // Compute daily series for the chosen time range (default 30 days)
  const chartData = useMemo(() => {
    const days: DayData[] = [];
    const now = new Date();

    // Map logs by date string (YYYY-MM-DD)
    const logsByDate = new Map<string, TradeLog[]>();
    logs.forEach((log) => {
      const dateSource = log.timeClose || log.timeOpen;
      if (!dateSource) return;
      const d = new Date(dateSource);
      if (isNaN(d.getTime())) return;
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      
      if (!logsByDate.has(key)) {
        logsByDate.set(key, []);
      }
      logsByDate.get(key)!.push(log);
    });

    // Generate consecutive days backwards from today
    for (let i = timeRange - 1; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - i);
      
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const displayDate = `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
      const fullDate = `${targetDate.getDate()} ${monthNames[targetDate.getMonth()]} ${year}`;

      const dayLogs = logsByDate.get(key) || [];
      const wins = dayLogs.filter((l) => l.profit > 0).length;
      const losses = dayLogs.filter((l) => l.profit <= 0).length;
      const total = wins + losses;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      
      let grossProfit = 0;
      let grossLoss = 0;
      let profit = 0;

      dayLogs.forEach((l) => {
        profit += l.profit;
        if (l.profit > 0) grossProfit += l.profit;
        else grossLoss += Math.abs(l.profit);
      });

      days.push({
        dateKey: key,
        displayDate,
        fullDate,
        wins,
        losses,
        total,
        winRate,
        profit,
        grossProfit,
        grossLoss
      });
    }

    return days;
  }, [logs, timeRange]);

  // Aggregate statistics over the selected range
  const stats = useMemo(() => {
    let totalWins = 0;
    let totalLosses = 0;
    let totalTrades = 0;
    let totalProfit = 0;
    let activeDaysCount = 0;
    let maxDailyTrades = 0;
    let bestDay: DayData | null = null;

    chartData.forEach((d) => {
      totalWins += d.wins;
      totalLosses += d.losses;
      totalTrades += d.total;
      totalProfit += d.profit;
      if (d.total > 0) {
        activeDaysCount++;
        if (d.total > maxDailyTrades) {
          maxDailyTrades = d.total;
        }
      }
      if (!bestDay || d.profit > bestDay.profit) {
        bestDay = d;
      }
    });

    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgTradesPerDay = timeRange > 0 ? (totalTrades / timeRange) : 0;
    const avgTradesPerActiveDay = activeDaysCount > 0 ? (totalTrades / activeDaysCount) : 0;

    return {
      totalWins,
      totalLosses,
      totalTrades,
      totalProfit,
      winRate,
      activeDaysCount,
      avgTradesPerDay,
      avgTradesPerActiveDay,
      maxDailyTrades,
      bestDay: (bestDay && bestDay.total > 0) ? bestDay : null
    };
  }, [chartData, timeRange]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: DayData = payload[0].payload;
      return (
        <div className="bg-[#0b0f19] border border-gray-700/80 rounded-xl p-3.5 shadow-2xl font-mono text-xs z-50 min-w-[210px]">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
            <span className="font-bold text-gray-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {data.fullDate}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
              {data.total} {data.total === 1 ? 'Trade' : 'Trades'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Successful Wins
              </span>
              <span className="font-bold text-emerald-300">
                {data.wins} {data.wins > 0 && `(+$${data.grossProfit.toFixed(2)})`}
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px]">
              <span className="text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Unsuccessful Losses
              </span>
              <span className="font-bold text-rose-300">
                {data.losses} {data.losses > 0 && `(-$${data.grossLoss.toFixed(2)})`}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-800/80 flex justify-between items-center text-[11px]">
              <span className="text-gray-400">Daily Win Rate</span>
              <span className={`font-bold ${data.winRate >= 50 ? 'text-emerald-400' : 'text-gray-300'}`}>
                {data.total > 0 ? `${data.winRate.toFixed(1)}%` : '0%'}
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-400">Net Daily PnL</span>
              <span className={`font-bold ${data.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="daily-trade-frequency-widget" className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Header with Title and Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BarChart2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
              Daily Trade Frequency & Success Rate ({timeRange} Days)
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Visualizing successful (win) versus unsuccessful (loss) executions per day with 4–5 daily target benchmark.
          </p>
        </div>

        {/* Range Buttons */}
        <div className="flex items-center bg-gray-950/70 p-1 rounded-lg border border-gray-800 self-start sm:self-auto">
          {([7, 14, 30] as TimeRangeOption[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                timeRange === r
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="bg-gray-950/50 border border-gray-800/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3 text-indigo-400" /> Avg Daily Trades
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-gray-100">{stats.avgTradesPerActiveDay.toFixed(1)}</span>
            <span className="text-[10.5px] text-gray-400">/ active day</span>
          </div>
          <span className="text-[9.5px] text-gray-500 mt-1">
            Target benchmark: 4–5 trades/day
          </span>
        </div>

        <div className="bg-gray-950/50 border border-gray-800/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {timeRange}D Win Rate
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-400">{stats.winRate.toFixed(1)}%</span>
            <span className="text-[10.5px] text-gray-400">({stats.totalWins}W / {stats.totalLosses}L)</span>
          </div>
          <span className="text-[9.5px] text-gray-500 mt-1">
            Total {stats.totalTrades} closed trades
          </span>
        </div>

        <div className="bg-gray-950/50 border border-gray-800/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-teal-400" /> Net {timeRange}D Realized
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-xl font-black ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}
            </span>
          </div>
          <span className="text-[9.5px] text-gray-500 mt-1">
            Cumulative net closed PnL
          </span>
        </div>

        <div className="bg-gray-950/50 border border-gray-800/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-400" /> Best Trading Day
          </span>
          <div className="mt-2 flex items-baseline gap-1.5 truncate">
            {stats.bestDay ? (
              <>
                <span className="text-sm font-bold text-amber-300">{stats.bestDay.displayDate}</span>
                <span className="text-[11px] font-bold text-emerald-400">+${stats.bestDay.profit.toFixed(1)}</span>
              </>
            ) : (
              <span className="text-xs text-gray-500">No trades yet</span>
            )}
          </div>
          <span className="text-[9.5px] text-gray-500 mt-1">
            {stats.activeDaysCount} active / {timeRange} total days
          </span>
        </div>
      </div>

      {/* Bar Chart Visualization */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400 px-1">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
              <strong className="text-gray-300">Successful Trades</strong> ({stats.totalWins})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
              <strong className="text-gray-300">Unsuccessful Trades</strong> ({stats.totalLosses})
            </span>
          </div>
          <span className="text-[11px] font-mono text-gray-500 hidden sm:inline-block">
            Benchmark: 4–5 High-Confidence Setups / Day
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                interval={timeRange === 30 ? 2 : 0}
              />
              <YAxis
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(5, dataMax + 1)]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1f2937', opacity: 0.4 }} />
              <ReferenceLine y={4} stroke="#6366f1" strokeDasharray="3 3" opacity={0.6} label={{ value: '4 Target', fill: '#818cf8', fontSize: 9, position: 'insideTopRight' }} />
              <Bar dataKey="wins" name="Successful Wins" fill="#10b981" radius={[3, 3, 0, 0]} stackId="a" maxBarSize={30} />
              <Bar dataKey="losses" name="Unsuccessful Losses" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
