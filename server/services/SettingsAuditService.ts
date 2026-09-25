import fs from 'fs';
import path from 'path';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { COLLECTIONS } from '../dbCollections.js';
import { appendLocalJsonl, safeSetDoc, isQuotaExhausted } from './firestoreSafe.js';

export interface SettingsAuditRecord {
  auditId: string;
  userId: string;
  accountId: string;
  action: string;
  before: Record<string, any>;
  after: Record<string, any>;
  changedFields: string[];
  version: number;
  source: 'FRONTEND' | 'API' | 'SYSTEM' | 'RECOVERY';
  createdAt: string;
  ipHashOrRequestId?: string;
}

const MAX_AUDIT_BUFFER = 100;
const auditBuffer: SettingsAuditRecord[] = [];

// Redact credentials from audit logs
const SENSITIVE_FIELDS = new Set([
  'binanceApiKey',
  'binanceApiSecret',
  'telegramBotToken',
  'githubPat'
]);

function sanitizeForAudit(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = value ? '[REDACTED]' : '';
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Preload recent audit records from disk on startup
try {
  const jsonlPath = path.join(process.cwd(), 'data', 'settings_audit.jsonl');
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
      const recent = validLines.slice(-MAX_AUDIT_BUFFER);
      for (let i = recent.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(recent[i]);
          auditBuffer.push(item);
        } catch (e) {}
      }
    }
  }
} catch (err) {
  console.warn('[SettingsAuditService] Could not preload settings_audit.jsonl:', err);
}

export function recordSettingsAudit(
  before: Record<string, any>,
  after: Record<string, any>,
  version: number,
  source: 'FRONTEND' | 'API' | 'SYSTEM' | 'RECOVERY' = 'FRONTEND',
  userId: string = 'default-user',
  accountId: string = 'main-account'
): SettingsAuditRecord {
  const changedFields: string[] = [];
  const diffBefore: Record<string, any> = {};
  const diffAfter: Record<string, any> = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === 'updatedAt' || key === 'settingsVersion') continue;
    const valBefore = before[key];
    const valAfter = after[key];

    // Deep equality check for primitives and simple objects
    const beforeStr = JSON.stringify(valBefore);
    const afterStr = JSON.stringify(valAfter);

    if (beforeStr !== afterStr) {
      changedFields.push(key);
      diffBefore[key] = SENSITIVE_FIELDS.has(key) ? (valBefore ? '[REDACTED]' : '') : valBefore;
      diffAfter[key] = SENSITIVE_FIELDS.has(key) ? (valAfter ? '[REDACTED]' : '') : valAfter;
    }
  }

  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const record: SettingsAuditRecord = {
    auditId,
    userId,
    accountId,
    action: changedFields.length > 0 ? 'SETTINGS_UPDATED' : 'SETTINGS_TOUCHED',
    before: diffBefore,
    after: diffAfter,
    changedFields,
    version,
    source,
    createdAt: new Date().toISOString()
  };

  // Prepend to in-memory buffer
  auditBuffer.unshift(record);
  if (auditBuffer.length > MAX_AUDIT_BUFFER) {
    auditBuffer.length = MAX_AUDIT_BUFFER;
  }

  // Persist to disk
  appendLocalJsonl('settings_audit.jsonl', record);

  // Best-effort persist to Firestore if quota not exhausted
  if (!isQuotaExhausted()) {
    safeSetDoc(doc(db, COLLECTIONS.SETTINGS_AUDIT, auditId), record).catch(() => {});
  }

  console.log(`📝 [SettingsAudit] Recorded audit ${auditId} (v${version}): ${changedFields.join(', ') || 'No fields changed'}`);
  return record;
}

export function getSettingsAudits(limitCount = 50): SettingsAuditRecord[] {
  return auditBuffer.slice(0, limitCount);
}
