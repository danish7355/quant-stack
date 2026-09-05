/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CoinDetail, SignalDirection, CoinStatus } from '../types';
import { Search, ArrowUpDown, Zap, TrendingUp, TrendingDown, RefreshCcw, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { formatPrice } from '../utils/format';

interface ScannerListProps {
  coins: CoinDetail[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
  isLoading: boolean;
  onManualScan: () => void;
  autoTradeThreshold: number;
}

type SortField = 'symbol' | 'price' | 'change24h' | 'score' | 'direction' | 'status' | 'adx' | 'rsi' | 'volumeRatio';

export default function ScannerList({
  coins,
  selectedSymbol,
  onSelectCoin,
  isLoading,
  onManualScan,
  autoTradeThreshold,
}: ScannerListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [signalFilter, setSignalFilter] = useState<'ALL' | SignalDirection>('ALL');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 1. Process coins (Filter & Sort)
  const filteredCoins = coins
    .filter((coin) => {
      const matchSearch = coin.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase());
      
      let matchStatus = true;
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'TRENDING') {
          matchStatus = coin.status === 'TRENDING' || coin.status === 'STRONG_TREND' || coin.status === 'WEAK_TREND';
        } else if (statusFilter === 'STRONG_TREND') {
          matchStatus = coin.status === 'STRONG_TREND' || coin.status === 'TRENDING';
        } else if (statusFilter === 'WEAK_TREND') {
          matchStatus = coin.status === 'WEAK_TREND';
        } else if (statusFilter === 'TRANSITION') {
          matchStatus = coin.status === 'TRANSITION';
        } else if (statusFilter === 'RANGING' || statusFilter === 'RANGE') {
          matchStatus = coin.status === 'RANGING' || coin.status === 'RANGE';
        } else if (statusFilter === 'CHOPPY' || statusFilter === 'UNSAFE') {
          matchStatus = coin.status === 'CHOPPY' || coin.status === 'UNSAFE';
        } else {
          matchStatus = coin.status === statusFilter;
        }
      }

      let matchSignal = true;
      if (signalFilter !== 'ALL') {
        const coinDir = coin.crSignal && coin.crSignal.status === 'confirmed' 
          ? coin.crSignal.direction 
          : coin.direction;
        matchSignal = coinDir === signalFilter;
      }

      return matchSearch && matchStatus && matchSignal;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'symbol':
          comparison = (a.symbol || '').localeCompare(b.symbol || '');
          break;
        case 'price':
          comparison = (a.price || 0) - (b.price || 0);
          break;
        case 'change24h':
          comparison = (a.change24h || 0) - (b.change24h || 0);
          break;
        case 'score':
          comparison = (a.score || 0) - (b.score || 0);
          break;
        case 'direction':
          comparison = (a.direction || '').localeCompare(b.direction || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'adx':
          comparison = (a.indicators?.adx?.adx || 0) - (b.indicators?.adx?.adx || 0);
          break;
        case 'rsi':
          comparison = (a.indicators?.rsi || 0) - (b.indicators?.rsi || 0);
          break;
        case 'volumeRatio':
          comparison = (a.indicators?.volumeRatio || 0) - (b.indicators?.volumeRatio || 0);
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

  const getScoreColor = (score: number) => {
    const absScore = Math.abs(score);
    if (absScore < 40) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (absScore < 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  const getSignalBadge = (dir: SignalDirection) => {
    if (dir === 'LONG') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
          <TrendingUp className="w-3 h-3" />
          <span>LONG</span>
        </span>
      );
    }
    if (dir === 'SHORT') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
          <TrendingDown className="w-3 h-3" />
          <span>SHORT</span>
        </span>
      );
    }
    return (
      <span className="inline-flex px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-semibold border border-transparent">
        NEUTRAL
      </span>
    );
  };

  const getStatusBadge = (status: CoinStatus | string) => {
    switch (status) {
      case 'STRONG_TREND':
      case 'TRENDING':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] uppercase font-bold tracking-wider border border-emerald-500/30">
            STRONG TREND
          </span>
        );
      case 'WEAK_TREND':
        return (
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 text-[10px] uppercase font-bold tracking-wider border border-cyan-500/30">
            WEAK TREND
          </span>
        );
      case 'TRANSITION':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px] uppercase font-bold tracking-wider border border-purple-500/30">
            TRANSITION
          </span>
        );
      case 'RANGE':
      case 'RANGING':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] uppercase font-bold tracking-wider border border-amber-500/30">
            RANGE
          </span>
        );
      case 'UNSAFE':
      case 'CHOPPY':
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] uppercase font-bold tracking-wider border border-gray-700">
            {status ? status.replace('_', ' ') : 'CHOPPY'}
          </span>
        );
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setSignalFilter('ALL');
  };

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden">
      {/* Search and Filters Strip */}
      <div className="p-4 bg-[#161B22] border-b border-[#30363D] flex flex-col md:flex-row md:items-center justify-between gap-3 font-semibold">
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0E1117] border border-[#30363D] focus:border-gray-500 focus:outline-none rounded-lg text-xs placeholder-gray-500 font-mono text-gray-200 pl-9 pr-4 py-2 w-full md:w-48 transition"
            />
          </div>

          {/* Badges Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mr-1 leading-none">
              Filters:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0E1117] text-gray-300 border border-[#30363D] focus:border-gray-500 rounded p-1.5 text-[11px] outline-none"
            >
              <option value="ALL">All Market States</option>
              <option value="STRONG_TREND">Strong Trend</option>
              <option value="WEAK_TREND">Weak Trend</option>
              <option value="TRANSITION">Transition</option>
              <option value="RANGE">Range / Ranging</option>
              <option value="UNSAFE">Unsafe / Choppy</option>
            </select>

            <select
              value={signalFilter}
              onChange={(e) => setSignalFilter(e.target.value as any)}
              className="bg-[#0E1117] text-gray-300 border border-[#30363D] focus:border-gray-500 rounded p-1.5 text-[11px] outline-none"
            >
              <option value="ALL">All Signals</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
              <option value="NEUTRAL">Neutral</option>
            </select>

            {(searchTerm || statusFilter !== 'ALL' || signalFilter !== 'ALL') && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-gray-300 hover:text-indigo-300 underline font-medium cursor-pointer ml-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Scan & Counts controls */}
        <div className="flex items-center space-x-3 justify-between">
          <span className="text-[10px] text-gray-400 font-mono">
            Showing <strong className="text-gray-200">{filteredCoins.length}</strong> of {coins.length} pairs
          </span>

          <button
            onClick={onManualScan}
            disabled={isLoading}
            className="flex items-center space-x-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-[#30363D] text-gray-400 font-sans uppercase text-[10px] tracking-wider select-none bg-gray-950/40">
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white" onClick={() => handleSort('symbol')}>
                <div className="flex items-center">
                  <span>Symbol</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-right" onClick={() => handleSort('price')}>
                <div className="flex items-center justify-end">
                  <span>Price</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-right" onClick={() => handleSort('change24h')}>
                <div className="flex items-center justify-end">
                  <span>24h Chg</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-center" onClick={() => handleSort('score')}>
                <div className="flex items-center justify-center">
                  <span>Score</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-center" onClick={() => handleSort('direction')}>
                <div className="flex items-center justify-center">
                  <span>Direction</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-center" onClick={() => handleSort('status')}>
                <div className="flex items-center justify-center">
                  <span>Market State</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-right" onClick={() => handleSort('adx')}>
                <div className="flex items-center justify-end">
                  <span>ADX (14)</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-right" onClick={() => handleSort('rsi')}>
                <div className="flex items-center justify-end">
                  <span>RSI (14)</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold text-center">EMA Setup</th>
              <th className="py-3 px-4 font-bold text-center">SuperTrend</th>
              <th className="py-3 px-4 font-bold cursor-pointer hover:text-white text-right" onClick={() => handleSort('volumeRatio')}>
                <div className="flex items-center justify-end">
                  <span>Vol Ratio</span>
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="py-3 px-4 font-bold text-left">Gate Conditions</th>
              <th className="py-3 px-4 font-bold text-center">Pattern</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filteredCoins.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-gray-500 font-sans">
                  {coins.length === 0 ? (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <p className="text-gray-400 text-sm">No coin data loaded yet.</p>
                      <button
                        onClick={onManualScan}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition"
                      >
                        Start First Scan
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <p>No coins found matching the selected filters.</p>
                      <button
                        onClick={clearFilters}
                        className="text-xs text-gray-300 hover:text-indigo-300 underline font-semibold"
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredCoins.map((coin) => {
                const isSelected = selectedSymbol === coin.symbol;
                const scoreValue = Math.abs(coin.score);
                const isHighVol = (coin.indicators?.volumeRatio || 0) > 1.5;

                // Highlight active trigger triggers
                let qualifiesAutoTrade = scoreValue >= autoTradeThreshold && coin.status !== 'RANGE' && coin.status !== 'RANGING' && coin.status !== 'UNSAFE';
                if (coin.crSignal && coin.crSignal.status === 'confirmed') {
                  qualifiesAutoTrade = true;
                }
                let pulseClass = '';
                if (qualifiesAutoTrade) {
                  pulseClass = coin.direction === 'LONG'
                    ? 'hover:bg-emerald-950/30 bg-emerald-950/15 border-l-2 border-emerald-500 relative transition-all duration-200'
                    : 'hover:bg-rose-950/30 bg-rose-950/15 border-l-2 border-rose-500 relative transition-all duration-200';
                } else {
                  pulseClass = isSelected
                    ? 'bg-gray-800/80 hover:bg-gray-800 border-l-2 border-indigo-500'
                    : 'hover:bg-gray-800/40';
                }

                const allPassed = coin.statusReason === 'All gates passed' || (coin.statusReason && coin.statusReason.includes('Climax Reversal'));

                return (
                  <tr
                    key={coin.symbol}
                    id={`row-${coin.symbol}`}
                    onClick={() => onSelectCoin(coin.symbol)}
                    className={`cursor-pointer transition-colors duration-150 ${pulseClass} text-[11px]`}
                  >
                    {/* 1. Symbol */}
                    <td className="py-2.5 px-4 font-bold text-gray-100 flex items-center space-x-1.5">
                      {qualifiesAutoTrade && (
                        <Zap className={`w-3.5 h-3.5 fill-current shrink-0 animate-pulse ${coin.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`} />
                      )}
                      <span className={isSelected ? 'text-gray-300 font-black' : ''}>{coin.symbol}</span>
                    </td>

                    {/* 2. Price */}
                    <td className="py-2.5 px-4 text-right font-medium text-gray-300">
                      ${formatPrice(coin.price)}
                    </td>

                    {/* 3. Change 24h */}
                    <td className={`py-2.5 px-4 text-right font-semibold ${(coin.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(coin.change24h || 0) >= 0 ? '+' : ''}
                      {(coin.change24h || 0).toFixed(2)}%
                    </td>

                    {/* 4. Score */}
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 border rounded-full font-bold text-[10px] min-w-9 text-center ${getScoreColor(coin.score)}`}>
                        {coin.score > 0 ? '+' : ''}
                        {coin.score}
                      </span>
                    </td>

                    {/* 5. Direction */}
                    <td className="py-2.5 px-4 text-center">
                      {coin.crSignal && coin.crSignal.status === 'confirmed' ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${coin.crSignal.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                          CR {coin.crSignal.direction}
                        </span>
                      ) : getSignalBadge(coin.direction)}
                    </td>

                    {/* 6. Market State badge */}
                    <td className="py-2.5 px-4 text-center">
                      {getStatusBadge(coin.status)}
                    </td>

                    {/* 7. ADX indicator */}
                    <td className="py-2.5 px-4 text-right text-gray-400 font-medium">
                      <span className={(coin.indicators?.adx?.adx || 0) > 25 ? 'font-bold text-gray-300' : 'text-gray-500'}>
                        {(coin.indicators?.adx?.adx || 0).toFixed(1)}
                      </span>
                    </td>

                    {/* 8. RSI indicator */}
                    <td className="py-2.5 px-4 text-right text-gray-400 font-medium">
                      <span className={(coin.indicators?.rsi || 50) > 70 ? 'text-rose-400 font-bold' : (coin.indicators?.rsi || 50) < 30 ? 'text-emerald-400 font-bold' : 'text-gray-300'}>
                        {(coin.indicators?.rsi || 0).toFixed(1)}
                      </span>
                    </td>

                    {/* 9. EMA cross check */}
                    <td className="py-2.5 px-4 text-center text-[10px] font-medium">
                      {(coin.indicators?.emaFast || 0) > (coin.indicators?.emaSlow || 0) ? (
                        <span className="text-emerald-400">FAST &gt; SLOW</span>
                      ) : (
                        <span className="text-rose-400">FAST &lt; SLOW</span>
                      )}
                    </td>

                    {/* 10. SuperTrend direction */}
                    <td className="py-2.5 px-4 text-center text-[10px] font-bold">
                      {coin.indicators?.superTrend?.direction === 'uptrend' ? (
                        <span className="text-emerald-400 uppercase">UPTREND</span>
                      ) : (
                        <span className="text-rose-400 uppercase">DOWNTREND</span>
                      )}
                    </td>

                    {/* 11. Volume ratio */}
                    <td className="py-2.5 px-4 text-right font-medium">
                      <span className={isHighVol ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                        {(coin.indicators?.volumeRatio || 1.0).toFixed(1)}x
                      </span>
                    </td>

                    {/* 12. Gate Conditions */}
                    <td className="py-2.5 px-4 text-left max-w-xs truncate" title={coin.statusReason || 'Pending gate check'}>
                      {allPassed ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 font-bold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{coin.statusReason === 'All gates passed' ? '10 Gates Passed' : 'Setup Confirmed'}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500 truncate block">
                          {coin.statusReason || 'Pending validation'}
                        </span>
                      )}
                    </td>

                    {/* 13. Pattern / Setup */}
                    <td className="py-2.5 px-4 text-center text-[10px]">
                      {coin.wmPattern && coin.wmPattern !== 'NONE' ? (
                        <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-bold">
                          {coin.wmPattern}
                        </span>
                      ) : coin.crSignal ? (
                        <span className={`px-1.5 py-0.5 rounded font-bold ${coin.crSignal.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'}`}>
                          {coin.crSignal.status}
                        </span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
