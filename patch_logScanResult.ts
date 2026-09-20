import fs from 'fs';

let content = fs.readFileSync('server/services/AutoTrader.ts', 'utf8');

content = content.replace(
  /import \{ riskManager \} from '\.\/RiskManager\.js';/,
  "import { riskManager } from './RiskManager.js';\nimport { writeSignalAudit } from './SignalAuditService.js';"
);

// We need to update logScanResult to call writeSignalAudit.
// Also keep the JSONL logging for backward compatibility.
const newLogScanResult = `  private logScanResult(
    symbol: string, 
    direction: string, 
    passes: boolean, 
    rejectReason: string, 
    price: number, 
    sl: number, 
    tp1: number, 
    score: number,
    extra?: {
      macroColor?: string;
      marketRegime?: string;
      regimeConfidence?: number;
      tradeQuality?: string;
      strategyPriority?: string;
      structuralRR?: number;
    }
  ) {
    try {
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        symbol,
        direction,
        passed_gates: passes,
        reject_reason: rejectReason || null,
        entry_price: price,
        sl,
        tp1,
        score,
        macroColor: extra?.macroColor || null,
        marketRegime: extra?.marketRegime || null,
        regimeConfidence: extra?.regimeConfidence ?? null,
        tradeQuality: extra?.tradeQuality || null,
        strategyPriority: extra?.strategyPriority || null,
        structuralRR: extra?.structuralRR ?? null,
        strategy_version: 'v2.1_closed_candles'
      }) + '\\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'scan_logs.jsonl'), logLine);
    } catch(e) {}

    // Signal Audit Trail integration
    try {
      const decision = passes ? 'ENTER' : (rejectReason?.includes('Paused') || rejectReason?.includes('Failed Technical') ? 'WATCH' : 'REJECT');
      
      writeSignalAudit({
        signalId: \`\${symbol}-\${Date.now()}\`,
        symbol: symbol,
        timeframe: '15m', // default assumption in autotrader
        strategy: extra?.strategyPriority || 'UNKNOWN_STRATEGY',
        regime: extra?.marketRegime || 'UNKNOWN_REGIME',
        direction: (direction === 'LONG' || direction === 'SHORT') ? direction : 'NONE',
        confidence: extra?.regimeConfidence || score || 0,
        decision: decision,
        rejectionReasons: rejectReason ? [rejectReason] : [],
        gateResults: {
          macro: extra?.macroColor ? 'PASS' : 'NOT_CHECKED'
        },
        entryPrice: price || null,
        stopPrice: sl || null,
        targetPrices: tp1 ? [tp1] : [],
        riskReward: extra?.structuralRR || null,
        spreadBps: null,
        volumePercentile: null
      });
    } catch(e) {}
  }`;

content = content.replace(/  private logScanResult\([\s\S]*?\} catch\(e\) \{\}\n  \}/, newLogScanResult);

fs.writeFileSync('server/services/AutoTrader.ts', content);
