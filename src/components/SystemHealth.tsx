import React, { useEffect, useState } from 'react';
import { Activity, Database, Server, RefreshCw, ZapOff, Wifi, AlertTriangle } from 'lucide-react';
import { SystemHealth } from '../types.js';

export function SystemHealthPage({ initialHealth }: { initialHealth?: SystemHealth }) {
  const [health, setHealth] = useState<SystemHealth>(initialHealth || {
    engine: 'PAUSED',
    marketData: 'DISCONNECTED',
    userStream: 'DISCONNECTED',
    lastReconciliationAt: 'Never',
    tradingBlocked: false
  });

  // Keep in sync with parent updates
  useEffect(() => {
    if (initialHealth) setHealth(initialHealth);
  }, [initialHealth]);

  const StatusCard = ({ title, status, icon: Icon, desc }: any) => {
    let colorClass = 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
    if (status === 'STALE' || status === 'DEGRADED') colorClass = 'text-amber-400 border-amber-400/20 bg-amber-400/5';
    if (status === 'DISCONNECTED' || status === 'ERROR' || status === 'BLOCKED') colorClass = 'text-red-400 border-red-400/20 bg-red-400/5';
    if (status === 'PAUSED') colorClass = 'text-gray-400 border-gray-400/20 bg-gray-400/5';

    return (
      <div className={`p-4 rounded-lg border ${colorClass} flex items-start gap-3`}>
        <div className="mt-0.5"><Icon size={18} /></div>
        <div>
          <h3 className="text-sm font-bold text-gray-300">{title}</h3>
          <div className="text-xs font-bold mt-1 uppercase tracking-wider">{status}</div>
          <div className="text-[10px] text-gray-400 mt-1">{desc}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <Server className="text-blue-400" size={24} />
        <h2 className="text-lg font-bold text-gray-100">System Health</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatusCard 
          title="Execution Engine" 
          status={health.engine} 
          icon={Activity} 
          desc="Core autonomous trading loop status" 
        />
        <StatusCard 
          title="Market Data (WS)" 
          status={health.marketData} 
          icon={Wifi} 
          desc="Binance Futures mini-ticker stream" 
        />
        <StatusCard 
          title="User Stream (WS)" 
          status={health.userStream} 
          icon={RefreshCw} 
          desc="Live position & order execution reports" 
        />
        <StatusCard 
          title="Trading Status" 
          status={health.tradingBlocked ? 'BLOCKED' : 'ACTIVE'} 
          icon={health.tradingBlocked ? ZapOff : Server} 
          desc={health.blockReason || "Normal execution permitted"} 
        />
      </div>

      <div className="bg-[#161B22] border border-[#30363D] rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
          <Database size={16} className="text-purple-400" />
          Reconciliation & State
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between text-xs border-b border-[#30363D] pb-2">
            <span className="text-gray-400">Last True-State Reconciliation</span>
            <span className="text-gray-200 font-mono">{health.lastReconciliationAt}</span>
          </div>
          <div className="flex justify-between text-xs border-b border-[#30363D] pb-2">
            <span className="text-gray-400">Database Connection</span>
            <span className="text-emerald-400">CONNECTED</span>
          </div>
          <div className="flex justify-between text-xs pb-2">
            <span className="text-gray-400">Stale Data Circuit Breaker</span>
            <span className={health.marketData === 'STALE' ? 'text-red-400' : 'text-emerald-400'}>
              {health.marketData === 'STALE' ? 'TRIPPED' : 'ARMED'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
