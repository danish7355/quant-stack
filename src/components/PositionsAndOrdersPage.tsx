/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Position, TradeLog, AppSettings } from '../types';
import { 
  Activity, 
  Layers, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  RefreshCw, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Clock,
  Search,
  Filter
} from 'lucide-react';
import ActiveTrades from './ActiveTrades';
import FullTradeLogTable from './FullTradeLogTable';
import { formatPrice, getCurrencySymbol } from '../utils/format';

interface PositionsAndOrdersPageProps {
  positions: Position[];
  tradeLogs: TradeLog[];
  settings: AppSettings;
  onManualClose: (id: string) => void;
  onSelectSymbol?: (symbol: string) => void;
  totalAccountValue?: number;
  balance?: number;
}

export function PositionsAndOrdersPage({
  positions,
  tradeLogs,
  settings,
  onManualClose,
  onSelectSymbol,
  totalAccountValue = 10000,
  balance = 10000
}: PositionsAndOrdersPageProps) {
  const [activeSubTab, setActiveSubTab] = useState<'positions' | 'orders'>('positions');
  const [isCloseAllModalOpen, setIsCloseAllModalOpen] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);

  const currSymbol = getCurrencySymbol(settings);

  // Aggregated Position Metrics
  const totalAllocated = useMemo(() => {
    return positions.reduce((acc, p) => acc + (p.allocatedBalance || 0), 0);
  }, [positions]);

  const totalUnrealizedPnl = useMemo(() => {
    return positions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);
  }, [positions]);

  const totalUnrealizedPct = useMemo(() => {
    if (totalAllocated <= 0) return 0;
    return (totalUnrealizedPnl / totalAllocated) * 100;
  }, [totalUnrealizedPnl, totalAllocated]);

  const totalRealizedPnl = useMemo(() => {
    return tradeLogs.reduce((acc, t) => acc + (t.profit || 0), 0);
  }, [tradeLogs]);

  const winningTradesCount = useMemo(() => {
    return tradeLogs.filter(t => (t.profit || 0) > 0).length;
  }, [tradeLogs]);

  const winRate = useMemo(() => {
    if (tradeLogs.length === 0) return 0;
    return (winningTradesCount / tradeLogs.length) * 100;
  }, [winningTradesCount, tradeLogs]);

  const maxPositions = settings.maxConcurrentTrades || 23;
  const capacityPct = Math.min(100, Math.round((positions.length / maxPositions) * 100));

  const handleCloseAll = async () => {
    setIsClosingAll(true);
    try {
      for (const pos of positions) {
        onManualClose(pos.id);
      }
    } finally {
      setIsClosingAll(false);
      setIsCloseAllModalOpen(false);
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-10">
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121721] border border-[#232B3B] rounded-xl p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Activity size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                Positions & Orders
                <span className={`w-2 h-2 rounded-full ${positions.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              </h1>
              <p className="text-xs text-gray-400">
                Real-time active futures positions, margin risk exposure, and complete executed order history.
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {positions.length > 0 && (
            <button
              onClick={() => setIsCloseAllModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldAlert size={14} />
              Close All Positions ({positions.length})
            </button>
          )}

          {/* Sub-Tab Navigation Toggle */}
          <div className="flex items-center bg-[#0B0E14] border border-[#232B3B] p-1 rounded-lg">
            <button
              onClick={() => setActiveSubTab('positions')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'positions'
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Activity size={13} />
              <span>Open Positions</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'positions' ? 'bg-white/20 text-white' : 'bg-[#1F293D] text-gray-300'
              }`}>
                {positions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('orders')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'orders'
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <FileSpreadsheet size={13} />
              <span>Order History</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'orders' ? 'bg-white/20 text-white' : 'bg-[#1F293D] text-gray-300'
              }`}>
                {tradeLogs.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Portfolio Risk & P&L KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Metric 1: Allocated Margin */}
        <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3.5 sm:p-4">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Allocated Margin</span>
            <PieChart size={14} className="text-sky-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-gray-100">
            {currSymbol}{totalAllocated.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {((totalAllocated / (totalAccountValue || 1)) * 100).toFixed(1)}% of total account equity
          </div>
        </div>

        {/* Metric 2: Floating Unrealized P&L */}
        <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3.5 sm:p-4">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Floating Open P&L</span>
            {totalUnrealizedPnl >= 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />}
          </div>
          <div className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}{currSymbol}{totalUnrealizedPnl.toFixed(2)}
          </div>
          <div className={`text-[10px] font-mono tabular-nums font-semibold mt-1 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}{totalUnrealizedPct.toFixed(2)}% ROI
          </div>
        </div>

        {/* Metric 3: Total Realized P&L */}
        <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3.5 sm:p-4">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Realized P&L (Total)</span>
            <DollarSign size={14} className="text-purple-400" />
          </div>
          <div className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalRealizedPnl >= 0 ? '+' : ''}{currSymbol}{totalRealizedPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {winningTradesCount} wins out of {tradeLogs.length} filled orders ({winRate.toFixed(1)}%)
          </div>
        </div>

        {/* Metric 4: Position Slots Capacity */}
        <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-3.5 sm:p-4">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Slots Capacity</span>
            <Activity size={14} className="text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-gray-100">
            {positions.length} <span className="text-xs text-gray-400 font-normal">/ {maxPositions} max</span>
          </div>
          <div className="w-full bg-[#1A202E] rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className={`h-full transition-all rounded-full ${
                capacityPct > 80 ? 'bg-rose-500' : capacityPct > 50 ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.max(4, capacityPct)}%` }}
            />
          </div>
        </div>

      </div>

      {/* 3. Main View Switcher: Open Positions vs Order History */}
      {activeSubTab === 'positions' ? (
        <div className="space-y-4">
          <ActiveTrades
            positions={positions}
            onManualClose={onManualClose}
            settings={settings}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#121721] border border-[#232B3B] rounded-xl overflow-hidden p-1 sm:p-2">
            <FullTradeLogTable logs={tradeLogs} />
          </div>
        </div>
      )}

      {/* Close All Confirmation Modal */}
      {isCloseAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#121721] border border-[#232B3B] rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-100 text-sm">Emergency Flatten: Close All Positions?</h3>
                <p className="text-xs text-gray-400">This will close all {positions.length} open position(s) at current market price.</p>
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E14] border border-[#232B3B] text-xs space-y-1 font-mono">
              <div className="flex justify-between text-gray-400">
                <span>Active Positions:</span>
                <span className="text-gray-200">{positions.length}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Total Allocated Margin:</span>
                <span className="text-gray-200">{currSymbol}{totalAllocated.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Floating P&L to Realize:</span>
                <span className={totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {totalUnrealizedPnl >= 0 ? '+' : ''}{currSymbol}{totalUnrealizedPnl.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCloseAllModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-[#1A202E] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseAll}
                disabled={isClosingAll}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isClosingAll && <RefreshCw size={13} className="animate-spin" />}
                Confirm Flatten All
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
