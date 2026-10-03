import React, { useState, useMemo } from 'react';
import { 
  useSignalAudit, 
  SignalAuditRecord, 
  SignalDecision 
} from '../hooks/useSignalAudit';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Filter, 
  RefreshCw, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  BarChart2, 
  Layers, 
  Percent, 
  SlidersHorizontal,
  Clock,
  ExternalLink,
  Info
} from 'lucide-react';

export interface GateSpec {
  id: string;
  name: string;
  category: 'REGIME' | 'LIQUIDITY' | 'MOMENTUM' | 'STRUCTURE' | 'RISK' | 'DATA';
  description: string;
  formula: string;
  fallbackFailReason: string;
}

export const SYSTEM_VALIDATION_GATES: GateSpec[] = [
  {
    id: 'dataFresh',
    name: 'Gate 1: Data Freshness & Feeds Liveness',
    category: 'DATA',
    description: 'Verifies price feed synchronization, WebSocket liveness, and ensures candle timestamp is within tolerance (<60s jitter).',
    formula: 'Clock - LastTickTimestamp <= 60s & WebSocket State == OPEN',
    fallbackFailReason: 'Feed latency spike or disconnected WebSocket market tick stream.'
  },
  {
    id: 'regimeConfirmed',
    name: 'Gate 2: Market Regime Hysteresis & Stability',
    category: 'REGIME',
    description: 'Requires regime confirmation across at least 2 consecutive closed bars to avoid whipsaw transition noise.',
    formula: 'RegimeState.consecutiveBars >= 2 & ADX >= RegimeThreshold',
    fallbackFailReason: 'Regime hysteresis pending (insufficient consecutive closed bars in current regime).'
  },
  {
    id: 'strategyAllowedInRegime',
    name: 'Gate 3: Regime-to-Strategy Permissibility Matrix',
    category: 'REGIME',
    description: 'Validates that the triggered strategy is mathematically allowed within the current detected market regime.',
    formula: 'Strategy in RegimeEligibilityMatrix[CurrentRegime]',
    fallbackFailReason: 'Strategy is incompatible with the detected regime (e.g. Mean Reversion in Runaway Trend).'
  },
  {
    id: 'directionAllowed',
    name: 'Gate 4: Directional Alignment Guard',
    category: 'MOMENTUM',
    description: 'Enforces that signal direction (LONG/SHORT) aligns with technical momentum stack or confirmed directional breakout.',
    formula: 'Direction == PermittedRegimeDirection(Regime)',
    fallbackFailReason: 'Signal direction conflicts with the prevailing market trend bias.'
  },
  {
    id: 'higherTimeframeAligned',
    name: 'Gate 5: Higher Timeframe (1H HTF) Confirmation',
    category: 'MOMENTUM',
    description: 'Evaluates the 1-Hour anchor timeframe EMA(21)/EMA(50) stack and price location to confirm directional synergy.',
    formula: '1H Close > 1H EMA21 > 1H EMA50 (Long) | 1H Close < 1H EMA21 < 1H EMA50 (Short)',
    fallbackFailReason: 'Higher timeframe (1H) trend structure contradicts the execution timeframe signal.'
  },
  {
    id: 'structureValid',
    name: 'Gate 6: Swing Structure & Fractal Boundary',
    category: 'STRUCTURE',
    description: 'Verifies confirmed fractal swing points, checks overextension limits, and denies entries into major opposing volume spikes.',
    formula: 'Distance(Price, EMA50) <= MaxOverextension & SwingPivotConfirmed == TRUE',
    fallbackFailReason: 'Structure invalidation: Price extended into opposing supply/demand wall or pivot broken.'
  },
  {
    id: 'confirmationCandleClosed',
    name: 'Gate 7: Closed-Candle Execution Proof',
    category: 'STRUCTURE',
    description: 'Strictly mandates that signal conditions are locked on closed candle (C1) to prevent intra-bar repainting.',
    formula: 'Candle.isClosed == TRUE & ClosedPriceCrossed(Threshold)',
    fallbackFailReason: 'Live unclosed candle in progress; signal confirmation pending bar close.'
  },
  {
    id: 'volumeValid',
    name: 'Gate 8: Volume Surge & Liquidity Floor ($10M 24h)',
    category: 'LIQUIDITY',
    description: 'Checks that 24-hour turnover meets the $10M baseline and confirmation candle shows volume expansion over 20-SMA.',
    formula: '24h QuoteVolume >= $10,000,000 & TriggerVolume >= VolumeSurgeThreshold',
    fallbackFailReason: 'Volume below $10M 24h liquidity floor or insufficient volume expansion on trigger.'
  },
  {
    id: 'spreadValid',
    name: 'Gate 9: Real-time Orderbook Spread Tolerance',
    category: 'LIQUIDITY',
    description: 'Guarantees the real-time bid/ask spread does not exceed 10 bps (majors) or 30 bps (altcoins) to avoid slippage drag.',
    formula: 'SpreadBps = ((Ask - Bid) / Mid) * 10000 <= MaxSpreadBps',
    fallbackFailReason: 'Bid/Ask spread exceeds maximum allowable threshold (high execution slippage risk).'
  },
  {
    id: 'stopStructurallyValid',
    name: 'Gate 10: Structural Stop-Loss & Target Asymmetry',
    category: 'RISK',
    description: 'Enforces mathematically validated stop-loss (0.3% - 4.5% distance) with structural asymmetric reward-to-risk (R:R >= 3.0 or 2.5).',
    formula: '0.003 <= StopDistPct <= 0.045 & StructuralRR >= RequiredMinRR',
    fallbackFailReason: 'Stop loss distance too tight (<0.3%), too wide (>4.5%), or R:R below required threshold.'
  }
];

export function SignalAuditTable() {
  const { data: signals, loading, error, lastUpdated } = useSignalAudit(150);
  
  const [selectedSignal, setSelectedSignal] = useState<SignalAuditRecord | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ENTER' | 'WATCH' | 'REJECT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ALL');

  // Filtered dataset
  const filteredSignals = useMemo(() => {
    return signals.filter((sig) => {
      if (activeFilter !== 'ALL' && sig.decision !== activeFilter) {
        return false;
      }
      if (selectedStrategy !== 'ALL' && sig.strategy !== selectedStrategy) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchesSymbol = sig.symbol.toLowerCase().includes(q);
        const matchesStrategy = sig.strategy?.toLowerCase().includes(q);
        const matchesRegime = sig.regime?.toLowerCase().includes(q);
        const matchesReason = sig.rejectionReasons?.some(r => r.toLowerCase().includes(q));
        if (!matchesSymbol && !matchesStrategy && !matchesRegime && !matchesReason) {
          return false;
        }
      }
      return true;
    });
  }, [signals, activeFilter, selectedStrategy, searchQuery]);

  // Unique strategies for filter dropdown
  const uniqueStrategies = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => {
      if (s.strategy && s.strategy !== 'UNKNOWN_STRATEGY') set.add(s.strategy);
    });
    return Array.from(set);
  }, [signals]);

  // Statistics counters
  const counts = useMemo(() => {
    const enter = signals.filter(s => s.decision === 'ENTER').length;
    const watch = signals.filter(s => s.decision === 'WATCH').length;
    const reject = signals.filter(s => s.decision === 'REJECT').length;
    return { total: signals.length, enter, watch, reject };
  }, [signals]);

  // Helper to determine single gate status & details
  const getGateDetails = (gate: GateSpec, sig: SignalAuditRecord) => {
    const rawStatus = sig.gateResults ? sig.gateResults[gate.id] : undefined;
    
    // Look in rejection reasons to see if this gate explicitly caused failure
    const reasonMatch = sig.rejectionReasons?.find(r => {
      const lower = r.toLowerCase();
      if (gate.id === 'dataFresh' && (lower.includes('fresh') || lower.includes('feed') || lower.includes('live'))) return true;
      if (gate.id === 'regimeConfirmed' && (lower.includes('regime') || lower.includes('hysteresis') || lower.includes('bars'))) return true;
      if (gate.id === 'strategyAllowedInRegime' && (lower.includes('eligible') || lower.includes('mapped') || lower.includes('incompatible'))) return true;
      if (gate.id === 'directionAllowed' && (lower.includes('direction conflict') || lower.includes('bias'))) return true;
      if (gate.id === 'higherTimeframeAligned' && (lower.includes('htf') || lower.includes('higher timeframe') || lower.includes('1h'))) return true;
      if (gate.id === 'structureValid' && (lower.includes('structure') || lower.includes('overextended') || lower.includes('pivot') || lower.includes('wick'))) return true;
      if (gate.id === 'confirmationCandleClosed' && (lower.includes('closed') || lower.includes('candle'))) return true;
      if (gate.id === 'volumeValid' && (lower.includes('volume') || lower.includes('liquidity') || lower.includes('$10m'))) return true;
      if (gate.id === 'spreadValid' && lower.includes('spread')) return true;
      if (gate.id === 'stopStructurallyValid' && (lower.includes('stop loss') || lower.includes('sl too tight') || lower.includes('rr') || lower.includes('risk-to-reward') || lower.includes('structural rr'))) return true;
      return false;
    });

    let status: 'PASS' | 'FAIL' | 'NOT_CHECKED' = 'NOT_CHECKED';
    let specificReason = '';

    if (rawStatus === 'PASS') {
      status = 'PASS';
      specificReason = 'Condition met system checklist threshold.';
    } else if (rawStatus === 'FAIL') {
      status = 'FAIL';
      specificReason = reasonMatch || gate.fallbackFailReason;
    } else if (reasonMatch) {
      status = 'FAIL';
      specificReason = reasonMatch;
    } else if (sig.decision === 'ENTER') {
      status = 'PASS';
      specificReason = 'Fully satisfied with validated confirmation.';
    } else {
      // If signal was rejected or watched and this gate didn't explicitly trigger rejection
      status = 'NOT_CHECKED';
      specificReason = 'Bypassed or gated by upstream failure prerequisite.';
    }

    return { status, specificReason };
  };

  if (loading && signals.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-gray-400 bg-[#0E1117]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mb-4"></div>
        <span className="text-sm font-semibold tracking-wider text-gray-300">Synchronizing Real-Time Signal Audit Stream...</span>
        <span className="text-xs text-gray-500 mt-1">Inspecting confirmation gates & rejection logs</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-red-400 bg-[#0E1117]">
        <AlertCircle size={36} className="mb-3 text-red-400" />
        <span className="text-base font-bold">Signal Audit Stream Unavailable</span>
        <span className="text-xs text-gray-400 mt-1">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0E1117] text-gray-200">
      {/* Top Header & Metrics Bar */}
      <div className="p-4 sm:p-5 border-b border-[#30363D] bg-[#161B22]/70 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="text-emerald-400" size={22} />
            <h1 className="text-base sm:text-lg font-bold text-gray-100 tracking-tight">
              Signal & Rejection Audit Engine
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              10-GATE VALIDATION
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time audit trail of every candidate evaluation, multi-gate veto, and trade dispatch decision.
          </p>
        </div>

        {/* Filter Pills / Status Counters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            id="filter-all-btn"
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-[#21262D] text-gray-100 border-gray-500'
                : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-gray-200'
            }`}
          >
            <span>All Records</span>
            <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[10px] text-gray-300 font-mono">
              {counts.total}
            </span>
          </button>

          <button
            id="filter-enter-btn"
            onClick={() => setActiveFilter('ENTER')}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              activeFilter === 'ENTER'
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/50 shadow-xs'
                : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-emerald-400'
            }`}
          >
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Accepted (ENTER)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 font-mono">
              {counts.enter}
            </span>
          </button>

          <button
            id="filter-watch-btn"
            onClick={() => setActiveFilter('WATCH')}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              activeFilter === 'WATCH'
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/50 shadow-xs'
                : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-amber-400'
            }`}
          >
            <Activity size={13} className="text-amber-400" />
            <span>Watchlist (WATCH)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-[10px] text-amber-300 font-mono">
              {counts.watch}
            </span>
          </button>

          <button
            id="filter-reject-btn"
            onClick={() => setActiveFilter('REJECT')}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              activeFilter === 'REJECT'
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/50 shadow-xs'
                : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-rose-400'
            }`}
          >
            <XCircle size={13} className="text-rose-400" />
            <span>Vetoed (REJECT)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-[10px] text-rose-300 font-mono">
              {counts.reject}
            </span>
          </button>
        </div>
      </div>

      {/* Control / Search Filter Bar */}
      <div className="p-3 sm:px-5 border-b border-[#30363D] bg-[#0E1117] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
            <input
              id="signal-audit-search-input"
              type="text"
              placeholder="Search symbol, strategy, or reject reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded-md pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {uniqueStrategies.length > 0 && (
            <select
              id="signal-audit-strategy-select"
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="bg-[#161B22] border border-[#30363D] rounded-md px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Strategies</option>
              {uniqueStrategies.map(strat => (
                <option key={strat} value={strat}>{strat.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-4 text-gray-400 text-[11px] self-end sm:self-auto">
          <span>Showing <strong className="text-gray-200 font-mono">{filteredSignals.length}</strong> evaluations</span>
          <span className="hidden md:inline text-gray-600">|</span>
          <span className="hidden md:flex items-center gap-1">
            <Clock size={12} className="text-gray-500" />
            <span>Updated: <strong className="text-gray-300">{lastUpdated?.toLocaleTimeString() ?? 'just now'}</strong></span>
          </span>
        </div>
      </div>

      {/* Main Layout Area: Table with click-to-view Drawer */}
      <div className="flex-1 overflow-hidden relative flex">
        {/* Table View */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs text-gray-300 min-w-[700px] border-collapse">
            <thead className="text-[11px] uppercase bg-[#161B22] text-gray-400 sticky top-0 z-10 border-b border-[#30363D]">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Decision</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Regime</th>
                <th className="px-4 py-3 font-medium">Score / Conf</th>
                <th className="px-4 py-3 font-medium">10-Gate Summary</th>
                <th className="px-4 py-3 font-medium text-right">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363D]/60 font-mono">
              {filteredSignals.map((sig, idx) => {
                const isSelected = selectedSignal?.signalId === sig.signalId;
                
                // Count pass/fail across the 10 system gates
                let passCount = 0;
                let failCount = 0;
                SYSTEM_VALIDATION_GATES.forEach(g => {
                  const { status } = getGateDetails(g, sig);
                  if (status === 'PASS') passCount++;
                  else if (status === 'FAIL') failCount++;
                });

                const rowKey = `${sig.signalId || sig.symbol}-${sig.decision || 'NONE'}-${sig.createdAt || ''}-${idx}`;
                return (
                  <tr
                    key={rowKey}
                    id={`signal-row-${rowKey}`}
                    onClick={() => setSelectedSignal(sig)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-950/20 border-l-2 border-emerald-400'
                        : 'hover:bg-[#161B22]/70'
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-[11px]">
                      {new Date(sig.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-100 flex items-center gap-1.5">
                      {sig.direction === 'LONG' && <TrendingUp size={13} className="text-emerald-400" />}
                      {sig.direction === 'SHORT' && <TrendingDown size={13} className="text-rose-400" />}
                      <span>{sig.symbol}</span>
                    </td>
                    <td className="px-4 py-3">
                      {sig.decision === 'ENTER' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                          <CheckCircle2 size={11} /> ENTER
                        </span>
                      ) : sig.decision === 'WATCH' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">
                          <Activity size={11} /> WATCH
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">
                          <XCircle size={11} /> REJECT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-sans text-xs">
                      {sig.strategy === 'UNKNOWN_STRATEGY' ? 'Multi-Strategy Scan' : sig.strategy.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-sans text-xs">
                      {sig.regime || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        sig.confidence >= 80 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : sig.confidence >= 60 
                          ? 'bg-amber-500/10 text-amber-400' 
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        {sig.confidence} / 100
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-emerald-400">{passCount} Pass</span>
                          <span className="text-gray-600">/</span>
                          <span className={`text-[10px] font-bold ${failCount > 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                            {failCount} Fail
                          </span>
                        </div>
                        {failCount > 0 && sig.rejectionReasons && sig.rejectionReasons.length > 0 && (
                          <span className="text-[10px] text-rose-400/80 font-sans truncate max-w-[180px]" title={sig.rejectionReasons[0]}>
                            • {sig.rejectionReasons[0]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        id={`btn-view-audit-${sig.signalId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSignal(sig);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] text-gray-300 hover:text-white transition text-[11px] font-semibold border border-[#30363D]"
                      >
                        <span>Audit Details</span>
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredSignals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-gray-500 font-sans">
                    <ShieldAlert size={32} className="mx-auto mb-2 text-gray-600 opacity-60" />
                    <p className="text-sm font-semibold">No signal records matched your filter criteria.</p>
                    <p className="text-xs text-gray-600 mt-1">Try switching tabs or clearing your search term.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Audit Details Slide-Over / Side Panel */}
        {selectedSignal && (
          <div
            id="signal-audit-details-panel"
            className="w-full sm:w-[480px] lg:w-[540px] border-l border-[#30363D] bg-[#161B22] flex flex-col h-full z-20 shadow-2xl shrink-0 absolute right-0 top-0 bottom-0 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-[#0E1117]/80">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    <span>Audit Breakdown:</span>
                    <span className="text-emerald-400">{selectedSignal.symbol}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      selectedSignal.decision === 'ENTER' 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                        : selectedSignal.decision === 'WATCH' 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}>
                      {selectedSignal.decision}
                    </span>
                  </h3>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Evaluated at {new Date(selectedSignal.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <button
                id="close-audit-details-btn"
                onClick={() => setSelectedSignal(null)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition"
                title="Close details view"
              >
                <X size={18} />
              </button>
            </div>

            {/* Context Summary Cards */}
            <div className="p-4 border-b border-[#30363D] bg-[#161B22]/40 grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded bg-[#0E1117] border border-[#30363D]">
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Strategy</div>
                <div className="font-semibold text-gray-200 mt-0.5 truncate" title={selectedSignal.strategy}>
                  {selectedSignal.strategy?.replace(/_/g, ' ') || 'Multi-Strategy'}
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#0E1117] border border-[#30363D]">
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Market Regime</div>
                <div className="font-semibold text-gray-200 mt-0.5 truncate" title={selectedSignal.regime}>
                  {selectedSignal.regime || '—'}
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#0E1117] border border-[#30363D]">
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Target R:R</div>
                <div className="font-semibold text-emerald-400 mt-0.5">
                  {selectedSignal.riskReward ? `${selectedSignal.riskReward.toFixed(1)}:1` : '≥ 3.0:1'}
                </div>
              </div>
            </div>

            {/* Prices & Execution Parameters (if available) */}
            {(selectedSignal.entryPrice || selectedSignal.stopPrice) && (
              <div className="px-4 py-2.5 bg-[#0E1117]/60 border-b border-[#30363D] flex items-center justify-between text-[11px] font-mono">
                <div>
                  <span className="text-gray-500 mr-1.5">Entry:</span>
                  <span className="text-gray-200 font-bold">${selectedSignal.entryPrice}</span>
                </div>
                {selectedSignal.stopPrice && (
                  <div>
                    <span className="text-gray-500 mr-1.5">Stop Loss:</span>
                    <span className="text-rose-400 font-bold">${selectedSignal.stopPrice}</span>
                  </div>
                )}
                {selectedSignal.targetPrices && selectedSignal.targetPrices.length > 0 && (
                  <div>
                    <span className="text-gray-500 mr-1.5">TP1:</span>
                    <span className="text-emerald-400 font-bold">${selectedSignal.targetPrices[0]}</span>
                  </div>
                )}
              </div>
            )}

            {/* Rejection Summary Callout if Rejected */}
            {selectedSignal.rejectionReasons && selectedSignal.rejectionReasons.length > 0 && (
              <div className="m-4 p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg text-xs text-rose-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-400 uppercase tracking-wider text-[10px]">
                  <ShieldAlert size={13} />
                  <span>Rejection Root Cause ({selectedSignal.rejectionReasons.length} Vetoes)</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-200/90 pl-1">
                  {selectedSignal.rejectionReasons.map((reason, idx) => (
                    <li key={idx} className="leading-snug">{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* All 10 Confirmation Gates Breakdown */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-emerald-400" />
                  <span>10 Confirmation Gates Breakdown</span>
                </span>
                <span className="text-[10px] text-gray-500">System Validation Checklist</span>
              </div>

              <div className="space-y-2.5">
                {SYSTEM_VALIDATION_GATES.map((gate, index) => {
                  const { status, specificReason } = getGateDetails(gate, selectedSignal);

                  return (
                    <div
                      key={gate.id}
                      id={`gate-card-${gate.id}`}
                      className={`p-3 rounded-lg border transition-all ${
                        status === 'PASS'
                          ? 'bg-emerald-950/15 border-emerald-800/40'
                          : status === 'FAIL'
                          ? 'bg-rose-950/20 border-rose-800/50'
                          : 'bg-[#0E1117] border-[#30363D]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#21262D] text-gray-400 border border-[#30363D]">
                            {index + 1}
                          </span>
                          <span className="font-bold text-gray-200 text-xs">{gate.name}</span>
                        </div>

                        {status === 'PASS' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                            <CheckCircle2 size={11} /> PASS
                          </span>
                        ) : status === 'FAIL' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold">
                            <XCircle size={11} /> FAIL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 text-[10px] font-medium">
                            BYPASSED
                          </span>
                        )}
                      </div>

                      {/* Gate Purpose & Condition */}
                      <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed font-sans">
                        {gate.description}
                      </p>

                      {/* Formula Specification */}
                      <div className="mt-2 text-[10px] bg-[#0E1117]/80 p-2 rounded border border-[#30363D] font-mono text-gray-400">
                        <span className="text-gray-500 block text-[9px] uppercase tracking-wider mb-0.5">Verification Formula:</span>
                        <code className="text-emerald-400/90">{gate.formula}</code>
                      </div>

                      {/* Reason & Measured Verification Code */}
                      <div className="mt-2 text-[11px] flex items-start gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 shrink-0 mt-0.5">
                          Audit Verdict:
                        </span>
                        <span className={`text-[11px] leading-snug font-sans ${
                          status === 'PASS' ? 'text-emerald-300' : status === 'FAIL' ? 'text-rose-300' : 'text-gray-400'
                        }`}>
                          {specificReason}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-[#30363D] bg-[#0E1117] flex items-center justify-between text-xs text-gray-500">
              <span>Gate Schema Version: <strong className="text-gray-400">v2.2-HardVeto</strong></span>
              <button
                onClick={() => setSelectedSignal(null)}
                className="px-3 py-1 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded text-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
