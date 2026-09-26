import fs from 'fs';
import path from 'path';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../dbCollections.js';
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
    const stat = fs.statSync(jsonlPath);
    if (stat.size > 0) {
      const readSize = Math.min(stat.size, 512 * 1024); // read last 512KB max
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(jsonlPath, 'r');
      try {
        fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
      } finally {
        fs.closeSync(fd);
      }
      const chunk = buffer.toString('utf8');
      const lines = chunk.split('\n').filter(Boolean);
      const validLines = stat.size > readSize ? lines.slice(1) : lines;
      const recentLines = validLines.slice(-MAX_AUDIT_BUFFER);
      for (let i = recentLines.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(recentLines[i]);
          auditBuffer.push(item);
        } catch (e) {}
      }
    }
  }
} catch (err) {
  console.warn('[SignalAuditService] Could not preload signal_audit.jsonl:', err);
}

let writeCountSinceCheck = 0;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max

function pruneSignalAuditFileIfNeeded() {
  try {
    const jsonlPath = path.join(process.cwd(), 'data', 'signal_audit.jsonl');
    if (!fs.existsSync(jsonlPath)) return;
    const stat = fs.statSync(jsonlPath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      const readSize = Math.min(stat.size, 1024 * 1024); // read last 1MB (~2000 lines)
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(jsonlPath, 'r');
      try {
        fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
      } finally {
        fs.closeSync(fd);
      }
      const chunk = buffer.toString('utf8');
      const lines = chunk.split('\n').filter(Boolean);
      const validLines = stat.size > readSize ? lines.slice(1) : lines;
      const recentLines = validLines.slice(-1000); // keep last 1000 lines
      const tmpPath = jsonlPath + '.tmp';
      fs.writeFileSync(tmpPath, recentLines.join('\n') + '\n', 'utf8');
      fs.copyFileSync(tmpPath, jsonlPath);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  } catch (e) {
    console.warn('[SignalAuditService] Error pruning audit file:', e);
  }
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

    writeCountSinceCheck++;
    if (writeCountSinceCheck >= 200) {
      writeCountSinceCheck = 0;
      pruneSignalAuditFileIfNeeded();
    }

    // Persist to Firestore only for actionable trade signals (ENTER), not every rejected coin scan
    if (!isQuotaExhausted() && fullRecord.decision === 'ENTER') {
      safeSetDoc(doc(db, COLLECTIONS.SIGNAL_AUDITS, fullRecord.signalId), fullRecord).catch(() => {});
    }
  } catch (error) {
    console.error('[SignalAuditService] Failed to record signal audit:', error);
  }
}

export function getSignalAudits(limitCount = 100): SignalAuditRecord[] {
  return auditBuffer.slice(0, limitCount);
}
