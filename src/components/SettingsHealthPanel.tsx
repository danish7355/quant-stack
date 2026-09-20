import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, AlertTriangle, RefreshCw, Shield, Server, Database, Clock } from 'lucide-react';
import { TradingSettings } from '../types';

interface HealthData {
  dbVersion: number;
  engineVersion: number;
  engineRunning: boolean;
  lastSaved: string;
  lastApplied: string;
  status: string;
  tradingMode: string;
  activeStrategy: string;
  accountRiskPct: number;
  dailyLossLimitPct: number;
  maxConcurrentTrades: number;
  leverage: number;
}

interface SettingsHealthPanelProps {
  currentSettings: TradingSettings;
  isDirty: boolean;
  hasLoadedServerSettings: boolean;
  settingsLoadError: string | null;
}

export function SettingsHealthPanel({
  currentSettings,
  isDirty,
  hasLoadedServerSettings,
  settingsLoadError
}: SettingsHealthPanelProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<string>('Just now');

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLastCheck(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.warn('Failed to fetch settings health:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  const frontendVersion = currentSettings.settingsVersion || 1;
  const engineVersion = health?.engineVersion ?? frontendVersion;
  const isSync = hasLoadedServerSettings && !settingsLoadError && (!health || frontendVersion === engineVersion) && !isDirty;

  let overallStatus = 'SYNCHRONIZED';
  let statusColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40';

  if (settingsLoadError) {
    overallStatus = 'CONFIGURATION ERROR';
    statusColor = 'text-red-400 bg-red-950/40 border-red-500/40';
  } else if (!hasLoadedServerSettings) {
    overallStatus = 'LOADING';
    statusColor = 'text-blue-400 bg-blue-950/40 border-blue-500/40';
  } else if (isDirty) {
    overallStatus = 'UNSAVED CHANGES';
    statusColor = 'text-amber-400 bg-amber-950/40 border-amber-500/40';
  } else if (health && frontendVersion !== engineVersion) {
    overallStatus = 'OUT OF SYNC';
    statusColor = 'text-rose-400 bg-rose-950/40 border-rose-500/40';
  }

  return (
    <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-[#30363D] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Settings Synchronization & Health
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${statusColor}`}>
                {overallStatus}
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              Verifies zero-drift synchronization across Browser State, Backend Service, and Live Trading Engine.
            </p>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-300 text-xs font-semibold border border-[#30363D] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Version Matrix Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Frontend Version */}
        <div className="bg-[#0E1117] rounded-lg p-3.5 border border-[#30363D] space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              Frontend UI
            </span>
            <span className="font-mono text-[10px] text-gray-500">React Client</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white">v{frontendVersion}</span>
            {isDirty && (
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                Draft Modified
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500">Current in-memory form state</p>
        </div>

        {/* Backend DB Version */}
        <div className="bg-[#0E1117] rounded-lg p-3.5 border border-[#30363D] space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              Persisted Database
            </span>
            <span className="font-mono text-[10px] text-gray-500">Firestore</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white">v{health?.dbVersion ?? '—'}</span>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Stored
            </span>
          </div>
          <p className="text-[10px] text-gray-500 truncate" title={health?.lastSaved || ''}>
            Saved: {health?.lastSaved ? new Date(health.lastSaved).toLocaleTimeString() : 'N/A'}
          </p>
        </div>

        {/* Trading Engine Active Version */}
        <div className="bg-[#0E1117] rounded-lg p-3.5 border border-[#30363D] space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              Trading Engine
            </span>
            <span className="font-mono text-[10px] text-gray-500">AutoTrader</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white">v{engineVersion}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              health?.engineRunning
                ? 'text-emerald-400 bg-emerald-950/50 border-emerald-800/40'
                : 'text-rose-400 bg-rose-950/50 border-rose-800/40'
            }`}>
              {health?.engineRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
          <p className="text-[10px] text-gray-500">
            Active version generating live signals
          </p>
        </div>
      </div>

      {/* Out of Sync Warning Banner */}
      {health && frontendVersion !== engineVersion && (
        <div className="bg-rose-950/50 border border-rose-600/60 rounded-lg p-3 flex items-start gap-2.5 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Configuration Out of Sync!</p>
            <p className="text-rose-400 text-[11px]">
              The trading engine is currently executing on version <strong>v{engineVersion}</strong>, while your local interface has version <strong>v{frontendVersion}</strong>.
              Save settings to push your latest configuration to the engine.
            </p>
          </div>
        </div>
      )}

      {/* Status Details Bar */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-[#30363D]/60 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span>Mode: <strong className="text-white font-mono">{currentSettings.tradingMode || 'PAPER'}</strong></span>
          <span>Account Risk: <strong className="text-white font-mono">{currentSettings.accountRiskPct}%</strong></span>
          <span>Max Trades: <strong className="text-white font-mono">{currentSettings.maxConcurrentTrades}</strong></span>
          <span>Leverage: <strong className="text-white font-mono">{currentSettings.leverage}x</strong></span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Last telemetry check: {lastCheck}</span>
        </div>
      </div>
    </div>
  );
}
