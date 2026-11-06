/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Position, AppSettings } from '../types';
import { TrendingUp, TrendingDown, Target, Shield, Clock, X, Anchor, Zap, Activity, Flame, Award, Sparkles, Cpu, Compass, Box } from 'lucide-react';
import { formatPrice, formatISTDateTime } from '../utils/format';

interface ActiveTradesProps {
  positions: Position[];
  onManualClose: (id: string) => void;
  settings?: AppSettings;
}

export default function ActiveTrades({ positions, onManualClose, settings }: ActiveTradesProps) {
  const [now, setNow] = useState(Date.now());
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'pnl_desc' | 'pnl_asc'>('newest');
  
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  
  const formatStratName = (id: string) => {
    switch (id) {
      case 'COIL_BREAKOUT':
      case 'VCB':
      case 'VOLATILITY_COMPRESSION':
        return '🌀 Volatility Compression Breakout (VCB)';
      case 'ORDER_BLOCK': return '🧱 Order Block (1:3.5+)';
      case 'RANGE_REGIME_V1':
      case 'RANGE_REGIME':
        return '📊 Range Regime V1';
      case 'MULTICOIN_SCALPER_PRO': return '⚡ Scalper PRO';
      case 'TREND_PULLBACK': return '🎯 Trend Pullback';
      case 'LIQUIDITY_SWEEP_REVERSAL': return '💧 Liquidity Sweep (LSR)';
      case 'SMC_LIQUIDITY': return '💧 SMC Liquidity';
      case 'SMC_LIQUIDITY_SWEEP': return '💧 SMC Sweep';
      case 'DELTA_CLIMAX': return '⚡ Delta Climax';
      case 'VOLATILITY_COMPRESSION': return '💥 VCB Breakout';
      case 'AUTO_REGIME': return '🤖 Auto-Regime';
      default: return id.replace(/_/g, ' ');
    }
  };

  const deletedStrats = settings?.deletedStrategies || [];
  const activeStrategiesList = ((settings?.activeStrategies && settings.activeStrategies.length > 0)
    ? settings.activeStrategies
    : (settings?.activeStrategy && settings.activeStrategy !== 'NONE' ? [settings.activeStrategy] : ['COIL_BREAKOUT', 'MULTICOIN_SCALPER_PRO', 'TREND_PULLBACK', 'LIQUIDITY_SWEEP_REVERSAL', 'ORDER_BLOCK', 'RANGE_REGIME_V1'])).filter(s => !deletedStrats.includes(s));
  const activeStrategiesCount = activeStrategiesList.length;

  const getQualityBadge = (quality?: string) => {
    if (quality === 'High') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">HQ: 80+</span>;
    if (quality === 'Medium') return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MQ: 60-79</span>;
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">LQ: &lt;60</span>;
  };

  const getRegimeStatusBadge = (status?: string) => {
    if (status === 'IN_FAVOR' || !status) {
      return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">REGIME: IN FAVOR</span>;
    }
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">REGIME: WAITING</span>;
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
    if (s.includes('CLIMAX') || s === 'DELTA_CLIMAX') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/50 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Zap className="w-3 h-3 text-cyan-400" /> Climax Reversal
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
    if (s.includes('PULLBACK') || s === 'TREND_PULLBACK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/50 text-blue-300 border border-blue-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Target className="w-3 h-3 text-blue-400" /> Trend Pullback
        </span>
      );
    }
    if (s.includes('ORDER_BLOCK') || s === 'ORDER_BLOCK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Box className="w-3 h-3 text-purple-400" /> Order Block (1:3.5+)
        </span>
      );
    }
    if (s.includes('RANGE_REGIME') || s === 'RANGE_REGIME_V1' || s === 'RANGE_REGIME') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/60 text-cyan-300 border border-cyan-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Compass className="w-3 h-3 text-cyan-400" /> Range Regime V1
        </span>
      );
    }
    if (s.includes('COIL') || s === 'COIL_BREAKOUT' || s === 'VCB' || s.includes('VCB')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Sparkles className="w-3 h-3 text-purple-400" /> VCB Breakout
        </span>
      );
    }
    if (s.includes('SCALPER') || s === 'MULTICOIN_SCALPER_PRO') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-700/60 text-[10px] font-bold tracking-wide uppercase">
          <Zap className="w-3 h-3 text-amber-400" /> Scalper PRO
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

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3 sm:p-5 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <h2 className="text-base sm:text-lg font-bold text-gray-100 tracking-tight">Active Futures Positions</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg">
            <span className="text-gray-400">Bot Strategy:</span>
            {activeStrategiesCount >= 2 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{activeStrategiesCount} Active Portfolio</span>
                <span className="hidden xl:inline text-[9.5px] text-gray-400 font-normal">
                  ({activeStrategiesList.map(formatStratName).join(', ')})
                </span>
              </span>
            ) : activeStrategiesCount === 1 ? (
              <span className="text-[#00e696]">{formatStratName(activeStrategiesList[0])}</span>
            ) : (
              <span className="text-rose-400">None (Stand Aside)</span>
            )}
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 bg-indigo-950/40 text-indigo-300 border border-indigo-800/40 rounded">
            🎯 Target 1:3 - 1:5+ R:R
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
              <option value="pnl_desc">Highest PnL</option>
              <option value="pnl_asc">Lowest PnL</option>
            </select>
          )}
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed border-gray-800 rounded-lg text-gray-500">
          <Clock className="w-8 h-8 mb-2 stroke-gray-600" />
          <p className="text-sm font-medium">No open positions at the moment</p>
          <span className="text-xs text-gray-500 mt-1 max-w-md text-center leading-relaxed">
            Scanning {settings?.coinCount || 100} Binance Futures pairs across <strong className="text-gray-300">{activeStrategiesList.map(formatStratName).join(' • ')}</strong> for high-probability fully-confirmed signals with tight structural Stop Loss and asymmetric profit targets.
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

                  
                  {/* Strategy-Specific Market Regime Indicator */}
                  {pos.marketRegime ? (
                    <div className="pl-1.5 mb-2 flex items-center gap-1.5 flex-wrap">
                      {getRegimeStatusBadge(pos.strategyRegimeStatus)}
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
                      pos.stopStatus === 'CONFIRMED' || (pos.stopStatus === 'UNKNOWN' && pos.sl) || (!pos.stopStatus && pos.sl) ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      pos.stopStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      pos.stopStatus === 'MISSING' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse' :
                      (pos.sl ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-gray-800 text-gray-400 border-gray-700')
                    }`}>
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-emerald-400" /> STOP: {(pos.stopStatus && pos.stopStatus !== 'UNKNOWN') ? pos.stopStatus : (pos.sl ? 'CONFIRMED' : 'MISSING')}
                        {pos.sl ? ` (SL: $${formatPrice(pos.sl)})` : ''}
                      </span>
                      {(!pos.sl && pos.stopStatus === 'MISSING') && <span className="bg-rose-500 text-white px-1 py-0.5 rounded-sm leading-none">UNPROTECTED</span>}
                      {pos.sl && <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 rounded-xs leading-none text-[8.5px]">PROTECTED</span>}
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

                    {/* Trend Pullback Two-Level Structural Separation & Retest Monitoring */}
                    {(pos.strategy === 'TREND_PULLBACK' || pos.triggerLevel || pos.lifecycleState) && (
                      <div className="bg-blue-950/20 border border-blue-800/40 rounded p-2 my-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            Retest Architecture
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                            pos.lifecycleState === 'CONTINUATION_CONFIRMED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : pos.lifecycleState === 'RETESTING'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          }`}>
                            {pos.lifecycleState || 'ENTRY_ACTIVE'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                          <div className="bg-gray-900/40 p-1 rounded flex justify-between">
                            <span className="text-gray-500">Trigger</span>
                            <span className="text-cyan-300 font-bold">
                              ${formatPrice(pos.triggerLevel || pos.entryPrice)}
                            </span>
                          </div>
                          <div className="bg-gray-900/40 p-1 rounded flex justify-between">
                            <span className="text-gray-500">Invalidation</span>
                            <span className="text-rose-400 font-bold">
                              ${formatPrice(pos.invalidationLevel || pos.sl)}
                            </span>
                          </div>
                        </div>

                        {pos.retestStatus && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500">Retest Status</span>
                            <span className={`font-bold px-1.5 py-0.2 rounded text-[9.5px] ${
                              pos.retestStatus === 'HEALTHY_RETEST'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : pos.retestStatus === 'DANGEROUS_RETEST'
                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                                : 'bg-gray-800 text-gray-300'
                            }`}>
                              {pos.retestStatus.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}

                        {(pos.mae !== undefined || pos.mfe !== undefined) && (
                          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5 border-t border-blue-900/40">
                            <span>Excursions</span>
                            <div className="flex items-center gap-2 font-mono text-[9.5px]">
                              {pos.mae !== undefined && (
                                <span className="text-rose-400 font-semibold">
                                  MAE: -${formatPrice(pos.mae)}
                                </span>
                              )}
                              {pos.mfe !== undefined && (
                                <span className="text-emerald-400 font-semibold">
                                  MFE: +${formatPrice(pos.mfe)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Order Block Structural Architecture & Invalidation Monitoring */}
                    {(pos.strategy === 'ORDER_BLOCK' || (pos.strategy && pos.strategy.includes('ORDER_BLOCK'))) && (
                      <div className="bg-purple-950/20 border border-purple-800/40 rounded p-2 my-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                            <Box className="w-3 h-3 text-purple-400" />
                            Order Block Architecture
                          </span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border bg-purple-500/20 text-purple-200 border-purple-500/40">
                            Min 1:3.5+ R:R Target
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                          <div className="bg-gray-900/40 p-1 rounded flex justify-between">
                            <span className="text-gray-500">Invalidation</span>
                            <span className="text-rose-400 font-bold">
                              ${formatPrice(pos.sl)}
                            </span>
                          </div>
                          <div className="bg-gray-900/40 p-1 rounded flex justify-between">
                            <span className="text-gray-500">TP Structural</span>
                            <span className="text-purple-300 font-bold">
                              ${formatPrice(pos.tp3 || pos.tp2 || pos.tp1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

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
                  {(() => {
                    const riskDist = Math.abs(pos.entryPrice - pos.sl);
                    const tp1R = (riskDist > 0 && pos.tp1) ? (Math.abs(pos.tp1 - pos.entryPrice) / riskDist).toFixed(1) : '1.0';
                    const tp2R = (riskDist > 0 && pos.tp2) ? (Math.abs(pos.tp2 - pos.entryPrice) / riskDist).toFixed(1) : '2.0';
                    const tp3R = (riskDist > 0 && pos.tp3) ? (Math.abs(pos.tp3 - pos.entryPrice) / riskDist).toFixed(1) : '3.0';

                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-gray-500 font-semibold uppercase">
                            Target Levels (Max +{tp3R}R)
                          </span>
                          <span className="text-[9.5px] font-bold text-indigo-300 bg-indigo-950/40 px-1.5 py-0.2 rounded border border-indigo-800/30">
                            {pos.structuralRR ? `Structural 1:${pos.structuralRR.toFixed(1)}` : `Asymmetric +${tp3R}R`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                            <span className="text-gray-500 flex items-center">
                              <Shield className="w-2.5 h-2.5 mr-1 stroke-rose-400" /> SL (-1.0R)
                            </span>
                            <span className="text-rose-300 font-bold">
                              ${formatPrice(pos.sl)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                            <span className="text-gray-500 flex items-center">
                              <Target className="w-2.5 h-2.5 mr-1 stroke-emerald-400" /> TP1 (+{tp1R}R)
                            </span>
                            <span className={`text-emerald-300 ${sizeRemaining <= 60 ? 'line-through text-gray-500 font-normal' : ''}`}>
                              ${formatPrice(pos.tp1)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between bg-gray-900/40 p-1.5 rounded">
                            <span className="text-gray-500 flex items-center">
                              <Target className="w-2.5 h-2.5 mr-1 stroke-emerald-400" /> TP2 (+{tp2R}R)
                            </span>
                            <span className={`text-emerald-300 ${sizeRemaining <= 20 ? 'line-through text-gray-500 font-normal' : ''}`}>
                              ${formatPrice(pos.tp2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between bg-indigo-950/30 border border-indigo-800/30 p-1.5 rounded">
                            <span className="text-indigo-300 flex items-center font-bold">
                              <Target className="w-2.5 h-2.5 mr-1 stroke-cyan-400" /> TP3 (+{tp3R}R)
                            </span>
                            <span className="text-cyan-300 font-bold">
                              ${formatPrice(pos.tp3)}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
