import { db } from '../firebase.js';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { priceStream } from './PriceStream.js';
import { oms } from './OMS.js';
import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { isQuotaExhausted, safeUpdateDoc, readLocalJson, writeLocalJson } from './firestoreSafe.js';

export interface MonitoredPosition {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  current_price: number;
  quantity: number;
  original_quantity?: number;
  leverage: number;
  allocated_balance: number;
  original_allocated?: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  entryAtr?: number;
  compression_high?: number;
  compression_low?: number;
  strategy?: string;
  market_regime?: string;
  strategyRegimeStatus?: 'IN_FAVOR' | 'WAITING' | 'NEUTRAL';
  strategyRegimeFavorable?: boolean;
  strategyRegimeDetails?: string;
  is_auto_regime?: boolean;
  macroColor?: 'GREEN' | 'AMBER' | 'RED';
  regimeConfidence?: number;
  tradeQuality?: string;
  extremeSinceEntry?: number;
  initialTpHit?: boolean;
  tp2Hit?: boolean;
  trailing_stop_active?: number;
  time_open: string;
  status: 'OPEN' | 'CLOSED';
  lifecycleState?: string;
  retestStatus?: string;
  atrValue?: number;
  triggerLevel?: number;
  retestTolerance?: number;
  invalidationLevel?: number;
  retestDetails?: any;
}

export class PositionMonitor {
  public settings: any = {};
  public onPositionsChanged?: () => void;
  private activePositions: MonitoredPosition[] = [];
  private isProcessing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private closingSet = new Set<string>();

  constructor() {
    this.init();
  }

  public async init() {
    await this.refreshOpenPositions();

    // Subscribe to real-time price updates (evaluates every tick 24/7)
    priceStream.subscribe((prices) => {
      this.evaluatePositions(prices);
    });

    // Refresh positions from Firestore or local store every 25 seconds to sync state
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      this.refreshOpenPositions();
    }, 25000);
  }

  public addPosition(pos: MonitoredPosition) {
    const idx = this.activePositions.findIndex(p => p.id === pos.id);
    if (idx >= 0) {
      this.activePositions[idx] = pos;
    } else {
      this.activePositions.push(pos);
    }
    writeLocalJson('positions.json', this.activePositions);
    const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
    riskManager.updateCurrentExposure(totalAllocated);
    try { this.onPositionsChanged?.(); } catch (e) {}
  }

  public removePosition(posId: string) {
    this.activePositions = this.activePositions.filter(p => p.id !== posId);
    this.closingSet.delete(posId);
    writeLocalJson('positions.json', this.activePositions);
    const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
    riskManager.updateCurrentExposure(totalAllocated);
    try { this.onPositionsChanged?.(); } catch (e) {}
  }

  public async refreshOpenPositions() {
    try {
      if (isQuotaExhausted()) {
        const local = readLocalJson<MonitoredPosition[]>('positions.json', []);
        if (local && local.length > 0) {
          this.activePositions = local.filter(p => p.status === 'OPEN');
          const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
          riskManager.updateCurrentExposure(totalAllocated);
        }
        try { this.onPositionsChanged?.(); } catch (e) {}
        return;
      }
      const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      this.activePositions = snapshot.docs.map(doc => doc.data() as MonitoredPosition);
      writeLocalJson('positions.json', this.activePositions);
      const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
      riskManager.updateCurrentExposure(totalAllocated);
      try { this.onPositionsChanged?.(); } catch (e) {}
    } catch (e) {
      const local = readLocalJson<MonitoredPosition[]>('positions.json', []);
      if (local && local.length > 0) {
        this.activePositions = local.filter(p => p.status === 'OPEN');
      }
      console.warn('PositionMonitor: Could not refresh from Firestore, maintained local/in-memory positions.');
      try { this.onPositionsChanged?.(); } catch (e) {}
    }
  }

  private async evaluatePositions(prices: Map<string, number>) {
    if (this.isProcessing || this.activePositions.length === 0) return;
    this.isProcessing = true;

    try {
      for (const pos of this.activePositions) {
        if (pos.status !== 'OPEN' || this.closingSet.has(pos.id)) continue;

        const currentPrice = prices.get(pos.symbol);
        if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) continue;

        pos.current_price = currentPrice;
        const isLong = pos.direction === 'LONG';
        const timeOpenMs = new Date(pos.time_open).getTime();
        const minutesOpen = (Date.now() - timeOpenMs) / (60 * 1000);
        const barsOpen = Math.floor(minutesOpen / 15);

        
        // Track MFE (Maximum Favorable Excursion) and MAE (Maximum Adverse Excursion) in R-multiples
        const initialRisk = Math.abs(pos.entry_price - (pos.sl || (pos.entry_price * 0.015)));
        if (initialRisk > 0) {
          const currentR = isLong ? (currentPrice - pos.entry_price) / initialRisk : (pos.entry_price - currentPrice) / initialRisk;
          if ((pos as any).mfe === undefined || currentR > (pos as any).mfe) {
            (pos as any).mfe = parseFloat(currentR.toFixed(2));
          }
          if ((pos as any).mae === undefined || (-currentR) > (pos as any).mae) {
            (pos as any).mae = parseFloat((-currentR).toFixed(2));
          }
        }

        let exitReason: string | null = null;

        // Model realistic order-book spread for exit fills:
        // Exiting a LONG is a MARKET SELL -> executes at the BID (currentPrice - halfSpread)
        // Exiting a SHORT is a MARKET BUY -> executes at the ASK (currentPrice + halfSpread)
        const halfSpread = currentPrice * 0.0003; // Conservative 3 bps half-spread for liquid futures
        const exitBidPrice = currentPrice - halfSpread;
        const exitAskPrice = currentPrice + halfSpread;
        const exitPrice = isLong ? exitBidPrice : exitAskPrice;

        // Universal 1:3 & Time-Based Trade Management (Applied to ALL Strategies)
        
        // 1. Time-Based Stall Check: Give positions room to breathe (respects user's timeBasedExitEnabled & timeBasedExitCandles)
        if (!exitReason) {
          const isTimeExitActive = Boolean(this.settings?.timeBasedExitEnabled);
          const timeExitBars = this.settings?.timeBasedExitCandles || 20;
          const stallCheckBar = isTimeExitActive ? timeExitBars : Math.max(16, this.settings?.vcbStallCheckBar ?? 16);
          const tp1Hit = pos.initialTpHit || (isLong ? exitPrice >= pos.tp1 : exitPrice <= pos.tp1);
          
          if (barsOpen >= stallCheckBar && !tp1Hit) {
            const inProfit = isLong ? currentPrice > pos.entry_price : currentPrice < pos.entry_price;
            const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
            const moveInAtr = Math.abs(currentPrice - pos.entry_price) / entryAtr;
            if (isTimeExitActive || (!inProfit && moveInAtr < 0.25)) {
              exitReason = 'STALL_TIMEOUT';
              console.log(`⏱️ [PositionMonitor] Time/Stall exit triggered on ${pos.symbol} after ${barsOpen} bars (move: ${moveInAtr.toFixed(2)} ATR)`);
            }
          }
        }
        
        if (pos.strategy === 'VOLATILITY_COMPRESSION') {
          // Initialize extremeSinceEntry if missing
          if (pos.extremeSinceEntry === undefined) pos.extremeSinceEntry = pos.entry_price;
          
          if (isLong) {
            if (currentPrice > pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
          } else {
            if (currentPrice < pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
          }

          const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 2.0) || (pos.entry_price * 0.015);

          // Check TP3 (Macro Home Run Target - full exit)
          if (pos.tp3 && !exitReason) {
            const tp3Reached = isLong ? exitPrice >= pos.tp3 : exitPrice <= pos.tp3;
            if (tp3Reached) {
              exitReason = 'TP3';
              console.log(`🚀 [PositionMonitor] VCB Home Run TP3 reached for ${pos.symbol}! Locking in full macro move.`);
            }
          }

          // Check TP2 (Core Structural Target - 35% scale-out)
          if (!pos.tp2Hit && !exitReason && pos.tp2) {
            const tp2Reached = isLong ? exitPrice >= pos.tp2 : exitPrice <= pos.tp2;
            if (tp2Reached) {
              pos.tp2Hit = true;
              console.log(`🎯 [PositionMonitor] VCB TP2 reached for ${pos.symbol}. Securing 35% profit and locking in TP1 as floor stop.`);
              // Lock stop to TP1 level
              pos.sl = isLong ? Math.max(pos.sl || 0, pos.tp1) : Math.min(pos.sl || 999999, pos.tp1);
              oms.partialClosePosition(pos.id, currentPrice, 0.35, 'TP2_35PCT')
                .then(() => this.refreshOpenPositions())
                .catch(err => console.error('PositionMonitor: Error in TP2 partialClosePosition:', err));
            }
          }

          // Check Initial TP1 (25% De-Risk)
          if (!pos.initialTpHit && !exitReason) {
            const tpReached = isLong ? exitPrice >= pos.tp1 : exitPrice <= pos.tp1;
            if (tpReached) {
              pos.initialTpHit = true;
              const closePct = this.settings?.vcbInitialTpClosePct ?? 0.25;
              console.log(`🎯 [PositionMonitor] VCB Initial TP1 reached for ${pos.symbol}. Securing ${(closePct * 100).toFixed(0)}% profit.`);
              
              // Move stop to true breakeven (entry price) to let the trade breathe
              pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price);

              // Execute 25% partial market close via OMS
              oms.partialClosePosition(pos.id, currentPrice, closePct, 'INITIAL_TP_25PCT')
                .then(() => this.refreshOpenPositions())
                .catch(err => console.error('PositionMonitor: Error in partialClosePosition:', err));
            } else {
              // Stall Check - Relaxed to 20 bars, never abort if in profit
              const stallCheckBar = Math.max(20, this.settings?.vcbStallCheckBar ?? 20);
              if (barsOpen >= stallCheckBar) {
                const inProfit = isLong ? currentPrice > pos.entry_price : currentPrice < pos.entry_price;
                const unrealizedMoveInAtr = isLong 
                  ? (currentPrice - pos.entry_price) / entryAtr 
                  : (pos.entry_price - currentPrice) / entryAtr;
                if (!inProfit && unrealizedMoveInAtr < 0.2) {
                  exitReason = 'STALL_TIMEOUT';
                  console.log(`⏱️ [PositionMonitor] VCB Stall Exit triggered on ${pos.symbol} (${barsOpen} bars, move: ${unrealizedMoveInAtr.toFixed(2)} ATR)`);
                }
              }
            }
          } else if (pos.initialTpHit && !exitReason) {
            // Chandelier Stop Trail - 2.5 * ATR behind extreme peak
            const chandelierAtrMult = this.settings?.vcbChandelierAtrMult ?? 2.5;
            const candidate = isLong 
              ? pos.extremeSinceEntry - chandelierAtrMult * entryAtr
              : pos.extremeSinceEntry + chandelierAtrMult * entryAtr;
            
            pos.sl = isLong ? Math.max(pos.sl || 0, candidate) : Math.min(pos.sl || 999999, candidate);
          }

          // Check if Stop Loss or Chandelier Stop is hit
          if (!exitReason) {
            const stopHit = isLong ? exitPrice <= pos.sl : exitPrice >= pos.sl;
            if (stopHit) {
              exitReason = pos.initialTpHit ? 'CHANDELIER_SL' : 'SL';
            }
          }
        } else if (pos.strategy === 'TREND_PULLBACK') {
          // Dedicated Retest-Aware Trend-Pullback Position Management
          if (pos.extremeSinceEntry === undefined) pos.extremeSinceEntry = pos.entry_price;
          if (pos.lifecycleState === undefined) pos.lifecycleState = 'ENTRY_ACTIVE';
          if (pos.retestStatus === undefined) pos.retestStatus = 'NONE';

          const isLong = pos.direction === 'LONG';
          if (isLong && currentPrice > pos.extremeSinceEntry) pos.extremeSinceEntry = currentPrice;
          if (!isLong && currentPrice < pos.extremeSinceEntry) pos.extremeSinceEntry = currentPrice;

          const entryAtr = pos.entryAtr || (pos.atrValue) || (Math.abs(pos.tp1 - pos.entry_price) / 2.0) || (pos.entry_price * 0.015);
          
          // Track Favorable and Adverse Excursions in price units
          const favorableMove = isLong ? Math.max(0, currentPrice - pos.entry_price) : Math.max(0, pos.entry_price - currentPrice);
          const adverseMove = isLong ? Math.max(0, pos.entry_price - currentPrice) : Math.max(0, currentPrice - pos.entry_price);
          (pos as any).favorableMovePrice = Math.max((pos as any).favorableMovePrice || 0, favorableMove);
          (pos as any).adverseMovePrice = Math.max((pos as any).adverseMovePrice || 0, adverseMove);

          // Retest structural levels
          const triggerLevel = pos.triggerLevel || pos.entry_price;
          const retestToleranceAtr = this.settings?.tpRetestToleranceAtr ?? 0.5;
          const retestTolerance = pos.retestTolerance || (entryAtr * retestToleranceAtr);
          const invalidationLevel = pos.invalidationLevel || (isLong ? (pos.sl + entryAtr * 0.2) : (pos.sl - entryAtr * 0.2));

          // 1. Dynamic Retest Classification
          if (pos.lifecycleState === 'ENTRY_ACTIVE' || pos.lifecycleState === 'RETESTING') {
            const isNearRetestZone = isLong 
              ? (currentPrice <= triggerLevel + (retestTolerance * 0.5) && currentPrice >= invalidationLevel)
              : (currentPrice >= triggerLevel - (retestTolerance * 0.5) && currentPrice <= invalidationLevel);
            
            const isBreakingStructure = isLong 
              ? (currentPrice < invalidationLevel && currentPrice > pos.sl)
              : (currentPrice > invalidationLevel && currentPrice < pos.sl);

            if (isNearRetestZone) {
              pos.lifecycleState = 'RETESTING';
              pos.retestStatus = 'HEALTHY_RETEST';
            } else if (isBreakingStructure) {
              pos.lifecycleState = 'RETESTING';
              pos.retestStatus = 'DANGEROUS_RETEST';
              if (this.settings?.tpDangerousRetestEarlyExit) {
                console.log(`⚠️ [PositionMonitor] Dangerous Retest detected on ${pos.symbol}: price broke invalidation level (${invalidationLevel.toFixed(2)}).`);
              }
            }

            // Check if continuation has confirmed (move beyond entry + 0.5 ATR)
            const continuationConfirmed = isLong 
              ? (currentPrice >= pos.entry_price + (entryAtr * 0.5))
              : (currentPrice <= pos.entry_price - (entryAtr * 0.5));

            if (continuationConfirmed) {
              pos.lifecycleState = 'CONTINUATION_CONFIRMED';
            }
          }

          // 2. Take-Profit Execution
          // TP3 (Final Runner)
          if (pos.tp3 && !exitReason) {
            const tp3Reached = isLong ? exitPrice >= pos.tp3 : exitPrice <= pos.tp3;
            if (tp3Reached) {
              exitReason = 'TP3';
              console.log(`🚀 [PositionMonitor] Trend-Pullback TP3 reached for ${pos.symbol}! Full structural run completed.`);
            }
          }

          // TP2 (Core Expansion Target - 50% remaining scale-out)
          if (pos.tp2 && !pos.tp2Hit && !exitReason) {
            const tp2Reached = isLong ? exitPrice >= pos.tp2 : exitPrice <= pos.tp2;
            if (tp2Reached) {
              pos.tp2Hit = true;
              console.log(`🎯 [PositionMonitor] Trend-Pullback TP2 reached for ${pos.symbol}. Securing partial profits.`);
              pos.sl = isLong ? Math.max(pos.sl || 0, pos.tp1) : Math.min(pos.sl || 999999, pos.tp1);
              oms.partialClosePosition(pos.id, currentPrice, 0.50, 'TP2_PARTIAL')
                .then(() => this.refreshOpenPositions())
                .catch(err => console.error('PositionMonitor: Error in TP2 partial close:', err));
            }
          }

          // TP1 (De-Risking Target - 35% scale-out)
          if (pos.tp1 && !pos.initialTpHit && !exitReason) {
            const tp1Reached = isLong ? exitPrice >= pos.tp1 : exitPrice <= pos.tp1;
            if (tp1Reached) {
              pos.initialTpHit = true;
              console.log(`🎯 [PositionMonitor] Trend-Pullback TP1 reached for ${pos.symbol}. De-risking 35% position.`);
              // After TP1, move stop to entry price (breakeven)
              pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price);
              oms.partialClosePosition(pos.id, currentPrice, 0.35, 'TP1_PARTIAL')
                .then(() => this.refreshOpenPositions())
                .catch(err => console.error('PositionMonitor: Error in TP1 partial close:', err));
            }
          }

          // 3. Breakeven & Retest Invalidation Protection
          // USER DIRECTIVE: A retest of the entry is not a stop-loss condition.
          // Do not move the stop to breakeven prematurely during normal retests.
          const allowBeDuringRetest = this.settings?.tpAllowBreakevenDuringRetest ?? false;
          if (allowBeDuringRetest && !pos.initialTpHit && pos.lifecycleState === 'CONTINUATION_CONFIRMED') {
            const moveInAtr = favorableMove / entryAtr;
            if (moveInAtr >= 1.5) {
              pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price);
            }
          }

          // 4. Stop Loss Check
          if (!exitReason) {
            const stopHit = isLong ? exitPrice <= pos.sl : exitPrice >= pos.sl;
            if (stopHit) {
              exitReason = pos.initialTpHit ? 'TRAIL_BE' : 'SL';
            }
          }
        } else {
          // Standard / Climax Strategy management
          // Initialize extremeSinceEntry if missing
          if (pos.extremeSinceEntry === undefined) pos.extremeSinceEntry = pos.entry_price;
          
          const isLong = pos.direction === 'LONG';
          const updateExtreme = () => {
             if (isLong && currentPrice > pos.extremeSinceEntry) pos.extremeSinceEntry = currentPrice;
             if (!isLong && currentPrice < pos.extremeSinceEntry) pos.extremeSinceEntry = currentPrice;
          };
          updateExtreme();

          // Check Aggressive Partials at 1:3 (TP2)
          const tp2Reached = pos.tp2 && (isLong ? exitPrice >= pos.tp2 : exitPrice <= pos.tp2);
          if (tp2Reached && !pos.tp2Hit && !exitReason) {
             pos.tp2Hit = true;
             pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price); // move SL to breakeven (if not already better)
             console.log(`🎯 [PositionMonitor] Aggressive 1:3 TP2 hit on ${pos.symbol}. Securing 60%.`);
             oms.partialClosePosition(pos.id, currentPrice, 0.60, 'TP2_1_3_PARTIAL')
               .then(() => this.refreshOpenPositions())
               .catch(err => console.log('Partial error:', err));
          }

          const useAtrTrailing = this.settings?.useAtrTrailingStop !== false;
          const trailActivation = this.settings?.trailingStopActivation || 'TP1';
          const chandelierMult = this.settings?.trailingStopAtrMultiplier || ((pos.strategyRegimeStatus === 'IN_FAVOR' || pos.tradeQuality === 'High' || pos.macroColor === 'GREEN') ? 3.0 : 2.0);

          if (isLong) {
            const canTrail = useAtrTrailing && (
              trailActivation === 'TP1' ? (pos.tp1 && exitPrice >= pos.tp1) :
              trailActivation === 'TP2' ? pos.tp2Hit :
              false
            );

            if (canTrail) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const candidate = pos.extremeSinceEntry - chandelierMult * entryAtr;
              const newSl = Math.max(pos.entry_price, candidate, pos.sl || 0);
              
              if (newSl > (pos.sl || 0)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                safeUpdateDoc(doc(db, 'positions', pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
                writeLocalJson('positions.json', this.activePositions);
              }
            }

            if (pos.tp3 && exitPrice >= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.sl && exitPrice <= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          } else {
            const canTrail = useAtrTrailing && (
              trailActivation === 'TP1' ? (pos.tp1 && exitPrice <= pos.tp1) :
              trailActivation === 'TP2' ? pos.tp2Hit :
              false
            );

            if (canTrail) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const candidate = pos.extremeSinceEntry + chandelierMult * entryAtr;
              const newSl = Math.min(pos.entry_price, candidate, pos.sl || 999999);
              
              if (newSl < (pos.sl || 999999)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                safeUpdateDoc(doc(db, 'positions', pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
                writeLocalJson('positions.json', this.activePositions);
              }
            }

            if (pos.tp3 && exitPrice <= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.sl && exitPrice >= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          }
        }

        if (exitReason) {
          this.closingSet.add(pos.id);

          let outcomeClassification: string | undefined = undefined;
          if (pos.strategy === 'TREND_PULLBACK') {
            const entryAtr = pos.entryAtr || (pos.atrValue) || (Math.abs((pos.tp1 || pos.entry_price) - pos.entry_price) / 2.0) || (pos.entry_price * 0.015);
            const favorablePrice = (pos as any).favorableMovePrice || (isLong ? Math.max(0, currentPrice - pos.entry_price) : Math.max(0, pos.entry_price - currentPrice));
            const adversePrice = (pos as any).adverseMovePrice || (isLong ? Math.max(0, pos.entry_price - currentPrice) : Math.max(0, currentPrice - pos.entry_price));
            const favorableAtr = entryAtr > 0 ? favorablePrice / entryAtr : 0;
            const adverseAtr = entryAtr > 0 ? adversePrice / entryAtr : 0;
            const maeR = (pos as any).mae || 0;
            const isWin = exitReason.startsWith('TP') || (currentPrice > pos.entry_price && isLong) || (currentPrice < pos.entry_price && !isLong);

            if (isWin) {
              if (adverseAtr <= 0.25) {
                outcomeClassification = 'CONTINUED_WITHOUT_RETEST';
              } else if (pos.retestStatus === 'HEALTHY_RETEST' || pos.lifecycleState === 'RETESTING' || pos.lifecycleState === 'CONTINUATION_CONFIRMED') {
                outcomeClassification = 'HEALTHY_RETEST_THEN_CONTINUATION';
              } else {
                outcomeClassification = 'CONTINUED_WITHOUT_RETEST';
              }
            } else {
              const invalidationLevel = pos.invalidationLevel || (isLong ? (pos.sl + entryAtr * 0.2) : (pos.sl - entryAtr * 0.2));
              const brokeStructureDecisively = isLong ? exitPrice < invalidationLevel : exitPrice > invalidationLevel;
              const isSpikeSweep = Math.abs(exitPrice - (pos.sl || 0)) <= entryAtr * 0.25;

              if (exitReason.includes('DANGEROUS_RETEST')) {
                outcomeClassification = 'TRUE_STRUCTURE_INVALIDATION';
              } else if (exitReason === 'TRAIL_BE' || adverseAtr <= 0.5) {
                outcomeClassification = 'STOPPED_BY_NORMAL_NOISE';
              } else if (isSpikeSweep && !brokeStructureDecisively) {
                outcomeClassification = 'STOPPED_BY_LIQUIDITY_SWEEP';
              } else if (brokeStructureDecisively) {
                outcomeClassification = 'TRUE_STRUCTURE_INVALIDATION';
              } else if (favorableAtr < 0.25 && (adverseAtr >= 0.8 || maeR >= 0.8)) {
                outcomeClassification = 'FAILED_CONFIRMATION';
              } else {
                outcomeClassification = 'STOPPED_BY_NORMAL_NOISE';
              }
            }
          }

          console.log(`⚡ [24/7 PositionMonitor] AUTO CLOSE triggered:
  - Symbol: ${pos.symbol} (${pos.direction})
  - Strategy: ${pos.strategy}
  - Outcome Classification: ${outcomeClassification || 'N/A'}
  - Exit Reason: ${exitReason}
  - Exec Price: ${currentPrice}
  - Exit Side Price (${isLong ? 'BID' : 'ASK'}): ${exitPrice.toFixed(4)}
  - Entry Price: ${pos.entry_price}
  - Target/Stop in DB: SL=${pos.sl}, TP1=${pos.tp1}, TP2=${pos.tp2}, TP3=${pos.tp3}
  - Condition Met: ${isLong ? (exitReason === 'SL' || exitReason === 'TRAIL_BE' ? `BID (${exitPrice.toFixed(4)}) <= SL (${pos.sl})` : `BID (${exitPrice.toFixed(4)}) >= TP (${pos.tp1 || pos.tp3})`) : (exitReason === 'SL' || exitReason === 'TRAIL_BE' ? `ASK (${exitPrice.toFixed(4)}) >= SL (${pos.sl})` : `ASK (${exitPrice.toFixed(4)}) <= TP (${pos.tp1 || pos.tp3})`)}`);
          
          // Execute closing via OMS with recorded MFE/MAE and Retest diagnostics
          oms.closePosition(pos.id, currentPrice, exitReason, { 
            mfe: (pos as any).mfe, 
            mae: (pos as any).mae,
            lifecycleState: pos.lifecycleState,
            retestStatus: pos.retestStatus,
            outcomeClassification,
            triggerLevel: pos.triggerLevel,
            invalidationLevel: pos.invalidationLevel,
            retestDetails: pos.retestDetails
          })
            .then(async (pnl) => {
              if (pnl !== null) {
                const pct = (pnl / pos.allocated_balance) * 100;
                await telegramService.notifyTradeClose(pos, currentPrice, pnl, pct, exitReason!);
              }
              await this.refreshOpenPositions();
            })
            .catch((err) => {
              console.error(`PositionMonitor: Error closing position ${pos.id}:`, err);
            })
            .finally(() => {
              this.closingSet.delete(pos.id);
            });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getActivePositions() {
    return this.activePositions;
  }

  /**
   * Targeted Improvement A: Regime Change Event Handler
   * Forces re-evaluation of open positions when a symbol's regime transitions.
   * - Flips from TRENDING to RANGING/TRANSITION: Tightens stop to BE or closer trailing.
   * - Flips to opposing trend or PANIC: Tightens stop or triggers early REGIME_FLIP protection exit.
   */
  public async handleRegimeTransition(
    symbol: string,
    prevRegime: string,
    newRegime: string,
    macroColor?: string
  ): Promise<void> {
    const matchingPositions = this.activePositions.filter(p => p.symbol === symbol && p.status === 'OPEN');
    if (matchingPositions.length === 0) return;

    for (const pos of matchingPositions) {
      const isLong = pos.direction === 'LONG';
      const currentPrice = pos.current_price || pos.entry_price;
      const inProfit = isLong ? currentPrice > pos.entry_price : currentPrice < pos.entry_price;

      console.log(`🔄 [PositionMonitor] Regime transition detected for open position ${symbol}: ${prevRegime} -> ${newRegime} (In profit: ${inProfit})`);

      // 1. If regime flips to opposing trend (e.g. LONG into TRENDING_DOWN, or SHORT into TRENDING_UP)
      const opposingTrend = (isLong && newRegime === 'TRENDING_DOWN') || (!isLong && newRegime === 'TRENDING_UP');
      const panicOrDanger = newRegime === 'PANIC' || macroColor === 'RED';

      if (opposingTrend || panicOrDanger) {
        if (inProfit) {
          // Lock in Breakeven immediately
          const bePrice = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price);
          pos.sl = bePrice;
          pos.trailing_stop_active = 1;
          console.log(`🛡️ [PositionMonitor] Opposing regime shift! Moved SL to Breakeven (${bePrice}) for ${symbol}`);
        } else {
          // Adverse regime flip: tighten SL by 50% towards current price to cut tail risk
          const tightenedSl = isLong ? Math.max(pos.sl || 0, (pos.sl + currentPrice) / 2) : Math.min(pos.sl || 999999, (pos.sl + currentPrice) / 2);
          pos.sl = parseFloat(tightenedSl.toFixed(4));
          console.log(`🛡️ [PositionMonitor] Adverse regime shift! Tightened SL to ${pos.sl} for ${symbol}`);
        }
      } else if (newRegime === 'RANGING' || newRegime === 'TRANSITION') {
        // Trend lost momentum: if in profit, move SL to breakeven
        if (inProfit && (!pos.trailing_stop_active || pos.trailing_stop_active === 0)) {
          pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price);
          pos.trailing_stop_active = 1;
          console.log(`🎯 [PositionMonitor] Regime transitioned to ${newRegime}. Protected gains by setting Breakeven for ${symbol}`);
        }
      }
    }
  }
}

export const positionMonitor = new PositionMonitor();
