/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ArrowRight,
  Info,
  RotateCcw,
  Sparkles,
  Search,
  Filter,
  Check,
  Flame,
} from 'lucide-react';
import { AppSettings, CoinDetail, Position } from '../types';
import {
  GATES_REGISTRY,
  GateDefinition,
  GateImportance,
  isGateBypassed,
  evaluateDetailedCoinGates,
} from '../utils/gatesRegistry';
import { formatPrice } from '../utils/format';

interface GateManagerProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  coins: CoinDetail[];
  positions: Position[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
}

export default function GateManager({
  settings,
  setSettings,
  coins,
  positions,
  selectedSymbol,
  onSelectCoin,
}: GateManagerProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<'BINANCE_COMPOSITE' | 'DELTA_CLIMAX' | 'RISK_ENGINE'>(
    settings.activeStrategy || 'BINANCE_COMPOSITE'
  );
  const [activeCoinSymbol, setActiveCoinSymbol] = useState<string>(selectedSymbol || coins[0]?.symbol || 'BTCUSDT');
  const [importanceFilter, setImportanceFilter] = useState<'ALL' | GateImportance>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);

  // Sync activeCoinSymbol if selectedSymbol changes externally
  React.useEffect(() => {
    if (selectedSymbol) {
      setActiveCoinSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  const activeCoin = useMemo(() => {
    return coins.find((c) => c.symbol === activeCoinSymbol) || coins[0] || ({} as CoinDetail);
  }, [coins, activeCoinSymbol]);

  // Evaluate gates for currently selected coin
  const coinGateEvaluation = useMemo(() => {
    if (!activeCoin || !activeCoin.symbol) return null;
    return evaluateDetailedCoinGates(activeCoin, settings, positions.length, 0);
  }, [activeCoin, settings, positions.length]);

  // Toggle a gate bypass
  const handleToggleGate = (gateId: string) => {
    const currentDisabled = { ...(settings.disabledGates || {}) };
    if (currentDisabled[gateId]) {
      delete currentDisabled[gateId]; // Re-enable gate (remove bypass)
    } else {
      currentDisabled[gateId] = true; // Bypass/disable gate
    }
    setSettings({
      ...settings,
      disabledGates: currentDisabled,
    });
  };

  // Batch Preset Handlers (Trade Frequency Modes)
  const handleApplyPreset = (preset: 'STRICT' | 'BALANCED' | 'AGGRESSIVE' | 'RESET') => {
    const updatedDisabled: Record<string, boolean> = {};
    let freqMode: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let threshold = 60;

    if (preset === 'STRICT') {
      freqMode = 'LOW';
      threshold = 75;
      // All gates enabled (no bypasses)
    } else if (preset === 'BALANCED' || preset === 'RESET') {
      freqMode = 'MEDIUM';
      threshold = 60;
      // Bypass lower-importance confirmation filters to allow healthy trade frequency
      updatedDisabled['COMPOSITE_g6'] = true; // RSI
      updatedDisabled['COMPOSITE_g7'] = true; // Structure bounce
      updatedDisabled['CR_stopDistance'] = true;
    } else if (preset === 'AGGRESSIVE') {
      freqMode = 'HIGH';
      threshold = 50;
      // Bypass confirmation and volume expansion for high-speed scalping
      updatedDisabled['COMPOSITE_g6'] = true;
      updatedDisabled['COMPOSITE_g7'] = true;
      updatedDisabled['COMPOSITE_g8'] = true; // Volume surge
      updatedDisabled['CR_volatility'] = true;
      updatedDisabled['CR_stopDistance'] = true;
    }

    setSettings({
      ...settings,
      tradeFrequency: freqMode,
      autoTradeThreshold: threshold,
      disabledGates: updatedDisabled,
    });
  };

  // Get list of gates filtered by strategy and user search
  const filteredGates = useMemo(() => {
    return GATES_REGISTRY.filter((gate) => {
      const matchStrategy = gate.strategy === selectedStrategy || gate.strategy === 'RISK_ENGINE';
      const matchImportance = importanceFilter === 'ALL' || gate.importance === importanceFilter;
      const matchSearch =
        gate.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        gate.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
        gate.category.toLowerCase().includes(searchFilter.toLowerCase());
      return matchStrategy && matchImportance && matchSearch;
    });
  }, [selectedStrategy, importanceFilter, searchFilter]);

  // Aggregate stats across all scanned coins
  const aggregateStats = useMemo(() => {
    let readyCount = 0;
    const gateBlockCounts: Record<string, number> = {};

    coins.forEach((c) => {
      const evalRes = evaluateDetailedCoinGates(c, settings, positions.length, 0);
      if (evalRes.isTradeReady) {
        readyCount++;
      }
      evalRes.evaluatedGates.forEach((eg) => {
        if (eg.blockingTrade) {
          gateBlockCounts[eg.def.id] = (gateBlockCounts[eg.def.id] || 0) + 1;
        }
      });
    });

    const totalBypassed = Object.keys(settings.disabledGates || {}).length;

    return {
      totalCoins: coins.length,
      readyCount,
      totalBypassed,
      gateBlockCounts,
    };
  }, [coins, settings, positions.length]);

  const getImportanceBadge = (importance: GateImportance, score: number) => {
    switch (importance) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Flame className="w-3 h-3 text-rose-400" /> CRITICAL ({score}%)
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> HIGH ({score}%)
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider">
            <Info className="w-3 h-3 text-cyan-400" /> MEDIUM ({score}%)
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-700/50 text-gray-300 border border-gray-600 text-[10px] font-semibold uppercase tracking-wider">
            OPTIONAL ({score}%)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-mono text-xs">
      {/* Top Banner / Strategy Header */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                Trade Execution Gate Matrix & Bypass Controller
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Inspect which algorithmic gates are blocking trade entries, assess risk importance ratings, and toggle gate bypasses strategy-wise.
              </p>
            </div>
          </div>
        </div>

        {/* Strategy Switcher Pills */}
        <div className="flex items-center gap-2 bg-[#0E1117] p-1.5 rounded-lg border border-[#30363D] self-start lg:self-center flex-wrap">
          <button
            onClick={() => {
              setSelectedStrategy('BINANCE_COMPOSITE');
              setSettings({ ...settings, activeStrategy: 'BINANCE_COMPOSITE' });
            }}
            className={`px-3 py-1.5 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
              selectedStrategy === 'BINANCE_COMPOSITE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Composite (10 Gates)</span>
          </button>
          <button
            onClick={() => {
              setSelectedStrategy('DELTA_CLIMAX');
              setSettings({ ...settings, activeStrategy: 'DELTA_CLIMAX' });
            }}
            className={`px-3 py-1.5 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
              selectedStrategy === 'DELTA_CLIMAX'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Climax Reversal (7 Gates)</span>
          </button>
          <button
            onClick={() => {
              setSelectedStrategy('VOLATILITY_COMPRESSION');
              setSettings({ ...settings, activeStrategy: 'VOLATILITY_COMPRESSION' });
            }}
            className={`px-3 py-1.5 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
              selectedStrategy === 'VOLATILITY_COMPRESSION'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Volatility Compression (4 Gates)</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 flex items-center justify-between">
            <span>Execution Ready Pairs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {aggregateStats.readyCount}{' '}
            <span className="text-xs font-normal text-gray-500">/ {aggregateStats.totalCoins} pairs</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {aggregateStats.readyCount > 0 ? 'Signals passing all active gates' : 'No pairs currently meeting all active gates'}
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 flex items-center justify-between">
            <span>Bypassed / Disabled Gates</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-400">
            {aggregateStats.totalBypassed}{' '}
            <span className="text-xs font-normal text-gray-500">gates overridden</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {aggregateStats.totalBypassed > 0 ? 'Bypassed gates are not blocking trades' : 'All standard gates strictly enforced'}
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 flex items-center justify-between">
            <span>Top Trade Blocker</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-sm font-bold text-rose-400 truncate">
            {(() => {
              const entries = Object.entries(aggregateStats.gateBlockCounts);
              if (entries.length === 0) return 'None (All Passing)';
              entries.sort((a, b) => (b[1] as number) - (a[1] as number));
              const topId = entries[0][0];
              const gateDef = GATES_REGISTRY.find((g) => g.id === topId);
              return `${gateDef?.key.toUpperCase() || topId} (${entries[0][1]} pairs)`;
            })()}
          </div>
          <div className="text-[10px] text-gray-400 mt-1 truncate">
            Most frequent condition preventing execution
          </div>
        </div>

        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 flex items-center justify-between">
            <span>Preset Profiles</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <button
              onClick={() => handleApplyPreset('STRICT')}
              className="px-2 py-1 bg-[#21262D] hover:bg-gray-700 text-gray-200 rounded text-[10px] font-semibold border border-gray-600 transition"
              title="Enforce all standard strategy gates"
            >
              Strict
            </button>
            <button
              onClick={() => handleApplyPreset('BALANCED')}
              className="px-2 py-1 bg-cyan-950/40 hover:bg-cyan-900/40 text-cyan-300 rounded text-[10px] font-semibold border border-cyan-800/60 transition"
              title="Bypass secondary confirmation filters"
            >
              Balanced
            </button>
            <button
              onClick={() => handleApplyPreset('AGGRESSIVE')}
              className="px-2 py-1 bg-purple-950/40 hover:bg-purple-900/40 text-purple-300 rounded text-[10px] font-semibold border border-purple-800/60 transition"
              title="Bypass volume surge and confirmation gates for early entry"
            >
              Aggressive
            </button>
            <button
              onClick={() => handleApplyPreset('RESET')}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded text-[10px] transition flex items-center gap-1"
              title="Reset all bypasses to defaults"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Primary Section: Active Coin Diagnostic Inspector */}
      {activeCoin && activeCoin.symbol && coinGateEvaluation && (
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-lg">
          {/* Pair Selector Strip */}
          <div className="p-4 bg-[#0E1117] border-b border-[#30363D] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-blue-400" /> Target Coin:
              </span>
              <select
                value={activeCoinSymbol}
                onChange={(e) => {
                  setActiveCoinSymbol(e.target.value);
                  onSelectCoin(e.target.value);
                }}
                className="bg-[#161B22] text-gray-100 font-bold border border-[#30363D] focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
              >
                {coins.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.symbol} — ${formatPrice(c.price)} ({c.direction} | Score: {c.score})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-300 font-bold">${formatPrice(activeCoin.price)}</span>
                <span className={`font-semibold ${(activeCoin.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(activeCoin.change24h || 0) >= 0 ? '+' : ''}
                  {(activeCoin.change24h || 0).toFixed(2)}%
                </span>
                <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] border border-gray-700 font-bold">
                  {activeCoin.status}
                </span>
              </div>
            </div>

            {/* Quick Summary Pill for Selected Coin */}
            <div>
              {coinGateEvaluation.isTradeReady ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> READY FOR AUTO-TRADE EXECUTION
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full font-bold text-xs">
                  <XCircle className="w-4 h-4 text-rose-400" /> BLOCKED BY {coinGateEvaluation.blockingGateCount} GATE{coinGateEvaluation.blockingGateCount > 1 ? 'S' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Diagnostic Reason Highlight Card */}
          <div className="p-5 border-b border-[#30363D] bg-gradient-to-r from-[#161B22] to-[#1c222b]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-blue-400" /> Live Gate Diagnostic Verdict for {activeCoin.symbol}
                </div>
                <div className="text-sm font-bold text-gray-100 flex items-center gap-2 flex-wrap">
                  {coinGateEvaluation.isTradeReady ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> All strategy gates passed or safely bypassed. Bot will execute when signal confirms.
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{coinGateEvaluation.primaryBlockReason}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Bypass Action Button for Primary Blocker */}
              {!coinGateEvaluation.isTradeReady && coinGateEvaluation.evaluatedGates.find((g) => g.blockingTrade) && (
                <button
                  onClick={() => {
                    const firstBlocker = coinGateEvaluation.evaluatedGates.find((g) => g.blockingTrade);
                    if (firstBlocker) {
                      handleToggleGate(firstBlocker.def.id);
                    }
                  }}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs transition shadow-md flex items-center gap-2 self-start md:self-center shrink-0 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    Bypass {coinGateEvaluation.evaluatedGates.find((g) => g.blockingTrade)?.def.key.toUpperCase()}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Detailed Gate Breakdown Table for Current Coin */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#30363D] text-gray-400 uppercase text-[10px] tracking-wider bg-[#0E1117]">
                  <th className="py-3 px-4 font-bold">Gate / Condition</th>
                  <th className="py-3 px-4 font-bold text-center">Importance</th>
                  <th className="py-3 px-4 font-bold text-center">Type</th>
                  <th className="py-3 px-4 font-bold text-center">Status</th>
                  <th className="py-3 px-4 font-bold">Measured Live Value</th>
                  <th className="py-3 px-4 font-bold">Required Threshold</th>
                  <th className="py-3 px-4 font-bold text-center">Bypass Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D]/60 text-[11px]">
                {coinGateEvaluation.evaluatedGates.map((eg) => {
                  const isBypassed = eg.bypassed;
                  const isBlocking = eg.blockingTrade;
                  const isPassed = eg.passed;

                  let rowBg = 'hover:bg-[#1c222b]/50';
                  if (isBlocking) {
                    rowBg = 'bg-rose-950/20 hover:bg-rose-950/30 border-l-2 border-rose-500';
                  } else if (isBypassed) {
                    rowBg = 'bg-purple-950/20 hover:bg-purple-950/30 border-l-2 border-purple-500';
                  }

                  return (
                    <tr key={eg.def.id} className={`transition ${rowBg}`}>
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-100 flex items-center gap-1.5">
                          {isBlocking ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : isBypassed ? (
                            <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span>{eg.def.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{eg.def.description}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {getImportanceBadge(eg.def.importance, eg.def.importanceScore)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          eg.def.isMandatory ? 'bg-gray-800 text-gray-300 border border-gray-700' : 'bg-blue-900/30 text-blue-300 border border-blue-800/40'
                        }`}>
                          {eg.def.isMandatory ? 'Mandatory' : 'Confirmation'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isBypassed ? (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                            BYPASSED
                          </span>
                        ) : isPassed ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                            PASSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold">
                            BLOCKED
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-gray-200">
                        <span className={isBlocking ? 'text-rose-400 font-bold' : ''}>{eg.measuredValue}</span>
                      </td>

                      <td className="py-3 px-4 font-mono text-gray-400">
                        {eg.requiredThreshold}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleGate(eg.def.id)}
                          className={`px-3 py-1 rounded-md text-[10px] font-bold transition cursor-pointer border ${
                            isBypassed
                              ? 'bg-purple-600/30 text-purple-300 border-purple-500 hover:bg-purple-600/40'
                              : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-gray-700'
                          }`}
                        >
                          {isBypassed ? 'Bypassed (Click to Enable)' : 'Enforced (Click to Bypass)'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Secondary Section: Strategy Gate Definitions, Risk Analysis & Global Toggles */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#30363D] pb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Strategy Gate Architecture & Risk Importance Registry
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Review what each gate does, the catastrophic failure risks if bypassed, and customize gate enforcement per strategy.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter gates..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="bg-[#0E1117] border border-[#30363D] focus:border-blue-500 rounded px-2.5 pl-8 py-1.5 text-xs text-gray-200 outline-none w-36 sm:w-44"
              />
            </div>

            <select
              value={importanceFilter}
              onChange={(e) => setImportanceFilter(e.target.value as any)}
              className="bg-[#0E1117] border border-[#30363D] focus:border-blue-500 rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
            >
              <option value="ALL">All Importance</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>
          </div>
        </div>

        {/* Gates List */}
        <div className="space-y-3">
          {filteredGates.map((gate) => {
            const isBypassed = isGateBypassed(gate.id, settings);
            const blockedCoinsCount = aggregateStats.gateBlockCounts[gate.id] || 0;
            const isExpanded = expandedGateId === gate.id;

            return (
              <div
                key={gate.id}
                className={`border rounded-xl p-4 transition ${
                  isBypassed
                    ? 'bg-purple-950/10 border-purple-800/40'
                    : 'bg-[#0E1117] border-[#30363D] hover:border-gray-600'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-100 text-xs">{gate.name}</span>
                      {getImportanceBadge(gate.importance, gate.importanceScore)}
                      <span className="text-[10px] text-gray-500 font-mono">[{gate.strategy}]</span>
                      {blockedCoinsCount > 0 && !isBypassed && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                          Blocking {blockedCoinsCount} pairs now
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{gate.description}</p>
                  </div>

                  {/* Right Actions & Toggle */}
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setExpandedGateId(isExpanded ? null : gate.id)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                    >
                      {isExpanded ? 'Hide Details' : 'View Risk & Logic'}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-400">
                        {isBypassed ? 'BYPASS ON' : 'ENFORCING'}
                      </span>
                      <button
                        onClick={() => handleToggleGate(gate.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                          isBypassed ? 'bg-purple-600' : 'bg-emerald-600'
                        }`}
                        title={isBypassed ? 'Click to re-enable gate' : 'Click to bypass gate'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isBypassed ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details / Hazard Assessment */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[#30363D] grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                    <div className="bg-[#161B22] p-3 rounded-lg border border-[#30363D] space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Exact Mathematical Condition
                      </span>
                      <p className="text-gray-300 font-mono text-[10px]">{gate.formulaOrCondition}</p>
                    </div>

                    <div className="bg-rose-950/20 p-3 rounded-lg border border-rose-900/40 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Risk Hazard if Bypassed
                      </span>
                      <p className="text-rose-300/90 text-[10px]">{gate.riskIfBypassed}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
