import React, { useState } from 'react';
import { 
  AlertOctagon, 
  Play, 
  RotateCcw, 
  ShieldAlert, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  ExternalLink,
  Lock,
  Wifi,
  KeyRound,
  Eye
} from 'lucide-react';
import { ExecutionStatus, ExecutionGuardrail } from '../types.js';

interface Props {
  status?: ExecutionStatus | null;
  engineRunning: boolean;
  onStartEngine: () => void;
  onActivateBothStrategies: () => void;
  onResetCircuitBreaker: () => void;
  onDeactivateKillSwitch: () => void;
  onNavigateTab: (tabId: string) => void;
  onOpenStrategyChecker?: () => void;
}

export function ExecutionGuardBanner({
  status,
  engineRunning,
  onStartEngine,
  onActivateBothStrategies,
  onResetCircuitBreaker,
  onDeactivateKillSwitch,
  onNavigateTab,
  onOpenStrategyChecker
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // If no server status yet, derive fallback from engineRunning
  const isBlocked = status ? status.blocked : !engineRunning;
  const reason = status?.reason || (!engineRunning ? 'Trading Engine is stopped. Autonomous scanning and order placements are paused.' : null);
  const code = status?.code || (!engineRunning ? 'ENGINE_STATUS' : 'OK');
  const actionType = status?.actionType || (!engineRunning ? 'START_ENGINE' : 'NONE');
  const guardrails = status?.guardrails || [];

  if (!isBlocked && !expanded) {
    const activeList = status?.summary?.activeStrategies || [];
    const formatName = (s: string) => {
      if (s === 'COIL_BREAKOUT' || s === 'VCB' || s === 'VOLATILITY_COMPRESSION') return 'VCB Breakout';
      if (s === 'LIQUIDITY_SWEEP_REVERSAL') return 'LSR';
      if (s === 'MULTICOIN_SCALPER_PRO') return 'Scalper PRO';
      if (s === 'TREND_PULLBACK') return 'Trend Pullback';
      if (s === 'ORDER_BLOCK') return 'Order Block';
      if (s === 'RANGE_REGIME_V1' || s === 'RANGE_REGIME') return 'Range Regime V1';
      return s.replace(/_/g, ' ');
    };
    const stratText = activeList.length >= 2
      ? `${activeList.length} Strategies Active (${activeList.map(formatName).join(', ')})`
      : activeList.length === 1
      ? `${formatName(activeList[0])} Active`
      : 'Portfolio Active';

    const dirText = status?.summary?.recommendedDirection
      ? `${status.summary.recommendedDirection} ONLY`
      : null;

    // Subtle, calm status bar when everything is active & passing
    return (
      <div className="bg-emerald-950/20 border-b border-emerald-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-emerald-300">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold tracking-wide text-[11px]">
            EXECUTION STATUS: <strong>ARMED & ACTIVE</strong> ({stratText})
          </span>
          {dirText && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
              REGIME DIRECTION: {dirText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onOpenStrategyChecker && (
            <button
              onClick={onOpenStrategyChecker}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium cursor-pointer transition"
            >
              <Eye size={12} /> Check Strategy Health
            </button>
          )}
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 transition"
          >
            <span>{guardrails.length || 10} Safety Guardrails</span>
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Determine button label and click action based on actionType
  const renderActionButton = () => {
    switch (actionType) {
      case 'START_ENGINE':
        return (
          <button
            id="guard-banner-start-engine-btn"
            onClick={onStartEngine}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-black font-bold rounded text-xs hover:bg-emerald-400 transition shadow-sm cursor-pointer shrink-0"
          >
            <Play size={14} fill="currentColor" />
            <span>START ENGINE</span>
          </button>
        );
      case 'ACTIVATE_STRATEGIES':
        return (
          <button
            id="guard-banner-activate-strats-btn"
            onClick={() => onNavigateTab('strategies')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white font-bold rounded text-xs hover:bg-indigo-400 transition shadow-sm cursor-pointer shrink-0"
          >
            <Layers size={14} />
            <span>MANAGE STRATEGIES</span>
          </button>
        );
      case 'RESET_CIRCUIT_BREAKER':
        return (
          <button
            id="guard-banner-reset-breaker-btn"
            onClick={onResetCircuitBreaker}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-black font-bold rounded text-xs hover:bg-amber-400 transition shadow-sm cursor-pointer shrink-0"
          >
            <RotateCcw size={14} />
            <span>RESET BREAKER</span>
          </button>
        );
      case 'RESET_KILL_SWITCH':
        return (
          <button
            id="guard-banner-disarm-killswitch-btn"
            onClick={onDeactivateKillSwitch}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white font-bold rounded text-xs hover:bg-rose-400 transition shadow-sm cursor-pointer shrink-0"
          >
            <Lock size={14} />
            <span>DISARM KILL-SWITCH</span>
          </button>
        );
      case 'VIEW_POSITIONS':
        return (
          <button
            id="guard-banner-view-positions-btn"
            onClick={() => onNavigateTab('positions')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded text-xs transition shadow-sm cursor-pointer shrink-0"
          >
            <ExternalLink size={14} />
            <span>VIEW POSITIONS</span>
          </button>
        );
      case 'ADD_CREDENTIALS':
        return (
          <button
            id="guard-banner-credentials-btn"
            onClick={() => onNavigateTab('settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition shadow-sm cursor-pointer shrink-0"
          >
            <KeyRound size={14} />
            <span>ADD BOT KEYS</span>
          </button>
        );
      case 'ADJUST_MACRO':
        return (
          <button
            id="guard-banner-macro-btn"
            onClick={() => onNavigateTab('settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded text-xs border border-gray-600 transition shadow-sm cursor-pointer shrink-0"
          >
            <span>SETTINGS</span>
          </button>
        );
      case 'BYPASS_TRADEABILITY_GATE':
        return (
          <button
            id="guard-banner-bypass-l3-btn"
            onClick={() => onNavigateTab('regime')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-xs transition shadow-sm cursor-pointer shrink-0"
          >
            <span>VIEW REGIME & BYPASS</span>
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      id="execution-guard-banner" 
      className={`border-b transition-colors ${
        isBlocked 
          ? 'bg-gradient-to-r from-rose-950/80 via-rose-900/30 to-[#161B22] border-rose-500/40 text-rose-200'
          : 'bg-[#161B22] border-emerald-500/30 text-emerald-200'
      }`}
    >
      <div className="px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Status Icon & Exact Reason */}
        <div className="flex items-start md:items-center gap-3">
          <div className={`p-1.5 rounded-md shrink-0 mt-0.5 md:mt-0 border ${
            isBlocked
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
          }`}>
            {isBlocked ? (
              <AlertOctagon size={18} className="animate-pulse" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 ${
                isBlocked ? 'text-rose-300' : 'text-emerald-300'
              }`}>
                <span>{isBlocked ? 'TRADE EXECUTION STOPPED' : 'TRADE EXECUTION ARMED & ACTIVE'}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono border ${
                  isBlocked
                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                    : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                }`}>
                  {isBlocked ? code : 'ALL CHECKS PASSED (OK)'}
                </span>
              </span>
            </div>
            <p className="text-xs text-gray-200 mt-0.5 leading-relaxed">
              {isBlocked ? (
                <>
                  <strong>Reason:</strong> {reason || 'Trade executions are paused by active risk limits or system status.'}
                </>
              ) : (
                <>
                  <strong>Status:</strong> All safety guardrails and risk gates are clear. Autonomous scanner and trade execution engine are running normally.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Quick Action & Expand Guardrails */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          {onOpenStrategyChecker && (
            <button
              onClick={onOpenStrategyChecker}
              className="px-2.5 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded text-xs border border-[#30363D] flex items-center gap-1 font-medium transition cursor-pointer"
              title="Inspect live strategy execution and run test"
            >
              <Eye size={13} className="text-cyan-400" />
              <span className="hidden sm:inline">Strategy Health</span>
            </button>
          )}

          {renderActionButton()}

          <button
            onClick={() => setExpanded(prev => !prev)}
            className="p-1.5 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800/60 transition cursor-pointer"
            title={expanded ? 'Hide guardrail breakdown' : 'Show all 9 safety guardrails'}
            aria-label="Toggle safety guardrails breakdown"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expandable Safety Guardrails Status Breakdown */}
      {expanded && (
        <div className="border-t border-[#30363D] bg-[#0E1117]/80 p-4 font-sans text-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-gray-300 tracking-wide flex items-center gap-2">
              <ShieldAlert size={14} className="text-indigo-400" />
              <span>SAFETY GUARDRAILS AUDIT (Real-Time Pre-Execution Gates)</span>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">
              {guardrails.filter(g => g.passed).length}/{guardrails.length || 10} Checks Passing
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {guardrails.length > 0 ? (
              guardrails.map(g => (
                <div 
                  key={g.id}
                  className={`p-2.5 rounded-lg border flex flex-col justify-between transition ${
                    g.passed 
                      ? 'bg-[#161B22] border-[#30363D] text-gray-300' 
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-gray-200 text-[11px] truncate" title={g.label}>
                      {g.label}
                    </span>
                    {g.passed ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 shrink-0">
                        <CheckCircle2 size={12} /> PASS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 shrink-0 animate-pulse">
                        <XCircle size={12} /> BLOCKED
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-gray-400">
                    {g.metric}
                  </div>
                  {!g.passed && g.reason && (
                    <div className="text-[10px] text-rose-300 mt-1 font-sans leading-tight border-t border-rose-500/20 pt-1">
                      {g.reason}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center text-gray-500 py-2">
                Loading safety guardrails telemetry...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExecutionGuardBanner;
