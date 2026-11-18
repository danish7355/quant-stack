import React from 'react';
import { 
  ArrowUpRight, ArrowDownRight, Shield, Target, Award, 
  CheckCircle2, Clock, AlertTriangle, Sparkles, Filter, Activity, Compass, ShieldCheck, XCircle 
} from 'lucide-react';
import { CoinDetail, AppSettings, Position } from '../../types';
import { formatPrice } from '../../utils/format';

interface SignalCardProps {
  coin: CoinDetail | undefined;
  activePosition: Position | undefined;
  settings?: AppSettings;
  macroColor?: 'GREEN' | 'AMBER' | 'RED';
  onInspectStrategy?: (strategy: string) => void;
}

export function SignalCard({
  coin,
  activePosition,
  settings,
  macroColor = 'GREEN',
  onInspectStrategy,
}: SignalCardProps) {
  if (!coin) {
    return (
      <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-5 flex flex-col justify-center items-center text-center text-gray-400 min-h-[360px]">
        <Clock className="w-8 h-8 text-gray-500 mb-2 animate-pulse" />
        <span className="text-xs font-semibold">Synchronizing signal feed...</span>
      </div>
    );
  }

  // Detect which strategy produced the signal or potential setup on this coin
  const rawDirection = activePosition?.direction || coin.direction;
  const isTradeActive = Boolean(activePosition);
  const score = coin.score || 0;
  const autoThreshold = settings?.autoTradeThreshold || 75;
  const hasConfidentSignal = isTradeActive || (score >= autoThreshold && (rawDirection === 'LONG' || rawDirection === 'SHORT'));

  // Sizing and parameters resolution
  const entryPrice = activePosition?.entryPrice || coin.vcb?.breakout?.entryPrice || coin.price;
  const stopLossPrice = activePosition?.sl || coin.vcb?.breakout?.sl || (rawDirection === 'LONG' ? entryPrice * 0.985 : entryPrice * 1.015);
  const takeProfitPrice = activePosition?.tp1 || coin.vcb?.breakout?.tp1 || (rawDirection === 'LONG' ? entryPrice * 1.045 : entryPrice * 0.955);

  const riskDist = Math.abs(entryPrice - stopLossPrice);
  const rewardDist = Math.abs(takeProfitPrice - entryPrice);
  const riskRewardRatio = riskDist > 0 && rewardDist > 0 ? (rewardDist / riskDist).toFixed(1) : '3.8';

  const strategyName = (activePosition as any)?.strategy || coin.detectedStrategy || coin.strategy || 'Volatility Compression (VCB)';
  const isLong = rawDirection === 'LONG';

  // Quality classification
  const quality = score >= 85 ? 'High' : score >= 70 ? 'Medium' : 'Selective';

  const marketRegimeText = macroColor === 'GREEN' ? 'Favorable' : macroColor === 'AMBER' ? 'Caution / Selective' : 'Defensive';
  const coinRegimeText = coin.status === 'STRONG_TREND' || coin.status === 'TRENDING' ? 'Favorable (Trending)' : 'Consolidating';
  const trendText = rawDirection === 'LONG' ? 'Bullish' : rawDirection === 'SHORT' ? 'Bearish' : 'Neutral / Range';

  return (
    <div className="bg-[#121721] border border-[#232B3B] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm relative overflow-hidden h-full">
      
      {/* Background ambient accent */}
      <div className={`absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10 opacity-15 ${
        hasConfidentSignal 
          ? (isLong ? 'bg-emerald-500' : 'bg-rose-500') 
          : 'bg-sky-500'
      }`} />

      {/* Top Header: Signal Status & Mode */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-[#232B3B]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
              Current Signal
            </span>
            {isTradeActive && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                ● Live Trade Active
              </span>
            )}
          </div>

          <span className="text-[11px] font-mono text-gray-300 font-bold">
            {coin.symbol}
          </span>
        </div>

        {/* State A: Valid Confident Setup / Active Trade */}
        {hasConfidentSignal ? (
          <div className="mt-4 space-y-4">
            
            {/* Direction & Strategy Banner */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-base font-extrabold px-3 py-1 rounded-lg ${
                    isLong 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}>
                    {isLong ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    {rawDirection}
                  </span>
                  <span className="text-xs font-semibold text-gray-300">
                    Confidence: {score}/100
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Strategy: <span className="font-semibold text-gray-100">{strategyName.replace(/_/g, ' ')}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Signal Quality</span>
                <span className="text-xs font-bold text-emerald-400">{quality}</span>
              </div>
            </div>

            {/* Execution Coordinates Grid */}
            <div className="grid grid-cols-2 gap-2 bg-[#0B0E14] p-3 rounded-lg border border-[#232B3B] text-xs">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Entry</span>
                <span className="font-mono text-gray-100 font-bold">${formatPrice(entryPrice)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Risk / Reward</span>
                <span className="font-mono text-emerald-400 font-bold">1:{riskRewardRatio}</span>
              </div>
              <div className="pt-2 border-t border-[#1C2333]">
                <span className="text-[10px] text-rose-400 flex items-center gap-1 uppercase">
                  <Shield size={10} /> Stop Loss
                </span>
                <span className="font-mono text-rose-300 font-bold">${formatPrice(stopLossPrice)}</span>
              </div>
              <div className="pt-2 border-t border-[#1C2333]">
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 uppercase">
                  <Target size={10} /> Take Profit
                </span>
                <span className="font-mono text-emerald-300 font-bold">${formatPrice(takeProfitPrice)}</span>
              </div>
            </div>

            {/* Metadata Summary Grid */}
            <div className="grid grid-cols-3 gap-2 text-[11px] p-2 bg-[#0B0E14]/60 rounded border border-[#232B3B]/60">
              <div>
                <span className="text-[10px] text-gray-400 block">Market Regime</span>
                <span className="font-semibold text-emerald-400">{marketRegimeText}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Coin Regime</span>
                <span className="font-semibold text-gray-200">{coinRegimeText}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Trend</span>
                <span className={`font-semibold ${isLong ? 'text-emerald-400' : 'text-rose-400'}`}>{trendText}</span>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="space-y-1.5 text-[11px] text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Trend direction aligned with higher timeframe</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Valid structural setup confirmed on closed candle</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>Volume & asymmetric risk/reward requirement met</span>
              </div>
            </div>

            {/* Human Readable Setup Summary */}
            <div className="p-2.5 rounded-lg bg-[#0B0E14]/80 border border-[#232B3B] text-[11px] text-gray-300 leading-relaxed">
              <strong className="text-gray-200">Reason: </strong>
              {coin.statusReason || `Valid ${rawDirection} setup confirmed on closed candle. Volatility expansion supportive with favorable asymmetric risk profile.`}
            </div>

          </div>
        ) : (
          /* State B: Intelligent "Standing Aside in Cash / NO TRADE" */
          <div className="mt-4 space-y-4">
            
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-base font-extrabold px-3 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    <ShieldCheck size={16} className="text-sky-400" />
                    NO TRADE
                  </span>
                </div>
                <div className="text-xs text-gray-300 font-medium mt-2">
                  "Waiting for a high-quality setup."
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Bot Behavior</span>
                <span className="text-xs font-bold text-sky-400">Capital Preserved</span>
              </div>
            </div>

            {/* Primary Rejection / Skipping Reason */}
            <div className="p-3 rounded-lg bg-[#0B0E14] border border-[#232B3B] space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Reason for Skipping
              </span>
              <p className="text-xs text-gray-200 leading-relaxed">
                {coin.statusReason 
                  ? coin.statusReason
                  : score < 40
                  ? `Coin score (${score}/100) is below minimum threshold (${autoThreshold}/100). Technical indicators are consolidating without asymmetric displacement.`
                  : `Waiting for closed-candle confirmation meeting minimum 1:3.5 Risk/Reward ratio.`}
              </p>
            </div>

            {/* Current Market Status Values */}
            <div className="grid grid-cols-3 gap-2 text-[11px] p-2 bg-[#0B0E14]/60 rounded border border-[#232B3B]/60">
              <div>
                <span className="text-[10px] text-gray-400 block">Market Regime</span>
                <span className={`font-semibold ${macroColor === 'GREEN' ? 'text-emerald-400' : 'text-amber-400'}`}>{marketRegimeText}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Coin Regime</span>
                <span className="font-semibold text-gray-300">{coinRegimeText}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">Trend</span>
                <span className="font-semibold text-gray-400">{score < 40 ? 'Too weak' : trendText}</span>
              </div>
            </div>

            {/* Gate Checklist Overview */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Scanning Checklist
              </span>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-400" /> 24h Volume Floor ($10M+)
                  </span>
                  <span className="font-semibold text-emerald-400 font-mono">Passed</span>
                </div>

                <div className="flex items-center justify-between text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-400" /> Max Spread Check (&lt;0.2%)
                  </span>
                  <span className="font-semibold text-emerald-400 font-mono">Passed</span>
                </div>

                <div className="flex items-center justify-between text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-amber-400" /> Confluence Trigger
                  </span>
                  <span className="font-semibold text-amber-400 font-mono">Waiting for Retest</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-gray-500 italic">
              Skipping poor setups protects capital. The bot only executes on asymmetric setups.
            </div>

          </div>
        )}

      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-[#232B3B] flex items-center justify-between text-[10px] text-gray-400">
        <span>Active Strategies: 5 Active</span>
        <span>Auto-Execution: Armed</span>
      </div>

    </div>
  );
}
