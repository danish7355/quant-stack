import React from 'react';
import { X, TrendingUp, TrendingDown, Target, Shield, Clock, DollarSign, Layers, Activity, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Position, TradeLog, AppSettings } from '../../types';
import { formatPrice, formatISTDateTime, getCurrencySymbol } from '../../utils/format';

interface TradeDetailDrawerProps {
  trade: (Position | TradeLog) | null;
  isOpen: boolean;
  onClose: () => void;
  onClosePosition?: (id: string) => void;
  settings?: AppSettings;
}

export function TradeDetailDrawer({ trade, isOpen, onClose, onClosePosition, settings }: TradeDetailDrawerProps) {
  if (!isOpen || !trade) return null;

  const currSymbol = getCurrencySymbol(settings);
  const isPosition = 'unrealizedPnl' in trade;
  const isLong = trade.direction === 'LONG';
  const pnl = isPosition ? (trade as Position).unrealizedPnl : (trade as TradeLog).profit;
  const pnlPct = isPosition 
    ? ((trade as Position).allocatedBalance > 0 ? ((trade as Position).unrealizedPnl / (trade as Position).allocatedBalance) * 100 : 0)
    : ((trade as TradeLog).pctReturn ?? 0);
  const isProfitable = pnl >= 0;

  const entryPrice = trade.entryPrice;
  const currentOrExitPrice = isPosition ? (trade as Position).currentPrice : (trade as TradeLog).closePrice;
  const sl = isPosition ? (trade as Position).sl : (trade as any).stopLoss || (trade as any).sl;
  const tp1 = isPosition ? (trade as Position).tp1 : (trade as any).takeProfit || (trade as any).tp1;
  const tp2 = isPosition ? (trade as Position).tp2 : undefined;
  const tp3 = isPosition ? (trade as Position).tp3 : undefined;
  const strategy = (trade as any).strategy || 'Standard';
  const marketRegime = (trade as any).marketRegime || 'Normal';

  // Risk & Reward calculation
  const riskAmount = sl ? Math.abs(entryPrice - sl) : 0;
  const targetDistance = tp1 ? Math.abs(tp1 - entryPrice) : 0;
  const calculatedRR = riskAmount > 0 && targetDistance > 0 ? (targetDistance / riskAmount).toFixed(1) : (trade as any).structuralRR?.toFixed(1) || '—';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-md bg-[#121721] border-l border-[#232B3B] h-full shadow-2xl flex flex-col z-10 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-[#232B3B] bg-[#0E131C] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
              isLong ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
            }`}>
              {isLong ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-100">{trade.symbol}</h3>
                <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                  isLong ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {trade.direction}
                </span>
                <span className="text-[10px] text-gray-400">
                  {trade.leverage ? `${trade.leverage}x` : '1x'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isPosition ? 'Active Open Position' : `Closed Trade · ${(trade as TradeLog).exitReason || (trade as TradeLog).outcome || 'CLOSED'}`}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-[#1A202E] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* P&L Highlight Box */}
          <div className={`p-4 rounded-xl border ${
            isProfitable 
              ? 'bg-emerald-500/10 border-emerald-500/20' 
              : 'bg-rose-500/10 border-rose-500/20'
          }`}>
            <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
              {isPosition ? 'Unrealized P&L' : 'Net Realized P&L'}
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-2xl font-bold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfitable ? '+' : ''}{currSymbol}{pnl.toFixed(2)}
              </span>
              <span className={`text-sm font-semibold font-mono tabular-nums ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfitable ? '+' : ''}{pnlPct.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="bg-[#0B0E14] border border-[#232B3B] rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Execution Coordinates
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">Entry Price</span>
              <span className="font-mono text-gray-200 font-semibold">${formatPrice(entryPrice)}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">{isPosition ? 'Current Mark' : 'Exit Price'}</span>
              <span className="font-mono text-gray-200 font-semibold">${formatPrice(currentOrExitPrice)}</span>
            </div>

            {sl && (
              <div className="flex justify-between py-1 border-b border-[#1E2638]">
                <span className="text-rose-400/90 flex items-center gap-1">
                  <Shield size={12} /> Stop Loss
                </span>
                <span className="font-mono text-rose-300 font-semibold">${formatPrice(sl)}</span>
              </div>
            )}

            {tp1 && (
              <div className="flex justify-between py-1 border-b border-[#1E2638]">
                <span className="text-emerald-400/90 flex items-center gap-1">
                  <Target size={12} /> Take Profit (TP1)
                </span>
                <span className="font-mono text-emerald-300 font-semibold">${formatPrice(tp1)}</span>
              </div>
            )}

            {tp2 && (
              <div className="flex justify-between py-1 border-b border-[#1E2638]">
                <span className="text-emerald-400/70">Take Profit 2</span>
                <span className="font-mono text-emerald-300">${formatPrice(tp2)}</span>
              </div>
            )}

            {tp3 && (
              <div className="flex justify-between py-1 border-b border-[#1E2638]">
                <span className="text-emerald-400/70">Take Profit 3 (Runner)</span>
                <span className="font-mono text-emerald-300">${formatPrice(tp3)}</span>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <span className="text-gray-400">Target Risk/Reward</span>
              <span className="font-mono text-sky-400 font-bold">{calculatedRR !== '—' ? `1:${calculatedRR}` : '1:3.0+'}</span>
            </div>
          </div>

          {/* Sizing & Capital */}
          <div className="bg-[#0B0E14] border border-[#232B3B] rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Position Sizing & Risk
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">Position Margin</span>
              <span className="font-mono text-gray-200">{currSymbol}{(trade as any).allocatedBalance ? (trade as any).allocatedBalance.toFixed(2) : '—'}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">Quantity</span>
              <span className="font-mono text-gray-200">{(trade as any).quantity ? (trade as any).quantity.toFixed(4) : '—'} {trade.symbol.replace('USDT', '')}</span>
            </div>

            {isPosition && (trade as any).liquidationPrice && (
              <div className="flex justify-between py-1 border-b border-[#1E2638]">
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle size={12} /> Est. Liquidation
                </span>
                <span className="font-mono text-amber-300 font-semibold">${formatPrice((trade as any).liquidationPrice!)}</span>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <span className="text-gray-400">Effective Leverage</span>
              <span className="font-mono text-gray-200">{trade.leverage ? `${trade.leverage}x isolated` : '1x cross'}</span>
            </div>
          </div>

          {/* Strategy & Market Context */}
          <div className="bg-[#0B0E14] border border-[#232B3B] rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Strategy & Market Context
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">Detection Strategy</span>
              <span className="font-medium text-gray-200">{strategy.replace(/_/g, ' ')}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#1E2638]">
              <span className="text-gray-400">Market Regime</span>
              <span className="font-medium text-gray-200">{marketRegime}</span>
            </div>

            <div className="flex justify-between pt-1">
              <span className="text-gray-400">Entry Timestamp</span>
              <span className="font-mono text-gray-300 text-[11px]">{trade.timeOpen ? formatISTDateTime(trade.timeOpen) : (trade as any).timestampMs ? formatISTDateTime((trade as any).timestampMs) : '—'}</span>
            </div>

            {!isPosition && (trade as TradeLog).timeClose && (
              <div className="flex justify-between pt-1 border-t border-[#1E2638]">
                <span className="text-gray-400">Exit Timestamp</span>
                <span className="font-mono text-gray-300 text-[11px]">{formatISTDateTime((trade as TradeLog).timeClose)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        {isPosition && onClosePosition && (
          <div className="p-4 border-t border-[#232B3B] bg-[#0E131C]">
            <button
              onClick={() => {
                onClosePosition(trade.id);
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              Emergency Close Position
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
