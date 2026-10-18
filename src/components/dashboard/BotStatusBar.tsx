import React from 'react';
import { Play, Square, Wifi, ShieldCheck, ShieldAlert, Layers, Clock, AlertTriangle } from 'lucide-react';

interface BotStatusBarProps {
  engineRunning: boolean;
  onToggleEngine: () => void;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  isStale: boolean;
  executionBlocked?: boolean;
  activeStrategiesCount: number;
  lastScanTime: string;
}

export function BotStatusBar({
  engineRunning,
  onToggleEngine,
  connectionStatus,
  isStale,
  executionBlocked = false,
  activeStrategiesCount = 5,
  lastScanTime = 'Just now',
}: BotStatusBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      
      {/* 1. Bot Engine Status & Control */}
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
            Bot Engine
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${engineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span className={`text-xs font-bold tracking-wide ${engineRunning ? 'text-emerald-400' : 'text-rose-400'}`}>
              {engineRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
        </div>
        <button
          onClick={onToggleEngine}
          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
            engineRunning 
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25' 
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
          }`}
          title={engineRunning ? 'Stop automated execution' : 'Start automated execution'}
        >
          {engineRunning ? <Square size={10} /> : <Play size={10} />}
          {engineRunning ? 'STOP' : 'START'}
        </button>
      </div>

      {/* 2. Data Feed */}
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 shadow-sm">
        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
          Market Data Feed
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Wifi size={13} className={isStale ? 'text-amber-400 animate-pulse' : connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400'} />
          <span className={`text-xs font-bold tracking-wide ${isStale ? 'text-amber-400' : connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isStale ? 'STALE' : connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'CONNECTING'}
          </span>
        </div>
      </div>

      {/* 3. Execution Guard */}
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 shadow-sm">
        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
          Execution Guard
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {executionBlocked ? (
            <>
              <ShieldAlert size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400 tracking-wide">DEFENSIVE</span>
            </>
          ) : (
            <>
              <ShieldCheck size={13} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 tracking-wide">READY</span>
            </>
          )}
        </div>
      </div>

      {/* 4. Active Strategies */}
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 shadow-sm">
        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
          Strategies
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Layers size={13} className="text-sky-400" />
          <span className="text-xs font-bold text-gray-100 tracking-wide">
            {activeStrategiesCount} ACTIVE
          </span>
        </div>
      </div>

      {/* 5. Last Signal / Scan */}
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3 shadow-sm col-span-2 sm:col-span-1">
        <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
          Last Scan
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock size={13} className="text-gray-400" />
          <span className="text-xs font-mono font-semibold text-gray-300 tracking-wide truncate">
            {lastScanTime || 'Active'}
          </span>
        </div>
      </div>

    </div>
  );
}
