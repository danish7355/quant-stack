/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Position, AppSettings } from '../types';
import { TrendingUp, TrendingDown, Target, Shield, Clock, X, Anchor, Zap, Activity, Flame, Award, Sparkles, Cpu, Compass } from 'lucide-react';
import { formatPrice, formatISTDateTime } from '../utils/format';

interface ActiveTradesProps {
  positions: Position[];
  onManualClose: (id: string) => void;
  settings?: AppSettings;
}

export default function ActiveTrades({ positions, onManualClose, settings }: ActiveTradesProps) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <h2 className="text-lg font-bold text-gray-100 tracking-tight">Active Futures Positions</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 bg-indigo-950/40 text-indigo-300 border border-indigo-800/40 rounded">
            🎯 Target 1:3 R:R
          </span>
          <span className="text-xs font-mono bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full">
            {positions.length} Open Trades
          </span>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed border-gray-800 rounded-lg text-gray-500">
          <Clock className="w-8 h-8 mb-2 stroke-gray-600" />
          <p className="text-sm font-medium">No open positions at the moment</p>
          <span className="text-xs text-gray-500 mt-1 max-w-sm text-center leading-relaxed">
            Scanning {settings?.coinCount || 25} Binance Futures pairs for <strong className="text-gray-400">{settings?.activeStrategy === 'DELTA_CLIMAX' ? 'Climax Reversal' : settings?.activeStrategy === 'VOLATILITY_COMPRESSION' ? 'VCB Breakout' : `Score ≥ ${settings?.autoTradeThreshold || 75}`}</strong> fully-confirmed signals with tight invalidation Stop Loss and <strong className="text-indigo-400">1:3 Asymmetric Target</strong>.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map((pos) => {
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
                    <div className="pl-1.5 mb-2 flex items-center gap-1.5">
                      <span className="text-[9.5px] font-semibold text-gray-400 flex items-center gap-1">
                        <Compass className="w-2.5 h-2.5 text-cyan-400" /> Regime:
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950/30 border border-cyan-800/50 text-cyan-200 text-[9.5px] font-mono font-medium">
                        {pos.marketRegime}
                      </span>
                    </div>
                  ) : null}

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
                      onClick={() => onManualClose(pos.id)}
                      className="p-1 text-gray-500 hover:text-rose-400 hover:bg-gray-800/60 rounded-full transition-all"
                      title="Market Exit"
                    >
                      <X className="w-4 h-4" />
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
                        <Clock className="w-3 h-3 mr-1" /> Executed (IST)
                      </span>
                      <span className="text-gray-300 font-mono text-[10.5px]">
                        {formatISTDateTime(pos.timeOpen)}
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
