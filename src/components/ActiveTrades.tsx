/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Position, AppSettings } from '../types';
import { 
  TrendingUp, TrendingDown, Target, Shield, Clock, X, 
  Activity, ArrowUpRight, ArrowDownRight, ExternalLink, AlertCircle, ChevronRight,
  LayoutGrid, List, Zap
} from 'lucide-react';
import { formatPrice, formatISTDateTime, getCurrencySymbol } from '../utils/format';
import { EmptyState } from './common/EmptyState';
import { TradeDetailDrawer } from './common/TradeDetailDrawer';

interface ActiveTradesProps {
  positions: Position[];
  onManualClose: (id: string) => void;
  settings?: AppSettings;
  onSelectSymbol?: (symbol: string) => void;
}

export default function ActiveTrades({ 
  positions, 
  onManualClose, 
  settings,
  onSelectSymbol 
}: ActiveTradesProps) {
  const [selectedTrade, setSelectedTrade] = useState<Position | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'pnl_desc' | 'pnl_asc'>('newest');
  const [viewMode, setViewMode] = useState<'boxes' | 'table'>('boxes');

  const currSymbol = getCurrencySymbol(settings);

  const handleRowClick = (pos: Position) => {
    setSelectedTrade(pos);
    setDrawerOpen(true);
    onSelectSymbol?.(pos.symbol);
  };

  const getTime = (p: Position) => p.timestampMs || (p.timeOpen ? new Date(p.timeOpen).getTime() : 0);

  const sortedPositions = [...positions].sort((a, b) => {
    if (sortBy === 'newest') return getTime(b) - getTime(a);
    if (sortBy === 'oldest') return getTime(a) - getTime(b);
    if (sortBy === 'pnl_desc') return b.unrealizedPnl - a.unrealizedPnl;
    if (sortBy === 'pnl_asc') return a.unrealizedPnl - b.unrealizedPnl;
    return 0;
  });

  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const totalAllocated = positions.reduce((acc, p) => acc + (p.allocatedBalance || 0), 0);
  const isOverallProfitable = totalUnrealizedPnl >= 0;

  return (
    <div className="bg-[#121721] border border-[#232B3B] rounded-xl overflow-hidden shadow-sm flex flex-col">
      
      {/* Header Bar */}
      <div className="p-3.5 sm:p-4 border-b border-[#232B3B] bg-[#0E131C] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
            Active Positions
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1A202E] text-gray-300 border border-[#2A3447]">
              {positions.length}
            </span>
          </h2>
        </div>

        {/* View Switcher and Metrics */}
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <div className="hidden sm:flex items-center gap-4 text-xs pr-2 border-r border-[#232B3B]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-gray-400 text-[11px]">Allocated:</span>
                <span className="font-mono font-semibold text-gray-200">{currSymbol}{totalAllocated.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-gray-400 text-[11px]">Open P&L:</span>
                <span className={`font-mono font-bold tabular-nums ${isOverallProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isOverallProfitable ? '+' : ''}{currSymbol}{totalUnrealizedPnl.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Box vs Table View Toggle Switcher */}
          <div className="flex items-center bg-[#0B0E14] border border-[#232B3B] p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('boxes')}
              className={`p-1.5 rounded flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === 'boxes'
                  ? 'bg-sky-500 text-white font-semibold shadow-xs'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Box / Card Grid View"
            >
              <LayoutGrid size={14} />
              <span className="hidden md:inline text-[11px]">Boxes</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded flex items-center gap-1 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-sky-500 text-white font-semibold shadow-xs'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Table View"
            >
              <List size={14} />
              <span className="hidden md:inline text-[11px]">Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {positions.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No Open Positions"
          description="The 24/7 autonomous engine is actively scanning. When a setup meets all 10 confirmation gates, orders execute automatically."
          className="border-none rounded-none py-12"
        />
      ) : viewMode === 'boxes' ? (
        /* Box / Cards Grid View */
        <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-[#0B0E14]/40">
          {sortedPositions.map((pos) => {
            const isLong = pos.direction === 'LONG';
            const isProfitable = pos.unrealizedPnl >= 0;
            const pnlPct = (pos.allocatedBalance && pos.allocatedBalance > 0)
              ? (pos.unrealizedPnl / pos.allocatedBalance) * 100
              : 0;

            const riskDist = Math.abs(pos.entryPrice - pos.sl);
            const targetDist = pos.tp1 ? Math.abs(pos.tp1 - pos.entryPrice) : 0;
            const rr = riskDist > 0 && targetDist > 0 ? (targetDist / riskDist).toFixed(1) : pos.structuralRR?.toFixed(1) || '3.5';

            // Calculate progress towards TP1 vs SL
            let progressPct: number | null = null;
            if (pos.tp1 && pos.sl && pos.entryPrice) {
              const fullRange = Math.abs(pos.tp1 - pos.sl);
              if (fullRange > 0) {
                if (isLong) {
                  progressPct = Math.max(0, Math.min(100, ((pos.currentPrice - pos.sl) / fullRange) * 100));
                } else {
                  progressPct = Math.max(0, Math.min(100, ((pos.sl - pos.currentPrice) / fullRange) * 100));
                }
              }
            }

            return (
              <div
                key={pos.id}
                onClick={() => handleRowClick(pos)}
                className={`bg-[#121721] border rounded-xl p-4 transition-all hover:border-gray-500/50 cursor-pointer shadow-sm relative group overflow-hidden flex flex-col justify-between ${
                  isProfitable 
                    ? 'border-emerald-500/40 hover:shadow-emerald-500/5' 
                    : 'border-rose-500/40 hover:shadow-rose-500/5'
                }`}
              >
                {/* Top Colored Accent Stripe */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${isLong ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                <div>
                  {/* Top Bar: Symbol, Direction, Leverage & Unrealized P&L */}
                  <div className="flex items-start justify-between gap-2 pt-1 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isLong 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isLong ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-100 text-sm tracking-wide">{pos.symbol}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#1A202E] text-gray-300 border border-[#2A3447]">
                            {pos.leverage ? `${pos.leverage}x` : '1x'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[11px] font-bold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos.direction}
                          </span>
                          <span className="text-gray-500 text-[10px]">·</span>
                          <span className="text-gray-400 text-[10px] truncate max-w-[110px]" title={pos.strategy}>
                            {pos.strategy ? pos.strategy.replace(/_/g, ' ') : 'Composite'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Prominent Floating P&L */}
                    <div className="text-right">
                      <div className={`font-mono font-bold text-base tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{currSymbol}{pos.unrealizedPnl.toFixed(2)}
                      </div>
                      <div className={`text-xs font-mono font-semibold tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{pnlPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Metrics Box Grid (2 columns x 3 rows) */}
                  <div className="grid grid-cols-2 gap-2 bg-[#0B0E14] border border-[#1C2433] rounded-lg p-2.5 mb-3 text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-medium">Entry Price</span>
                      <span className="font-mono font-semibold text-gray-200 tabular-nums">${formatPrice(pos.entryPrice)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-medium">Current Mark</span>
                      <span className="font-mono font-bold text-gray-100 tabular-nums">${formatPrice(pos.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-400 flex items-center gap-1 font-medium">
                        <Shield size={10} /> Stop Loss
                      </span>
                      <span className="font-mono text-rose-300 tabular-nums font-semibold">${formatPrice(pos.sl)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-400 flex items-center justify-end gap-1 font-medium">
                        <Target size={10} /> Take Profit (TP1)
                      </span>
                      <span className="font-mono text-emerald-300 tabular-nums font-semibold">${formatPrice(pos.tp1)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-medium">Margin Allocated</span>
                      <span className="font-mono text-gray-300 tabular-nums">{currSymbol}{(pos.allocatedBalance || 0).toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-medium">Risk / Reward</span>
                      <span className="font-mono font-semibold text-sky-400 tabular-nums">1:{rr}</span>
                    </div>
                  </div>

                  {/* Target Progress Bar */}
                  {progressPct !== null && (
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                        <span className="text-rose-400">SL: ${formatPrice(pos.sl)}</span>
                        <span className="text-gray-300 font-sans">Progress: {Math.round(progressPct)}%</span>
                        <span className="text-emerald-400">TP: ${formatPrice(pos.tp1)}</span>
                      </div>
                      <div className="w-full bg-[#1A202E] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            progressPct >= 70 ? 'bg-emerald-400' : progressPct >= 35 ? 'bg-sky-400' : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.max(3, Math.min(100, progressPct))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Box Footer Actions */}
                <div className="flex items-center justify-between pt-2.5 border-t border-[#1C2433] text-[11px] mt-1">
                  <div className="flex items-center gap-1.5 text-gray-400 text-[10px]">
                    <Clock size={12} />
                    <span>{pos.timeOpen ? formatISTDateTime(pos.timeOpen) : 'Active'}</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRowClick(pos)}
                      className="px-2.5 py-1 rounded bg-[#1A202E] hover:bg-[#232B3B] text-gray-300 border border-[#2A3447] text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => onManualClose(pos.id)}
                      className="px-3 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#232B3B] bg-[#0B0E14]/70 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-2.5 px-4">Symbol / Direction</th>
                <th className="py-2.5 px-3 text-right">Entry Price</th>
                <th className="py-2.5 px-3 text-right">Current Mark</th>
                <th className="py-2.5 px-3 text-right">Stop Loss</th>
                <th className="py-2.5 px-3 text-right">Take Profit</th>
                <th className="py-2.5 px-4 text-right">Unrealized P&L</th>
                <th className="py-2.5 px-3 text-center">R:R</th>
                <th className="py-2.5 px-3">Strategy</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2433]">
              {sortedPositions.map((pos) => {
                const isLong = pos.direction === 'LONG';
                const isProfitable = pos.unrealizedPnl >= 0;
                const riskDist = Math.abs(pos.entryPrice - pos.sl);
                const targetDist = pos.tp1 ? Math.abs(pos.tp1 - pos.entryPrice) : 0;
                const rr = riskDist > 0 && targetDist > 0 ? (targetDist / riskDist).toFixed(1) : pos.structuralRR?.toFixed(1) || '3.5';

                return (
                  <tr
                    key={pos.id}
                    onClick={() => handleRowClick(pos)}
                    className="hover:bg-[#1A202E]/60 transition-colors cursor-pointer group"
                  >
                    {/* Symbol & Side */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                          isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {isLong ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        </div>
                        <div>
                          <div className="font-bold text-gray-100 flex items-center gap-1.5">
                            {pos.symbol}
                            <span className="text-[10px] font-normal text-gray-400">
                              {pos.leverage ? `${pos.leverage}x` : '1x'}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos.direction}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Entry Price */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-gray-300">
                      ${formatPrice(pos.entryPrice)}
                    </td>

                    {/* Mark Price */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-gray-100 font-semibold">
                      ${formatPrice(pos.currentPrice)}
                    </td>

                    {/* Stop Loss */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-300">
                      ${formatPrice(pos.sl)}
                    </td>

                    {/* Take Profit 1 */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-300">
                      ${formatPrice(pos.tp1)}
                    </td>

                    {/* P&L */}
                    <td className="py-3 px-4 text-right">
                      <div className={`font-mono font-bold tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{currSymbol}{pos.unrealizedPnl.toFixed(2)}
                      </div>
                      <div className={`text-[10px] font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{(pos.allocatedBalance > 0 ? (pos.unrealizedPnl / pos.allocatedBalance) * 100 : 0).toFixed(2)}%
                      </div>
                    </td>

                    {/* R:R Ratio */}
                    <td className="py-3 px-3 text-center font-mono font-semibold text-sky-400 text-xs">
                      1:{rr}
                    </td>

                    {/* Strategy */}
                    <td className="py-3 px-3 text-gray-300 text-[11px] truncate max-w-[130px]" title={pos.strategy}>
                      {pos.strategy ? pos.strategy.replace(/_/g, ' ') : 'Composite'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onManualClose(pos.id)}
                          className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Close position immediately at current mark"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => handleRowClick(pos)}
                          className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#1F293D] transition-colors"
                          title="Inspect details"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      <TradeDetailDrawer
        trade={selectedTrade}
        isOpen={drawerOpen}
        settings={settings}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTrade(null);
        }}
        onClosePosition={onManualClose}
      />

    </div>
  );
}
