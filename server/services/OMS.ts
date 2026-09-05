import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { riskManager } from './RiskManager.js';
import { telegramService } from './TelegramService.js';
import { executionAdapter } from './ExecutionAdapter.js';

export class OMS {
  private processingOrder = new Set<string>();

  public async placeOrder(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    price: number,
    score: number,
    atr: number,
    customOpts?: {
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
    }
  ) {
    if (!symbol || !direction || !price || isNaN(price) || price <= 0) {
      throw new Error(`Invalid order params for ${symbol}`);
    }

    if (this.processingOrder.has(symbol)) {
      throw new Error(`Order for ${symbol} already processing. Preventing duplicate.`);
    }
    this.processingOrder.add(symbol);

    try {
      const balance = 10000;
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

      const riskCheck = riskManager.checkEntryAllowed(balance, finalAllocated, 0);
      if (!riskCheck.allowed) {
        throw new Error(`Risk manager check disallowed trade for ${symbol}: ${riskCheck.reason}`);
      }

      // Execute on live exchange if live mode is enabled
      if (executionAdapter.getIsLive()) {
        const side = direction === 'LONG' ? 'buy' : 'sell';
        await executionAdapter.createMarketOrder(symbol, side, finalQuantityResolved, finalLeverageResolved);
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
      
      const posId = Math.random().toString(36).substring(7);
      
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
        trailing_stop_active: 0,
        initialTpHit: false,
        extremeSinceEntry: price,
        score_at_entry: score || 80,
        time_open: new Date().toISOString(),
        status: 'OPEN'
      };

      const docRef = doc(db, 'positions', posId);
      await setDoc(docRef, positionData);

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
      console.error(`OMS placeOrder error for ${symbol}:`, e);
      throw e;
    } finally {
      this.processingOrder.delete(symbol);
    }
  }

  public async partialClosePosition(posId: string, currentPrice: number, partialRatio: number = 0.25, exitReason: string = 'INITIAL_TP_PARTIAL') {
    const posRef = doc(db, 'positions', posId);
    const docSnap = await getDoc(posRef);
    if (!docSnap.exists()) return null;
    const pos = docSnap.data() as any;

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

    await updateDoc(posRef, {
      quantity: remainingQty,
      allocated_balance: remainingAllocated,
      sl: newSl,
      initialTpHit: true,
      current_price: currentPrice
    });

    const logId = `${posId}_tp1_${Date.now()}`;
    await setDoc(doc(db, 'trade_logs', logId), {
      id: logId,
      parent_position_id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || 'BINANCE_COMPOSITE',
      frequency_preset: pos.frequency_preset || 'MEDIUM',
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
  }

  public async closePosition(posId: string, currentPrice: number, exitReason: string) {
    const posRef = doc(db, 'positions', posId);
    const docSnap = await getDoc(posRef);
    if (!docSnap.exists()) return null;
    const pos = docSnap.data() as any;
    
    if (pos.status !== 'OPEN') return null;

    // If live exchange mode is active, close live order
    if (executionAdapter.getIsLive()) {
      try {
        const closeSide = pos.direction === 'LONG' ? 'sell' : 'buy';
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, pos.quantity);
      } catch (err) {
        console.warn(`OMS: Live close position warning on ${pos.symbol}:`, err);
      }
    }

    const isLong = pos.direction === 'LONG';
    const priceDeltaPct = pos.entry_price > 0 ? (isLong ? (currentPrice - pos.entry_price) / pos.entry_price : (pos.entry_price - currentPrice) / pos.entry_price) : 0;
    const pnl = priceDeltaPct * pos.allocated_balance * (pos.leverage || 1);
    const pctReturn = pos.allocated_balance > 0 ? (pnl / pos.allocated_balance) * 100 : 0;
      
    await updateDoc(posRef, {
      status: 'CLOSED',
      current_price: currentPrice
    });
    
    
    await setDoc(doc(db, 'trade_logs', posId), {
      id: posId,
      symbol: pos.symbol,
      direction: pos.direction,
      strategy: pos.strategy || 'BINANCE_COMPOSITE',
      market_regime: pos.market_regime || null,
      is_auto_regime: !!pos.is_auto_regime,
      frequency_preset: pos.frequency_preset || 'MEDIUM',
      leverage: pos.leverage || 1,
      score_at_entry: pos.score_at_entry || 80,
      entry_price: pos.entry_price,
      close_price: currentPrice,
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
        timestamp: new Date().toISOString(),
        symbol: pos.symbol,
        direction: pos.direction,
        passed_gates: true,
        reject_reason: null,
        entry_price: pos.entry_price,
        sl: pos.sl,
        tp1: pos.tp1,
        tp2: pos.tp2,
        tp3: pos.tp3,
        score: pos.score_at_entry,
        exit_price: currentPrice,
        exit_reason: exitReason,
        realized_r: parseFloat(realized_r.toFixed(2)),
        strategy_version: 'v2.1_closed_candles'
      }) + '\n';
      fs.appendFileSync(path.join(process.cwd(), 'data', 'scan_logs.jsonl'), logLine);
    } catch(e) {}

    
    riskManager.recordTradeResult(pnl, 10000);

    return pnl;
  }
}

export const oms = new OMS();
