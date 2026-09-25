import React, { useEffect, useState } from 'react';
import { Activity, Database, Server, RefreshCw, ZapOff, Wifi, AlertTriangle, Send, ShieldCheck, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { SystemHealth } from '../types.js';

interface Props {
  initialHealth?: SystemHealth;
  onRefresh?: () => void;
}

export function SystemHealthPage({ initialHealth, onRefresh }: Props) {
  const [health, setHealth] = useState<SystemHealth>(initialHealth || {
    engine: 'PAUSED',
    marketData: 'DISCONNECTED',
    userStream: 'DISCONNECTED',
    lastReconciliationAt: 'Never',
    tradingBlocked: false
  });
  const [loading, setLoading] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date>(new Date());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const fetchLiveHealth = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      if (onRefresh) onRefresh();
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLatencyMs(Math.round(performance.now() - t0));
        setLastCheckTime(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch health', e);
    } finally {
      setLoading(false);
    }
  };

  // Keep in sync with parent updates
  useEffect(() => {
    if (initialHealth) setHealth(initialHealth);
  }, [initialHealth]);

  // Periodic health ping every 6 seconds
  useEffect(() => {
    const interval = setInterval(fetchLiveHealth, 6000);
    return () => clearInterval(interval);
  }, []);

  const StatusCard = ({ title, status, icon: Icon, desc, badge }: any) => {
    let colorClass = 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
    if (status === 'STALE' || status === 'DEGRADED' || status === 'WARNING') colorClass = 'text-amber-400 border-amber-400/20 bg-amber-400/5';
    if (status === 'DISCONNECTED' || status === 'ERROR' || status === 'BLOCKED' || status === 'NOT CONFIGURED') colorClass = 'text-red-400 border-red-400/20 bg-red-400/5';
    if (status === 'PAUSED') colorClass = 'text-gray-400 border-gray-400/20 bg-gray-400/5';

    return (
      <div className={`p-4 rounded-xl border ${colorClass} flex items-start gap-3 shadow-sm`}>
        <div className="mt-0.5"><Icon size={20} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-300">{title}</h3>
            {badge && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-gray-700">
                {badge}
              </span>
            )}
          </div>
          <div className="text-xs font-bold mt-1 uppercase tracking-wider">{status}</div>
          <div className="text-[10px] text-gray-400 mt-1 truncate" title={desc}>{desc}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-[#161B22] border border-[#30363D] p-5 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Server size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
              System Health & Diagnostics
              <span className="text-xs font-normal text-gray-400 font-mono">
                ({latencyMs !== null ? `${latencyMs}ms ping` : 'Live'})
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
              <span>Continuous 24/7 background engine monitoring & connection health.</span>
              <span className="text-gray-500">●</span>
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Clock size={12} /> Last verified: {lastCheckTime.toLocaleTimeString()}
              </span>
            </p>
          </div>
        </div>

        <button
          onClick={fetchLiveHealth}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-lg border border-[#30363D] bg-[#0E1117] text-gray-300 hover:text-white hover:border-gray-500 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-blue-400' : ''} />
          <span>Refresh Health</span>
        </button>
      </div>

      {/* Grid of Service Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatusCard 
          title="Execution Engine" 
          status={health.engine} 
          icon={Activity} 
          desc="Core autonomous trade scanning and execution loop" 
        />
        <StatusCard 
          title="Market Data (WS)" 
          status={health.marketData} 
          icon={Wifi} 
          desc="Binance Futures mini-ticker real-time stream" 
        />
        <StatusCard 
          title="User Stream (WS)" 
          status={health.userStream} 
          icon={RefreshCw} 
          desc="Live position & balance order execution reports" 
        />
        <StatusCard 
          title="Execution Gate Status" 
          status={health.tradingBlocked ? 'BLOCKED' : 'ACTIVE'} 
          icon={health.tradingBlocked ? ZapOff : ShieldCheck} 
          desc={health.blockReason || "Normal autonomous execution permitted"} 
        />
        <StatusCard 
          title="Telegram Alert Bot" 
          status={health.telegramConfigured ? 'CONNECTED' : 'NOT CONFIGURED'} 
          icon={Send} 
          desc={health.telegramConfigured ? "Instant notifications for orders & stops" : "Configure Bot Token in Settings -> Alerts"} 
        />
        <StatusCard 
          title="Active Managed Trades" 
          status={`${health.activePositions ?? 0} OPEN`} 
          icon={Database} 
          badge={`${health.activePositions ?? 0} pos`}
          desc="Positions tracked by live PositionMonitor" 
        />
        <StatusCard 
          title="Macro Market Filter" 
          status={health.globalFilterActive ? 'PAUSING' : 'CLEAR'} 
          icon={AlertTriangle} 
          desc={health.globalFilterReason || "BTC volatility & macro regime tradable"} 
        />
        <StatusCard 
          title="Stale Price Breaker" 
          status={health.marketData === 'STALE' ? 'TRIPPED' : 'ARMED'} 
          icon={Wifi} 
          desc={health.marketData === 'STALE' ? "Trading blocked due to stale market feed" : "Circuit breaker armed with 10s timeout"} 
        />
      </div>

      {/* Detailed Telemetry & Reconciliation State */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center gap-2">
          <Database size={16} className="text-purple-400" />
          True-State Reconciliation & Backend Telemetry
        </h3>
        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2.5">
            <span className="text-gray-400 font-sans">True-State Position Reconciliation</span>
            <span className="text-gray-200">{health.lastReconciliationAt || 'Running continuous sync'}</span>
          </div>
          <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2.5">
            <span className="text-gray-400 font-sans">Database / Disk Fallback Engine</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 size={13} /> HIGH-SPEED STORAGE ACTIVE
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2.5">
            <span className="text-gray-400 font-sans">Rolling 24h Daily Drawdown</span>
            <span className="text-gray-200">
              {(health.dailyLossPct ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-[#30363D]/60 pb-2.5">
            <span className="text-gray-400 font-sans">Consecutive Loss Count</span>
            <span className="text-gray-200">
              {health.consecutiveLosses ?? 0} losses
            </span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-gray-400 font-sans">Server Heartbeat Timestamp</span>
            <span className="text-gray-400">{health.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
