import React from 'react';
import { useSignalAudit, SignalAuditRecord } from '../hooks/useSignalAudit';

export function SignalAuditTable() {
  const { data: signals, loading, error, lastUpdated } = useSignalAudit(100);

  if (loading && signals.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-4"></div>
        <span>Loading signal audit...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-red-400">
        <span className="mb-2 text-lg font-bold">Signal audit unavailable</span>
        <span>{error}</span>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-gray-400">
        <span className="mb-2 text-lg font-bold">No signal evaluations yet</span>
        <span>The backend has not published any accepted or rejected signal records.</span>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="rounded border border-slate-700 p-3 text-xs mb-4 flex justify-between bg-slate-900/50">
        <div>
          <span className="mr-4">Collection: <strong className="text-emerald-400">signalAudit</strong></span>
          <span className="mr-4">Rows received: <strong>{signals.length}</strong></span>
        </div>
        <div>
          <span>Last update: <strong>{lastUpdated?.toLocaleTimeString() ?? 'never'}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-slate-800 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Decision</th>
              <th className="px-4 py-3">Strategy</th>
              <th className="px-4 py-3">Regime</th>
              <th className="px-4 py-3">Conf</th>
              <th className="px-4 py-3">Reasons</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((sig) => (
              <tr key={sig.signalId} className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 text-gray-400">
                  {new Date(sig.createdAt).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3 font-medium">
                  {sig.symbol}
                </td>
                <td className="px-4 py-3">
                  {sig.decision === 'ENTER' ? (
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold">ENTER</span>
                  ) : sig.decision === 'WATCH' ? (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-bold">WATCH</span>
                  ) : (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold">REJECT</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {sig.strategy}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {sig.regime}
                </td>
                <td className="px-4 py-3">
                  <span className={sig.confidence >= 80 ? 'text-emerald-400' : sig.confidence >= 60 ? 'text-amber-400' : 'text-red-400'}>
                    {sig.confidence}%
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {sig.rejectionReasons?.join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
