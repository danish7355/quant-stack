import { db } from '../firebase.js';
import { collection, doc } from 'firebase/firestore';
import { executionAdapter } from './ExecutionAdapter.js';
import { telegramService } from './TelegramService.js';
import { isQuotaExhausted, safeUpdateDoc, safeSetDoc, safeGetDocs, readLocalJson, writeLocalJson } from './firestoreSafe.js';

export class PositionReconciliationWorker {
  private syncInterval: any = null;
  private isReconciling = false;
  private alertedStops = new Map<string, number>();
  private alertedMismatches = new Map<string, number>();
  private ghostMissCount = new Map<string, number>();

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
    if (!executionAdapter.getIsLive()) return; // Only reconcile when live trading is active

    this.isReconciling = true;

    try {
      const isCoinDcx = executionAdapter.getExchangeProvider() === 'COINDCX';
      const exchangeName = isCoinDcx ? 'CoinDCX' : 'Binance';

      // 1. Fetch Open Exchange Positions
      const exchangePositionsRaw = await executionAdapter.fetchPositionRisk();
      const activeExchangePositions = (exchangePositionsRaw || []).filter((p: any) => parseFloat(p.positionAmt || '0') !== 0);
      
      // 2. Fetch Open Exchange Orders (to verify stops exist)
      const openOrders = await executionAdapter.fetchOpenOrders();
      
      // 3. Fetch Internal Positions (safe check)
      let activeDbPositions: any[] = [];
      if (isQuotaExhausted()) {
        const local = readLocalJson<any[]>('positions.json', []);
        activeDbPositions = local.filter((p: any) => p.status === 'OPEN').map((p: any) => ({ docId: p.id, ...p }));
      } else {
        const snapRes = await safeGetDocs(collection(db, 'positions'));
        if (snapRes.success) {
          activeDbPositions = snapRes.docs.map(d => ({ docId: d.id, ...d.data() })).filter((p: any) => p.status === 'OPEN');
        } else {
          const local = readLocalJson<any[]>('positions.json', []);
          activeDbPositions = local.filter((p: any) => p.status === 'OPEN').map((p: any) => ({ docId: p.id, ...p }));
        }
      }

      // 4. Cross-check
      for (const bPos of activeExchangePositions) {
        const symbol = bPos.symbol;
        const bPosAmt = parseFloat(bPos.positionAmt);
        
        // Find corresponding DB position
        const dbPos = activeDbPositions.find(p => p.symbol === symbol);
        
        const bDirection = bPosAmt > 0 ? 'LONG' : 'SHORT';
        const expectedStopSide = bPosAmt > 0 ? 'SELL' : 'BUY';
        const symbolOrders = openOrders.filter((o: any) => o.symbol === symbol && o.side === expectedStopSide);
        const exchangeStopOrder = symbolOrders.find((o: any) => parseFloat(o.stopPrice || '0') > 0);
        const existingStopPrice = exchangeStopOrder ? parseFloat(exchangeStopOrder.stopPrice) : 0;

        if (!dbPos) {
          console.warn(`[Reconciliation] Auto-adopting ${exchangeName} open position for ${symbol} into DB.`);
          const newDocId = `${isCoinDcx ? 'coindcx' : 'binance'}-${symbol}-${Date.now()}`;
          const bEntry = parseFloat(bPos.entryPrice || '0');
          const bMark = parseFloat(bPos.markPrice || bPos.entryPrice || '0');
          const bPnl = parseFloat(bPos.unRealizedProfit || '0');
          const bLev = parseFloat(bPos.leverage || '10');
          const bNotional = Math.abs(parseFloat(bPos.notional || (bEntry * Math.abs(bPosAmt)).toString()));

          // If exchange order has a stop price, adopt it; otherwise set a default 2% safety stop so SL is NEVER 0
          const safeAdoptedSl = existingStopPrice > 0 
            ? existingStopPrice 
            : (bDirection === 'LONG' ? bEntry * 0.98 : bEntry * 1.02);

          const isMarginInr = isCoinDcx && (bPos.marginCurrency === 'INR' || executionAdapter.getMarginCurrency() === 'INR');
          const rate = isMarginInr ? executionAdapter.getUsdtToInrRate() : 1.0;
          const allocatedMargin = bLev > 0 ? (bNotional * rate) / bLev : (bNotional * rate);

          const newPosRecord: any = {
            id: newDocId,
            symbol,
            direction: bDirection,
            quantity: Math.abs(bPosAmt),
            original_quantity: Math.abs(bPosAmt),
            entry_price: bEntry,
            current_price: bMark,
            mark_price: bMark,
            unrealized_profit: bPnl,
            allocated_balance: Number(allocatedMargin.toFixed(2)),
            original_allocated: Number(allocatedMargin.toFixed(2)),
            leverage: bLev,
            liquidation_price: parseFloat(bPos.liquidationPrice || '0'),
            sl: safeAdoptedSl,
            tp1: 0,
            tp2: 0,
            tp3: 0,
            strategy: isCoinDcx ? 'COINDCX_DIRECT' : 'BINANCE_DIRECT',
            market_regime: 'LIVE_POSITION',
            time_open: new Date(bPos.updateTime || Date.now()).toISOString(),
            status: 'OPEN',
            stopStatus: existingStopPrice > 0 ? 'ACTIVE' : 'MISSING',
            execution_state: 'POSITION_ACTIVE'
          };
          await safeSetDoc(doc(db, 'positions', newDocId), newPosRecord);
          continue;
        } else {
          this.alertedMismatches.delete(symbol);
        }

        // Verify protective stop exists
        let hasStop = symbolOrders.some((o: any) => {
          const typeStr = (o.type || '').toUpperCase();
          return typeStr.includes('STOP') || typeStr.includes('TRAILING');
        });

        const bLev = parseFloat(bPos.leverage || '10');

        // Auto-repair missing stop on exchange
        if (!hasStop && dbPos.sl && dbPos.sl > 0) {
          console.log(`🛡️ [Reconciliation] Auto-repairing missing stop loss on ${exchangeName} for ${symbol} at $${dbPos.sl}`);
          try {
            const stopSide = bPosAmt > 0 ? 'sell' : 'buy';
            await executionAdapter.createStopMarketOrder(symbol, stopSide, Math.abs(bPosAmt), dbPos.sl, `REC-${symbol}-${Date.now()}`, bLev);
            hasStop = true;
          } catch (repairErr) {
            console.error(`🚨 [Reconciliation] Failed to auto-repair stop order on ${exchangeName}:`, repairErr);
          }
        }

        const stopStatus = hasStop ? 'ACTIVE' : 'MISSING';

        if (!hasStop) {
          const now = Date.now();
          const lastAlert = this.alertedStops.get(symbol) || 0;
          if (now - lastAlert > 300000) {
            this.alertedStops.set(symbol, now);
            console.error(`🚨 [CRITICAL RISK] ${symbol} position exists but NO PROTECTIVE STOP is active on ${exchangeName}!`);
            telegramService.sendUrgentAlert(`🚨 UNPROTECTED POSITION 🚨\n${symbol} is open but has no active stop loss on ${exchangeName}. Emergency close recommended.`);
          }
        } else {
          this.alertedStops.delete(symbol);
        }

        const bEntry = parseFloat(bPos.entryPrice || '0');
        const bMark = parseFloat(bPos.markPrice || bPos.entryPrice || '0');
        const bPnl = parseFloat(bPos.unRealizedProfit || '0');
        const bLiq = parseFloat(bPos.liquidationPrice || '0');

        const updatePayload: any = {
          current_price: bMark,
          unrealized_profit: bPnl,
          quantity: Math.abs(bPosAmt),
          leverage: bLev,
          liquidation_price: bLiq
        };
        if (bEntry > 0) {
          updatePayload.entry_price = bEntry;
        }
        if (dbPos.stopStatus !== stopStatus) {
          updatePayload.stopStatus = stopStatus;
        }
        await safeUpdateDoc(doc(db, 'positions', dbPos.docId), updatePayload);
      }

      // Check for ghost DB positions with a 120s grace period and multi-check confirmation
      const now = Date.now();
      for (const dbPos of activeDbPositions) {
        const openTime = dbPos.time_open ? new Date(dbPos.time_open).getTime() : now;
        // Grace period: allow 2 minutes for newly placed orders to register on the exchange
        if (now - openTime < 120000) {
          continue;
        }

        const isExchangeOpen = activeExchangePositions.some((p: any) => p.symbol === dbPos.symbol);
        if (!isExchangeOpen) {
          const missCount = (this.ghostMissCount.get(dbPos.symbol) || 0) + 1;
          this.ghostMissCount.set(dbPos.symbol, missCount);
          if (missCount >= 2) {
            console.warn(`[Reconciliation] DB shows OPEN position for ${dbPos.symbol}, but ${exchangeName} is flat across multiple checks. Auto-closing DB record.`);
            await safeUpdateDoc(doc(db, 'positions', dbPos.docId), {
              status: 'CLOSED',
              execution_state: 'CLOSED_BY_RECONCILIATION'
            });
            this.ghostMissCount.delete(dbPos.symbol);
          }
        } else {
          this.ghostMissCount.delete(dbPos.symbol);
        }
      }
      
      console.log(`[Reconciliation] Complete. ${activeExchangePositions.length} active positions verified on ${exchangeName}.`);
    } catch (e) {
      console.error(`[Reconciliation] Error running reconciliation sync:`, e);
    } finally {
      this.isReconciling = false;
    }
  }
}

export const reconciliationWorker = new PositionReconciliationWorker();
