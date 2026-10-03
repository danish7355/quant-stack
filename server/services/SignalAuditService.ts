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

const MAX_AUDIT_BUFFER = 200;
const auditBuffer: SignalAuditRecord[] = [];

// Initialize buffer from existing local signal_audit.jsonl on startup
try {
  const jsonlPath = path.join(process.cwd(), 'data', 'signal_audit.jsonl');
  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    const recentLines = lines.slice(-MAX_AUDIT_BUFFER);
    const seenIds = new Set<string>();
    for (let i = recentLines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(recentLines[i]);
        if (!item.signalId) item.signalId = `${item.symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        if (seenIds.has(item.signalId)) {
          item.signalId = `${item.signalId}-${Math.random().toString(36).substring(2, 6)}`;
        }
        seenIds.add(item.signalId);
        auditBuffer.push(item);
      } catch (e) {}
    }
  }
} catch (err) {
  console.warn('[SignalAuditService] Could not preload signal_audit.jsonl:', err);
}

export async function writeSignalAudit(record: Omit<SignalAuditRecord, 'createdAt'>) {
  try {
    const fullRecord: SignalAuditRecord = {
      ...record,
      signalId: record.signalId && !auditBuffer.some(b => b.signalId === record.signalId)
        ? record.signalId
        : `${record.symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString()
    };

    // Prepend to in-memory buffer
    auditBuffer.unshift(fullRecord);
    if (auditBuffer.length > MAX_AUDIT_BUFFER) {
      auditBuffer.length = MAX_AUDIT_BUFFER;
    }

    // Persist to local jsonl file
    appendLocalJsonl('signal_audit.jsonl', fullRecord);
  } catch (error) {
    console.error('[SignalAuditService] Failed to record signal audit:', error);
  }
}

export function getSignalAudits(limitCount = 100): SignalAuditRecord[] {
  return auditBuffer.slice(0, limitCount);
}

export function getAuditAnalytics() {
  const gateFailureCounts: Record<string, number> = {};
  const regimeDistribution: Record<string, { enter: number; watch: number; reject: number }> = {};
  const rejectionReasonCounts: Record<string, number> = {};
  let totalApproved = 0;
  let totalRr = 0;

  for (const record of auditBuffer) {
    if (!regimeDistribution[record.regime]) {
      regimeDistribution[record.regime] = { enter: 0, watch: 0, reject: 0 };
    }
    if (record.decision === 'ENTER') {
      regimeDistribution[record.regime].enter++;
      totalApproved++;
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
    totalRecords: auditBuffer.length,
    totalApproved,
    averageApprovedRr: totalApproved > 0 ? parseFloat((totalRr / totalApproved).toFixed(2)) : null,
    gateFailureCounts,
    rejectionReasonCounts,
    regimeDistribution
  };
}
