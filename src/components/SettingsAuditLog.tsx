import React, { useState, useEffect } from 'react';
import { History, RefreshCw, AlertCircle, ArrowRight, ShieldCheck, User } from 'lucide-react';

interface AuditRecord {
  auditId: string;
  userId: string;
  accountId: string;
  action: string;
  before: Record<string, any>;
  after: Record<string, any>;
  changedFields: string[];
  version: number;
  source: string;
  createdAt: string;
}

export function SettingsAuditLog() {
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/audit');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch audit history`);
      const data = await res.json();
      setAudits(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  return (
    <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[#30363D] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Settings Change Audit Trail
              <span className="text-xs font-normal text-gray-400">({audits.length} entries)</span>
            </h3>
            <p className="text-xs text-gray-400">
              Immutable ledger of all configuration adjustments, risk updates, and credentials syncs.
            </p>
          </div>
        </div>

        <button
          onClick={fetchAudits}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-gray-300 text-xs font-semibold border border-[#30363D] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && audits.length === 0 && (
        <div className="py-12 text-center text-xs text-gray-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
          <p>Loading audit ledger from disk & cloud...</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {!loading && audits.length === 0 && !error && (
        <div className="py-12 text-center text-xs text-gray-500 space-y-1">
          <ShieldCheck className="w-8 h-8 mx-auto text-gray-600 mb-2" />
          <p className="font-semibold text-gray-400">No settings changes recorded yet</p>
          <p>When you update and save settings, every field change and version diff will appear here.</p>
        </div>
      )}

      {audits.length > 0 && (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {audits.map((item) => {
            const hasChanges = item.changedFields && item.changedFields.length > 0;
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A';

            return (
              <div
                key={item.auditId}
                className="bg-[#0E1117] rounded-lg border border-[#30363D] p-3.5 text-xs space-y-2.5 transition hover:border-[#484F58]"
              >
                <div className="flex items-center justify-between text-gray-400 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white bg-indigo-950/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/40 text-[11px]">
                      v{item.version}
                    </span>
                    <span className="font-semibold text-gray-200">{item.action}</span>
                    <span className="text-[10px] text-gray-500 font-mono">by {item.source}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{dateStr}</span>
                </div>

                {hasChanges ? (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] text-gray-400 font-semibold">
                      Modified {item.changedFields.length} {item.changedFields.length === 1 ? 'parameter' : 'parameters'}:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.changedFields.map((field) => {
                        const beforeVal = item.before?.[field] !== undefined ? JSON.stringify(item.before[field]) : '—';
                        const afterVal = item.after?.[field] !== undefined ? JSON.stringify(item.after[field]) : '—';

                        return (
                          <div
                            key={field}
                            className="bg-[#161B22] p-2 rounded border border-[#30363D]/60 flex items-center justify-between gap-2 font-mono text-[11px]"
                          >
                            <span className="text-gray-300 font-semibold truncate" title={field}>{field}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-rose-400 line-through opacity-80 max-w-[80px] truncate" title={beforeVal}>{beforeVal}</span>
                              <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />
                              <span className="text-emerald-400 font-bold max-w-[80px] truncate" title={afterVal}>{afterVal}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 italic">Settings saved with no parameter changes detected.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
