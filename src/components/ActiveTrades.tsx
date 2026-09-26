/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Position, AppSettings } from '../types';
import { TrendingUp, TrendingDown, Target, Shield, Clock, X, Anchor, Zap, Activity, Flame, Award, Sparkles, Cpu, Compass, AlertTriangle } from 'lucide-react';
import { formatPrice, formatISTDateTime } from '../utils/format';

interface ActiveTradesProps {
  positions: Position[];
  onManualClose: (id: string) => void;
  settings?: AppSettings;
  globalFilterState?: { isPausing: boolean; reason: string | null };
}

export default function ActiveTrades({ positions, onManualClose, settings, globalFilterState }: ActiveTradesProps) {
  const [now, setNow] = useState(Date.now());
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'pnl_desc' | 'pnl_asc'>('newest');
  
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  
  const getQualityBadge = (quality?: string) => {
    if (quality === 'High') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">HQ: 80+</span>;
    if (quality === 'Medium') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MQ: 60-79</span>;
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">LQ: &lt;60</span>;
  };

  const getMacroBadge = (color?: string) => {
    if (color === 'GREEN') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">MACRO: GREEN</span>;
    if (color === 'RED') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">MACRO: RED</span>;
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MACRO: AMBER</span>;
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null;
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
        {priority}
      </span>
    );
  };

  const getRRBadge = (rrStruct?: string, num?: number) => {
    const text = rrStruct ? `R:R ${rrStruct}` : (num ? `R:R 1:${num}` : 'R:R ≥3.5');
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
        {text}
      </span>
    );
  };

  const getStrategyBadge = (strat?: string) => {
    const s = (strat || 'BINANCE_COMPOSITE').toUpperCase();
    if (s.includes('EMA5_PA') || s === 'EMA5_PA_VOLUME_V1') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Zap className="w-3 h-3 text-emerald-400" /> EMA 5 PA Vol
        </span>
      );
    }
    if (s.includes('EMA_GAP') || s === 'EMA_GAP_PULLBACK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-950/50 text-teal-300 border border-teal-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Zap className="w-3 h-3 text-teal-400" /> 5 EMA Gap
        </span>
      );
    }
    if (s.includes('CLIMAX') || s === 'DELTA_CLIMAX') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/50 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Zap className="w-3 h-3 text-cyan-400" /> Climax Reversal (Legacy)
        </span>
      );
    }
    if (s.includes('VOLATILITY') || s.includes('VCB') || s === 'VOLATILITY_COMPRESSION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/50 text-amber-300 border border-amber-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Flame className="w-3 h-3 text-amber-400" /> VCB Breakout
        </span>
      );
    }
    if (s === 'TREND_PULLBACK_RETEST') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/50 text-sky-300 border border-sky-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Target className="w-3 h-3 text-sky-400" /> Pullback Retest
        </span>
      );
    }
    if (s.includes('PULLBACK') || s === 'TREND_PULLBACK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/50 text-blue-300 border border-blue-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Target className="w-3 h-3 text-blue-400" /> Trend Pullback
        </span>
      );
    }
    if (s.includes('SMC') || s.includes('LIQUIDITY')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Sparkles className="w-3 h-3 text-purple-400" /> SMC Liquidity Sweep
        </span>
      );
    }
    if (s.includes('COMPOSITE') || s === 'BINANCE_COMPOSITE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Activity className="w-3 h-3 text-emerald-400" /> 10-Gate Scanner
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700 text-[10px] font-bold tracking-wide uppercase">
        <Activity className="w-3 h-3 text-gray-400" /> {strat?.replace(/_/g, ' ')}
      </span>
    );
  };

  const getFrequencyBadge = (freq?: string) => {
    const mode = freq || 'LOW';
    if (mode === 'HIGH') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-950/40 text-rose-300 border border-rose-800/50 text-[10px] font-bold">
          <Sparkles className="w-2.5 h-2.5 text-rose-400" /> High Freq
        </span>
      );
    }
    if (mode === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-950/50 text-teal-300 border border-teal-700/60 text-[10px] font-bold">
          <Target className="w-2.5 h-2.5 text-teal-400" /> Medium Freq
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-950/50 text-indigo-300 border border-indigo-700/60 text-[10px] font-bold">
        <Shield className="w-2.5 h-2.5 text-indigo-400" /> 🎯 1:3 Sniper (Confirmed)
      </span>
    );
  };

  const activeStrategiesList = (settings?.enabledStrategies && settings.enabledStrategies.length > 0)
    ? settings.enabledStrategies
    : [settings?.activeStrategy || 'VOLATILITY_COMPRESSION'];

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <h2 className="text-lg font-bold text-gray-100 tracking-tight">Active Futures Positions</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeStrategiesList.length > 1 ? (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg">
              <span className="text-gray-400">Active Strategies ({activeStrategiesList.length}):</span>
              <span className="text-[#00e696]">
                {activeStrategiesList.map(s => {
                  if (s === 'EMA5_PA_VOLUME_V1') return 'EMA 5 PA Vol';
                  if (s === 'EMA_GAP_PULLBACK') return '5 EMA Gap';
                  if ((s as string) === 'DELTA_CLIMAX') return 'Delta Climax (Legacy)';
                  if (s === 'VOLATILITY_COMPRESSION') return 'VCB';
                  if (s === 'TREND_PULLBACK') return 'Trend Pullback';
                  if (s === 'TREND_PULLBACK_RETEST') return 'Pullback Retest';
                  if (s === 'SMC_LIQUIDITY_SWEEP') return 'SMC';
                  if (s === 'BINANCE_COMPOSITE') return 'Ranging 1:3';
                  if (s === 'EARLY_COIL_BREAKOUT') return 'Early Coil';
                  if (s === 'MACRO_RANGE_BREAKOUT') return 'Macro Box';
                  return s;
                }).join(', ')}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg">
              <span className="text-gray-400">Bot Strategy:</span>
              <span className="text-[#00e696]">
                {activeStrategiesList[0] === 'EMA5_PA_VOLUME_V1' ? '⚡ EMA 5 PA + Volume'
                  : activeStrategiesList[0] === 'EMA_GAP_PULLBACK' ? '⚡ 5 EMA Gap Pullback'
                  : (activeStrategiesList[0] as string) === 'DELTA_CLIMAX' ? '⚡ Delta Climax (Legacy)'
                  : activeStrategiesList[0] === 'VOLATILITY_COMPRESSION' ? '💥 VCB Breakout'
                  : activeStrategiesList[0] === 'EARLY_COIL_BREAKOUT' ? '🔥 Early Coil Breakout'
                  : activeStrategiesList[0] === 'TREND_PULLBACK' ? '🎯 Trend Pullback'
                  : activeStrategiesList[0] === 'TREND_PULLBACK_RETEST' ? '🎯 Pullback Retest'
                  : activeStrategiesList[0] === 'MACRO_RANGE_BREAKOUT' ? '📦 Macro Range Breakout'
                  : activeStrategiesList[0] === 'SMC_LIQUIDITY_SWEEP' ? '💧 Liquidity Sweep Reversal'
                  : '📊 Composite 10-Gate'}
              </span>
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 bg-indigo-950/40 text-indigo-300 border border-indigo-800/40 rounded">
            🎯 Target 1:3 R:R
          </span>
          <span className="text-xs font-mono bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full">
            {positions.length} Open Trades
          </span>
          {positions.length > 0 && (
            <select
              className="bg-[#121418] border border-gray-700 text-gray-300 text-[10.5px] px-2 py-1 rounded-lg focus:outline-none focus:border-gray-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="pnl_desc">PnL (High → Low)</option>
              <option value="pnl_asc">PnL (Low → High)</option>
            </select>
          )}
        </div>
      </div>

      {/* Global Market & BTC Safety Filter Warning Banner */}
      {settings?.useGlobalBtcFilter !== false && globalFilterState?.isPausing && (
        <div className="mb-4 rounded-xl p-4 border bg-amber-950/40 border-amber-500/50 shadow-xl flex items-start gap-3.5">
          <div className="p-2 rounded-lg shrink-0 bg-amber-500/20 text-amber-400 border border-amber-500/30 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-amber-300">
                Global Market & BTC Safety Filter Active
              </h3>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold tracking-wider uppercase">
                Macro Risk Management Active
              </span>
            </div>
            <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
              Macro risk management to pause trading during extreme market distress. This pauses new trade entries across all coins.
            </p>
            {globalFilterState.reason && (
              <p className="text-[11px] font-mono text-amber-300/80 mt-1.5 bg-black/30 px-2.5 py-1 rounded border border-amber-500/20">
                {globalFilterState.reason}
              </p>
            )}
            <p className="text-[10.5px] text-gray-400 mt-1">
              Existing open positions remain actively monitored by the risk engine with trailing stops and take-profits.
            </p>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed border-gray-800 rounded-lg text-gray-500">
          <Clock className="w-8 h-8 mb-2 stroke-gray-600" />
          <p className="text-sm font-medium">No open positions at the moment</p>
          <span className="text-xs text-gray-500 mt-1 max-w-sm text-center leading-relaxed">
            Scanning {settings?.coinCount || 100} Binance Futures pairs across <strong className="text-gray-400">{activeStrategiesList.length > 1 ? `${activeStrategiesList.length} Active Strategies` : (activeStrategiesList[0] === 'EMA5_PA_VOLUME_V1' ? 'EMA 5 PA + Volume' : activeStrategiesList[0] === 'EMA_GAP_PULLBACK' ? '5 EMA Gap Pullback' : (activeStrategiesList[0] as string) === 'DELTA_CLIMAX' ? 'Delta Climax (Legacy)' : activeStrategiesList[0] === 'VOLATILITY_COMPRESSION' ? 'VCB Breakout' : activeStrategiesList[0] === 'TREND_PULLBACK' ? 'Trend Pullback' : activeStrategiesList[0] === 'TREND_PULLBACK_RETEST' ? 'Pullback Retest' : activeStrategiesList[0] === 'SMC_LIQUIDITY_SWEEP' ? 'SMC Liquidity' : activeStrategiesList[0] || 'Autonomous')}</strong> fully-confirmed signals with tight invalidation Stop Loss and <strong className="text-indigo-400">1:3 Asymmetric Target</strong>.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...positions].sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.timeOpen).getTime() - new Date(a.timeOpen).getTime();
            if (sortBy === 'oldest') return new Date(a.timeOpen).getTime() - new Date(b.timeOpen).getTime();
            if (sortBy === 'pnl_desc') return (b.unrealizedPnl || 0) - (a.unrealizedPnl || 0);
            if (sortBy === 'pnl_asc') return (a.unrealizedPnl || 0) - (b.unrealizedPnl || 0);
            return 0;
          }).map((pos) => {
            const isLong = pos.direction === 'LONG';
            const unrealizedPnlVal = pos.unrealizedPnl;
            const pnlColorClass = unrealizedPnlVal >= 0 ? 'text-emerald-400' : 'text-rose-400';
            const pnlBgClass = unrealizedPnlVal >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10';
            const sizeRemaining = pos.sizeRemainingPct;

            return (
              <div
                key={pos.id}
                id={`pos-${pos.symbol}`}
                className="bg-[#121418] border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-5 transition-colors flex flex-col justify-between"
              >
                

                <div>
                  {/* Strategy, Regime & Frequency Badge Row */}
                  <div className="flex items-center justify-between pl-1.5 mb-2 gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getStrategyBadge(pos.strategy)}
                      {pos.isAutoRegime ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-700/60 text-[10px] font-bold">
                          <Cpu className="w-2.5 h-2.5 text-purple-400" /> Auto-Regime
                        </span>
                      ) : null}
                      {getFrequencyBadge(pos.frequencyPreset)}
                    </div>
                    {pos.scoreAtEntry ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/40 text-[9.5px] font-bold">
                        <Award className="w-2.5 h-2.5 text-purple-400" /> Score: {pos.scoreAtEntry}
                      </span>
                    ) : null}
                  </div>

                  
                  {/* Market Regime Indicator */}
                  {pos.marketRegime ? (
                    <div className="pl-1.5 mb-2 flex items-center gap-1.5 flex-wrap">
                      {getMacroBadge(pos.macroColor)}
                      {getPriorityBadge(pos.strategyPriority)}
                      {getRRBadge(pos.rrStruct, pos.structuralRR)}
                      {getQualityBadge(pos.tradeQuality)}
                      <span className="text-[9.5px] font-semibold text-gray-400 flex items-center gap-1">
                        <Compass className="w-2.5 h-2.5 text-cyan-400" />
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/30 border border-cyan-800/50 text-cyan-200 text-[9.5px] font-mono font-medium">
                          {pos.marketRegime} ({pos.regimeConfidence ?? 0}%)
                        </span>
                      </span>
                    </div>
                  ) : null}


                  {/* Protection Banner */}
                  <div className={`pl-1.5 mb-2`}>
                    <div className={`flex items-center justify-between px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border ${
                      pos.stopStatus === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      pos.stopStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      pos.stopStatus === 'MISSING' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse' :
                      'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                      <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> STOP: {pos.stopStatus || 'UNKNOWN'}</span>
                      {pos.stopStatus === 'MISSING' && <span className="bg-rose-500 text-white px-1 py-0.5 rounded-sm leading-none">UNPROTECTED</span>}
                    </div>
                  </div>

                  {/* Header Row */}
                  <div className="flex items-center justify-between pl-1.5 mb-2.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-100 font-mono tracking-tight text-md">
                        {pos.symbol}
                      </span>
                      <span className="text-[10px] bg-gray-800 text-gray-400 font-mono px-1.5 py-0.5 rounded font-semibold">
                        {pos.leverage}x
                      </span>
                      <span
                        className={`flex items-center space-x-0.5 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isLong
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isLong ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        <span>{isLong ? 'LONG' : 'SHORT'}</span>
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (window.confirm(`URGENT: Are you sure you want to Market Close ${pos.symbol} entirely? This will execute immediately on the exchange.`)) {
                          onManualClose(pos.id);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 rounded transition-all"
                      title="Emergency Market Close"
                    >
                      <X className="w-3 h-3" /> CLOSE
                    </button>
                  </div>

                  {/* Pricing and PNL */}
                  <div className="grid grid-cols-2 gap-2 mb-3.5 pl-1.5">
                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800/45">
                      <span className="text-[10px] text-gray-500 uppercase block font-medium">
                        Entry Price
                      </span>
                      <span className="text-sm font-semibold text-gray-300 font-mono">
                        ${formatPrice(pos.entryPrice)}
                      </span>
                    </div>

                    <div className="bg-gray-900/40 p-2 rounded border border-gray-800/45">
                      <span className="text-[10px] text-gray-500 uppercase block font-medium">
                        Mark Price
                      </span>
                      <span className="text-sm font-semibold text-gray-100 font-mono animate-pulse">
                        ${formatPrice(pos.currentPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Live Profit & Loss Panel */}
                  <div className={`p-3 rounded-lg ${pnlBgClass} border border-gray-800/50 mb-3.5 flex items-center justify-between`}>
                    <div>
                      <span className="text-[11px] text-gray-400 font-medium block">
                        Unrealized Profit/Loss
                      </span>
                      <span className={`text-xl font-bold font-mono tracking-tight ${pnlColorClass}`}>
                        {unrealizedPnlVal >= 0 ? '+' : ''}
                        ${(unrealizedPnlVal || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-medium">Return %</span>
                      <span className={`text-sm font-bold font-mono ${pnlColorClass}`}>
                        {pos.entryPrice
                          ? (isLong
                              ? (((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.leverage || 1)).toFixed(2)
                              : (((pos.entryPrice - pos.currentPrice) / pos.entryPrice) * 100 * (pos.leverage || 1)).toFixed(2))
                          : '0.00'}
                        %
                      </span>
                    </div>
                  </div>

                  {/* Details / Metrics */}
                  <div className="space-y-2 font-mono text-[11px] text-gray-400 pl-1 mb-4">
                    <div className="flex justify-between items-center bg-gray-900/10 py-0.5">
                      <span className="text-gray-500">Last Tick</span>
                      <span className={`font-semibold ${pos.lastUpdated ? (now - pos.lastUpdated < 3000 ? 'text-emerald-400' : 'text-amber-400') : 'text-gray-500'}`}>
                        {pos.lastUpdated ? `${Math.floor((now - pos.lastUpdated) / 1000)}s ago` : 'Live'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-gray-900/10 py-0.5">
                      <span className="text-gray-500 flex items-center space-x-1">
                        <Anchor className="w-3 h-3 mr-1" /> Size (USD)
                      </span>
                      <span className="text-gray-300 font-semibold">
                        ${(pos.allocatedBalance || 0).toFixed(2)}
                      </span>
                    </div>

                    
                    <div className="flex justify-between items-center bg-gray-900/10 py-0.5">
                      <span className="text-gray-500 flex items-center space-x-1">
                        <Clock className="w-3 h-3 mr-1" /> Duration / Executed
                      </span>
                      <span className="text-gray-300 font-mono text-[10.5px]">
                        {Math.floor((now - new Date(pos.timeOpen).getTime()) / 60000)}m / {formatISTDateTime(pos.timeOpen)}
                      </span>
                    </div>


                    <div className="flex justify-between items-center bg-gray-900/10 py-0.5">
                      <span className="text-gray-500">Score at Entry</span>
                      <span className="text-gray-300 font-semibold">
                        {pos.scoreAtEntry ? `${pos.scoreAtEntry}` : '-'}
                      </span>
                    </div>

                    {typeof pos.trailingStop === 'number' && !isNaN(pos.trailingStop) && (
                      <div className="flex justify-between items-center bg-amber-500/5 text-amber-400 p-1.5 rounded border border-amber-500/10">
                        <span>Trailing Stop Limit</span>
                        <span className="font-semibold">
                          ${formatPrice(pos.trailingStop)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Targets Slider / Status List */}
                <div className="border-t border-gray-800/80 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">
                      Target Levels (1:3 R:R)
                    </span>
                    <span className="text-[9.5px] font-bold text-indigo-300 bg-indigo-950/40 px-1.5 py-0.2 rounded border border-indigo-800/30">
                      Asymmetric 1:3
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                      <span className="text-gray-500 flex items-center">
                        <Shield className="w-2.5 h-2.5 mr-1 stroke-rose-400" /> SL (1R)
                      </span>
                      <span className="text-rose-300 font-bold">
                        ${formatPrice(pos.sl)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                      <span className="text-gray-500 flex items-center">
                        <Target className="w-2.5 h-2.5 mr-1 stroke-emerald-400" /> TP1 (1R)
                      </span>
                      <span className={`text-emerald-300 ${sizeRemaining <= 60 ? 'line-through text-gray-500 font-normal' : ''}`}>
                        ${formatPrice(pos.tp1)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                      <span className="text-gray-500 flex items-center">
                        <Target className="w-2.5 h-2.5 mr-1 stroke-emerald-400" /> TP2 (2R)
                      </span>
                      <span className={`text-emerald-300 ${sizeRemaining <= 20 ? 'line-through text-gray-500 font-normal' : ''}`}>
                        ${formatPrice(pos.tp2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-indigo-950/30 border border-indigo-800/30 p-1.5 rounded">
                      <span className="text-indigo-300 flex items-center font-bold">
                        <Target className="w-2.5 h-2.5 mr-1 stroke-cyan-400" /> TP3 (3R)
                      </span>
                      <span className="text-cyan-300 font-bold">
                        ${formatPrice(pos.tp3)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
