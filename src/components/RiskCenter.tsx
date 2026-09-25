import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, AlertTriangle, 
  RefreshCw, ZapOff, Play, DollarSign, Activity, Percent, ArrowUpRight, 
  ArrowDownRight, CheckCircle2, XCircle, RotateCcw, Lock, Unlock, Sliders,
  Layers, Crosshair
} from 'lucide-react';
import { Position, AppSettings, SystemHealth } from '../types';
import { formatPrice } from '../utils/format';

interface RiskCenterProps {
  positions?: Position[];
  balance?: number;
  settings?: AppSettings;
  systemHealth?: SystemHealth | null;
  onFlattenAll?: () => void;
  onManualClose?: (id: string) => void;
  onOpenSettings?: () => void;
}

interface BackendHealthRisk {
  dbVersion?: number;
  engineVersion?: number;
  engineRunning?: boolean;
  tradingMode?: string;
  activeStrategy?: string;
  accountRiskPct?: number;
  dailyLossLimitPct?: number;
  bypassDailyLossLimit?: boolean;
  currentDailyLossPct?: number;
  maxConcurrentTrades?: number;
  bypassMaxPositions?: boolean;
  maxConsecutiveLosses?: number;
  bypassMaxConsecutiveLosses?: boolean;
  consecutiveLosses?: number;
  maxPortfolioExposurePct?: number;
  bypassExposureLimit?: boolean;
  minLiquidationBuffer?: number;
  maxSinglePositionExposureMult?: number;
  minStopDistancePct?: number;
  tradeCooldownSeconds?: number;
  killSwitchActive?: boolean;
  leverage?: number;
}

export function RiskCenter({
  positions = [],
  balance = 10000,
  settings,
  systemHealth,
  onFlattenAll,
  onManualClose,
  onOpenSettings
}: RiskCenterProps) {
  const [healthRisk, setHealthRisk] = useState<BackendHealthRisk | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchHealthRisk = async () => {
    try {
      const res = await fetch('/api/settings/health');
      if (res.ok) {
        const data = await res.json();
        setHealthRisk(data);
      }
    } catch (e) {
      console.error('Failed to fetch risk health data', e);
    }
  };

  useEffect(() => {
    fetchHealthRisk();
    const interval = setInterval(fetchHealthRisk, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalAccountValue = useMemo(() => {
    return balance + positions.reduce((acc, p) => acc + (p.allocatedBalance || 0) + (p.unrealizedPnl || 0), 0);
  }, [balance, positions]);

  // Exposure & Risk Calculations
  const exposureMetrics = useMemo(() => {
    let longNotional = 0;
    let shortNotional = 0;
    let totalOpenRiskDollars = 0;

    positions.forEach((p) => {
      const lev = p.leverage || settings?.leverage || 1;
      const notional = (p.allocatedBalance || 0) * lev;

      if (p.direction === 'LONG') {
        longNotional += notional;
        if (p.sl && p.entryPrice && p.sl < p.entryPrice) {
          const slDistancePct = (p.entryPrice - p.sl) / p.entryPrice;
          totalOpenRiskDollars += notional * slDistancePct;
        } else {
          totalOpenRiskDollars += (p.allocatedBalance || 0);
        }
      } else {
        shortNotional += notional;
        if (p.sl && p.entryPrice && p.sl > p.entryPrice) {
          const slDistancePct = (p.sl - p.entryPrice) / p.entryPrice;
          totalOpenRiskDollars += notional * slDistancePct;
        } else {
          totalOpenRiskDollars += (p.allocatedBalance || 0);
        }
      }
    });

    const totalExposure = longNotional + shortNotional;
    const netExposure = longNotional - shortNotional;
    const grossExposurePct = totalAccountValue > 0 ? (totalExposure / totalAccountValue) * 100 : 0;
    const longExposurePct = totalAccountValue > 0 ? (longNotional / totalAccountValue) * 100 : 0;
    const shortExposurePct = totalAccountValue > 0 ? (shortNotional / totalAccountValue) * 100 : 0;
    const openRiskPct = totalAccountValue > 0 ? (totalOpenRiskDollars / totalAccountValue) * 100 : 0;

    return {
      longNotional,
      shortNotional,
      totalExposure,
      netExposure,
      grossExposurePct,
      longExposurePct,
      shortExposurePct,
      totalOpenRiskDollars,
      openRiskPct
    };
  }, [positions, settings, totalAccountValue]);

  // Daily Loss & Limit
  const dailyLossPct = Math.abs(healthRisk?.currentDailyLossPct ?? 0);
  const dailyLossLimitPct = healthRisk?.dailyLossLimitPct ?? settings?.dailyLossLimitPct ?? 5.0;
  const dailyLossRatio = Math.min(100, Math.max(0, (dailyLossPct / (dailyLossLimitPct || 1)) * 100));

  // Consecutive losses
  const consecutiveLosses = healthRisk?.consecutiveLosses ?? 0;
  const maxConsecutiveLosses = healthRisk?.maxConsecutiveLosses ?? settings?.maxConsecutiveLosses ?? 4;

  // Kill Switch
  const isKillSwitchActive = healthRisk?.killSwitchActive ?? settings?.killSwitchActive ?? false;

  // Action handlers
  const handleToggleKillSwitch = async () => {
    const nextState = !isKillSwitchActive;
    const confirmed = window.confirm(
      nextState 
        ? "🚨 ENGAGE EMERGENCY KILL SWITCH?\n\nThis will immediately halt all autonomous scanning, block new trade executions, and freeze order dispatching."
        : "✅ DISENGAGE KILL SWITCH?\n\nThis will re-arm normal risk evaluations and permit autonomous order execution if the engine is running."
    );
    if (!confirmed) return;

    setActionLoading('kill-switch');
    try {
      const res = await fetch('/api/risk/toggle-kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState })
      });
      if (res.ok) {
        setActionMessage({ text: `Kill switch ${nextState ? 'ENGAGED' : 'DISENGAGED'} successfully.`, type: 'success' });
        await fetchHealthRisk();
      } else {
        const err = await res.json();
        setActionMessage({ text: err.error || 'Failed to toggle kill switch', type: 'error' });
      }
    } catch (e: any) {
      setActionMessage({ text: e.message || 'Network error', type: 'error' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleResetDailyLoss = async () => {
    if (!window.confirm("Reset the rolling 24-hour daily loss drawdown counter to 0.00%?")) return;
    setActionLoading('reset-daily-loss');
    try {
      const res = await fetch('/api/risk/reset-daily-loss', { method: 'POST' });
      if (res.ok) {
        setActionMessage({ text: "Daily loss statistics reset to 0.00%", type: 'success' });
        await fetchHealthRisk();
      } else {
        setActionMessage({ text: "Failed to reset daily loss", type: 'error' });
      }
    } catch (e: any) {
      setActionMessage({ text: e.message, type: 'error' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleResetConsecutiveLosses = async () => {
    if (!window.confirm("Reset consecutive loss streak counter to 0?")) return;
    setActionLoading('reset-losses');
    try {
      const res = await fetch('/api/risk/reset-losses', { method: 'POST' });
      if (res.ok) {
        setActionMessage({ text: "Consecutive loss streak reset to 0", type: 'success' });
        await fetchHealthRisk();
      } else {
        setActionMessage({ text: "Failed to reset consecutive losses", type: 'error' });
      }
    } catch (e: any) {
      setActionMessage({ text: e.message, type: 'error' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleFlattenPositions = async () => {
    if (positions.length === 0) {
      alert("No open positions to flatten.");
      return;
    }
    const confirmed = window.confirm(
      `⚠️ EMERGENCY FLATTEN ALL POSITIONS?\n\nThis will execute IMMEDIATE market-close orders for all ${positions.length} active open positions.\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setActionLoading('flatten');
    try {
      if (onFlattenAll) {
        onFlattenAll();
      } else {
        await fetch('/api/bot/flatten', { method: 'POST' });
      }
      setActionMessage({ text: `Emergency flatten dispatched for ${positions.length} positions.`, type: 'success' });
      await fetchHealthRisk();
    } catch (e: any) {
      setActionMessage({ text: e.message || 'Flatten failed', type: 'error' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-[#161B22] border border-[#30363D] p-5 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${isKillSwitchActive ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
            <ShieldAlert size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-100">Live Risk & Capital Protection Center</h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isKillSwitchActive 
                  ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                {isKillSwitchActive ? 'KILL SWITCH ACTIVE' : 'PROTECTION ARMED'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Real-time portfolio exposure, automated drawdown circuit breakers, and active margin tracking.
            </p>
          </div>
        </div>

        {/* Global Emergency Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchHealthRisk}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-[#30363D] bg-[#0E1117] text-gray-300 hover:text-white hover:border-gray-500 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Refresh Risk Metrics"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>

          <button
            onClick={handleFlattenPositions}
            disabled={actionLoading === 'flatten' || positions.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/60 hover:bg-rose-900/60 text-rose-300 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Emergency Market Close for all open positions"
          >
            <ZapOff size={14} />
            <span>FLATTEN ALL ({positions.length})</span>
          </button>

          <button
            onClick={handleToggleKillSwitch}
            disabled={actionLoading === 'kill-switch'}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
              isKillSwitchActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-emerald-900/40'
                : 'bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-red-900/40'
            }`}
          >
            {isKillSwitchActive ? <Unlock size={14} /> : <Lock size={14} />}
            <span>{isKillSwitchActive ? 'DISENGAGE KILL SWITCH' : 'EMERGENCY KILL SWITCH'}</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
            : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}>
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Top Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Account Equity */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Account Value</span>
            <DollarSign size={16} className="text-blue-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-white font-mono">
              ${totalAccountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Cash: ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[10px] text-gray-500 border-t border-[#30363D]/60 pt-2">
            Leverage multiplier: {healthRisk?.leverage ?? settings?.leverage ?? 10}x
          </div>
        </div>

        {/* Total Open Risk */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Total Open Risk</span>
            <AlertTriangle size={16} className={exposureMetrics.openRiskPct > 3 ? 'text-rose-400' : 'text-amber-400'} />
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black font-mono ${exposureMetrics.openRiskPct > 3 ? 'text-rose-400' : 'text-amber-300'}`}>
              {exposureMetrics.openRiskPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              ${exposureMetrics.totalOpenRiskDollars.toFixed(2)} at max SL hit
            </div>
          </div>
          <div className="text-[10px] text-gray-500 border-t border-[#30363D]/60 pt-2">
            Budgeted per trade: {healthRisk?.accountRiskPct ?? settings?.accountRiskPct ?? 1}%
          </div>
        </div>

        {/* Daily Drawdown */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Rolling 24h Loss</span>
            <TrendingDown size={16} className={dailyLossPct >= dailyLossLimitPct ? 'text-rose-400' : 'text-emerald-400'} />
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black font-mono ${dailyLossPct >= dailyLossLimitPct ? 'text-rose-400' : dailyLossPct > 2 ? 'text-amber-300' : 'text-emerald-400'}`}>
              {dailyLossPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Limit: -{dailyLossLimitPct.toFixed(1)}% ({dailyLossRatio.toFixed(0)}% of quota)
            </div>
          </div>
          <div className="text-[10px] text-gray-500 border-t border-[#30363D]/60 pt-2">
            Circuit breaker: {dailyLossPct >= dailyLossLimitPct ? 'TRIPPED (HALTED)' : 'NORMAL'}
          </div>
        </div>

        {/* Active Positions & Streak */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Positions & Streak</span>
            <Activity size={16} className="text-purple-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-white font-mono">
              {positions.length} / {healthRisk?.maxConcurrentTrades ?? settings?.maxConcurrentTrades ?? 3}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Loss streak: <strong className={consecutiveLosses >= maxConsecutiveLosses ? 'text-rose-400' : 'text-gray-200'}>{consecutiveLosses}</strong> / {maxConsecutiveLosses} max
            </div>
          </div>
          <div className="text-[10px] text-gray-500 border-t border-[#30363D]/60 pt-2">
            Status: {consecutiveLosses >= maxConsecutiveLosses ? 'STREAK LOCKOUT' : 'CAPACITY OK'}
          </div>
        </div>
      </div>

      {/* Main Analysis Section: Circuit Breakers & Exposure Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drawdown & Circuit Breaker Panel */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <TrendingDown size={17} className="text-red-400" />
              Drawdown & Circuit Breakers
            </h3>
            <button
              onClick={handleResetDailyLoss}
              disabled={actionLoading === 'reset-daily-loss'}
              className="px-2.5 py-1 text-[11px] font-semibold rounded border border-[#30363D] bg-[#0E1117] text-gray-300 hover:text-white flex items-center gap-1 transition"
            >
              <RotateCcw size={11} /> Reset Daily Loss
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-gray-400">Current Daily Drawdown</span>
                <span className={`font-bold ${dailyLossPct >= dailyLossLimitPct ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {dailyLossPct.toFixed(2)}% / -{dailyLossLimitPct.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-[#0E1117] rounded-full h-2 border border-[#30363D] overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    dailyLossRatio > 80 ? 'bg-rose-500' : dailyLossRatio > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} 
                  style={{ width: `${dailyLossRatio}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-gray-400">Consecutive Loss Streak</span>
                <span className={`font-bold ${consecutiveLosses >= maxConsecutiveLosses ? 'text-rose-400' : 'text-gray-200'}`}>
                  {consecutiveLosses} of {maxConsecutiveLosses} allowed
                </span>
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: maxConsecutiveLosses }).map((_, idx) => (
                  <div 
                    key={idx}
                    className={`flex-1 h-2 rounded-full border transition-all ${
                      idx < consecutiveLosses
                        ? 'bg-rose-500 border-rose-400'
                        : 'bg-[#0E1117] border-[#30363D]'
                    }`}
                  />
                ))}
                <button
                  onClick={handleResetConsecutiveLosses}
                  disabled={actionLoading === 'reset-losses'}
                  className="px-2 py-0.5 text-[10px] rounded border border-gray-700 bg-gray-800 text-gray-300 hover:text-white shrink-0 ml-1"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-[#0E1117] border border-[#30363D] rounded-lg text-xs text-gray-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-gray-300 font-bold text-[11px]">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Deterministic Protection Rules:</span>
              </div>
              <p>
                1. <strong>Daily Loss Cutoff:</strong> If cumulative net losses exceed <span className="text-gray-200 font-semibold">{dailyLossLimitPct}%</span> in 24 hours, new trades are hard-rejected.
              </p>
              <p>
                2. <strong>Streak Circuit Breaker:</strong> {maxConsecutiveLosses} consecutive losses pauses automated execution until manual reset or session rollover.
              </p>
            </div>
          </div>
        </div>

        {/* Portfolio Exposure & Directional Bias */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <Layers size={17} className="text-amber-400" />
              Exposure & Directional Bias
            </h3>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
              exposureMetrics.netExposure > 0 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : exposureMetrics.netExposure < 0 
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}>
              {exposureMetrics.netExposure > 0 ? 'NET LONG' : exposureMetrics.netExposure < 0 ? 'NET SHORT' : 'DELTA NEUTRAL'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2">
              <span className="text-gray-400">Gross Notional Exposure</span>
              <span className="text-gray-200 font-mono font-bold">
                ${exposureMetrics.totalExposure.toFixed(2)} ({exposureMetrics.grossExposurePct.toFixed(1)}% of Equity)
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2">
              <span className="text-gray-400 flex items-center gap-1.5">
                <ArrowUpRight size={14} className="text-emerald-400" />
                Long Notional Exposure
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                ${exposureMetrics.longNotional.toFixed(2)} ({exposureMetrics.longExposurePct.toFixed(1)}%)
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2">
              <span className="text-gray-400 flex items-center gap-1.5">
                <ArrowDownRight size={14} className="text-rose-400" />
                Short Notional Exposure
              </span>
              <span className="text-rose-400 font-mono font-bold">
                ${exposureMetrics.shortNotional.toFixed(2)} ({exposureMetrics.shortExposurePct.toFixed(1)}%)
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2">
              <span className="text-gray-400">Net Directional Imbalance</span>
              <span className="text-gray-200 font-mono font-bold">
                ${Math.abs(exposureMetrics.netExposure).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-400">Max Portfolio Exposure Cap</span>
              <span className="text-gray-300 font-mono">
                {healthRisk?.maxPortfolioExposurePct ?? settings?.maxPortfolioExposurePct ?? 100}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Position Risk Matrix Table */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <Crosshair size={17} className="text-indigo-400" />
              Active Positions Risk Ledger ({positions.length})
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Granular breakdown of stop loss distances, capital at risk, and liquidation cushions.
            </p>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="py-12 text-center text-gray-500 space-y-2">
            <ShieldCheck size={36} className="mx-auto text-emerald-500/40 mb-2" />
            <p className="font-semibold text-gray-400">Zero Market Exposure</p>
            <p className="text-xs max-w-md mx-auto">
              No positions are currently active. Capital is 100% in cash/reserve with 0.00% market risk.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0E1117] text-gray-400 uppercase text-[10px] border-b border-[#30363D]">
                <tr>
                  <th className="px-3 py-2.5">Symbol</th>
                  <th className="px-3 py-2.5">Side</th>
                  <th className="px-3 py-2.5">Margin / Notional</th>
                  <th className="px-3 py-2.5">Entry Price</th>
                  <th className="px-3 py-2.5">Stop Loss</th>
                  <th className="px-3 py-2.5">Distance to SL</th>
                  <th className="px-3 py-2.5">Capital at Risk</th>
                  <th className="px-3 py-2.5">Unrealized PnL</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D]/60 text-gray-300">
                {positions.map((pos) => {
                  const lev = pos.leverage || 10;
                  const notional = pos.allocatedBalance * lev;
                  let slDistancePct = 0;
                  let capitalAtRisk = pos.allocatedBalance;

                  if (pos.direction === 'LONG' && pos.sl && pos.entryPrice) {
                    slDistancePct = Math.max(0, (pos.entryPrice - pos.sl) / pos.entryPrice);
                    capitalAtRisk = notional * slDistancePct;
                  } else if (pos.direction === 'SHORT' && pos.sl && pos.entryPrice) {
                    slDistancePct = Math.max(0, (pos.sl - pos.entryPrice) / pos.entryPrice);
                    capitalAtRisk = notional * slDistancePct;
                  }

                  const pnl = pos.unrealizedPnl || 0;
                  const pnlPct = pos.allocatedBalance > 0 ? (pnl / pos.allocatedBalance) * 100 : 0;

                  return (
                    <tr key={pos.id} className="hover:bg-[#21262D]/50 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-white font-sans">
                        {pos.symbol}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          pos.direction === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {pos.direction} {lev}x
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        ${pos.allocatedBalance.toFixed(2)} / ${notional.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5">
                        ${formatPrice(pos.entryPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-amber-300 font-bold">
                        {pos.sl ? `$${formatPrice(pos.sl)}` : 'None'}
                      </td>
                      <td className="px-3 py-2.5">
                        {(slDistancePct * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-rose-400 font-bold">
                        -${capitalAtRisk.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {onManualClose && (
                          <button
                            onClick={() => onManualClose(pos.id)}
                            className="px-2 py-1 rounded bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-800/40 text-[10px] font-bold cursor-pointer transition"
                          >
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
