// src/utils/strategies/core/logger.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight structured JSON-line logger.
// Logs BOTH accepted and rejected signals so you can distinguish:
//   "strategy never fires" vs "strategy fires but filters reject everything"
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from "fs";
import * as path from "path";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface SignalLogEntry {
  level: LogLevel;
  ts: string;                    // ISO-8601
  strategy: string;
  symbol?: string;
  timeframe?: string;
  candleTime?: number;
  regime?: string;
  volatility?: string;
  direction?: "long" | "short";
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  atr?: number;
  setupScore?: number;
  regimeConfidence?: number;
  riskQualityScore?: number;
  rr1?: number;
  bufferApplied?: number;
  rejectionReason: string | null;
  durationMs?: number;
  dataVersion?: string;
  [key: string]: unknown;
}

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "strategies.log");

let _fileStream: fs.WriteStream | null = null;
let _consoleEnabled = true;

function getStream(): fs.WriteStream {
  if (!_fileStream) {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    _fileStream = fs.createWriteStream(LOG_FILE, { flags: "a", encoding: "utf8" });
  }
  return _fileStream;
}

export const logger = {
  /** Enable/disable console echo (on by default) */
  setConsole(enabled: boolean) { _consoleEnabled = enabled; },

  log(entry: SignalLogEntry) {
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n";
    try { getStream().write(line); } catch { /* non-fatal */ }
    if (_consoleEnabled) {
      const prefix = `[${entry.level.toUpperCase()}][${entry.strategy}]`;
      if (entry.rejectionReason) {
        console.warn(`${prefix} REJECTED: ${entry.rejectionReason}`);
      } else {
        console.info(`${prefix} SIGNAL ${entry.direction} entry=${entry.entry} sl=${entry.sl}`);
      }
    }
  },

  info(entry: Omit<SignalLogEntry, "level">) {
    this.log({ ...entry, level: "info" });
  },

  warn(entry: Omit<SignalLogEntry, "level">) {
    this.log({ ...entry, level: "warn" });
  },

  error(entry: Omit<SignalLogEntry, "level">) {
    this.log({ ...entry, level: "error" });
  },

  /** Time a strategy evaluation and attach durationMs */
  time<T>(label: string, fn: () => T): { result: T; durationMs: number } {
    const start = Date.now();
    const result = fn();
    return { result, durationMs: Date.now() - start };
  },
};
