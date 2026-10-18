import fs from 'fs';
import path from 'path';
import { appendLocalJsonl } from './firestoreSafe.js';

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
  createdAt?: string;
}

const MAX_PER_BUFFER = 200;
const enterSignalsBuffer: SignalAuditRecord[] = [];
const rejectSignalsBuffer: SignalAuditRecord[] = [];

// Initialize buffers from existing local signal_audit.jsonl on startup
try {
  const jsonlPath = path.join(process.cwd(), 'data', 'signal_audit.jsonl');
  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    const seenIds = new Set<string>();
    for (let i = lines.length - 1; i >= 0 && (enterSignalsBuffer.length < MAX_PER_BUFFER || rejectSignalsBuffer.length < MAX_PER_BUFFER); i--) {
      try {
        const item = JSON.parse(lines[i]);
        // Filter out idle scan ticks that are not true signal rejections or entries
        if (item.symbol === 'GLOBAL' || item.rejectionReasons?.some((r: string) => r.includes('No setup matching active strategies'))) {
          continue;
        }
        // Normalize any legacy UNKNOWN tags
        if (!item.regime || item.regime === 'UNKNOWN' || item.regime === 'UNKNOWN_REGIME') {
          item.regime = 'RANGING';
        }
        if (!item.strategy || item.strategy === 'UNKNOWN_STRATEGY' || item.strategy === 'UNKNOWN') {
          item.strategy = 'ACTIVE_PORTFOLIO';
        }

        if (!item.signalId) item.signalId = `${item.symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        if (seenIds.has(item.signalId)) {
          item.signalId = `${item.signalId}-${Math.random().toString(36).substring(2, 6)}`;
        }
        seenIds.add(item.signalId);

        if (item.decision === 'ENTER') {
          // Deduplicate: collapse repeated signals for the same symbol/candle
          const isDup = enterSignalsBuffer.some(b => 
            b.symbol === item.symbol && (
              (b.rejectionReasons?.[0] && item.rejectionReasons?.[0] && b.rejectionReasons[0] === item.rejectionReasons[0]) ||
              (b.createdAt && item.createdAt && Math.abs(new Date(b.createdAt).getTime() - new Date(item.createdAt).getTime()) < 5 * 60 * 1000 && b.strategy === item.strategy)
            )
          );
          if (!isDup && enterSignalsBuffer.length < MAX_PER_BUFFER) {
            enterSignalsBuffer.push(item);
          }
        } else {
          if (rejectSignalsBuffer.length < MAX_PER_BUFFER) {
            rejectSignalsBuffer.push(item);
          }
        }
      } catch (e) {}
    }
  }
} catch (err) {
  console.warn('[SignalAuditService] Could not preload signal_audit.jsonl:', err);
}

export async function writeSignalAudit(record: Omit<SignalAuditRecord, 'createdAt'>) {
  try {
    // Filter out idle scan ticks that are not true trade setups
    if (record.symbol === 'GLOBAL' || record.rejectionReasons?.some(r => r.includes('No setup matching active strategies'))) {
      return;
    }

    const cleanRegime = (!record.regime || record.regime === 'UNKNOWN' || record.regime === 'UNKNOWN_REGIME')
      ? 'RANGING'
      : record.regime;
    const cleanStrategy = (!record.strategy || record.strategy === 'UNKNOWN_STRATEGY' || record.strategy === 'UNKNOWN')
      ? 'ACTIVE_PORTFOLIO'
      : record.strategy;

    const fullRecord: SignalAuditRecord = {
      ...record,
      regime: cleanRegime,
      strategy: cleanStrategy,
      signalId: record.signalId && !enterSignalsBuffer.some(b => b.signalId === record.signalId) && !rejectSignalsBuffer.some(b => b.signalId === record.signalId)
        ? record.signalId
        : `${record.symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString()
    };

    // Store in dedicated in-memory buffer with deduplication for passed signals
    if (fullRecord.decision === 'ENTER') {
      const isDup = enterSignalsBuffer.some(b => 
        b.symbol === fullRecord.symbol && (
          (b.rejectionReasons?.[0] && fullRecord.rejectionReasons?.[0] && b.rejectionReasons[0] === fullRecord.rejectionReasons[0]) ||
          (b.createdAt && fullRecord.createdAt && Math.abs(new Date(b.createdAt).getTime() - new Date(fullRecord.createdAt).getTime()) < 5 * 60 * 1000 && b.strategy === fullRecord.strategy)
        )
      );
      if (!isDup) {
        enterSignalsBuffer.unshift(fullRecord);
        if (enterSignalsBuffer.length > MAX_PER_BUFFER) {
          enterSignalsBuffer.length = MAX_PER_BUFFER;
        }
        appendLocalJsonl('signal_audit.jsonl', fullRecord);
      }
    } else {
      rejectSignalsBuffer.unshift(fullRecord);
      if (rejectSignalsBuffer.length > MAX_PER_BUFFER) {
        rejectSignalsBuffer.length = MAX_PER_BUFFER;
      }
      appendLocalJsonl('signal_audit.jsonl', fullRecord);
    }
  } catch (error) {
    console.error('[SignalAuditService] Failed to record signal audit:', error);
  }
}

export function getSignalAudits(limitCount = 200, decisionFilter?: string): SignalAuditRecord[] {
  if (decisionFilter === 'ENTER') {
    return enterSignalsBuffer.slice(0, limitCount);
  }
  if (decisionFilter === 'REJECT' || decisionFilter === 'WATCH') {
    return rejectSignalsBuffer.slice(0, limitCount);
  }

  // When 'ALL' or unspecified, return a balanced quota ensuring passed signals (ENTER)
  // are never crowded out by the high volume of background scanner rejections
  const enterQuota = Math.min(enterSignalsBuffer.length, Math.max(50, Math.floor(limitCount * 0.4)));
  const rejectQuota = Math.max(50, limitCount - enterQuota);

  const balancedEnters = enterSignalsBuffer.slice(0, enterQuota);
  const balancedRejects = rejectSignalsBuffer.slice(0, rejectQuota);

  const combined = [...balancedEnters, ...balancedRejects];
  combined.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
  return combined;
}

export function getAuditAnalytics() {
  const gateFailureCounts: Record<string, number> = {};
  const regimeDistribution: Record<string, { enter: number; watch: number; reject: number }> = {};
  const rejectionReasonCounts: Record<string, number> = {};
  let totalApproved = enterSignalsBuffer.length;
  let totalRr = 0;

  const allRecords = [...enterSignalsBuffer, ...rejectSignalsBuffer];
  for (const record of allRecords) {
    if (!regimeDistribution[record.regime]) {
      regimeDistribution[record.regime] = { enter: 0, watch: 0, reject: 0 };
    }
    if (record.decision === 'ENTER') {
      regimeDistribution[record.regime].enter++;
      if (record.riskReward) {
        totalRr += record.riskReward;
      }
    } else if (record.decision === 'WATCH') {
      regimeDistribution[record.regime].watch++;
    } else {
      regimeDistribution[record.regime].reject++;
    }

    if (record.gateResults) {
      for (const [gate, status] of Object.entries(record.gateResults)) {
        if (status === 'FAIL') {
          gateFailureCounts[gate] = (gateFailureCounts[gate] || 0) + 1;
        }
      }
    }

    if (record.rejectionReasons) {
      for (const reason of record.rejectionReasons) {
        const normalized = reason.split(':')[0] || reason;
        rejectionReasonCounts[normalized] = (rejectionReasonCounts[normalized] || 0) + 1;
      }
    }
  }

  return {
    totalRecords: allRecords.length,
    totalApproved,
    averageApprovedRr: totalApproved > 0 ? parseFloat((totalRr / totalApproved).toFixed(2)) : null,
    gateFailureCounts,
    rejectionReasonCounts,
    regimeDistribution
  };
}
