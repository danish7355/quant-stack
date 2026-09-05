/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { TradeLog } from '../types';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  ArrowUpDown,
  Zap,
  Flame,
  Activity,
  Shield,
  Target,
  Sparkles,
  ChevronsUp,
  ChevronsDown,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { formatPrice, formatISTDateTime } from '../utils/format';

interface FullTradeLogTableProps {
  logs: TradeLog[];
}

type OutcomeFilter = 'ALL' | 'WINS' | 'LOSSES' | 'TP3' | 'SL';
type SortField = 'timeOpen' | 'timeClose' | 'profit' | 'pctReturn' | 'duration' | 'scoreAtEntry';
type SortOrder = 'desc' | 'asc';

export default function FullTradeLogTable({ logs }: FullTradeLogTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('timeOpen');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Helper to compute duration in ms and human string
  const getDurationInfo = (openTime?: string, closeTime?: string) => {
    if (!openTime || !closeTime) return { ms: 0, text: 'N/A' };
    const tOpen = new Date(openTime).getTime();
    const tClose = new Date(closeTime).getTime();
    if (isNaN(tOpen) || isNaN(tClose) || tClose < tOpen) return { ms: 0, text: 'N/A' };
    
    const diffMs = tClose - tOpen;
    const totalMins = Math.floor(diffMs / 60000);
    if (totalMins < 1) return { ms: diffMs, text: '<1 min' };
    if (totalMins < 60) return { ms: diffMs, text: `${totalMins}m` };
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours < 24) return { ms: diffMs, text: `${hours}h ${mins}m` };
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return { ms: diffMs, text: `${days}d ${remHours}h` };
  };

  // Helper for Exit Reason Badges
  const getExitReasonBadge = (reason: string, isProfit: boolean) => {
    const upper = (reason || '').toUpperCase();
    if (upper.includes('TP3') || upper.includes('1:3') || upper === 'TP3') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-600/60 text-[10px] font-bold">
          <Target className="w-2.5 h-2.5 text-emerald-400" /> 1:3 Target Hit (TP3)
        </span>
      );
    }
    if (upper.includes('TP2') || upper === 'TP2') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-700/50 text-[10px] font-bold">
          <Target className="w-2.5 h-2.5 text-emerald-400" /> 2:1 Target Hit (TP2)
        </span>
      );
    }
    if (upper.includes('TP1') || upper.includes('PARTIAL') || upper === 'TP1') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-950/40 text-teal-300 border border-teal-700/50 text-[10px] font-bold">
          <Target className="w-2.5 h-2.5 text-teal-400" /> Partial Target (TP1)
        </span>
      );
    }
    if (upper.includes('SL') || upper.includes('STOP') || upper === 'SL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/50 text-rose-300 border border-rose-700/60 text-[10px] font-bold">
          <Shield className="w-2.5 h-2.5 text-rose-400" /> Stop Loss Hit (SL)
        </span>
      );
    }
    if (upper.includes('TS') || upper.includes('TRAILING')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-700/50 text-[10px] font-bold">
          <Activity className="w-2.5 h-2.5 text-indigo-400" /> Trailing Stop (TS)
        </span>
      );
    }
    if (upper.includes('MANUAL') || upper.includes('FLATTEN')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 text-[10px] font-bold">
          Manual Flatten
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800/80 text-gray-300 border border-gray-700 text-[10px] font-mono">
        {reason || 'CLOSED'}
      </span>
    );
  };

  // Filter and sort logs
  const filteredAndSortedLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Search term filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchSymbol = log.symbol.toLowerCase().includes(term);
          const matchReason = (log.exitReason || '').toLowerCase().includes(term);
          const matchStrat = (log.strategy || '').toLowerCase().includes(term);
          if (!matchSymbol && !matchReason && !matchStrat) return false;
        }

        // Outcome filter
        if (outcomeFilter === 'WINS' && log.profit <= 0) return false;
        if (outcomeFilter === 'LOSSES' && log.profit > 0) return false;
        if (outcomeFilter === 'TP3') {
          const r = (log.exitReason || '').toUpperCase();
          if (!r.includes('TP3') && !r.includes('1:3')) return false;
        }
        if (outcomeFilter === 'SL') {
          const r = (log.exitReason || '').toUpperCase();
          if (!r.includes('SL') && !r.includes('STOP')) return false;
        }

        // Strategy filter
        if (strategyFilter !== 'ALL') {
          const strat = log.strategy || 'BINANCE_COMPOSITE';
          if (strat !== strategyFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortField === 'timeOpen') {
          valA = new Date(a.timeOpen || 0).getTime();
          valB = new Date(b.timeOpen || 0).getTime();
        } else if (sortField === 'timeClose') {
          valA = new Date(a.timeClose || 0).getTime();
          valB = new Date(b.timeClose || 0).getTime();
        } else if (sortField === 'profit') {
          valA = a.profit;
          valB = b.profit;
        } else if (sortField === 'pctReturn') {
          valA = a.pctReturn || 0;
          valB = b.pctReturn || 0;
        } else if (sortField === 'duration') {
          valA = getDurationInfo(a.timeOpen, a.timeClose).ms;
          valB = getDurationInfo(b.timeOpen, b.timeClose).ms;
        } else if (sortField === 'scoreAtEntry') {
          valA = a.scoreAtEntry || 0;
          valB = b.scoreAtEntry || 0;
        }

        if (sortOrder === 'desc') {
          return valB > valA ? 1 : valB < valA ? -1 : 0;
        } else {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
      });
  }, [logs, searchTerm, outcomeFilter, strategyFilter, sortField, sortOrder]);

  // Aggregates of the filtered subset
  const subsetStats = useMemo(() => {
    const total = filteredAndSortedLogs.length;
    const wins = filteredAndSortedLogs.filter((l) => l.profit > 0).length;
    const losses = filteredAndSortedLogs.filter((l) => l.profit <= 0).length;
    const netProfit = filteredAndSortedLogs.reduce((sum, l) => sum + l.profit, 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    return { total, wins, losses, netProfit, winRate };
  }, [filteredAndSortedLogs]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLogs.length / itemsPerPage));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedLogs.slice(start, start + itemsPerPage);
  }, [filteredAndSortedLogs, currentPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (logs.length === 0) return;
    const headers = [
      'Trade ID',
      'Symbol',
      'Direction',
      'Leverage',
      'Strategy',
      'Frequency Preset',
      'Entry Price',
      'Close Price',
      'Executed Time (UTC)',
      'Executed Time (IST)',
      'Closed Time (UTC)',
      'Closed Time (IST)',
      'Duration',
      'Net Profit (USD)',
      'Return (%)',
      'Exit Reason',
      'Score At Entry'
    ];

    const rows = filteredAndSortedLogs.map((log) => {
      const duration = getDurationInfo(log.timeOpen, log.timeClose).text;
      return [
        `"${log.id}"`,
        `"${log.symbol}"`,
        `"${log.direction}"`,
        `${log.leverage || 1}`,
        `"${log.strategy || 'BINANCE_COMPOSITE'}"`,
        `"${log.frequencyPreset || 'LOW'}"`,
        `${log.entryPrice}`,
        `${log.closePrice}`,
        `"${log.timeOpen || ''}"`,
        `"${formatISTDateTime(log.timeOpen)}"`,
        `"${log.timeClose || ''}"`,
        `"${formatISTDateTime(log.timeClose)}"`,
        `"${duration}"`,
        `${log.profit.toFixed(4)}`,
        `${(log.pctReturn || 0).toFixed(2)}`,
        `"${log.exitReason || 'CLOSED'}"`,
        `${log.scoreAtEntry || 0}`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trade_logs_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="full-trade-log-widget" className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
              Full Trade Execution & Closure Log
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Complete audit record of every executed position with exact open/close timestamps (IST), entry/exit prices, and closure trigger reasons.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportToCSV}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" /> Export CSV
          </button>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-1 rounded">
            {filteredAndSortedLogs.length} / {logs.length} Logged
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs font-mono">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search coin, reason..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-gray-950/80 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-xs"
          />
        </div>

        {/* Outcome Filter Buttons */}
        <div className="flex bg-gray-950/80 p-1 rounded-lg border border-gray-800">
          {(['ALL', 'WINS', 'LOSSES', 'TP3', 'SL'] as OutcomeFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setOutcomeFilter(f);
                setCurrentPage(1);
              }}
              className={`flex-1 py-1 px-1.5 rounded text-[10.5px] font-bold transition-all ${
                outcomeFilter === f
                  ? f === 'WINS' || f === 'TP3'
                    ? 'bg-emerald-600 text-white'
                    : f === 'LOSSES' || f === 'SL'
                    ? 'bg-rose-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'WINS' ? 'Wins' : f === 'LOSSES' ? 'Losses' : f === 'TP3' ? '1:3 TP' : 'SL'}
            </button>
          ))}
        </div>

        {/* Strategy Selector */}
        <div className="relative">
          <select
            value={strategyFilter}
            onChange={(e) => {
              setStrategyFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-gray-950/80 border border-gray-800 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-cyan-500 text-xs"
          >
            <option value="ALL">All Strategies</option>
            <option value="BINANCE_COMPOSITE">10-Gate Scanner</option>
            <option value="DELTA_CLIMAX">Climax Reversal</option>
            <option value="VOLATILITY_COMPRESSION">VCB Breakout</option>
            <option value="TREND_PULLBACK">Trend Pullback</option>
            <option value="SMC_LIQUIDITY_SWEEP">SMC Liquidity Sweep</option>
          </select>
        </div>

        {/* Filtered Subset Quick Summary */}
        <div className="flex items-center justify-between bg-gray-950/50 border border-gray-800/80 px-3 py-1.5 rounded-lg text-[11px]">
          <span className="text-gray-400">Win Rate: <strong className="text-emerald-400">{subsetStats.winRate.toFixed(0)}%</strong></span>
          <span className="text-gray-400">Net: <strong className={subsetStats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{subsetStats.netProfit >= 0 ? '+' : ''}${subsetStats.netProfit.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Trade Log Table */}
      {filteredAndSortedLogs.length === 0 ? (
        <div className="text-center p-12 text-gray-500 text-xs border border-dashed border-gray-800 rounded-lg">
          No trade records match your filter criteria.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-[10.5px] uppercase">
                  <th className="pb-3 pr-4">Pair & Type</th>
                  <th className="pb-3 pr-4">Strategy & Mode</th>
                  <th
                    className="pb-3 pr-4 cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('timeOpen')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Executed (IST)</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </th>
                  <th
                    className="pb-3 pr-4 cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('timeClose')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Closed (IST)</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </th>
                  <th
                    className="pb-3 pr-4 cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Duration</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </th>
                  <th className="pb-3 pr-4 text-right">Entry $\to$ Exit</th>
                  <th
                    className="pb-3 pr-4 text-right cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('profit')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Net PnL</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </th>
                  <th className="pb-3 pr-4 text-center">Exit Reason</th>
                  <th
                    className="pb-3 text-right cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('scoreAtEntry')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Score</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {paginatedLogs.map((trade) => {
                  const isLong = trade.direction === 'LONG';
                  const isProfit = trade.profit >= 0;
                  const strat = trade.strategy || 'BINANCE_COMPOSITE';
                  const freq = trade.frequencyPreset || 'LOW';
                  const duration = getDurationInfo(trade.timeOpen, trade.timeClose);

                  return (
                    <tr key={trade.id} className="hover:bg-gray-800/30 transition-colors">
                      {/* Pair and Direction */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-100">{trade.symbol}</span>
                          <span
                            className={`inline-flex items-center text-[9.5px] px-1.5 py-0.2 rounded font-bold ${
                              isLong
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {isLong ? <ChevronsUp className="w-2.5 h-2.5 mr-0.5" /> : <ChevronsDown className="w-2.5 h-2.5 mr-0.5" />}
                            {trade.direction} {trade.leverage ? `${trade.leverage}x` : ''}
                          </span>
                        </div>
                      </td>

                      {/* Strategy & Frequency Badges */}
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          {strat === 'DELTA_CLIMAX' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-950/50 text-cyan-300 border border-cyan-700/50 text-[9.5px] font-bold w-fit">
                              <Zap className="w-2.5 h-2.5 text-cyan-400" /> Climax Reversal
                            </span>
                          ) : strat === 'VOLATILITY_COMPRESSION' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-700/50 text-[9.5px] font-bold w-fit">
                              <Flame className="w-2.5 h-2.5 text-amber-400" /> VCB Breakout
                            </span>
                          ) : strat === 'TREND_PULLBACK' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-950/50 text-blue-300 border border-blue-700/50 text-[9.5px] font-bold w-fit">
                              <Target className="w-2.5 h-2.5 text-blue-400" /> Trend Pullback
                            </span>
                          ) : strat === 'SMC_LIQUIDITY_SWEEP' || strat === 'SMC' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-700/50 text-[9.5px] font-bold w-fit">
                              <Sparkles className="w-2.5 h-2.5 text-purple-400" /> SMC Liquidity
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-700/50 text-[9.5px] font-bold w-fit">
                              <Activity className="w-2.5 h-2.5 text-emerald-400" /> {strat === 'BINANCE_COMPOSITE' ? '10-Gate Scanner' : strat.replace(/_/g, ' ')}
                            </span>
                          )}

                          {freq === 'HIGH' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-950/40 text-rose-300 border border-rose-800/50 text-[9px] font-bold w-fit">
                              <Sparkles className="w-2.5 h-2.5 text-rose-400" /> High Freq
                            </span>
                          ) : freq === 'LOW' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-800/50 text-[9px] font-bold w-fit">
                              <Shield className="w-2.5 h-2.5 text-indigo-400" /> 1:3 Sniper (Confirmed)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-teal-950/50 text-teal-300 border border-teal-700/60 text-[9px] font-bold w-fit">
                              <Target className="w-2.5 h-2.5 text-teal-400" /> Medium Freq
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Executed Time (IST) */}
                      <td className="py-3 pr-4 text-gray-300 text-[11px]">
                        <div>{formatISTDateTime(trade.timeOpen)}</div>
                      </td>

                      {/* Closed Time (IST) */}
                      <td className="py-3 pr-4 text-gray-300 text-[11px]">
                        <div>{formatISTDateTime(trade.timeClose)}</div>
                      </td>

                      {/* Duration */}
                      <td className="py-3 pr-4 text-gray-400 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span>{duration.text}</span>
                        </div>
                      </td>

                      {/* Entry -> Exit Price */}
                      <td className="py-3 pr-4 text-right text-gray-300 text-[11px]">
                        <div>${formatPrice(trade.entryPrice)}</div>
                        <div className="text-gray-500 text-[10px]">
                          $\to$ ${formatPrice(trade.closePrice)}
                        </div>
                      </td>

                      {/* Net PnL */}
                      <td className="py-3 pr-4 text-right">
                        <div className={`font-bold text-[12px] ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}${trade.profit.toFixed(2)}
                        </div>
                        <div className={`text-[10px] ${isProfit ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                          {isProfit ? '+' : ''}{(trade.pctReturn || 0).toFixed(2)}%
                        </div>
                      </td>

                      {/* Exit Reason with full badge */}
                      <td className="py-3 pr-4 text-center">
                        {getExitReasonBadge(trade.exitReason, isProfit)}
                      </td>

                      {/* Score at Entry */}
                      <td className="py-3 text-right text-gray-400 text-[11px]">
                        {trade.scoreAtEntry ? (
                          <span className="font-bold text-gray-300">
                            {trade.scoreAtEntry}
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-800 pt-3 text-xs font-mono text-gray-400">
              <span>
                Page {currentPage} of {totalPages} ({filteredAndSortedLogs.length} total entries)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
