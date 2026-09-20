import React, { useState, useMemo } from 'react';
import { Activity, XCircle, CheckCircle2, ShieldAlert, Clock, Filter, Layers, Database } from 'lucide-react';
import { SignalView } from '../types.js';

interface Props {
  signals: SignalView[];
  loading?: boolean;
  error?: string | null;
}

export function SignalsPage({ signals, loading = false, error = null }: Props) {
  const [filterType, setFilterType] = useState<'ALL' | 'ENTER' | 'REJECT' | 'WATCH'>('ALL');
  const [searchSymbol, setSearchSymbol] = useState('');

  const stats = useMemo(() => {
    const total = signals.length;
    const accepted = signals.filter(s => s.decision === 'ENTER').length;
    const rejected = signals.filter(s => s.decision === 'REJECT').length;
    const watch = signals.filter(s => s.decision === 'WATCH').length;
    return { total, accepted, rejected, watch };
  }, [signals]);

  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      if (filterType !== 'ALL' && s.decision !== filterType) return false;
      if (searchSymbol && !s.symbol.toLowerCase().includes(searchSymbol.toLowerCase())) return false;
      return true;
    });
  }, [signals, filterType, searchSymbol]);

  const lastUpdated = signals.length > 0 && signals[0].createdAt
    ? new Date(signals[0].createdAt).toLocaleTimeString()
    : 'N/A';

  return (
    <div className="p-6 h-full flex flex-col space-y-4">
      {/* Top Header & Metrics Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 shrink-0 bg-[#161B22] border border-[#30363D] p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Signal Audit Trail
              <span className="text-xs font-normal text-gray-400">({stats.total} total evaluated)</span>
            </h2>
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span>Full lifecycle audit of all evaluated trading setups & gate verdicts.</span>
              <span className="text-gray-500">●</span>
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Clock className="w-3 h-3" /> Last tick: {lastUpdated}
              </span>
            </p>
          </div>
        </div>

        {/* Aggregate KPI counters */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition ${
              filterType === 'ALL'
                ? 'bg-gray-200 text-[#0E1117] border-white'
                : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-white'
            }`}
          >
            All: <strong className="font-mono">{stats.total}</strong>
          </button>
          <button
            onClick={() => setFilterType('ENTER')}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              filterType === 'ENTER'
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/40'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Accepted: <strong className="font-mono">{stats.accepted}</strong>
          </button>
          <button
            onClick={() => setFilterType('REJECT')}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              filterType === 'REJECT'
                ? 'bg-rose-500 text-white border-rose-400'
                : 'bg-rose-950/40 text-rose-400 border-rose-800/50 hover:bg-rose-900/40'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Rejected: <strong className="font-mono">{stats.rejected}</strong>
          </button>
          <button
            onClick={() => setFilterType('WATCH')}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition flex items-center gap-1.5 ${
              filterType === 'WATCH'
                ? 'bg-amber-500 text-white border-amber-400'
                : 'bg-amber-950/40 text-amber-400 border-amber-800/50 hover:bg-amber-900/40'
            }`}
          >
            Watch/Filtered: <strong className="font-mono">{stats.watch}</strong>
          </button>
        </div>
      </div>

      {/* Filter search bar */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Filter by symbol (e.g. BTC)..."
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
        <div className="text-xs text-gray-500">
          Showing {filteredSignals.length} of {signals.length} signals
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <p className="font-bold">Error Loading Signal Trail</p>
            <p className="text-rose-400/80 text-[11px]">{error}</p>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="flex-1 overflow-auto border border-[#30363D] rounded-xl bg-[#161B22] shadow-inner">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="text-xs uppercase bg-[#21262D] text-gray-400 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Regime</th>
              <th className="px-4 py-3 font-medium">Strategy</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Decision</th>
              <th className="px-4 py-3 font-medium">Config Version</th>
              <th className="px-4 py-3 font-medium">Gate Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363D]">
            {filteredSignals.map((sig) => (
              <tr key={sig.id} className="hover:bg-[#21262D]/50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs font-mono">
                  {new Date(sig.createdAt).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3 font-bold text-gray-200 font-mono">
                  {sig.symbol}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="px-2 py-0.5 rounded bg-gray-800 border border-[#30363D] text-gray-300 text-[11px]">
                    {sig.regime}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                  {sig.strategy}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                    sig.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {sig.confidence}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${
                    sig.decision === 'ENTER' ? 'text-emerald-400' :
                    sig.decision === 'REJECT' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {sig.decision === 'ENTER' ? <CheckCircle2 size={14} /> :
                     sig.decision === 'REJECT' ? <XCircle size={14} /> : <Activity size={14} />}
                    <span>{sig.decision}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-gray-400">
                  <span className="bg-[#0E1117] px-2 py-0.5 rounded border border-[#30363D] text-[10px]">
                    v{(sig as any).settingsVersion || 1}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate" title={sig.rejectionReasons.join(', ')}>
                  {sig.rejectionReasons.length > 0 ? (
                    <span className="text-amber-400/90 flex items-center gap-1.5">
                      <ShieldAlert size={12} className="shrink-0 text-amber-400" />
                      <span className="truncate">{sig.rejectionReasons[0]} {sig.rejectionReasons.length > 1 && `(+${sig.rejectionReasons.length - 1})`}</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400/80 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Passed all gates
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filteredSignals.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 space-y-2">
                  <Database className="w-8 h-8 mx-auto text-gray-600 mb-1" />
                  <p className="font-semibold text-gray-400">No signals match current filter</p>
                  <p className="text-xs">Signals evaluated by the scanner will appear here with gate pass/fail verdicts.</p>
                </td>
              </tr>
            )}
            {loading && filteredSignals.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <Activity className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                  <p>Loading signal audit history...</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
