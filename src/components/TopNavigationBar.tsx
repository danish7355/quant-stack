import React from 'react';
import { Activity, ShieldAlert, Wifi, ZapOff, Play, Clock, AlertTriangle } from 'lucide-react';
import { TradingMode, SystemHealth } from '../types.js';

interface Props {
  mode: TradingMode;
  health: SystemHealth;
  dailyLossPct: number;
  openRiskPct: number;
  engineRunning: boolean;
  onToggleEngine: () => void;
}

export function TopNavigationBar({ mode, health, dailyLossPct, openRiskPct, engineRunning, onToggleEngine }: Props) {
  const isStale = health.marketData === 'STALE';
  const isBlocked = health.tradingBlocked;

  return (
    <div className="h-14 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between px-4 shrink-0 z-40 relative">
      
      {/* Left: Mode & Health */}
      <div className="flex items-center gap-4">
        <div className={`px-2.5 py-1 text-[10px] font-bold rounded-sm border ${
          mode === 'LIVE' ? 'border-red-500/50 text-red-400 bg-red-500/10' :
          mode === 'TESTNET' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' :
          'border-blue-500/50 text-blue-400 bg-blue-500/10'
        }`}>
          {mode} MODE
        </div>

        <div className="flex items-center gap-3 hidden md:flex">
          <div className="flex items-center gap-1.5" title={isStale ? "Market Data is STALE - No updates >10s" : "Market Data Connected"}>
            <Wifi size={14} className={isStale ? "text-amber-400 animate-pulse" : "text-emerald-400"} />
            <span className="text-xs text-gray-400">{isStale ? "DATA STALE" : "DATA OK"}</span>
          </div>
          <div className="w-px h-4 bg-[#30363D]"></div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-500" />
            <span className="text-xs text-gray-400">Sync: {health.lastReconciliationAt}</span>
          </div>
        </div>
      </div>

      {/* Center: Warnings */}
      <div className="hidden lg:flex items-center justify-center flex-1">
        {isBlocked && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-sm text-xs font-bold">
            <AlertTriangle size={14} />
            TRADING BLOCKED: {health.blockReason?.toUpperCase()}
          </div>
        )}
      </div>

      {/* Right: Risk & Kill Switch */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end hidden md:flex">
          <div className="text-[10px] text-gray-500 font-medium">DAILY LOSS</div>
          <div className={`text-xs font-bold ${dailyLossPct < -4 ? 'text-red-400' : 'text-gray-300'}`}>
            {dailyLossPct.toFixed(2)}% / -5.0%
          </div>
        </div>
        <div className="flex flex-col items-end hidden md:flex">
          <div className="text-[10px] text-gray-500 font-medium">OPEN RISK</div>
          <div className="text-xs font-bold text-gray-300">{openRiskPct.toFixed(2)}%</div>
        </div>

        <div className="w-px h-6 bg-[#30363D] mx-1"></div>

        <button
          onClick={onToggleEngine}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            engineRunning 
              ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20'
          }`}
        >
          {engineRunning ? (
            <>
              <ZapOff size={14} />
              <span className="hidden sm:inline">KILL SWITCH</span>
            </>
          ) : (
            <>
              <Play size={14} />
              <span className="hidden sm:inline">START ENGINE</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
}
