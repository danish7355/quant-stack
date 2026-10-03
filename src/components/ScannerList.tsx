/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { CoinDetail, SignalDirection, CoinStatus } from '../types';
import { 
  Search, ArrowUpDown, Zap, TrendingUp, TrendingDown, RefreshCcw, 
  CheckCircle2, AlertCircle, XCircle, LayoutGrid, List,
  ChevronDown, Layers, Check, SlidersHorizontal
} from 'lucide-react';
import { formatPrice } from '../utils/format';

interface ScannerListProps {
  coins: CoinDetail[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
  isLoading: boolean;
  onManualScan: () => void;
  autoTradeThreshold: number;
  activeStrategies?: string[];
  deletedStrategies?: string[];
  activeStrategy?: string;
  onToggleStrategy?: (strategy: string) => void;
  onSelectStrategy?: (strategy: string) => void;
  onSetMultipleStrategies?: (strategies: string[]) => void;
}

type SortField = 'symbol' | 'price' | 'change24h' | 'score' | 'direction' | 'status';

export default function ScannerList({
  coins,
  selectedSymbol,
  onSelectCoin,
  isLoading,
  onManualScan,
  autoTradeThreshold,
  activeStrategies,
  deletedStrategies,
  activeStrategy,
  onToggleStrategy,
  onSelectStrategy,
  onSetMultipleStrategies,
}: ScannerListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [signalFilter, setSignalFilter] = useState<'ALL' | SignalDirection>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<'ALL' | 'CONFLUENCE' | 'SMC' | 'TREND_PULLBACK' | 'MULTICOIN_SCALPER' | string>('ALL');
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [strategyDropdownOpen, setStrategyDropdownOpen] = useState(false);
  const strategyDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (strategyDropdownRef.current && !strategyDropdownRef.current.contains(event.target as Node)) {
        setStrategyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute active strategy states
  const deletedStrats = deletedStrategies || [];
  const currentActive = ((activeStrategies && activeStrategies.length > 0)
    ? activeStrategies
    : [activeStrategy || 'COIL_BREAKOUT']).filter(s => !deletedStrats.includes(s));
  const isLsrActive = !deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && (currentActive.includes('LIQUIDITY_SWEEP_REVERSAL') || currentActive.includes('SMC_LIQUIDITY'));
  const isSmcActive = !deletedStrats.includes('SMC_LIQUIDITY') && (currentActive.includes('SMC_LIQUIDITY') || currentActive.includes('SMC_LIQUIDITY_SWEEP'));
  const isTpActive = !deletedStrats.includes('TREND_PULLBACK') && currentActive.includes('TREND_PULLBACK');
  const isScalperActive = !deletedStrats.includes('MULTICOIN_SCALPER_PRO') && currentActive.includes('MULTICOIN_SCALPER_PRO');
  const isCoilActive = !deletedStrats.includes('COIL_BREAKOUT') && (currentActive.includes('COIL_BREAKOUT') || currentActive.includes('VCB') || currentActive.includes('VOLATILITY_COMPRESSION'));
  const isOrderBlockActive = !deletedStrats.includes('ORDER_BLOCK') && currentActive.includes('ORDER_BLOCK');
  const isRangeRegimeActive = !deletedStrats.includes('RANGE_REGIME_V1') && (currentActive.includes('RANGE_REGIME_V1') || currentActive.includes('RANGE_REGIME'));
  const availableBaseStrats = ['ORDER_BLOCK', 'COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'RANGE_REGIME_V1'].filter(s => !deletedStrats.includes(s));
  const isAllActive = availableBaseStrats.length > 0 && availableBaseStrats.every(s => currentActive.includes(s));

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

      let matchStrategy = true;
      if (strategyFilter === 'CONFLUENCE') {
        matchStrategy = Boolean(coin.isMultiConfluence || (coin.matchedStrategies && coin.matchedStrategies.length > 1));
      } else if (strategyFilter === 'LSR' || strategyFilter === 'LIQUIDITY_SWEEP_REVERSAL' || strategyFilter === 'SMC') {
        matchStrategy = coin.detectedStrategy === 'LIQUIDITY_SWEEP_REVERSAL' ||
          coin.detectedStrategy === 'SMC_LIQUIDITY' ||
          (coin.matchedStrategies && (coin.matchedStrategies.includes('LIQUIDITY_SWEEP_REVERSAL') || coin.matchedStrategies.includes('SMC') || coin.matchedStrategies.includes('SMC_LIQUIDITY'))) ||
          Boolean(coin.lsrSignal && (coin.lsrSignal.finalDecision === 'EXECUTE' || coin.lsrSignal.status === 'TRIGGERED' || coin.lsrSignal.status === 'ARMED')) ||
          Boolean(coin.smcSignal && coin.smcSignal.hasConfluence);
      } else if (strategyFilter === 'TREND_PULLBACK') {
        matchStrategy = coin.detectedStrategy === 'TREND_PULLBACK' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('TREND_PULLBACK')) ||
          Boolean(coin.trendPullbackSignal && coin.trendPullbackSignal.finalDecision !== 'REJECT') ||
          Boolean(coin.tpSignal && coin.tpSignal.finalDecision !== 'REJECT');
      } else if (strategyFilter === 'MULTICOIN_SCALPER' || strategyFilter === 'MULTICOIN_SCALPER_PRO') {
        matchStrategy = coin.detectedStrategy === 'MULTICOIN_SCALPER_PRO' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('MULTICOIN_SCALPER_PRO')) ||
          Boolean(coin.multicoinScalperSignal && coin.multicoinScalperSignal.finalDecision !== 'REJECT');
      } else if (strategyFilter === 'ORDER_BLOCK') {
        matchStrategy = coin.detectedStrategy === 'ORDER_BLOCK' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('ORDER_BLOCK')) ||
          Boolean(coin.orderBlockSignal && coin.orderBlockSignal.finalDecision !== 'REJECT');
      } else if (strategyFilter === 'RANGE_REGIME_V1' || strategyFilter === 'RANGE_REGIME') {
        matchStrategy = coin.detectedStrategy === 'RANGE_REGIME_V1' ||
          coin.detectedStrategy === 'RANGE_REGIME' ||
          (coin.matchedStrategies && (coin.matchedStrategies.includes('RANGE_REGIME_V1') || coin.matchedStrategies.includes('RANGE_REGIME'))) ||
          Boolean((coin as any).rangeRegimeSignal && (coin as any).rangeRegimeSignal.finalDecision !== 'REJECT');
      } else if (strategyFilter === 'COIL_BREAKOUT' || strategyFilter === 'VCB' || strategyFilter === 'VOLATILITY_COMPRESSION') {
        matchStrategy = coin.detectedStrategy === 'COIL_BREAKOUT' ||
          coin.detectedStrategy === 'VCB' ||
          coin.detectedStrategy === 'VOLATILITY_COMPRESSION' ||
          (coin.matchedStrategies && (coin.matchedStrategies.includes('COIL_BREAKOUT') || coin.matchedStrategies.includes('VCB') || coin.matchedStrategies.includes('VOLATILITY_COMPRESSION'))) ||
          Boolean(coin.coilBreakoutSignal && coin.coilBreakoutSignal.status !== 'REJECTED') ||
          Boolean((coin as any).vcbSignal && (coin as any).vcbSignal.finalDecision !== 'REJECT');
      } else if (strategyFilter === 'DELTA_CLIMAX') {
        matchStrategy = coin.detectedStrategy === 'DELTA_CLIMAX' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('DELTA_CLIMAX'));
      } else if (strategyFilter === 'VOLATILITY_COMPRESSION') {
        matchStrategy = coin.detectedStrategy === 'VOLATILITY_COMPRESSION' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('VOLATILITY_COMPRESSION'));
      } else if (strategyFilter === 'BINANCE_COMPOSITE') {
        matchStrategy = coin.detectedStrategy === 'BINANCE_COMPOSITE' ||
          (coin.matchedStrategies && coin.matchedStrategies.includes('BINANCE_COMPOSITE'));
      }

      return matchSearch && matchStatus && matchSignal && matchStrategy;
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
      }
      return sortAsc ? comparison : -comparison;
    });

  const getStrategyBadge = (coin: CoinDetail) => {
    const isOb = coin.detectedStrategy === 'ORDER_BLOCK' ||
      (coin.matchedStrategies && coin.matchedStrategies.includes('ORDER_BLOCK')) ||
      Boolean(coin.orderBlockSignal && (coin.orderBlockSignal.finalDecision === 'EXECUTE' || coin.orderBlockSignal.status === 'TRIGGERED' || coin.orderBlockSignal.status === 'ARMED'));
    const isLsr = coin.detectedStrategy === 'LIQUIDITY_SWEEP_REVERSAL' ||
      (coin.matchedStrategies && coin.matchedStrategies.includes('LIQUIDITY_SWEEP_REVERSAL')) ||
      Boolean(coin.lsrSignal && (coin.lsrSignal.finalDecision === 'EXECUTE' || coin.lsrSignal.status === 'TRIGGERED' || coin.lsrSignal.status === 'ARMED'));
    const isSmc = coin.detectedStrategy === 'SMC_LIQUIDITY' ||
      (coin.matchedStrategies && (coin.matchedStrategies.includes('SMC') || coin.matchedStrategies.includes('SMC_LIQUIDITY'))) ||
      Boolean(coin.smcSignal && coin.smcSignal.hasConfluence);
    const isTp = coin.detectedStrategy === 'TREND_PULLBACK' ||
      (coin.matchedStrategies && coin.matchedStrategies.includes('TREND_PULLBACK')) ||
      Boolean(coin.trendPullbackSignal && coin.trendPullbackSignal.finalDecision !== 'REJECT') ||
      Boolean(coin.tpSignal && coin.tpSignal.finalDecision !== 'REJECT');
    const isScalper = coin.detectedStrategy === 'MULTICOIN_SCALPER_PRO' ||
      (coin.matchedStrategies && coin.matchedStrategies.includes('MULTICOIN_SCALPER_PRO')) ||
      Boolean(coin.multicoinScalperSignal && coin.multicoinScalperSignal.finalDecision !== 'REJECT');
    const isCoil = coin.detectedStrategy === 'COIL_BREAKOUT' ||
      (coin.matchedStrategies && coin.matchedStrategies.includes('COIL_BREAKOUT')) ||
      Boolean(coin.coilBreakoutSignal && coin.coilBreakoutSignal.status !== 'REJECTED');
    const isRangeRegime = coin.detectedStrategy === 'RANGE_REGIME_V1' ||
      coin.detectedStrategy === 'RANGE_REGIME' ||
      (coin.matchedStrategies && (coin.matchedStrategies.includes('RANGE_REGIME_V1') || coin.matchedStrategies.includes('RANGE_REGIME'))) ||
      Boolean((coin as any).rangeRegimeSignal && (coin as any).rangeRegimeSignal.finalDecision !== 'REJECT');
    const isDelta = coin.detectedStrategy === 'DELTA_CLIMAX' || (coin.matchedStrategies && coin.matchedStrategies.includes('DELTA_CLIMAX'));
    const isVcb = coin.detectedStrategy === 'VOLATILITY_COMPRESSION' || (coin.matchedStrategies && coin.matchedStrategies.includes('VOLATILITY_COMPRESSION'));
    const isComp = coin.detectedStrategy === 'BINANCE_COMPOSITE' || (coin.matchedStrategies && coin.matchedStrategies.includes('BINANCE_COMPOSITE'));
    const isConfluence = coin.isMultiConfluence || (coin.matchedStrategies && coin.matchedStrategies.length > 1);

    const tpSig = coin.trendPullbackSignal || coin.tpSignal;
    const retestClass = tpSig?.retestClassification;

    if (!isOb && !isLsr && !isRangeRegime && !isSmc && !isTp && !isScalper && !isCoil && !isDelta && !isVcb && !isComp && !isConfluence) return null;

    return (
      <div className="flex flex-wrap items-center gap-1">
        {isConfluence && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-indigo-500/20 via-teal-500/20 to-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono tracking-tight flex items-center gap-1" title="Multi-Strategy Confluence Activated">
            <span>⚡ Confluence ({coin.confluenceCount || coin.matchedStrategies?.length || 2}x)</span>
          </span>
        )}
        {isRangeRegime && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono tracking-tight flex items-center gap-1" title="Range Regime V1 (Institutional Fades)">
            <span>📊 Range V1</span>
          </span>
        )}
        {isOb && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono tracking-tight flex items-center gap-1" title="Order Block Strategy (1:3.5+ R:R)">
            <span>🧱 OB 1:3.5</span>
          </span>
        )}
        {isLsr && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono tracking-tight flex items-center gap-1" title="Liquidity Sweep Reversal (LSR)">
            <span>💧 LSR</span>
          </span>
        )}
        {isScalper && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono tracking-tight" title="3Commas Multicoin Scalper PRO (SwissAlgo)">
            Scalper PRO
          </span>
        )}
        {isCoil && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono tracking-tight flex items-center gap-1" title="Two-Sided Coil Breakout (1:5+ R:R)">
            <span>🌀 Coil 1:5</span>
          </span>
        )}
        {isSmc && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono tracking-tight" title="Smart Money Concepts">
            SMC
          </span>
        )}
        {isTp && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 font-mono tracking-tight" title="Trend Pullback Strategy">
            Trend PB
          </span>
        )}
        {isDelta && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono tracking-tight" title="Delta Climax Exhaustion Reversal">
            Delta Climax
          </span>
        )}
        {isVcb && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono tracking-tight" title="Volatility Compression Breakout">
            VCB
          </span>
        )}
        {isComp && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono tracking-tight" title="10-Gate Technical Composite">
            Composite
          </span>
        )}
        {retestClass && retestClass !== 'PENDING' && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border font-mono ${
            retestClass === 'HEALTHY_RETEST_THEN_CONTINUATION' || retestClass === 'NORMAL_RETEST'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : retestClass === 'LIQUIDITY_SWEEP'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
          }`} title={`Retest Status: ${retestClass}`}>
            {retestClass === 'HEALTHY_RETEST_THEN_CONTINUATION' ? 'Retest Cont.' : retestClass === 'NORMAL_RETEST' ? 'Retest' : retestClass}
          </span>
        )}
      </div>
    );
  };

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
      case 'ARMED':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] uppercase font-bold tracking-wider border border-amber-500/30">
            ARMED
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
    setStrategyFilter('ALL');
  };

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden">
      {/* Search and Filters Strip */}
      <div className="p-4 bg-[#161B22] border-b border-[#30363D] flex flex-col xl:flex-row xl:items-center justify-between gap-3 font-semibold">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick-Switch Strategy Dropdown */}
          <div className="relative" ref={strategyDropdownRef}>
            <button
              type="button"
              id="scanner-strategy-dropdown-btn"
              onClick={() => setStrategyDropdownOpen(prev => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer select-none shadow-sm ${
                currentActive.length >= 2
                  ? 'bg-gradient-to-r from-indigo-950/70 via-[#161B22] to-teal-950/70 border-indigo-500/50 text-gray-100 hover:border-indigo-400'
                  : isTpActive
                  ? 'bg-teal-950/40 border-teal-500/50 text-teal-200 hover:border-teal-400'
                  : isSmcActive
                  ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200 hover:border-indigo-400'
                  : currentActive.length === 0
                  ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                  : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200 hover:border-cyan-400'
              }`}
              title="Quick-switch active scanning & trading strategies"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-gray-400 text-[11px] hidden sm:inline">Active:</span>
              <div className="flex items-center gap-1 font-mono">
                {currentActive.length >= 2 ? (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-indigo-500/30 to-teal-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                      ⚡ {currentActive.length} Multi-Strategies
                    </span>
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                      Confluence
                    </span>
                  </>
                ) : isOrderBlockActive ? (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">Order Block (1:3.5+)</span>
                ) : isScalperActive ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">Scalper PRO (Top 100)</span>
                ) : isTpActive ? (
                  <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-bold">Trend Pullback</span>
                ) : isSmcActive ? (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">SMC (Liquidity)</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-bold">None (Stand Aside)</span>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${strategyDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {strategyDropdownOpen && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl z-50 overflow-hidden font-sans text-xs">
                {/* Header */}
                <div className="p-3 bg-[#0E1117] border-b border-[#30363D] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="font-bold text-gray-200 text-xs tracking-wide">ACTIVE STRATEGIES PORTFOLIO</div>
                      <div className="text-[10px] text-gray-400 font-normal">Activate multiple strategies concurrently</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {currentActive.length} Active
                  </span>
                </div>

                {/* Quick Presets Bar */}
                <div className="p-2.5 bg-[#12161E] border-b border-[#30363D] flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      onSetMultipleStrategies?.(availableBaseStrats);
                    }}
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                      isAllActive
                        ? 'bg-gradient-to-r from-emerald-600 via-amber-600 to-indigo-600 text-white border-emerald-400 shadow-sm'
                        : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                    }`}
                  >
                    Portfolio (All)
                  </button>
                  {!deletedStrats.includes('ORDER_BLOCK') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('ORDER_BLOCK');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isOrderBlockActive
                          ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      🧱 OB Solo (1:3.5)
                    </button>
                  )}
                  {!deletedStrats.includes('COIL_BREAKOUT') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('COIL_BREAKOUT');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isCoilActive
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      🌀 VCB Solo (Coil)
                    </button>
                  )}
                  {!deletedStrats.includes('MULTICOIN_SCALPER_PRO') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('MULTICOIN_SCALPER_PRO');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isScalperActive
                          ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      Scalper Solo
                    </button>
                  )}
                  {!deletedStrats.includes('TREND_PULLBACK') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('TREND_PULLBACK');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isTpActive
                          ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      TP Solo
                    </button>
                  )}
                  {!deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && !deletedStrats.includes('SMC_LIQUIDITY') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('LIQUIDITY_SWEEP_REVERSAL');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isLsrActive
                          ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      LSR Solo
                    </button>
                  )}
                  {!deletedStrats.includes('RANGE_REGIME_V1') && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy?.('RANGE_REGIME_V1');
                      }}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap ${
                        currentActive.length === 1 && isRangeRegimeActive
                          ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                          : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      Range Solo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onSetMultipleStrategies?.([]);
                    }}
                    className="py-1 px-2 rounded text-[10px] font-bold transition text-center cursor-pointer border whitespace-nowrap bg-rose-950/20 text-rose-300 border-rose-900/30 hover:bg-rose-900/40"
                  >
                    Stand Aside
                  </button>
                </div>

                {/* Interactive Strategy Rows */}
                <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                  {[
                    {
                      id: 'ORDER_BLOCK',
                      name: 'Order Block Strategy',
                      badge: '1:3.5+ R:R Strict',
                      badgeColor: 'purple',
                      desc: 'Pure price action, displacement impulse, liquidity sweep & confirmed BOS retests with hard minimum 1:3.5 R:R.',
                      active: isOrderBlockActive
                    },
                    {
                      id: 'COIL_BREAKOUT',
                      name: 'Two-Sided Coil Breakout',
                      badge: '1:5+ R:R Strict',
                      badgeColor: 'emerald',
                      desc: 'Direction-neutral compression detection (5-20 bars, <=1.25x ATR), displacement breakout, retest hold & structural 1:5 R:R.',
                      active: isCoilActive
                    },
                    {
                      id: 'MULTICOIN_SCALPER_PRO',
                      name: '3Commas Multicoin Scalper PRO',
                      badge: 'Top 100 Volume (5m/15m)',
                      badgeColor: 'amber',
                      desc: 'Micro-trend ribbon, daily VWAP, RSI resting zones, ATR targets across top 100 volume altcoins.',
                      active: isScalperActive
                    },
                    {
                      id: 'TREND_PULLBACK',
                      name: 'Robust Trend-Pullback',
                      badge: 'Retest-Aware (1:3+)',
                      badgeColor: 'teal',
                      desc: 'Multi-EMA alignment, dynamic zones, distinguishes normal retest from structural invalidation.',
                      active: isTpActive
                    },
                    {
                      id: 'LIQUIDITY_SWEEP_REVERSAL',
                      name: 'Liquidity Sweep Reversal (LSR)',
                      badge: 'Sweep & Reclaim (2:1+)',
                      badgeColor: 'cyan',
                      desc: 'Institutional failed-breakout engine: swing high/low sweep, mandatory candle close reclaim, micro-structure shift (MSS) & tight SL.',
                      active: isLsrActive
                    },
                    {
                      id: 'RANGE_REGIME_V1',
                      name: 'Range Regime V1',
                      badge: 'Range Fades (S1/S2/S3)',
                      badgeColor: 'cyan',
                      desc: 'Institutional range trading with ADX trend veto, Kaufman ER, swing edge clusters, and fee-to-risk gate.',
                      active: isRangeRegimeActive
                    }
                  ].filter(s => !deletedStrats.includes(s.id)).map((strat) => (
                    <div
                      key={strat.id}
                      onClick={() => onToggleStrategy?.(strat.id)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer flex items-start gap-2.5 ${
                        strat.active
                          ? 'bg-indigo-950/20 border-indigo-500/40 hover:border-indigo-400'
                          : 'bg-[#0E1117]/60 border-[#30363D] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={strat.active}
                        onChange={() => {}} // Handled by parent div
                        className="mt-0.5 rounded border-gray-600 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="font-bold text-gray-200 text-xs flex items-center gap-1.5">
                            <span>{strat.name}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                              strat.badgeColor === 'amber'
                                ? 'bg-amber-500/20 text-amber-300'
                                : strat.badgeColor === 'teal' 
                                ? 'bg-teal-500/20 text-teal-300' 
                                : 'bg-indigo-500/20 text-indigo-300'
                            }`}>
                              {strat.badge}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStrategy?.(strat.id);
                            }}
                            className="text-[10px] text-gray-400 hover:text-indigo-300 font-semibold px-1.5 py-0.5 rounded hover:bg-indigo-500/10 transition"
                          >
                            Solo
                          </button>
                        </div>
                        <div className="text-[11px] text-gray-400 leading-tight">
                          {strat.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer sync badge */}
                <div className="px-3 py-2 bg-[#0E1117] border-t border-[#30363D] text-[10px] text-gray-400 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    +12 Confluence boost when strategies agree
                  </span>
                  <span className="text-gray-500 font-mono">Live Sync</span>
                </div>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0E1117] border border-[#30363D] focus:border-gray-500 focus:outline-none rounded-lg text-xs placeholder-gray-500 font-mono text-gray-200 pl-9 pr-4 py-2 w-full md:w-44 transition"
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

            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value as any)}
              className="bg-[#0E1117] text-gray-300 border border-[#30363D] focus:border-gray-500 rounded p-1.5 text-[11px] outline-none font-semibold"
            >
              <option value="ALL">All Strategies</option>
              <option value="CONFLUENCE">⚡ Multi-Strategy Confluence</option>
              {!deletedStrats.includes('ORDER_BLOCK') && (
                <option value="ORDER_BLOCK">🧱 Order Block (1:3.5+ R:R)</option>
              )}
              {!deletedStrats.includes('COIL_BREAKOUT') && (
                <option value="COIL_BREAKOUT">🌀 Volatility Compression Breakout (VCB)</option>
              )}
              {!deletedStrats.includes('MULTICOIN_SCALPER_PRO') && (
                <option value="MULTICOIN_SCALPER">🚀 Scalper PRO (Top 100)</option>
              )}
              {!deletedStrats.includes('TREND_PULLBACK') && (
                <option value="TREND_PULLBACK">🎯 Trend Pullback Only</option>
              )}
              {!deletedStrats.includes('LIQUIDITY_SWEEP_REVERSAL') && !deletedStrats.includes('SMC_LIQUIDITY') && (
                <option value="LSR">💧 Liquidity Sweep Reversal (LSR)</option>
              )}
              {!deletedStrats.includes('RANGE_REGIME_V1') && (
                <option value="RANGE_REGIME_V1">📊 Range Regime V1</option>
              )}
            </select>

            {(searchTerm || statusFilter !== 'ALL' || signalFilter !== 'ALL' || strategyFilter !== 'ALL') && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-gray-300 hover:text-indigo-300 underline font-medium cursor-pointer ml-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Scan & Counts controls + Mobile View Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3 justify-between">
          <span className="text-[10px] text-gray-400 font-mono">
            Showing <strong className="text-gray-200">{filteredCoins.length}</strong> of {coins.length} pairs
          </span>

          <div className="flex items-center gap-1.5">
            {/* View Switcher: Auto / Cards / Table */}
            <div className="flex items-center bg-[#0E1117] border border-[#30363D] rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition ${viewMode === 'cards' ? 'bg-[#21262D] text-indigo-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                title="Cards view"
                aria-label="Cards view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition ${viewMode === 'table' ? 'bg-[#21262D] text-indigo-400 font-bold' : 'text-gray-500 hover:text-gray-300'}`}
                title="Table view"
                aria-label="Table view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onManualScan}
              disabled={isLoading}
              className="flex items-center space-x-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-300 border border-indigo-500/30 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isLoading ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Cards View (Shown on mobile by default or when cards mode is active) */}
      <div className={`${viewMode === 'table' ? 'hidden' : viewMode === 'cards' ? 'block' : 'block md:hidden'} p-3 space-y-2.5`}>
        {filteredCoins.length === 0 ? (
          <div className="py-12 text-center text-gray-500 font-sans text-xs">
            No pairs found matching filter criteria.
          </div>
        ) : (
          filteredCoins.map((coin) => {
            const isSelected = selectedSymbol === coin.symbol;
            const scoreValue = Math.abs(coin.score);
            let qualifiesAutoTrade = scoreValue >= autoTradeThreshold && coin.status !== 'RANGE' && coin.status !== 'RANGING' && coin.status !== 'UNSAFE';
            if (coin.crSignal && coin.crSignal.status === 'confirmed') {
              qualifiesAutoTrade = true;
            }
            const allPassed = coin.gates ? Object.values(coin.gates).every(v => v === true) : true;

            return (
              <div
                key={`card-${coin.symbol}`}
                onClick={() => onSelectCoin(coin.symbol)}
                className={`bg-[#0E1117] border rounded-xl p-3.5 transition-all cursor-pointer ${
                  isSelected ? 'border-indigo-500 shadow-md bg-indigo-950/10' :
                  qualifiesAutoTrade ? (coin.direction === 'LONG' ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-rose-500/50 bg-rose-950/10') :
                  'border-[#30363D] hover:border-gray-600'
                }`}
              >
                {/* Header: Symbol, Qualify badge, Price, 24h change */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    {qualifiesAutoTrade && (
                      <Zap className={`w-3.5 h-3.5 fill-current shrink-0 animate-pulse ${coin.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`} />
                    )}
                    <span className="font-bold text-gray-100 text-sm font-mono">{coin.symbol}</span>
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full font-bold font-mono ${getScoreColor(coin.score)}`}>
                      {coin.score > 0 ? '+' : ''}{coin.score}
                    </span>
                    {getStrategyBadge(coin)}
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-mono text-gray-200 text-xs">${formatPrice(coin.price)}</div>
                    <div className={`text-[11px] font-mono font-semibold ${(coin.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(coin.change24h || 0) >= 0 ? '+' : ''}{(coin.change24h || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Sub row: Direction, Status, Decision */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-800/60 text-[10px]">
                  {coin.crSignal && coin.crSignal.status === 'confirmed' ? (
                    <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${coin.crSignal.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {coin.crSignal.direction}
                    </span>
                  ) : getSignalBadge(coin.direction)}

                  {getStatusBadge(coin.status)}

                  <span className="ml-auto text-right">
                    {allPassed ? (
                      <span className="text-emerald-400 font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> ARMED
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold inline-flex items-center gap-1 max-w-[120px] truncate">
                        <XCircle className="w-3 h-3 shrink-0" /> {coin.statusReason || 'BLOCKED'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Table (Hidden on mobile when cards mode is active) */}
      <div className={`overflow-x-auto ${viewMode === 'cards' ? 'hidden' : viewMode === 'table' ? 'block' : 'hidden md:block'}`}>
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
              <th className="py-3 px-4 font-bold text-right">Risk (SL)</th>
              <th className="py-3 px-4 font-bold text-left">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filteredCoins.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-500 font-sans">
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
                    <td className="py-2.5 px-4 font-bold text-gray-100 flex items-center space-x-1.5 flex-wrap">
                      {qualifiesAutoTrade && (
                        <Zap className={`w-3.5 h-3.5 fill-current shrink-0 animate-pulse ${coin.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`} />
                      )}
                      <span className={isSelected ? 'text-gray-300 font-black' : ''}>{coin.symbol}</span>
                      {getStrategyBadge(coin)}
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

                    {/* 7. Risk / SL */}
                    <td className="py-2.5 px-4 text-right font-medium">
                      <span className="text-gray-400">
                        {coin.sl ? `$${coin.sl.toFixed(2)}` : 'N/A'}
                      </span>
                    </td>

                    {/* 8. Decision / Status */}
                    <td className="py-2.5 px-4 text-left max-w-xs truncate" title={coin.statusReason || 'Pending gate check'}>
                      {allPassed ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>ARMED</span>
                        </span>
                      ) : (
                         <span className="inline-flex items-center space-x-1 text-rose-400 font-bold text-[10px] uppercase tracking-wider truncate">
                           <XCircle className="w-3 h-3 shrink-0" />
                           <span className="truncate">{coin.statusReason || 'BLOCKED'}</span>
                         </span>
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
