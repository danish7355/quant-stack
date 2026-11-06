import React, { useState } from 'react';
import { TradeLog } from '../../types';
import { Clock, ArrowUpRight, ArrowDownRight, ChevronRight, Activity } from 'lucide-react';
import { formatPrice, formatISTDateTime } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';
import { TradeDetailDrawer } from '../common/TradeDetailDrawer';

interface RecentTradesWidgetProps {
  logs: TradeLog[];
  onSelectTrade?: (trade: TradeLog) => void;
  onNavigateToHistory?: () => void;
}

export function RecentTradesWidget({ logs, onSelectTrade, onNavigateToHistory }: RecentTradesWidgetProps) {
  const [selectedTrade, setSelectedTrade] = useState<TradeLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleRowClick = (trade: TradeLog) => {
    setSelectedTrade(trade);
    setDrawerOpen(true);
    onSelectTrade?.(trade);
  };

  const recent = logs.slice(0, 7);

  return (
    <div className="bg-[#121721] border border-[#232B3B] rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-[#232B3B] bg-[#0E131C] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-sky-400" />
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
            Recent Executed Trades
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1A202E] text-gray-300 border border-[#2A3447]">
            {logs.length}
          </span>
        </div>

        {onNavigateToHistory && logs.length > 0 && (
          <button
            onClick={onNavigateToHistory}
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            Full Journal <ChevronRight size={13} />
          </button>
        )}
      </div>

      {/* Content */}
      {recent.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No Executed Trades Yet"
          description="When market conditions satisfy strategy rules and risk gates, executed trades will appear here."
          className="border-none rounded-none py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#232B3B] bg-[#0B0E14]/70 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-3">Symbol / Side</th>
                <th className="py-2.5 px-3">Strategy</th>
                <th className="py-2.5 px-3 text-right">Entry</th>
                <th className="py-2.5 px-3 text-right">Exit</th>
                <th className="py-2.5 px-3 text-right">Net P&L</th>
                <th className="py-2.5 px-4 text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2433]">
              {recent.map((trade, idx) => {
                const isLong = trade.direction === 'LONG';
                const isProfitable = trade.profit >= 0;
                const strat = (trade as any).strategy || 'Standard';

                return (
                  <tr
                    key={`recent-trade-${trade.id || 'tr'}-${trade.timeClose || trade.timeOpen || idx}-${idx}`}
                    onClick={() => handleRowClick(trade)}
                    className="hover:bg-[#1A202E]/60 transition-colors cursor-pointer group"
                  >
                    {/* Time */}
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                      {trade.timeClose ? formatISTDateTime(trade.timeClose).split(' ')[1] : formatISTDateTime(trade.timeOpen).split(' ')[1]}
                    </td>

                    {/* Symbol / Side */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                          isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {isLong ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        </div>
                        <div>
                          <span className="font-bold text-gray-100">{trade.symbol}</span>
                          <span className={`block text-[10px] font-semibold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {trade.direction}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Strategy */}
                    <td className="py-3 px-3 text-gray-300 text-[11px] max-w-[140px] truncate" title={strat}>
                      {strat.replace(/_/g, ' ')}
                    </td>

                    {/* Entry Price */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-gray-300">
                      ${formatPrice(trade.entryPrice)}
                    </td>

                    {/* Exit Price */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-gray-100">
                      ${formatPrice(trade.closePrice)}
                    </td>

                    {/* P&L */}
                    <td className="py-3 px-3 text-right">
                      <span className={`font-mono font-bold tabular-nums block ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}${trade.profit.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}{(trade.pctReturn ?? 0).toFixed(2)}%
                      </span>
                    </td>

                    {/* Result */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                        isProfitable 
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}>
                        {trade.exitReason || trade.outcome || (isProfitable ? 'WIN' : 'LOSS')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Trade Detail Drawer */}
      <TradeDetailDrawer
        trade={selectedTrade}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
