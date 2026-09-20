import fs from 'fs';
import path from 'path';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { appendLocalJsonl, safeSetDoc, isQuotaExhausted } from './firestoreSafe.js';

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
  settingsVersion?: number;
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
    for (let i = recentLines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(recentLines[i]);
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
      createdAt: new Date().toISOString()
    };

    // Prepend to in-memory buffer
    auditBuffer.unshift(fullRecord);
    if (auditBuffer.length > MAX_AUDIT_BUFFER) {
      auditBuffer.length = MAX_AUDIT_BUFFER;
    }

    // Persist to local jsonl file
    appendLocalJsonl('signal_audit.jsonl', fullRecord);

    // Persist to Firestore if quota not exhausted
    if (!isQuotaExhausted()) {
      safeSetDoc(doc(db, 'signal_audits', fullRecord.signalId), fullRecord).catch(() => {});
    }
  } catch (error) {
    console.error('[SignalAuditService] Failed to record signal audit:', error);
  }
}

export function getSignalAudits(limitCount = 100): SignalAuditRecord[] {
  return auditBuffer.slice(0, limitCount);
}
