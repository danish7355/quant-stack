import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  Query, 
  DocumentReference, 
  SetOptions, 
  UpdateData 
} from 'firebase/firestore';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

// Track quota exhaustion state with disk persistence to survive server restarts
const QUOTA_STATE_FILE = path.join(DATA_DIR, 'quota_state.json');
let quotaExhaustedUntil: number = 0;
let hasLoggedQuotaNotice: boolean = false;

try {
  if (fs.existsSync(QUOTA_STATE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(QUOTA_STATE_FILE, 'utf8'));
    if (raw && typeof raw.quotaExhaustedUntil === 'number' && raw.quotaExhaustedUntil > Date.now()) {
      quotaExhaustedUntil = raw.quotaExhaustedUntil;
      console.log(`[Firestore] Loaded persisted quota exhaustion state: active for next ${Math.round((quotaExhaustedUntil - Date.now()) / 60000)} minutes.`);
    }
  }
} catch (e) {}

export function isQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil;
}

export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || error?.code || error);
  return (
    msg.includes('resource-exhausted') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded') ||
    error?.code === 'resource-exhausted'
  );
}

export function markQuotaExhausted(cooldownMs: number = 30 * 60 * 1000) {
  quotaExhaustedUntil = Math.max(quotaExhaustedUntil, Date.now() + cooldownMs);
  try {
    fs.writeFileSync(QUOTA_STATE_FILE, JSON.stringify({ quotaExhaustedUntil }), 'utf8');
  } catch (e) {}

  if (!hasLoggedQuotaNotice) {
    hasLoggedQuotaNotice = true;
    console.warn(
      `⚠️ [Firestore] Free daily write quota reached (RESOURCE_EXHAUSTED). Switching automatically to local offline-first storage (data/) for the next ${Math.round(cooldownMs / 60000)} minutes.`
    );
    // Reset notice log flag after cooldown
    setTimeout(() => {
      hasLoggedQuotaNotice = false;
    }, cooldownMs);
  }
}

// --- Local File Storage Helpers ---

export function readLocalJson<T>(filename: string, defaultValue: T): T {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as T;
    }
  } catch (e) {
    console.warn(`[LocalStore] Failed to read ${filename}:`, e);
  }
  return defaultValue;
}

export function writeLocalJson<T>(filename: string, data: T): boolean {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`[LocalStore] Failed to write ${filename}:`, e);
    return false;
  }
}

export function appendLocalJsonl<T>(filename: string, item: T): boolean {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.appendFileSync(filePath, JSON.stringify(item) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error(`[LocalStore] Failed to append ${filename}:`, e);
    return false;
  }
}

export function getRecentTradeLogsFromDisk(limitCount = 50): any[] {
  const filePath = path.join(DATA_DIR, 'trade_logs.jsonl');
  if (!fs.existsSync(filePath)) return [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    const parsed: any[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < limitCount; i--) {
      try {
        const item = JSON.parse(lines[i]);
        if (!item.id) {
          item.id = `disk-log-${item.symbol || 'COIN'}-${item.timestamp || item.time_close || i}-${i}`;
        }
        parsed.push(item);
      } catch (e) {}
    }
    return parsed;
  } catch (e) {
    return [];
  }
}

// --- Safe Firestore Operations with Non-blocking Timeouts ---

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 3000, fallbackMsg = 'Firestore timeout'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(fallbackMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function safeSetDoc<T extends Record<string, any>>(
  ref: DocumentReference,
  data: T,
  options?: SetOptions
): Promise<{ success: boolean; isQuotaExhausted: boolean }> {
  if (isQuotaExhausted()) {
    return { success: false, isQuotaExhausted: true };
  }

  try {
    if (options) {
      await withTimeout(setDoc(ref, data, options), 3000);
    } else {
      await withTimeout(setDoc(ref, data), 3000);
    }
    return { success: true, isQuotaExhausted: false };
  } catch (error: any) {
    if (isQuotaError(error)) {
      markQuotaExhausted();
      return { success: false, isQuotaExhausted: true };
    }
    console.warn(`[Firestore] Safe setDoc fallback for ${ref.path}:`, error?.message || error);
    return { success: false, isQuotaExhausted: false };
  }
}

export async function safeUpdateDoc(
  ref: DocumentReference,
  data: UpdateData<any>
): Promise<{ success: boolean; isQuotaExhausted: boolean }> {
  if (isQuotaExhausted()) {
    return { success: false, isQuotaExhausted: true };
  }

  try {
    await withTimeout(updateDoc(ref, data), 3000);
    return { success: true, isQuotaExhausted: false };
  } catch (error: any) {
    if (isQuotaError(error)) {
      markQuotaExhausted();
      return { success: false, isQuotaExhausted: true };
    }
    console.warn(`[Firestore] Safe updateDoc fallback for ${ref.path}:`, error?.message || error);
    return { success: false, isQuotaExhausted: false };
  }
}

export async function safeDeleteDoc(
  ref: DocumentReference
): Promise<{ success: boolean; isQuotaExhausted: boolean }> {
  if (isQuotaExhausted()) {
    return { success: false, isQuotaExhausted: true };
  }

  try {
    await withTimeout(deleteDoc(ref), 3000);
    return { success: true, isQuotaExhausted: false };
  } catch (error: any) {
    if (isQuotaError(error)) {
      markQuotaExhausted();
      return { success: false, isQuotaExhausted: true };
    }
    console.warn(`[Firestore] Safe deleteDoc fallback for ${ref.path}:`, error?.message || error);
    return { success: false, isQuotaExhausted: false };
  }
}

export async function safeGetDoc(ref: DocumentReference) {
  try {
    const snap = await withTimeout(getDoc(ref), 3000);
    return { success: true, exists: snap.exists(), data: snap.exists() ? snap.data() : null };
  } catch (error: any) {
    if (isQuotaError(error)) {
      markQuotaExhausted();
    }
    return { success: false, exists: false, data: null, error };
  }
}

export async function safeGetDocs(q: Query) {
  try {
    const snap = await withTimeout(getDocs(q), 3000);
    return { success: true, docs: snap.docs };
  } catch (error: any) {
    if (isQuotaError(error)) {
      markQuotaExhausted();
    }
    return { success: false, docs: [], error };
  }
}
