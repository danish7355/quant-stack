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
    
    const fetchAudit = async () => {
      try {
        const res = await fetch('/api/signal_audit');
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const json = await res.json();
        
        if (mounted) {
          setData(json);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          console.error('Signal audit fetch error', err);
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchAudit();
    
    // Poll every 5 seconds since we don't have websocket for this yet
    interval = setInterval(fetchAudit, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [limitCount]);

  const refetch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/signal_audit?limit=${limitCount}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch
  };
}
