import { db } from '../firebase.js';
import { COLLECTIONS } from '../dbCollections.js';
import { collection, doc } from 'firebase/firestore';
import { executionAdapter } from './ExecutionAdapter.js';
import { telegramService } from './TelegramService.js';
import { isQuotaExhausted, safeUpdateDoc, safeGetDocs, readLocalJson } from './firestoreSafe.js';

export class PositionReconciliationWorker {
  private syncInterval: any = null;
  private isReconciling = false;
  private lastReconciliationTime: number = Date.now();
  private lastAlertSentTime = new Map<string, number>();

  public getLastReconciliationTime(): number {
    return this.lastReconciliationTime;
  }

  public start() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    // Run reconciliation cycle every 45 seconds (lightweight & safe)
    this.syncInterval = setInterval(() => {
      this.reconcile();
    }, 45000);
  }

  public async runReconciliation() {
    return this.reconcile();
  }

  public async reconcile() {
    if (this.isReconciling) return;
    this.lastReconciliationTime = Date.now();
    if (!executionAdapter.getIsLive()) return; // Only cross-check with exchange when live trading is active
    const currentSettings = readLocalJson<any>('settings.json', {});
    if (currentSettings.tradingMode !== 'LIVE') return;

    this.isReconciling = true;

    try {
      const exchange = executionAdapter.getExchangeInstance();
      if (!exchange) return;

      // 1. Fetch Open Binance Positions (use v2/v3 as v1 was deprecated and removed by Binance)
      let binancePositionsRaw: any[] = [];
      if (typeof exchange.fapiPrivateV2GetPositionRisk === 'function') {
        binancePositionsRaw = await exchange.fapiPrivateV2GetPositionRisk();
      } else if (typeof exchange.fapiPrivateV3GetPositionRisk === 'function') {
        binancePositionsRaw = await exchange.fapiPrivateV3GetPositionRisk();
      } else if (typeof exchange.fetchPositions === 'function') {
        binancePositionsRaw = await exchange.fetchPositions();
      }
      const activeBinancePositions = Array.isArray(binancePositionsRaw)
        ? binancePositionsRaw.filter((p: any) => parseFloat(p.positionAmt || (p.info && p.info.positionAmt) || 0) !== 0)
        : [];
      
      // 2. Fetch Open Binance Orders (to verify stops exist)
      let openOrders: any[] = [];
      try {
        if (typeof exchange.fetchOpenOrders === 'function') {
          openOrders = await exchange.fetchOpenOrders();
        } else if (typeof exchange.fapiPrivateGetOpenOrders === 'function') {
          openOrders = await exchange.fapiPrivateGetOpenOrders();
        }
      } catch (orderErr) {
        console.warn('[Reconciliation] Warning fetching open orders:', orderErr);
      }
      
      // 3. Fetch Internal Positions (safe check)
      let activeDbPositions: any[] = [];
      if (isQuotaExhausted()) {
        const local = readLocalJson<any[]>('positions.json', []);
        activeDbPositions = local.filter((p: any) => p.status === 'OPEN').map((p: any) => ({ docId: p.id, ...p }));
      } else {
        const snapRes = await safeGetDocs(collection(db, COLLECTIONS.POSITIONS));
        if (snapRes.success) {
          activeDbPositions = snapRes.docs.map(d => ({ docId: d.id, ...d.data() })).filter((p: any) => p.status === 'OPEN');
        } else {
          const local = readLocalJson<any[]>('positions.json', []);
          activeDbPositions = local.filter((p: any) => p.status === 'OPEN').map((p: any) => ({ docId: p.id, ...p }));
        }
      }

      // 4. Cross-check
      for (const bPos of activeBinancePositions) {
        const symbol = bPos.symbol;
        const bPosAmt = parseFloat(bPos.positionAmt);
        
        // Find corresponding DB position
        const dbPos = activeDbPositions.find(p => p.symbol === symbol);
        
        const now = Date.now();
        const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // Throttle: 30 minutes between repeated urgent alerts per symbol

        if (!dbPos) {
          // If the user hasn't explicitly opted in to alert on external/foreign positions, ignore them cleanly
          if (currentSettings.alertOnExternalPositions === true) {
            console.warn(`[Reconciliation] Untracked Binance position on ${symbol} (${bPosAmt}). Alerting as requested.`);
            const alertKey = `MISMATCH_${symbol}`;
            if (!this.lastAlertSentTime.has(alertKey) || now - (this.lastAlertSentTime.get(alertKey) || 0) > ALERT_COOLDOWN_MS) {
              this.lastAlertSentTime.set(alertKey, now);
              telegramService.sendUrgentAlert(`🚨 CRITICAL MISMATCH 🚨\nBinance has an open position on ${symbol} not tracked in the DB. Immediate manual intervention required.`);
            }
          } else {
            // External bot or manual position detected on shared Binance account - ignore cleanly
            console.log(`[Reconciliation] External position detected on Binance: ${symbol} (${bPosAmt}). Managed by another bot or manual trade. Skipping.`);
          }
          continue;
        }

        // Verify protective stop exists
        const expectedStopSide = bPosAmt > 0 ? 'SELL' : 'BUY';
        const symbolOrders = openOrders.filter((o: any) => o.symbol === symbol && o.side === expectedStopSide);
        
        const hasStop = symbolOrders.some((o: any) => 
          o.type === 'STOP_MARKET' || 
          o.type === 'STOP' || 
          o.type === 'TRAILING_STOP_MARKET'
        );

        const stopStatus = hasStop ? 'ACTIVE' : 'MISSING';

        if (!hasStop) {
          console.error(`🚨 [CRITICAL RISK] ${symbol} position exists but NO PROTECTIVE STOP is active on Binance!`);
          const alertKey = `UNPROTECTED_${symbol}`;
          if (!this.lastAlertSentTime.has(alertKey) || now - (this.lastAlertSentTime.get(alertKey) || 0) > ALERT_COOLDOWN_MS) {
            this.lastAlertSentTime.set(alertKey, now);
            telegramService.sendUrgentAlert(`🚨 UNPROTECTED POSITION 🚨\n${symbol} is open but has no active stop loss on Binance. Emergency close recommended.`);
          }
        }

        if (dbPos.stopStatus !== stopStatus) {
           await safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, dbPos.docId), {
             stopStatus
           });
        }
      }

      // Check for ghost DB positions
      for (const dbPos of activeDbPositions) {
        const isBinanceOpen = activeBinancePositions.some((p: any) => p.symbol === dbPos.symbol);
        if (!isBinanceOpen) {
          console.warn(`[Reconciliation] DB shows OPEN position for ${dbPos.symbol}, but Binance is flat. Auto-closing DB record.`);
          await safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, dbPos.docId), {
            status: 'CLOSED',
            execution_state: 'CLOSED_BY_RECONCILIATION'
          });
        }
      }
      
      console.log(`[Reconciliation] Complete. ${activeBinancePositions.length} active positions verified.`);
    } catch (e) {
      console.error(`[Reconciliation] Error running reconciliation sync:`, e);
    } finally {
      this.isReconciling = false;
    }
  }
}

export const reconciliationWorker = new PositionReconciliationWorker();
