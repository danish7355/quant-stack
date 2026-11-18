import fs from 'fs';
import path from 'path';
import { db } from '../firebase.js';
import { doc, setDoc, getDoc, updateDoc, writeBatch, collection } from 'firebase/firestore';
import { riskManager } from './RiskManager.js';
import { telegramService } from './TelegramService.js';
import { executionAdapter } from './ExecutionAdapter.js';
import { positionMonitor } from './PositionMonitor.js';
import { reconciliationWorker } from './PositionReconciliationWorker.js';
import { coinDcxSimulator } from './CoinDcxSimulator.js';
import { safeSetDoc, safeUpdateDoc, safeGetDoc, isQuotaExhausted, appendLocalJsonl } from './firestoreSafe.js';
import { calcPositionPnl } from '../../src/utils/pnl.js';
import { calcRoundTripFeePct } from '../../src/utils/regimeEngine.js';
import { resolveTakeProfitTargets } from '../../src/shared/takeProfitResolver.js';

export class OMS {
  private processingOrder = new Set<string>();
  private processingClose = new Set<string>();
  private processingPartial = new Set<string>();
  private warnedEquityFallback = false;

  private resolveAccountBalance(): number {
    const equity = this.getEffectiveAccountEquity?.();
    if (equity !== undefined && equity !== null && Number.isFinite(equity) && equity > 0) {
      return equity;
    }
    if (!this.warnedEquityFallback) {
      this.warnedEquityFallback = true;
      console.warn("⚠️ [OMS] getEffectiveAccountEquity() not available. Falling back to demoBalance or default (1000).");
    }
    return this.getSettings?.()?.demoBalance ?? 1000;
  }

  public onTradeClosed?: (pnl: number, pos?: any, exitReason?: string) => void;
  public isEngineActive?: () => boolean;
  public onTradePlaced?: (tradeData: any) => void;
  public getSettings?: () => any;
  public getEffectiveAccountEquity?: () => number;

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
      tp1ClosePct?: number;
      tp2ClosePct?: number;
      tp3ClosePct?: number;
      strategy?: string;
      marketRegime?: string;
      isAutoRegime?: boolean;
      strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
      strategyRegimeFavorable?: boolean;
      strategyRegimeDetails?: string;
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
      timeStopMinutes?: number;
      sizeMultiplier?: number;
      triggerLevel?: number;
      invalidationLevel?: number;
      retestTolerance?: number;
      retestArea?: any;
      lifecycleState?: string;
      entryMode?: string;
      retestClassification?: string;
      retestDetails?: any;
    }
  ) {
    if (!symbol || !direction || !price || isNaN(price) || price <= 0) {
      throw new Error(`Invalid order params for ${symbol}`);
    }

    if (direction !== 'LONG' && direction !== 'SHORT') {
      throw new Error(`Invalid order direction ${direction} for ${symbol}`);
    }

    // Accurate Setup Validation: verify Stop Loss and Take Profit alignment
    if (customOpts?.sl !== undefined && customOpts.sl > 0) {
      if (direction === 'LONG' && customOpts.sl >= price) {
        throw new Error(`Inaccurate setup: Long SL ($${customOpts.sl}) must be strictly below entry price ($${price})`);
      }
      if (direction === 'SHORT' && customOpts.sl <= price) {
        throw new Error(`Inaccurate setup: Short SL ($${customOpts.sl}) must be strictly above entry price ($${price})`);
      }
    }
    if (customOpts?.tp1 !== undefined && customOpts.tp1 > 0) {
      if (direction === 'LONG' && customOpts.tp1 <= price) {
        throw new Error(`Inaccurate setup: Long TP1 ($${customOpts.tp1}) must be strictly above entry price ($${price})`);
      }
      if (direction === 'SHORT' && customOpts.tp1 >= price) {
        throw new Error(`Inaccurate setup: Short TP1 ($${customOpts.tp1}) must be strictly below entry price ($${price})`);
      }
    }

    if (this.isEngineActive && !this.isEngineActive()) {
      throw new Error(`Engine is stopped. New trade execution is blocked.`);
    }

    if (this.processingOrder.has(symbol)) {
      throw new Error(`Order for ${symbol} already processing. Preventing duplicate.`);
    }

    const existingPos = positionMonitor.getActivePositions().find(p => p.symbol === symbol && p.status === 'OPEN');
    if (existingPos) {
      throw new Error(`Active position for ${symbol} already open (${existingPos.id}). Preventing duplicate.`);
    }

    this.processingOrder.add(symbol);

    try {
      const settings = (this.getSettings && this.getSettings()) || {};
      let balance = (settings.demoBalance !== undefined && settings.demoBalance > 0)
        ? settings.demoBalance
        : (settings.startingBalance || 22);

      if (executionAdapter.getIsLive()) {
        const liveBal = executionAdapter.getLastLiveBalance();
        if (liveBal && liveBal.availableBalance > 0) {
          balance = liveBal.availableBalance;
        } else if (settings.startingBalance && settings.startingBalance > 0) {
          balance = settings.startingBalance;
        }
      }
      const equity = this.resolveAccountBalance();
      const accountRiskPct = Number(settings.accountRiskPct || 1.5);
      const positionSizePct = Number(settings.positionSizePct || 10);
      const leverage = customOpts?.leverage || settings.leverage || 1;
      const sizeMult = (customOpts as any)?.sizeMultiplier && (customOpts as any).sizeMultiplier > 0
        ? (customOpts as any).sizeMultiplier
        : 1.0;

      const safeAtr = (atr && atr > 0) ? atr : (price * 0.015);
      
      // Tight Stop Loss (1.0x ATR or explicit structural level) & 1:3 Asymmetric Target
      const computedRisk = (customOpts?.sl !== undefined && customOpts.sl > 0)
        ? Math.abs(price - customOpts.sl)
        : (safeAtr * 1.0); // tight 1.0x ATR invalidation to minimize loss

      let sl = (customOpts?.sl !== undefined && customOpts.sl > 0)
        ? customOpts.sl 
        : (direction === 'LONG' ? Math.max(0.0001, price - computedRisk) : price + computedRisk);

      // Failsafe: if stop distance exceeds settings.maxStopPct, reject the order (throw) instead of moving the SL
      const maxStopPct = Number(settings.maxStopPct || 8.0);
      const maxStopDistance = price * (maxStopPct / 100);
      const initialStopDist = Math.abs(price - sl);
      if (initialStopDist > maxStopDistance) {
        throw new Error(`Stop loss distance (${((initialStopDist / price) * 100).toFixed(2)}%) exceeds maximum allowed threshold (${maxStopPct}%). Order rejected.`);
      }

      const stopDist = Math.max(0.00001, initialStopDist);

      const isCoinDcx = executionAdapter.getExchangeProvider() === 'COINDCX';
      const marginCurr = executionAdapter.getMarginCurrency();
      const usdtToInrRate = executionAdapter.getUsdtToInrRate() || 90;

      // Currency-coherent equity: Convert INR equity to USDT for USDT-denominated futures sizing
      const effectiveEquityUsdt = (isCoinDcx && marginCurr === 'INR')
        ? (equity / usdtToInrRate)
        : equity;

      // Risk-based sizing: quantity = (effectiveEquityUsdt * accountRiskPct / 100) / |entry - stopLoss| * signal.sizeMultiplier
      const riskAmountUsdt = effectiveEquityUsdt * (accountRiskPct / 100);
      let calculatedQty = customOpts?.qty && customOpts.qty > 0
        ? customOpts.qty * sizeMult
        : stopDist > 0
        ? (riskAmountUsdt / stopDist) * sizeMult
        : (effectiveEquityUsdt * (positionSizePct / 100) * leverage) / price;

      // Cap by marginAllocationPct and leverage (For Range and OB, marginAllocationPct = positionSizePct * (sizeMultiplier ?? 1))
      const stratName = customOpts?.strategy || '';
      const isRangeOrOb = ['RANGE_REGIME_V1', 'RANGE_REGIME', 'ORDER_BLOCK'].includes(stratName);
      const effectiveMarginAllocPct = isRangeOrOb ? (positionSizePct * sizeMult) : positionSizePct;
      const maxNotional = effectiveEquityUsdt * (effectiveMarginAllocPct / 100) * leverage;
      if ((calculatedQty * price) > maxNotional) {
        calculatedQty = maxNotional / price;
      }

      const computedRiskPct = effectiveEquityUsdt > 0 ? ((calculatedQty * stopDist) / effectiveEquityUsdt) * 100 : accountRiskPct;
      console.log(`[OMS] Risk-based sizing: equity=$${effectiveEquityUsdt.toFixed(2)}, risk=${accountRiskPct}%, stopDist=${stopDist.toFixed(4)}, sizeMult=${sizeMult}, computedRisk=${computedRiskPct.toFixed(2)}%, qty=${calculatedQty.toFixed(4)}`);

      // Centralised Take Profit Structure (TP1, TP2, TP3):
      // "if take profit is present in the strategy itself then override centralised take profit structure tp1,tp2,tp3"
      const resolvedTps = resolveTakeProfitTargets(
        price,
        direction,
        sl,
        safeAtr,
        {
          tp1: customOpts?.tp1,
          tp2: customOpts?.tp2,
          tp3: customOpts?.tp3,
          tp1ClosePct: customOpts?.tp1ClosePct,
          tp2ClosePct: customOpts?.tp2ClosePct,
          tp3ClosePct: customOpts?.tp3ClosePct
        },
        settings
      );

      const tp1 = resolvedTps.tp1;
      const tp2 = resolvedTps.tp2;
      const tp3 = resolvedTps.tp3;
      const tp1ClosePct = resolvedTps.tp1ClosePct;
      const tp2ClosePct = resolvedTps.tp2ClosePct;
      const tp3ClosePct = resolvedTps.tp3ClosePct;
      const tpSource = resolvedTps.source;
      const tpMode = resolvedTps.mode;
      const moveToBeAfterTp1 = settings?.centralisedTpMoveToBe !== false;

      console.log(`🎯 [OMS TP Resolver] ${symbol} (${stratName || 'PORTFOLIO'}) -> TP1: $${tp1} (${tp1ClosePct}%), TP2: $${tp2} (${tp2ClosePct}%), TP3: $${tp3} (${tp3ClosePct}%) [Mode: ${tpMode}, Source: ${tpSource}, Explanation: ${resolvedTps.explanation}]`);

      const maxMarginInr = Number(settings.maxTradeMarginInr || 200);
      const maxRiskInr = Number(settings.maxRiskPerTradeInr || 100);
      const enforceInr = settings.enforceInrCapsInLive !== false;

      const rawLev = customOpts?.leverage && customOpts.leverage >= 1 
        ? customOpts.leverage 
        : leverage;
      let finalLeverageResolved = isCoinDcx 
        ? Math.min(rawLev, executionAdapter.getMaxAllowedLeverage(symbol))
        : rawLev;

      let rawQty = calculatedQty;

      const rate = usdtToInrRate || 99.26;
      if (enforceInr) {
        const maxQtyRisk = maxRiskInr / (stopDist * rate);
        const maxQtyMargin = (maxMarginInr * finalLeverageResolved) / (price * rate);
        const maxAllowedQty = Math.min(maxQtyRisk, maxQtyMargin);

        if (rawQty > maxAllowedQty) {
          console.log(`🛡️ [OMS INR Gate] Clamping ${symbol} quantity from ${rawQty.toFixed(4)} to ${maxAllowedQty.toFixed(4)} to strictly enforce Max Margin ₹${maxMarginInr} and Max Risk ₹${maxRiskInr}.`);
          rawQty = maxAllowedQty;
        }
      }

      if (Object.keys(executionAdapter.getExchangeInfoCache()).length === 0) {
        await executionAdapter.loadExchangeInfo();
      }

      let finalQuantityResolved = isCoinDcx
        ? executionAdapter.ensureCoinDcxMinQuantity(symbol, rawQty, price)
        : executionAdapter.formatQuantity(symbol, rawQty);

      if (enforceInr && isCoinDcx && marginCurr === 'INR') {
        const projectedMarginInr = (finalQuantityResolved * price * rate) / finalLeverageResolved;
        if (projectedMarginInr > (maxMarginInr + 0.5)) {
          const maxLev = executionAdapter.getMaxAllowedLeverage(symbol);
          const neededLev = Math.ceil((finalQuantityResolved * price * rate) / maxMarginInr);
          if (neededLev <= maxLev) {
            console.log(`⚡ [OMS INR Gate] Adjusted leverage on ${symbol} from ${finalLeverageResolved}x to ${neededLev}x to keep initial margin under ₹${maxMarginInr} (Projected was ₹${projectedMarginInr.toFixed(2)})`);
            finalLeverageResolved = Math.max(finalLeverageResolved, neededLev);
          } else {
            // Cannot raise leverage above coin's maximum; try clamping quantity if still >= exchange min
            const minQty = executionAdapter.ensureCoinDcxMinQuantity(symbol, 0, price);
            const maxAllowedQty = (maxMarginInr * maxLev) / (price * rate);
            const clampedQty = executionAdapter.formatQuantity(symbol, maxAllowedQty);
            if (clampedQty >= minQty && clampedQty > 0) {
              console.log(`⚡ [OMS INR Gate] Clamped ${symbol} quantity to ${clampedQty} (Lev: ${maxLev}x) to strictly respect ₹${maxMarginInr} margin ceiling`);
              finalQuantityResolved = clampedQty;
              finalLeverageResolved = maxLev;
            } else {
              // Even at maximum leverage and minimum quantity, the trade requires more than maxMarginInr
              const requiredMargin = (minQty * price * rate) / maxLev;
              throw new Error(`Minimum order for ${symbol} requires ₹${requiredMargin.toFixed(2)} margin at max ${maxLev}x leverage, which exceeds strict ₹${maxMarginInr} threshold. Trade blocked to protect capital.`);
            }
          }
        }
      }

      const finalAllocated = (isCoinDcx && marginCurr === 'INR')
        ? Number(((finalQuantityResolved * price * rate) / finalLeverageResolved).toFixed(2))
        : Number(((finalQuantityResolved * price) / finalLeverageResolved).toFixed(2));

      // Currency-coherent balance for risk manager check (ensure both are in INR or both in USDT)
      const lastBal = executionAdapter.getLastLiveBalance();
      const effectiveRiskBalance = (isCoinDcx && marginCurr === 'INR')
        ? (lastBal?.futuresInr || lastBal?.inrBalance || (balance * usdtToInrRate))
        : balance;

      const riskCheck = riskManager.checkEntryAllowed(effectiveRiskBalance, finalAllocated, 0);
      if (!riskCheck.allowed) {
        throw new Error(`Risk manager check disallowed trade for ${symbol}: ${riskCheck.reason}`);
      }
      
      const posId = `sig_${Date.now()}_${Math.random().toString(36).substring(4)}`;
      const strategyPrefix = (customOpts?.strategy || 'GEN').substring(0, 8).replace(/[^a-zA-Z0-9]/g, '');
      
      // Trade Admission Record (Audit Trail)
      if (!isQuotaExhausted()) {
        try {
          await writeBatch(db).set(doc(collection(db, 'trade_admissions')), {
             posId,
             symbol,
             direction,
             requestedPrice: price,
             computedSl: sl,
             computedTp1: tp1,
             confidenceScore: score,
             strategy: customOpts?.strategy || 'ACTIVE_PORTFOLIO',
             marketRegime: customOpts?.marketRegime || 'RANGING',
             allocatedBalance: finalAllocated,
             leverage: finalLeverageResolved,
             quantity: finalQuantityResolved,
             timestamp: Date.now(),
             status: 'APPROVED'
          }).commit();
        } catch (admissionErr: any) {
          if (admissionErr && (admissionErr.code === 'resource-exhausted' || String(admissionErr).includes('resource-exhausted'))) {
            const { markQuotaExhausted } = await import('./firestoreSafe.js');
            markQuotaExhausted();
          }
        }
      }

      // Generate safe, pure ASCII deterministic Client Order IDs (strictly <= 28 chars to be well under Binance's 36-char limit)
      const cleanSym = symbol.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) || 'COIN';
      const cleanPos = posId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || Date.now().toString().slice(-8);
      const cleanStrat = (strategyPrefix || 'BOT').replace(/[^a-zA-Z0-9]/g, '').substring(0, 4);
      const baseId = `${cleanStrat}_${cleanSym}_${cleanPos}`.substring(0, 26);
      const entryOrderId = `E_${baseId}`.substring(0, 32);
      const stopOrderId = `S_${baseId}`.substring(0, 32);

      let executionState = 'SIGNAL_CREATED';

      let simulatedOrderResult: any = null;

      // Execute on live exchange if live mode is enabled
      if (executionAdapter.getIsLive()) {
        const side = direction === 'LONG' ? 'buy' : 'sell';
        const stopSide = direction === 'LONG' ? 'sell' : 'buy';

        // Pre-check credentials validity before submitting network order
        const isCoinDcx = executionAdapter.getExchangeProvider() === 'COINDCX';
        const validCreds = isCoinDcx ? executionAdapter.isValidCoinDcxCredentials : executionAdapter.isValidCredentials;
        const credErr = isCoinDcx ? executionAdapter.coindcxCredentialError : executionAdapter.lastCredentialError;

        if (!validCreds) {
          console.warn(`⚠️ [OMS] Live exchange order skipped for ${symbol}: ${isCoinDcx ? 'CoinDCX' : 'Binance'} credentials invalid (${credErr || 'unauthorized'}). Preserving trade as simulated paper position.`);
        } else {
          try {
            executionState = 'ORDER_SUBMITTED';
            const filledMarket = await executionAdapter.createMarketOrder(symbol, side, finalQuantityResolved, finalLeverageResolved, entryOrderId);
            
            executionState = 'FILLED';
            const actualFilledQty = filledMarket?.filled_quantity || finalQuantityResolved;
            
            // 1. IMMEDIATELY Submit Protective Stop Loss (bracket order) with 2 retries (3 attempts total)
            if (sl && sl > 0) {
              let slPlaced = false;
              let lastSlErr: any = null;
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  await executionAdapter.createStopMarketOrder(symbol, stopSide, actualFilledQty, sl, stopOrderId, finalLeverageResolved);
                  slPlaced = true;
                  console.log(`🛡️ [OMS] Live Protective Stop Loss PLACED: ${symbol} at $${sl} (Lev: ${finalLeverageResolved}x, attempt ${attempt})`);
                  break;
                } catch (slErr) {
                  lastSlErr = slErr;
                  console.warn(`⚠️ [OMS] Stop loss attempt ${attempt}/3 failed for ${symbol}:`, slErr);
                  if (attempt < 3) await new Promise(r => setTimeout(r, 400));
                }
              }

              if (!slPlaced) {
                console.error(`🚨 [OMS CRITICAL] Stop loss failed after 3 attempts on ${symbol}. Flattening position at market immediately.`);
                try {
                  const closeSide = direction === 'LONG' ? 'sell' : 'buy';
                  await executionAdapter.closeMarketPosition(symbol, closeSide, actualFilledQty, `EMG_FLAT_${baseId}`.substring(0, 32), finalLeverageResolved);
                  console.warn(`🛡️ Emergency flatten completed for unhedged ${symbol} position.`);
                } catch (flatErr) {
                  console.error(`🚨 [OMS EMERGENCY] Market flatten failed after unhedged SL failure on ${symbol}:`, flatErr);
                }
                return null;
              }
            }

            // 2. Submit Take Profit Target (Bracket Order Management)
            // Use strategy's own tp1, tp2, tp3
            const targetTp1 = tp1;
            if (targetTp1 && targetTp1 > 0) {
              const tpOrderId = `T1_${baseId}`.substring(0, 32);
              try {
                await executionAdapter.createTakeProfitMarketOrder(symbol, stopSide, actualFilledQty, targetTp1, tpOrderId, finalLeverageResolved);
                console.log(`🎯 [OMS] Live Take Profit 1 PLACED: ${symbol} at $${targetTp1} (Lev: ${finalLeverageResolved}x)`);
              } catch (tpErr) {
                console.warn(`⚠️ [OMS] Warning placing Take Profit 1 on exchange for ${symbol}:`, tpErr);
              }
            }

            // Place reduce-only TP2 for the remainder only if it is strictly farther than TP1 on the profit side
            const isProfitSideTp2 = tp2 && tp1 && (direction === 'LONG' ? tp2 > tp1 : tp2 < tp1);
            if (isProfitSideTp2) {
              const tp2OrderId = `T2_${baseId}`.substring(0, 32);
              try {
                await executionAdapter.createTakeProfitMarketOrder(symbol, stopSide, actualFilledQty, tp2, tp2OrderId, finalLeverageResolved);
                console.log(`🎯 [OMS] Live Take Profit 2 PLACED: ${symbol} at $${tp2} (Lev: ${finalLeverageResolved}x)`);
              } catch (tp2Err) {
                console.warn(`⚠️ [OMS] Warning placing Take Profit 2 for ${symbol}:`, tp2Err);
              }
            }
            
            executionState = 'PROTECTION_PLACED';
          } catch (ex: any) {
            const isCredError = ex.message?.includes('-2015') || 
                                ex.message?.includes('Invalid API-key') || 
                                ex.message?.includes('permissions for action') ||
                                ex.message?.includes('Invalid credentials') ||
                                ex.message?.includes('BFF-AUTH-001') ||
                                ex.message?.includes('401');

            const isSymbolStatusError = ex.message?.includes('-4140') ||
                                        ex.message?.includes('Invalid symbol status') ||
                                        ex.message?.includes('not active or TRADING') ||
                                        ex.message?.includes('opening position');

            if (isCredError) {
              if (isCoinDcx) {
                executionAdapter.isValidCoinDcxCredentials = false;
                executionAdapter.coindcxCredentialError = 'CoinDCX credentials unauthorized';
              } else {
                executionAdapter.isValidCredentials = false;
                executionAdapter.lastCredentialError = 'Invalid API-key, IP, or permissions for action (-2015)';
              }
              console.warn(`🛡️ [OMS] Live order rejected by ${isCoinDcx ? 'CoinDCX' : 'Binance'} due to permissions/credentials for ${symbol}. Safely continuing in simulated paper mode.`);
              // Don't rethrow or trigger emergency close since the entry never filled on exchange
            } else if (isSymbolStatusError) {
              executionAdapter.markSymbolUntradable(symbol, ex.message);
              console.warn(`⚠️ [OMS] Live order rejected for ${symbol}: Symbol is not open for opening positions on exchange (-4140: ${ex.message}). Quarantining symbol.`);
              // Return null without throwing so scanner/OMS does not alarm critically, since the entry was never filled on exchange
              return null;
            } else {
              console.error(`🚨 [CRITICAL OMS ERROR] Failed during execution state: ${executionState} for ${symbol}.`, ex);
              // If we filled the entry but failed to place the stop loss, close the filled position to prevent naked exposure.
              if (executionState === 'FILLED') {
                try {
                  const closeSide = direction === 'LONG' ? 'sell' : 'buy';
                  await executionAdapter.closeMarketPosition(symbol, closeSide, finalQuantityResolved, `EMG_${baseId}`.substring(0, 32), finalLeverageResolved);
                  console.warn(`🛡️ Emergency close succeeded for unprotected ${symbol} position.`);
                } catch (closeErr) {
                  console.error(`🚨🚨 FATAL: Emergency close FAILED for ${symbol}. Manual intervention required!`, closeErr);
                }
              }
              throw new Error(`Execution failed at state ${executionState}: ${ex.message}`);
            }
          }
        }
      } else {
        // High-fidelity paper / CoinDCX simulation execution
        const side = direction === 'LONG' ? 'buy' : 'sell';
        const stopSide = direction === 'LONG' ? 'sell' : 'buy';
        simulatedOrderResult = await executionAdapter.createMarketOrder(symbol, side, finalQuantityResolved, finalLeverageResolved, entryOrderId);
        if (sl && sl > 0) {
          await executionAdapter.createStopMarketOrder(symbol, stopSide, finalQuantityResolved, sl, stopOrderId, finalLeverageResolved);
        }
        const targetTp = tp1 || tp2 || tp3;
        if (targetTp && targetTp > 0) {
          const tpOrderId = `T_${baseId}`.substring(0, 32);
          await executionAdapter.createTakeProfitMarketOrder(symbol, stopSide, finalQuantityResolved, targetTp, tpOrderId, finalLeverageResolved);
        }
        executionState = 'PROTECTION_PLACED';
      }
      
      executionState = 'POSITION_ACTIVE';
      
      const positionData = {
        id: posId,
        symbol,
        direction,
        strategy: customOpts?.strategy || this.getSettings?.()?.activeStrategy || 'TREND_PULLBACK',
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
        tp1ClosePct,
        tp2ClosePct,
        tp3ClosePct,
        tpSource,
        tpMode,
        moveToBeAfterTp1,
        sl,
        entryAtr: safeAtr,
        triggerLevel: (customOpts as any)?.triggerLevel ?? null,
        invalidationLevel: (customOpts as any)?.invalidationLevel ?? null,
        retestTolerance: (customOpts as any)?.retestTolerance ?? null,
        retestArea: (customOpts as any)?.retestArea ?? null,
        lifecycleState: (customOpts as any)?.lifecycleState ?? 'ENTRY_ACTIVE',
        entryMode: (customOpts as any)?.entryMode ?? null,
        retestClassification: (customOpts as any)?.retestClassification ?? null,
        retestDetails: (customOpts as any)?.retestDetails ?? null,
        compression_high: customOpts?.compressionHigh ?? null,
        compression_low: customOpts?.compressionLow ?? null,
        strategyRegimeStatus: (customOpts as any)?.strategyRegimeStatus ?? 'IN_FAVOR',
        strategyRegimeFavorable: (customOpts as any)?.strategyRegimeFavorable ?? true,
        strategyRegimeDetails: (customOpts as any)?.strategyRegimeDetails ?? null,
        macroColor: customOpts?.macroColor ?? 'AMBER',
        macroLabel: (customOpts as any)?.macroLabel ?? null,
        regimeConfidence: customOpts?.regimeConfidence ?? 0,
        confidenceLevel: (customOpts as any)?.confidenceLevel ?? 'Medium',
        tradeQuality: customOpts?.tradeQuality ?? 'Medium',
        strategyPriority: (customOpts as any)?.strategyPriority ?? 'P1',
        rrStruct: (customOpts as any)?.rrStruct ?? '≥3.5',
        structuralRR: (customOpts as any)?.structuralRR ?? 3.5,
        timeStopMinutes: (customOpts as any)?.timeStopMinutes ?? null,
        computedRiskPct: computedRiskPct,
        trailing_stop_active: 0,
        initialTpHit: false,
        extremeSinceEntry: price,
        score_at_entry: score || 80,
        time_open: new Date().toISOString(),
        status: 'OPEN',
        stopStatus: (sl && sl > 0) ? 'CONFIRMED' : 'MISSING',
        execution_state: executionState,
        client_order_id_base: baseId,
        fee_entry: simulatedOrderResult?.fee_inr || 0,
        fee_exit: 0,
        funding_fee: 0,
        accumulated_funding_fee: 0,
        is_coindcx_simulation: isCoinDcx && !executionAdapter.getIsLive(),
        coindcx_pair: isCoinDcx ? executionAdapter.toCoinDcxFuturesPair(symbol) : symbol,
        margin_currency: isCoinDcx ? marginCurr : 'USDT',
        currency_symbol: (isCoinDcx && marginCurr === 'INR') ? '₹' : '$'
      };

      // Keep position instantly active in memory/local store
      positionMonitor.addPosition(positionData as any);

      if (this.onTradePlaced) {
        try {
          this.onTradePlaced(positionData);
        } catch (cbErr) {
          console.warn('OMS: onTradePlaced callback failed:', cbErr);
        }
      }

      const docRef = doc(db, 'positions', posId);
      await safeSetDoc(docRef, positionData);

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

      // Execution reconciliation check after fill with a 20s safety buffer for exchange ledger propagation
      setTimeout(() => {
        reconciliationWorker.runReconciliation().catch(() => {});
      }, 20000);

      return posId;
    } catch(e) {
      if (e.message && e.message.includes("Risk manager check disallowed trade")) { console.warn(`OMS placeOrder skipped for ${symbol}: ${e.message}`); } else { console.error(`OMS placeOrder error for ${symbol}:`, e); }
      throw e;
    } finally {
      this.processingOrder.delete(symbol);
    }
  }

  public async partialClosePosition(posId: string, currentPrice: number, partialRatio: number = 0.25, exitReason: string = 'INITIAL_TP_PARTIAL') {
    if (this.processingPartial.has(posId)) return null;
    this.processingPartial.add(posId);

    try {
      const posRef = doc(db, 'positions', posId);
      const docSnap = await getDoc(posRef);
      if (!docSnap.exists()) return null;
      const pos = docSnap.data() as any;

      if (pos.status !== 'OPEN' || !pos.quantity || pos.quantity <= 0) return null;
      if (pos.initialTpHit && pos.tp2Hit && exitReason.includes('TP2')) return null;

      const closeQty = Math.max(0.0001, pos.quantity * partialRatio);
      let remainingQty = Math.max(0, pos.quantity - closeQty);
      const closedAllocated = pos.allocated_balance * (closeQty / pos.quantity);
      const remainingAllocated = Math.max(0, pos.allocated_balance - closedAllocated);

      const isLong = pos.direction === 'LONG';
      const roundTripFeePct = calcRoundTripFeePct(this.getSettings?.());
      const feeBuffer = pos.entry_price * (roundTripFeePct / 100);
      const newSl = isLong ? pos.entry_price + feeBuffer : pos.entry_price - feeBuffer;

      // Live order execution if live mode active
      if (executionAdapter.getIsLive()) {
        try {
          const closeSide = isLong ? 'sell' : 'buy';
          await executionAdapter.closeMarketPosition(pos.symbol, closeSide, closeQty, undefined, pos.leverage);

          // 1. Read actual remaining open quantity from exchange
          const positionsRisk = await executionAdapter.fetchPositionRisk();
          const livePos = positionsRisk.find((p: any) => p.symbol === pos.symbol || p.symbol === pos.symbol.replace(/_/g, ''));
          if (livePos && livePos.positionAmt) {
            const parsedAmt = Math.abs(parseFloat(livePos.positionAmt));
            if (parsedAmt > 0) {
              remainingQty = parsedAmt;
            }
          }

          // 2. Cancel only this symbol's stop order (match by orderId)
          const openOrders = await executionAdapter.fetchOpenOrders(pos.symbol);
          for (const order of openOrders) {
            const isStopOrder = order.type === 'STOP_MARKET' || order.type === 'STOP' || order.stopPrice > 0;
            if (isStopOrder && (order.symbol === pos.symbol || order.symbol === pos.symbol.replace(/_/g, ''))) {
              await executionAdapter.cancelOrder(pos.symbol, order.orderId || order.id);
              console.log(`🛡️ [OMS] Cancelled prior exchange stop order ${order.orderId || order.id} for ${pos.symbol}`);
            }
          }

          // 3. Place new breakeven stop for that remaining quantity
          const beOrderId = `BE_${posId.substring(0, 16)}_${Date.now()}`.substring(0, 32);
          const stopSide = isLong ? 'sell' : 'buy';
          await executionAdapter.createStopMarketOrder(pos.symbol, stopSide, remainingQty, newSl, beOrderId, pos.leverage);
          console.log(`🛡️ [OMS] Placed new Breakeven Stop for remaining qty ${remainingQty} on ${pos.symbol} at $${newSl}`);
        } catch (err) {
          console.warn(`OMS: Live partial close warning on ${pos.symbol}:`, err);
        }
      }

      const pnlRes = calcPositionPnl(
        pos.direction,
        pos.entry_price,
        currentPrice,
        closedAllocated,
        pos.leverage || 1,
        this.getSettings?.()
      );
      const grossPnl = pnlRes.gross;
      const totalFees = pnlRes.fees;
      const pnl = pnlRes.net;
      const pctReturn = pnlRes.netPct;

      // Update in-memory monitor immediately so rapid price ticks don't re-trigger
      const memPos = positionMonitor.getActivePositions().find(p => p.id === posId);
      if (memPos) {
        memPos.quantity = remainingQty;
        memPos.allocated_balance = remainingAllocated;
        memPos.sl = newSl;
        memPos.initialTpHit = true;
        memPos.tp2Hit = true;
      }

      await safeUpdateDoc(posRef, {
        quantity: remainingQty,
        allocated_balance: remainingAllocated,
        sl: newSl,
        initialTpHit: true,
        tp2Hit: true,
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
      strategyRegimeStatus: (pos as any).strategyRegimeStatus || 'IN_FAVOR',
      strategyRegimeFavorable: (pos as any).strategyRegimeFavorable ?? true,
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
      gross_profit: grossPnl,
      total_fees: totalFees,
      pct_return: pctReturn,
      exit_reason: exitReason,
      closed_quantity: closeQty,
      remaining_quantity: remainingQty,
      time_open: pos.time_open,
      time_close: new Date().toISOString()
    });

    const currentBalance = this.resolveAccountBalance();
    riskManager.recordTradeResult(pnl, currentBalance + pnl);
    this.onTradeClosed?.(pnl, pos, exitReason);

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
      this.processingPartial.delete(posId);
    }
  }

  public async closePosition(
    posId: string, 
    currentPrice: number, 
    exitReason: string, 
    extraDiagnostic?: { 
      mfe?: number; 
      mae?: number; 
      lifecycleState?: string; 
      retestStatus?: string; 
      outcomeClassification?: string; 
      triggerLevel?: number; 
      invalidationLevel?: number;
      retestDetails?: string;
    }
  ) {
    if (this.processingClose.has(posId)) return null;
    this.processingClose.add(posId);

    try {
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
        await executionAdapter.closeMarketPosition(pos.symbol, closeSide, pos.quantity, undefined, pos.leverage);
      } catch (err) {
        console.warn(`OMS: Live close position warning on ${pos.symbol}:`, err);
      }
    }

    const isCoinDcx = executionAdapter.getExchangeProvider() === 'COINDCX';
    const marginCurr = executionAdapter.getMarginCurrency();
    const isLong = pos.direction === 'LONG';

    let pnl = 0;
    let pctReturn = 0;
    let feeEntry = 0;
    let feeExit = 0;
    let fundingFee = 0;
    let totalFees = 0;
    let grossPnl = 0;

    if (isCoinDcx && marginCurr === 'INR') {
      const usdtRate = executionAdapter.getUsdtToInrRate();
      const simClose = coinDcxSimulator.calculateSimulatedClose(pos, currentPrice, usdtRate, exitReason);
      pnl = simClose.netPnlInr;
      grossPnl = simClose.grossPnlInr;
      pctReturn = simClose.netReturnPct;
      feeEntry = simClose.entryFeeInr;
      feeExit = simClose.exitFeeInr;
      fundingFee = simClose.fundingFeeInr;
      totalFees = simClose.totalFeesInr;

      if (!executionAdapter.getIsLive()) {
        coinDcxSimulator.updateSimulatedBalance(pnl);
      }
    } else {
      const pnlRes = calcPositionPnl(
        pos.direction,
        pos.entry_price,
        currentPrice,
        pos.allocated_balance || 0,
        pos.leverage || 1,
        this.getSettings?.()
      );
      grossPnl = pnlRes.gross;
      totalFees = pnlRes.fees;
      feeEntry = totalFees / 2;
      feeExit = totalFees / 2;
      pnl = pnlRes.net;
      pctReturn = pnlRes.netPct;
    }
      
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
      strategy: pos.strategy || this.getSettings?.()?.activeStrategy || 'TREND_PULLBACK',
      market_regime: pos.market_regime || null,
      regimeAtEntry: pos.market_regime || null,
      strategyRegimeStatus: (pos as any).strategyRegimeStatus || 'IN_FAVOR',
      strategyRegimeFavorable: (pos as any).strategyRegimeFavorable ?? true,
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
      lifecycleState: extraDiagnostic?.lifecycleState || pos.lifecycleState || null,
      retestStatus: extraDiagnostic?.retestStatus || pos.retestStatus || null,
      outcomeClassification: extraDiagnostic?.outcomeClassification || pos.outcomeClassification || null,
      triggerLevel: extraDiagnostic?.triggerLevel ?? pos.triggerLevel ?? null,
      invalidationLevel: extraDiagnostic?.invalidationLevel ?? pos.invalidationLevel ?? null,
      retestDetails: extraDiagnostic?.retestDetails || pos.retestDetails || null,
      signalCandleTime: pos.signalCandleTime || null,
      profit: pnl,
      gross_profit: grossPnl,
      fee_entry: feeEntry,
      fee_exit: feeExit,
      funding_fee: fundingFee,
      total_fees: totalFees,
      margin_currency: isCoinDcx ? 'INR' : 'USDT',
      currency_symbol: isCoinDcx ? '₹' : '$',
      is_simulation: !executionAdapter.getIsLive(),
      coindcx_pair: isCoinDcx ? executionAdapter.toCoinDcxFuturesPair(pos.symbol) : pos.symbol,
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
        gross_profit: grossPnl,
        fee_entry: feeEntry,
        fee_exit: feeExit,
        funding_fee: fundingFee,
        total_fees: totalFees,
        margin_currency: isCoinDcx ? 'INR' : 'USDT',
        currency_symbol: isCoinDcx ? '₹' : '$',
        is_simulation: !executionAdapter.getIsLive(),
        coindcx_pair: isCoinDcx ? executionAdapter.toCoinDcxFuturesPair(pos.symbol) : pos.symbol,
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

    const currentBalance = this.resolveAccountBalance();
    riskManager.recordTradeResult(pnl, currentBalance + pnl);
    this.onTradeClosed?.(pnl, pos, exitReason);

    return pnl;
  } finally {
    this.processingClose.delete(posId);
  }
}
}

export const oms = new OMS();

