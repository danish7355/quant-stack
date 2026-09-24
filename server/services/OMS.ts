import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, setDoc, getDoc, updateDoc, writeBatch, collection } from 'firebase/firestore';
import { riskManager } from './RiskManager.js';
import { telegramService } from './TelegramService.js';
import { executionAdapter } from './ExecutionAdapter.js';
import { positionMonitor } from './PositionMonitor.js';
import { safeSetDoc, safeUpdateDoc, safeGetDoc, isQuotaExhausted, appendLocalJsonl } from './firestoreSafe.js';

export class OMS {
  private processingOrder = new Set<string>();
  private closingPositions = new Set<string>();
  public onTradeClosed?: (pnl: number) => void;
  public isEngineActive?: () => boolean;

  public async placeOrder(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    price: number,
    score: number,
    atr: number,
    customOpts?: {
      balance?: number;
      qty?: number;
      leverage?: number;
      allocatedBalance?: number;
      sl?: number;
      tp1?: number;
      tp2?: number;
      tp3?: number;
      strategy?: string;
      marketRegime?: string;
      isAutoRegime?: boolean;
      frequencyPreset?: string;
      compressionHigh?: number;
      compressionLow?: number;
      macroColor?: string;
      macroLabel?: string;
      regimeConfidence?: number;
      confidenceLevel?: 'High' | 'Medium' | 'Low';
      tradeQuality?: string;
      strategyPriority?: string;
      rrStruct?: string;
      structuralRR?: number;
    }
  ) {
    if (this.isEngineActive && !this.isEngineActive()) {
      throw new Error(`Engine is stopped. New trade execution is blocked.`);
    }

    if (!symbol || !direction || !price || isNaN(price) || price <= 0) {
      throw new Error(`Invalid order params for ${symbol}`);
    }

    if (this.processingOrder.has(symbol)) {
      console.warn(`OMS: Order already processing for ${symbol}, skipping duplicate`);
      return null;
    }

    this.processingOrder.add(symbol);

    try {
      const balance = customOpts?.balance || 10000;
      const riskPct = 2;
      const leverage = customOpts?.leverage || 1;
      
      const { allocatedBalance, quantity, actualLeverage } = riskManager.calculatePositionSize(
        balance,
        riskPct,
        leverage,
        price
      );
      
      const finalAllocated = customOpts?.allocatedBalance && customOpts.allocatedBalance > 0
        ? customOpts.allocatedBalance 
        : allocatedBalance;

      const finalQuantityResolved = customOpts?.qty && customOpts.qty > 0 
        ? customOpts.qty 
        : quantity;

      const finalLeverageResolved = customOpts?.leverage && customOpts.leverage >= 1 
        ? customOpts.leverage 
        : actualLeverage;

      const currentPositionCount = positionMonitor.getActivePositions().length;
      const riskCheck = riskManager.checkEntryAllowed(balance, finalAllocated, currentPositionCount);
      if (!riskCheck.allowed) {
        throw new Error(`Risk manager check disallowed trade for ${symbol}: ${riskCheck.reason}`);
      }

      const safeAtr = (atr && atr > 0) ? atr : (price * 0.015);
      
      // Tight Stop Loss (1.0x ATR or explicit structural level) & 1:3 Asymmetric Target
      const computedRisk = (customOpts?.sl !== undefined && customOpts.sl > 0)
        ? Math.abs(price - customOpts.sl)
        : (safeAtr * 1.0); // tight 1.0x ATR invalidation to minimize loss

      let sl = (customOpts?.sl !== undefined && customOpts.sl > 0)
        ? customOpts.sl 
        : (direction === 'LONG' ? Math.max(0.0001, price - computedRisk) : price + computedRisk);

      // Failsafe: Stop loss distance cannot exceed 4.0% of entry price to prevent margin blowouts on leverage
      const maxStopDistance = price * 0.04;
      if (direction === 'LONG' && (price - sl) > maxStopDistance) {
        sl = price - maxStopDistance;
      } else if (direction === 'SHORT' && (sl - price) > maxStopDistance) {
        sl = price + maxStopDistance;
      }
      const tp1 = (customOpts?.tp1 !== undefined && customOpts.tp1 > 0)
        ? customOpts.tp1 
        : (direction === 'LONG' ? price + computedRisk * 1.0 : Math.max(0.0001, price - computedRisk * 1.0));
      const tp2 = (customOpts?.tp2 !== undefined && customOpts.tp2 > 0)
        ? customOpts.tp2 
        : (direction === 'LONG' ? price + computedRisk * 2.0 : Math.max(0.0001, price - computedRisk * 2.0));
      const tp3 = (customOpts?.tp3 !== undefined && customOpts.tp3 > 0)
        ? customOpts.tp3 
        : (direction === 'LONG' ? price + computedRisk * 3.0 : Math.max(0.0001, price - computedRisk * 3.0));
      
      const posId = `sig_${Date.now()}_${Math.random().toString(36).substring(4)}`;
      const strategyPrefix = (customOpts?.strategy || 'GEN').substring(0, 8).replace(/[^a-zA-Z0-9]/g, '');
      
      // Trade Admission Record (Audit Trail) - Non-blocking async
      if (!isQuotaExhausted()) {
        safeSetDoc(doc(collection(db, 'trade_admissions'), posId), {
           posId,
           symbol,
           direction,
           requestedPrice: price,
           computedSl: sl,
           computedTp1: tp1,
           confidenceScore: score,
           strategy: customOpts?.strategy || 'UNKNOWN',
           marketRegime: customOpts?.marketRegime || 'UNKNOWN',
           allocatedBalance: finalAllocated,
           leverage: finalLeverageResolved,
           quantity: finalQuantityResolved,
           timestamp: Date.now(),
           status: 'APPROVED'
        }).catch((admissionErr: any) => {
          console.warn(`[OMS] Trade admission record skipped:`, admissionErr?.message || admissionErr);
        });
      }

      // Generate 36-char max deterministic Client Order IDs
      const baseId = `${strategyPrefix}-${symbol}-${posId}`;
      const entryOrderId = `E-${baseId}`.substring(0, 36);
      const stopOrderId = `S-${baseId}`.substring(0, 36);

      let executionState = 'SIGNAL_CREATED';

      // Execute on live exchange if live mode is enabled
      if (executionAdapter.getIsLive()) {
        const side = direction === 'LONG' ? 'buy' : 'sell';
        const stopSide = direction === 'LONG' ? 'sell' : 'buy';

        try {
          executionState = 'ORDER_SUBMITTED';
          await executionAdapter.createMarketOrder(symbol, side, finalQuantityResolved, finalLeverageResolved, entryOrderId);
          
          executionState = 'FILLED';
          
          // IMMEDIATELY Submit Protective Stop Loss
          await executionAdapter.createStopMarketOrder(symbol, stopSide, finalQuantityResolved, sl, stopOrderId);
          
          executionState = 'PROTECTION_PLACED';
        } catch (ex: any) {
          console.error(`🚨 [CRITICAL OMS ERROR] Failed during execution state: ${executionState} for ${symbol}. Triggering emergency fallback.`, ex);
          // If we filled the entry but failed to place the stop loss, we MUST close the position to prevent unprotected exposure.
          if (executionState === 'FILLED' || executionState === 'ORDER_SUBMITTED') {
            try {
              const closeSide = direction === 'LONG' ? 'sell' : 'buy';
              await executionAdapter.closeMarketPosition(symbol, closeSide, finalQuantityResolved, `EMG-${baseId}`.substring(0, 36));
              console.warn(`🛡️ Emergency close succeeded for unprotected ${symbol} position.`);
            } catch (closeErr) {
              console.error(`🚨🚨 FATAL: Emergency close FAILED for ${symbol}. Manual intervention required!`, closeErr);
            }
          }
          throw new Error(`Execution failed at state ${executionState}: ${ex.message}`);
        }
      }
      
      executionState = 'POSITION_ACTIVE';
      
      const positionData = {
        id: posId,
        symbol,
        direction,
        strategy: customOpts?.strategy || 'BINANCE_COMPOSITE',
        market_regime: (customOpts as any)?.marketRegime || null,
        is_auto_regime: !!(customOpts as any)?.isAutoRegime,
        frequency_preset: (customOpts as any)?.frequencyPreset || 'LOW',
        entry_price: price,
        current_price: price,
        quantity: finalQuantityResolved,
        original_quantity: finalQuantityResolved,
        leverage: finalLeverageResolved,
        allocated_balance: finalAllocated,
        original_allocated: finalAllocated,
        tp1,
        tp2,
        tp3,
        sl,
        entryAtr: safeAtr,
        compression_high: customOpts?.compressionHigh ?? null,
        compression_low: customOpts?.compressionLow ?? null,
        macroColor: customOpts?.macroColor ?? 'AMBER',
        macroLabel: (customOpts as any)?.macroLabel ?? null,
        regimeConfidence: customOpts?.regimeConfidence ?? 0,
        confidenceLevel: (customOpts as any)?.confidenceLevel ?? 'Medium',
        tradeQuality: customOpts?.tradeQuality ?? 'Medium',
        strategyPriority: (customOpts as any)?.strategyPriority ?? 'P1',
        rrStruct: (customOpts as any)?.rrStruct ?? '≥3.5',
        structuralRR: (customOpts as any)?.structuralRR ?? 3.5,
        trailing_stop_active: 0,
        initialTpHit: false,
        extremeSinceEntry: price,
        score_at_entry: score || 80,
        time_open: new Date().toISOString(),
        status: 'OPEN',
        execution_state: executionState,
        client_order_id_base: baseId
      };

      // Keep position instantly active in memory/local store
      positionMonitor.addPosition(positionData as any);

      const docRef = doc(db, 'positions', posId);
      safeSetDoc(docRef, positionData).catch(() => {});

      // Trigger 24/7 background Telegram notification asynchronously
      telegramService.notifyTradeOpen({
        ...positionData,
        strategy: positionData.strategy,
        market_regime: positionData.market_regime,
        is_auto_regime: positionData.is_auto_regime,
        frequency_preset: positionData.frequency_preset
      } as any, score).catch(err => {
        console.warn('OMS: Telegram dispatch failed', err);
      });

      return posId;
    } catch(e) {
      if (e.message && e.message.includes("Risk manager check disallowed trade")) { console.warn(`OMS placeOrder skipped for ${symbol}: ${e.message}`); } else { console.error(`OMS placeOrder error for ${symbol}:`, e); }
      throw e;
    } finally {
      this.processingOrder.delete(symbol);
    }
  }

  public async partialClosePosition(posId: string, currentPrice: number, partialRatio: number = 0.25, exitReason: string = 'INITIAL_TP_PARTIAL') {
    // C6 fix: Prevent concurrent partial closes racing on same position
    if (this.closingPositions.has(posId)) {
      console.warn(`OMS: Partial close already in progress for ${posId}, skipping`);
      return null;
    }
    this.closingPositions.add(posId);
    try {
    const posRef = doc(db, 'positions', posId);
    // I5 fix: Use quota-safe Firestore read with in-memory fallback
    const snapRes = await safeGetDoc(posRef);
    if (!snapRes.exists) {
      const fallback = positionMonitor.getActivePositions().find(p => p.id === posId);
      if (!fallback) return null;
      var pos = fallback as any;
    } else {
      var pos = snapRes.data as any;
    }

    if (pos.status !== 'OPEN' || !pos.quantity || pos.quantity <= 0) return null;

    const closeQty = Math.max(0.0001, pos.quantity * partialRatio);
    const remainingQty = Math.max(0, pos.quantity - closeQty);
    const closedAllocated = pos.allocated_balance * (closeQty / pos.quantity);
    const remainingAllocated = Math.max(0, pos.allocated_balance - closedAllocated);

    // Live order execution if live mode active
    if (executionAdapter.getIsLive()) {
      try {
        const closeSide = pos.direction === 'LONG' ? 'sell' : 'buy';
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, closeQty);
      } catch (err) {
        console.warn(`OMS: Live partial close warning on ${pos.symbol}:`, err);
      }
    }

    const isLong = pos.direction === 'LONG';
    const priceDeltaPct = pos.entry_price > 0 
      ? (isLong ? (currentPrice - pos.entry_price) / pos.entry_price : (pos.entry_price - currentPrice) / pos.entry_price)
      : 0;
    const pnl = priceDeltaPct * closedAllocated * (pos.leverage || 1);
    const pctReturn = closedAllocated > 0 ? (pnl / closedAllocated) * 100 : 0;

    // Stop is moved to breakeven + round trip fee buffer
    const buffer = pos.entry_price * 0.0015;
    const newSl = isLong ? pos.entry_price + buffer : pos.entry_price - buffer;

    await safeUpdateDoc(posRef, {
      quantity: remainingQty,
      allocated_balance: remainingAllocated,
      sl: newSl,
      initialTpHit: true,
      current_price: currentPrice
    });

    const logId = `${posId}_tp1_${Date.now()}`;
    await safeSetDoc(doc(db, 'trade_logs', logId), {
      id: logId,
      parent_position_id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || 'BINANCE_COMPOSITE',
      market_regime: pos.market_regime || null,
      is_auto_regime: !!pos.is_auto_regime,
      frequency_preset: pos.frequency_preset || 'MEDIUM',
      macroColor: pos.macroColor || 'AMBER',
      macroLabel: pos.macroLabel || null,
      regimeConfidence: pos.regimeConfidence ?? 0,
      confidenceLevel: pos.confidenceLevel || 'Medium',
      tradeQuality: pos.tradeQuality || 'Medium',
      strategyPriority: pos.strategyPriority || 'P1',
      rrStruct: pos.rrStruct || '≥3.5',
      structuralRR: pos.structuralRR || 3.5,
      outcome: 'Partial',
      leverage: pos.leverage || 1,
      score_at_entry: pos.score_at_entry || 80,
      entry_price: pos.entry_price,
      close_price: currentPrice,
      profit: pnl,
      pct_return: pctReturn,
      exit_reason: exitReason,
      closed_quantity: closeQty,
      remaining_quantity: remainingQty,
      time_open: pos.time_open,
      time_close: new Date().toISOString()
    });

    riskManager.recordTradeResult(pnl, 10000);
    this.onTradeClosed?.(pnl);

    // Send Telegram alert for partial TP
    telegramService.notifyPartialTp({
      id: pos.id,
      symbol: pos.symbol,
      direction: pos.direction,
      entry_price: pos.entry_price,
      allocated_balance: closedAllocated,
      sl: newSl
    }, currentPrice, pnl, pctReturn, closeQty, remainingQty).catch(() => {});

    return { pnl, newSl, remainingQty };
    } finally {
      this.closingPositions.delete(posId);
    }
  }

  public async closePosition(posId: string, currentPrice: number, exitReason: string, extraDiagnostic?: { mfe?: number; mae?: number }) {
    const posRef = doc(db, 'positions', posId);
    let pos: any = null;
    const snapRes = await safeGetDoc(posRef);
    if (snapRes.exists && snapRes.data) {
      pos = snapRes.data;
    } else {
      pos = positionMonitor.getActivePositions().find(p => p.id === posId);
    }
    if (!pos) return null;
    
    if (pos.status !== 'OPEN') return null;

    // Immediately remove from active monitoring
    positionMonitor.removePosition(posId);

    // If live exchange mode is active, close live order
    if (executionAdapter.getIsLive()) {
      try {
        const closeSide = pos.direction === 'LONG' ? 'sell' : 'buy';
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, pos.quantity);
      } catch (err) {
        console.warn(`OMS: Live close position warning on ${pos.symbol}:`, err);
      }
      // C5 fix: Cancel orphaned protective stop-loss order on exchange
      try {
        await executionAdapter.cancelAllOpenOrders(pos.symbol);
      } catch (err) {
        console.warn(`OMS: Failed to cancel orphaned orders on ${pos.symbol}:`, err);
      }
    }

    const isLong = pos.direction === 'LONG';
    const priceDeltaPct = pos.entry_price > 0 ? (isLong ? (currentPrice - pos.entry_price) / pos.entry_price : (pos.entry_price - currentPrice) / pos.entry_price) : 0;
    const pnl = priceDeltaPct * pos.allocated_balance * (pos.leverage || 1);
    const pctReturn = pos.allocated_balance > 0 ? (pnl / pos.allocated_balance) * 100 : 0;
      
    await safeUpdateDoc(posRef, {
      status: 'CLOSED',
      current_price: currentPrice,
      time_close: new Date().toISOString()
    });
    
    const riskAmount = Math.abs(pos.entry_price - (pos.sl || 0));
    const realized_r = riskAmount > 0 ? ((isLong ? (currentPrice - pos.entry_price) : (pos.entry_price - currentPrice)) / riskAmount) : 0;

    let outcome: 'Full 1:3' | 'Partial' | 'Scratch' | 'Loss' = 'Loss';
    const upperReason = (exitReason || '').toUpperCase();
    if (upperReason.includes('TP3') || realized_r >= 2.8) {
      outcome = 'Full 1:3';
    } else if (upperReason.includes('PARTIAL') || upperReason.includes('TP2') || upperReason.includes('TP1') || (pnl > 0 && realized_r >= 0.8)) {
      outcome = 'Partial';
    } else if (Math.abs(pnl) <= (pos.allocated_balance || 100) * 0.005 || upperReason.includes('BE') || upperReason.includes('TRAIL_BE')) {
      outcome = 'Scratch';
    } else {
      outcome = 'Loss';
    }

    const mfeVal = extraDiagnostic?.mfe ?? (pos as any).mfe ?? null;
    const maeVal = extraDiagnostic?.mae ?? (pos as any).mae ?? null;

    await safeSetDoc(doc(db, 'trade_logs', posId), {
      id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || 'BINANCE_COMPOSITE',
      market_regime: pos.market_regime || null,
      regimeAtEntry: pos.market_regime || null,
      is_auto_regime: !!pos.is_auto_regime,
      frequency_preset: pos.frequency_preset || 'MEDIUM',
      macroColor: pos.macroColor || 'AMBER',
      macroLabel: pos.macroLabel || null,
      regimeConfidence: pos.regimeConfidence ?? 0,
      confidenceLevel: pos.confidenceLevel || 'Medium',
      tradeQuality: pos.tradeQuality || 'Medium',
      strategyPriority: pos.strategyPriority || 'P1',
      rrStruct: pos.rrStruct || '≥3.5',
      structuralRR: pos.structuralRR || 3.5,
      outcome,
      leverage: pos.leverage || 1,
      score_at_entry: pos.score_at_entry || 80,
      entry_price: pos.entry_price,
      close_price: currentPrice,
      sl: pos.sl,
      tp1: pos.tp1,
      tp2: pos.tp2,
      tp3: pos.tp3,
      mfe: mfeVal,
      mae: maeVal,
      signalCandleTime: pos.signalCandleTime || null,
      profit: pnl,
      pct_return: pctReturn,
      exit_reason: exitReason,
      time_open: pos.time_open,
      time_close: new Date().toISOString()
    });

    try {
      const riskAmount = Math.abs(pos.entry_price - (pos.sl || 0));
      const realized_r = riskAmount > 0 ? ((isLong ? (currentPrice - pos.entry_price) : (pos.entry_price - currentPrice)) / riskAmount) : 0;
      const logLine = JSON.stringify({
        id: posId,
        timestamp: new Date().toISOString(),
        time_open: pos.time_open || pos.timestamp,
        time_close: new Date().toISOString(),
        symbol: pos.symbol,
        direction: pos.direction,
        leverage: pos.leverage || 1,
        passed_gates: true,
        reject_reason: null,
        entry_price: pos.entry_price,
        sl: pos.sl,
        close_price: currentPrice,
        profit: pnl,
        pct_return: pctReturn,
        realized_r,
        mfe: mfeVal,
        mae: maeVal,
        exit_reason: exitReason,
        strategy: pos.strategy,
        market_regime: pos.market_regime,
        strategy_version: 'v2.2_regime_gated'
      }) + '\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'trade_logs.jsonl'), logLine);
    } catch(e) {}

    riskManager.recordTradeResult(pnl, 10000);
    this.onTradeClosed?.(pnl);

    // Dispatch Telegram trade closure notification
    telegramService.notifyTradeClose(
      pos,
      currentPrice,
      pnl,
      pctReturn,
      exitReason
    ).catch((err) => {
      console.warn('OMS: Telegram notifyTradeClose failed:', err);
    });

    return pnl;
  }
}

export const oms = new OMS();
