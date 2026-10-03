import React, { useEffect, useState, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, X, ExternalLink, LineChart, 
  Volume2, VolumeX, ShieldCheck, Target, ArrowUpRight, ArrowDownRight, Zap 
} from 'lucide-react';
import { formatPrice } from '../utils/format';
import { playTradeExecutedSound, loadAudioSettings } from '../utils/audioNotification';

export interface ExecutedTradeNotice {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity?: number;
  allocatedBalance?: number;
  leverage?: number;
  strategy?: string;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  score?: number;
  timestamp: number;
  marketRegime?: string;
}

interface Props {
  notices: ExecutedTradeNotice[];
  onDismiss: (id: string) => void;
  onViewPosition?: (id: string, symbol: string) => void;
  onInspectChart?: (symbol: string) => void;
}

export const TradeExecutionPopup: React.FC<Props> = ({
  notices,
  onDismiss,
  onViewPosition,
  onInspectChart,
}) => {
  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none">
      {notices.map((trade) => (
        <TradePopupCard
          key={trade.id}
          trade={trade}
          onDismiss={() => onDismiss(trade.id)}
          onViewPosition={() => onViewPosition?.(trade.id, trade.symbol)}
          onInspectChart={() => onInspectChart?.(trade.symbol)}
        />
      ))}
    </div>
  );
};

const TradePopupCard: React.FC<{
  trade: ExecutedTradeNotice;
  onDismiss: () => void;
  onViewPosition: () => void;
  onInspectChart: () => void;
}> = ({ trade, onDismiss, onViewPosition, onInspectChart }) => {
  const [timeLeft, setTimeLeft] = useState(10); // 10 seconds auto-dismiss
  const [isPaused, setIsPaused] = useState(false);
  const isLong = trade.direction === 'LONG';
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Strategy display name & badge color
  const getStrategyMeta = (strat?: string) => {
    switch (strat) {
      case 'ORDER_BLOCK':
        return { label: '🧱 Order Block (1:3.5+)', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'RANGE_REGIME_V1':
      case 'RANGE_REGIME':
        return { label: '📊 Range Regime V1', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
      case 'VCB':
      case 'VOLATILITY_COMPRESSION':
      case 'COIL_BREAKOUT':
      case 'EARLY_COIL_BREAKOUT':
        return { label: '🌀 Volatility Compression Breakout (VCB)', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'LIQUIDITY_SWEEP_REVERSAL':
        return { label: '💧 Liquidity Sweep Reversal (LSR)', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
      case 'SMC_LIQUIDITY':
      case 'SMC_LIQUIDITY_SWEEP':
        return { label: '🌊 SMC Liquidity Sweep', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
      case 'TREND_PULLBACK':
        return { label: '📈 Trend-Pullback (EMA)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'MULTICOIN_SCALPER_PRO':
        return { label: '⚡ Scalper PRO', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      case 'DELTA_CLIMAX':
        return { label: '💥 Delta Exhaustion Climax', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
      default:
        return { label: '🎯 High-Probability Setup', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
    }
  };

  const stratMeta = getStrategyMeta(trade.strategy);

  // Compute R:R if SL and TP1 are available
  let riskRewardRatio = '';
  if (trade.sl && trade.tp1 && trade.entryPrice) {
    const risk = Math.abs(trade.entryPrice - trade.sl);
    const reward = Math.abs(trade.tp1 - trade.entryPrice);
    if (risk > 0) {
      const rr = reward / risk;
      riskRewardRatio = `1:${rr.toFixed(1)}`;
    }
  }

  // Auto-dismiss countdown tick
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Safe dismiss callback triggered after render commit when countdown reaches zero
  useEffect(() => {
    if (timeLeft === 0) {
      onDismissRef.current();
    }
  }, [timeLeft]);

  const replayNotificationSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTradeExecutedSound(trade.direction);
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-4 ${
        isLong
          ? 'bg-[#0f1d18]/95 border-emerald-500/60 shadow-[0_0_25px_rgba(16,185,129,0.35)]'
          : 'bg-[#201016]/95 border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
      }`}
    >
      {/* Top countdown progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-black/40">
        <div
          style={{ 
            width: isPaused ? `${(timeLeft / 10) * 100}%` : `${(timeLeft / 10) * 100}%`,
            transition: 'width 1s linear'
          }}
          className={`h-full ${isLong ? 'bg-emerald-400' : 'bg-rose-400'}`}
        />
      </div>

      <div className="p-4 pt-3.5">
        {/* Header line: Title + Sound indicator + Close */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isLong ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isLong ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </span>
            <span className="text-[11px] font-extrabold tracking-wider uppercase text-gray-200 flex items-center gap-1.5">
              <Zap size={13} className={isLong ? 'text-emerald-400' : 'text-rose-400'} />
              ORDER FILLED & EXECUTED
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={replayNotificationSound}
              title="Replay Audio Chime"
              className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-white/10 transition-colors"
            >
              <Volume2 size={14} className={isLong ? 'text-emerald-400' : 'text-rose-400'} />
            </button>
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-white/10 transition-colors"
              title="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Main Trade Identity */}
        <div className="flex items-center justify-between mb-3 bg-black/30 p-2.5 rounded-lg border border-white/5">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 border ${
                isLong
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              }`}
            >
              {isLong ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-gray-100 tracking-tight">
                  {trade.symbol}
                </span>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded tracking-wide ${
                    isLong
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                      : 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                  }`}
                >
                  {trade.direction} {trade.leverage ? `${trade.leverage}X` : '1X'}
                </span>
              </div>
              <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                Entry: <span className="font-semibold text-gray-200">{formatPrice(trade.entryPrice)}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded border inline-block ${stratMeta.color}`}
            >
              {stratMeta.label}
            </span>
            {riskRewardRatio && (
              <div className="text-[10px] text-gray-400 font-mono mt-1">
                Target R:R <span className="text-emerald-400 font-bold">{riskRewardRatio}</span>
              </div>
            )}
          </div>
        </div>

        {/* Key Levels HUD */}
        {(trade.sl || trade.tp1) && (
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs font-mono">
            {trade.sl && (
              <div className="bg-black/20 border border-white/5 rounded p-1.5 px-2">
                <div className="text-[9px] text-rose-400/80 font-bold flex items-center gap-1">
                  <ShieldCheck size={11} /> STOP LOSS
                </div>
                <div className="font-semibold text-rose-300">{formatPrice(trade.sl)}</div>
              </div>
            )}
            {trade.tp1 && (
              <div className="bg-black/20 border border-white/5 rounded p-1.5 px-2">
                <div className="text-[9px] text-emerald-400/80 font-bold flex items-center gap-1">
                  <Target size={11} /> TAKE PROFIT 1
                </div>
                <div className="font-semibold text-emerald-300">{formatPrice(trade.tp1)}</div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onViewPosition}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              isLong
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40'
            }`}
          >
            <ExternalLink size={13} />
            View Position
          </button>
          <button
            onClick={onInspectChart}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
          >
            <LineChart size={13} />
            Inspect Chart
          </button>
        </div>
      </div>
    </div>
  );
};
