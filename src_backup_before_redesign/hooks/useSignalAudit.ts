import { useEffect, useState } from 'react';

export type SignalDecision = 'ENTER' | 'WATCH' | 'REJECT';

export interface SignalAuditRecord {
  signalId: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  regime: string;
  direction: 'LONG' | 'SHORT' | 'NONE';
  confidence: number;
  decision: SignalDecision;
  rejectionReasons: string[];
  gateResults: Record<string, 'PASS' | 'FAIL' | 'NOT_CHECKED'>;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrices: number[];
  riskReward: number | null;
  spreadBps: number | null;
  volumePercentile: number | null;
  createdAt: string;
}

export function useSignalAudit(limitCount = 100) {
  const [data, setData] = useState<SignalAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout;
    
    const fetchAudit = async (isInitial = false) => {
      try {
        const res = await fetch(`/api/signal_audit?limit=${encodeURIComponent(limitCount)}`);
        
        if (!res.ok) {
          // If server is starting up or returning 502/503
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        // Guard against HTML responses (e.g. Vite SPA fallback during boot)
        if (!contentType.includes('application/json')) {
          return;
        }

        const json = await res.json();
        
        if (mounted && Array.isArray(json)) {
          setData(json);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          // Gracefully absorb transient polling / boot connection errors (e.g., 'Failed to fetch')
          const msg = err?.message || String(err);
          if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError')) {
            console.warn('[useSignalAudit] Poll notice:', msg);
          }
          if (isInitial && data.length === 0) {
            setError(msg);
          }
          setLoading(false);
        }
      }
    };

    fetchAudit(true);
    
    // Poll every 5 seconds since we don't have websocket for this yet
    interval = setInterval(() => fetchAudit(false), 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [limitCount]);

  return {
    data,
    loading,
    error,
    lastUpdated
  };
}
