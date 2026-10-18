import React, { useState } from 'react';
import {
  Layers,
  Zap,
  Target,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code,
  Copy,
  Check,
  Activity,
  Droplets,
  Box,
  Compass,
  SlidersHorizontal
} from 'lucide-react';
import { OrderBlockSignal, AppSettings } from '../types';
import { generateOrderBlockPineScript } from '../utils/strategies/orderBlockStrategy';

interface OrderBlockStrategyPanelProps {
  signal: OrderBlockSignal | null | undefined;
  symbol: string;
  settings?: AppSettings;
  onOpenDiagnostic?: () => void;
}

export function OrderBlockStrategyPanel({
  signal,
  symbol,
  settings = {} as AppSettings,
  onOpenDiagnostic
}: OrderBlockStrategyPanelProps) {
  const [copiedPine, setCopiedPine] = useState(false);

  if (!signal) {
    return (
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 text-xs text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box size={16} className="text-purple-400" />
          <span>ORDER BLOCK STRATEGY: No active scan data available for {symbol}</span>
        </div>
      </div>
    );
  }

  const isLong = signal.direction === 'LONG';
  const isTriggered = signal.finalDecision === 'EXECUTE';
  const isWaiting = signal.finalDecision === 'WAIT';
  const isRejected = signal.finalDecision === 'REJECT';

  const handleCopyPine = () => {
    const pine = generateOrderBlockPineScript(settings);
    navigator.clipboard.writeText(pine);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 2500);
  };

  return (
    <div className="bg-[#12161E] border border-purple-500/30 rounded-xl overflow-hidden shadow-lg font-sans">
      {/* Top Banner Header */}
      <div className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
        isTriggered
          ? 'bg-gradient-to-r from-purple-950/60 via-[#161B22] to-emerald-950/40 border-purple-500/40'
          : isWaiting
          ? 'bg-gradient-to-r from-purple-950/40 via-[#161B22] to-amber-950/30 border-purple-500/30'
          : 'bg-[#161B22] border-[#30363D]'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 border border-purple-500/40 rounded-lg text-purple-300">
            <Box size={18} className={isTriggered ? "animate-pulse" : ""} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm text-gray-100 tracking-wide flex items-center gap-1.5">
                <span>ORDER BLOCK STRATEGY</span>
                <span className="text-gray-400 font-mono text-xs">({symbol})</span>
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
                isLong
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}>
                {isLong ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {signal.direction}
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                1:3.5+ R:R Engine
              </span>
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
              <span>Pure Price Action, Liquidity, Displacement & Retest</span>
            </div>
          </div>
        </div>

        {/* Status Pill & Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono border flex items-center gap-1.5 ${
            isTriggered
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm animate-pulse'
              : isWaiting
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          }`}>
            {isTriggered && <CheckCircle2 size={13} className="text-emerald-400" />}
            {isWaiting && <Clock size={13} className="text-amber-400" />}
            {isRejected && <XCircle size={13} className="text-rose-400" />}
            <span>STATUS: {signal.setupStatus}</span>
          </span>

          <button
            type="button"
            onClick={handleCopyPine}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-300 hover:text-white bg-[#0E1117] border border-[#30363D] hover:border-purple-500/50 flex items-center gap-1 transition cursor-pointer"
            title="Copy TradingView Pine Script v6"
          >
            {copiedPine ? <Check size={13} className="text-emerald-400" /> : <Code size={13} />}
            <span>{copiedPine ? 'Copied' : 'Pine v6'}</span>
          </button>

          {onOpenDiagnostic && (
            <button
              type="button"
              onClick={onOpenDiagnostic}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/40 border border-purple-500/40 hover:bg-purple-900/50 flex items-center gap-1 transition cursor-pointer"
              title="Test Order Block live on candle stream"
            >
              <Activity size={13} />
              <span>Diagnostic</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: 6 Pillars of the Setup */}
      <div className="p-4 space-y-4 text-xs">
        {/* Row 1: Core Trade Model Gates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Gate 1: Liquidity Event */}
          <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
            <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Droplets size={11} className="text-cyan-400" /> LIQUIDITY EVENT
              </span>
              <span className={signal.liquidityEvent === 'DETECTED' ? 'text-emerald-400 font-bold' : 'text-gray-500'}>
                {signal.liquidityEvent}
              </span>
            </div>
            <div className="font-mono text-gray-200 text-xs font-bold truncate">
              {signal.liquidityEventType || (signal.liquidityEvent === 'DETECTED' ? 'SWEEP CONFIRMED' : 'Normal Base')}
            </div>
            <div className="text-[10px] text-gray-400 truncate mt-0.5">
              {signal.liquidityLevelPrice ? `Level: $${signal.liquidityLevelPrice.toFixed(4)}` : 'No sweep required'}
            </div>
          </div>

          {/* Gate 2: Displacement */}
          <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
            <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Zap size={11} className="text-amber-400" /> DISPLACEMENT
              </span>
              <span className={signal.displacementValid === 'VALID' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {signal.displacementValid}
              </span>
            </div>
            <div className="font-mono text-gray-200 text-xs font-bold">
              {signal.displacementMagnitudeAtr.toFixed(2)}x ATR
            </div>
            <div className="text-[10px] text-gray-400 truncate mt-0.5">
              Vol: {signal.displacementVolumeRatio.toFixed(1)}x SMA20
            </div>
          </div>

          {/* Gate 3: Market Structure Break (BOS) */}
          <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
            <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Compass size={11} className="text-indigo-400" /> STRUCTURE BREAK
              </span>
              <span className={signal.structureBreakValid === 'VALID' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {signal.structureBreakValid}
              </span>
            </div>
            <div className="font-mono text-gray-200 text-xs font-bold">
              BOS Confirmed
            </div>
            <div className="text-[10px] text-gray-400 truncate mt-0.5">
              Level: {signal.structureBreakLevel ? `$${signal.structureBreakLevel.toFixed(4)}` : 'Structural Pivot'}
            </div>
          </div>

          {/* Gate 4: Order Block Freshness */}
          <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg">
            <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Box size={11} className="text-purple-400" /> OB FRESHNESS
              </span>
              <span className={signal.obFreshness === 'FRESH' ? 'text-emerald-400 font-bold' : signal.obFreshness === 'TESTED' ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>
                {signal.obFreshness}
              </span>
            </div>
            <div className="font-mono text-gray-200 text-xs font-bold">
              Touches: {signal.obTouchCount} (Clean)
            </div>
            <div className="text-[10px] text-gray-400 truncate mt-0.5">
              Type: {signal.obType}
            </div>
          </div>
        </div>

        {/* Row 2: Active OB Zone & Geometry */}
        <div className="p-3 bg-[#0E1117] border border-[#30363D] rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs border-b border-[#30363D]/60 pb-2">
            <span className="text-gray-400 font-semibold flex items-center gap-1.5">
              <Layers size={13} className="text-purple-400" /> ACTIVE ORDER BLOCK ZONE
            </span>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-gray-400">High: <strong className="text-gray-200">${signal.obHigh.toFixed(4)}</strong></span>
              <span className="text-purple-300">50% Mid: <strong>${signal.obMidpoint.toFixed(4)}</strong></span>
              <span className="text-gray-400">Low: <strong className="text-gray-200">${signal.obLow.toFixed(4)}</strong></span>
            </div>
          </div>

          {/* Retest status banner */}
          <div className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-[11px]">Fast Reaction:</span>
              <span className="font-mono font-bold text-gray-200 text-[11px] px-2 py-0.5 rounded bg-purple-950/30 border border-purple-500/30">
                {signal.fastReactionType || 'MONITORING ZONE'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-[11px]">Chasing Check:</span>
              <span className={`font-mono text-[11px] font-bold ${signal.isChasing ? 'text-rose-400' : 'text-emerald-400'}`}>
                {signal.isChasing ? 'CHASED (>0.8 ATR)' : 'DISCIPLINED (No Chasing)'}
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Risk Geometry (Entry, SL, TP, Hard 1:3.5+ RR) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#161B22] p-3 rounded-xl border border-[#30363D]">
          {/* Entry */}
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Planned Entry</span>
            <div className="font-mono font-bold text-sm text-gray-100">
              ${signal.entryPrice.toFixed(4)}
            </div>
            <span className="text-[10px] text-gray-500">Zone Retest Level</span>
          </div>

          {/* Logical SL */}
          <div className="space-y-1">
            <span className="text-[10px] text-rose-400 uppercase font-semibold flex items-center gap-1">
              <ShieldAlert size={11} /> Logical Stop Loss
            </span>
            <div className="font-mono font-bold text-sm text-rose-300">
              ${signal.stopLossPrice.toFixed(4)}
            </div>
            <span className="text-[10px] text-gray-400 font-mono">
              Risk: {signal.slDistancePct.toFixed(2)}% (Tight)
            </span>
          </div>

          {/* Realistic TP */}
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-400 uppercase font-semibold flex items-center gap-1">
              <Target size={11} /> Realistic Target (TP)
            </span>
            <div className="font-mono font-bold text-sm text-emerald-300">
              ${signal.targetPrice.toFixed(4)}
            </div>
            <span className="text-[10px] text-gray-400 font-mono truncate block" title="Major opposing liquidity pool">
              Opposing Liquidity
            </span>
          </div>

          {/* Hard 1:3.5+ Risk/Reward Ratio */}
          <div className="space-y-1 bg-[#0E1117] p-2 rounded-lg border border-[#30363D]">
            <span className="text-[10px] text-purple-300 uppercase font-bold flex items-center justify-between">
              <span>Risk / Reward</span>
              <span className="text-[9px] text-gray-400 font-normal">Min 1:3.5</span>
            </span>
            <div className={`font-mono font-extrabold text-base ${
              signal.riskRewardRatio >= 3.5 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              1 : {signal.riskRewardRatio.toFixed(2)}
            </div>
            <div className="text-[10px] font-mono font-semibold text-gray-400">
              {signal.riskRewardRatio >= 3.5 ? '✓ Target Valid (>= 3.5)' : '✗ Below 3.5 Threshold'}
            </div>
          </div>
        </div>

        {/* Row 4: Regime Context & Rejection Reason Banner */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400 px-1">
            <div className="flex items-center gap-2">
              <span>BTC Market Regime:</span>
              <strong className="text-gray-200">{signal.marketRegime}</strong>
              <span className="text-gray-500">({signal.marketRegimeReason})</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Coin Regime:</span>
              <strong className="text-gray-200">{signal.coinRegime}</strong>
            </div>
          </div>

          {/* Exact Rejection Callout if any */}
          {signal.exactRejectionReason && (
            <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-mono text-xs uppercase tracking-wide">
                  REJECTED: {signal.exactRejectionReason}
                </strong>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {signal.rejectionReason || signal.reason}
                </p>
              </div>
            </div>
          )}

          {/* Valid Explanation */}
          {!signal.exactRejectionReason && signal.explanation && (
            <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-start gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-gray-200 leading-relaxed">
                {signal.explanation}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderBlockStrategyPanel;
