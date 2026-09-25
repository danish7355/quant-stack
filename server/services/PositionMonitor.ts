import { db } from '../firebase.js';
import { COLLECTIONS } from '../dbCollections.js';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { priceStream } from './PriceStream.js';
import { oms } from './OMS.js';
import { executionAdapter } from './ExecutionAdapter.js';
import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';
import { isQuotaExhausted, safeUpdateDoc, safeGetDocs, readLocalJson, writeLocalJson } from './firestoreSafe.js';

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
}

export class PositionMonitor {
  public settings: any = {};
  private activePositions: MonitoredPosition[] = [];
  private isProcessing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private closingSet = new Set<string>();
  private positionListeners = new Set<(positions: MonitoredPosition[]) => void>();

  constructor() {
    this.init();
  }

  public onPositionsChange(listener: (positions: MonitoredPosition[]) => void): () => void {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }

  private notifyPositionListeners() {
    const positionsCopy = [...this.activePositions];
    for (const listener of this.positionListeners) {
      try {
        listener(positionsCopy);
      } catch (err) {
        console.error('PositionMonitor: Error in position listener:', err);
      }
    }
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
    this.notifyPositionListeners();
  }

  public removePosition(posId: string) {
    this.activePositions = this.activePositions.filter(p => p.id !== posId);
    this.closingSet.delete(posId);
    writeLocalJson('positions.json', this.activePositions);
    const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
    riskManager.updateCurrentExposure(totalAllocated);
    this.notifyPositionListeners();
  }

  public async refreshOpenPositions() {
    try {
      if (isQuotaExhausted()) {
        const local = readLocalJson<MonitoredPosition[]>('positions.json', []);
        if (local && local.length > 0) {
          this.mergePositions(local.filter(p => p.status === 'OPEN'));
        }
        return;
      }
      const q = query(collection(db, COLLECTIONS.POSITIONS), where('status', '==', 'OPEN'));
      const res = await safeGetDocs(q);
      if (res.success && res.docs) {
        const remote = res.docs.map(doc => doc.data() as MonitoredPosition);
        this.mergePositions(remote);
      } else {
        const local = readLocalJson<MonitoredPosition[]>('positions.json', []);
        if (local && local.length > 0) {
          this.mergePositions(local.filter(p => p.status === 'OPEN'));
        }
      }
    } catch (e) {
      const local = readLocalJson<MonitoredPosition[]>('positions.json', []);
      if (local && local.length > 0) {
        this.mergePositions(local.filter(p => p.status === 'OPEN'));
      }
      console.warn('PositionMonitor: Could not refresh from Firestore, maintained local/in-memory positions.');
    }
  }

  private mergePositions(freshPositions: MonitoredPosition[]) {
    const map = new Map<string, MonitoredPosition>();
    // 1. Keep active in-memory positions
    for (const p of this.activePositions) {
      if (p && p.id && p.status === 'OPEN' && !this.closingSet.has(p.id)) {
        map.set(p.id, p);
      }
    }
    // 2. Add or merge from remote/disk
    for (const p of freshPositions) {
      if (p && p.id && p.status === 'OPEN' && !this.closingSet.has(p.id)) {
        if (map.has(p.id)) {
          const existing = map.get(p.id)!;
          map.set(p.id, { ...p, current_price: existing.current_price || p.current_price });
        } else {
          map.set(p.id, p);
        }
      }
    }
    this.activePositions = Array.from(map.values());
    writeLocalJson('positions.json', this.activePositions);
    const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
    riskManager.updateCurrentExposure(totalAllocated);
    this.notifyPositionListeners();
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

        const spreadBuffer = currentPrice * 0.0015; // 0.15% buffer
        const effectiveSl = isLong ? pos.sl - spreadBuffer : pos.sl + spreadBuffer;
        const effectiveTp1 = isLong ? pos.tp1 + spreadBuffer : pos.tp1 - spreadBuffer;
        const effectiveTp2 = isLong ? pos.tp2 + spreadBuffer : pos.tp2 - spreadBuffer;
        const effectiveTp3 = pos.tp3 ? (isLong ? pos.tp3 + spreadBuffer : pos.tp3 - spreadBuffer) : null;

        // VCB specific trend-following & validation logic
        // Universal 1:3 & Time-Based Trade Management (Applied to ALL Strategies)
        
        // 1. Time-Based Stall Check: Give positions room to breathe (at least 16-20 bars / 4-5 hours)
        if (!exitReason) {
          const stallCheckBar = Math.max(16, this.settings?.vcbStallCheckBar ?? 16);
          const tp1Hit = pos.initialTpHit || (isLong ? currentPrice >= effectiveTp1 : currentPrice <= effectiveTp1);
          
          if (barsOpen >= stallCheckBar && !tp1Hit) {
            const inProfit = isLong ? currentPrice > pos.entry_price : currentPrice < pos.entry_price;
            const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
            const moveInAtr = Math.abs(currentPrice - pos.entry_price) / entryAtr;
            if (!inProfit && moveInAtr < 0.25) {
              exitReason = 'STALL_TIMEOUT';
              console.log(`⏱️ [PositionMonitor] Stall timeout triggered on ${pos.symbol} after ${barsOpen} bars (move: ${moveInAtr.toFixed(2)} ATR)`);
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
            const tp3Reached = effectiveTp3 ? (isLong ? currentPrice >= effectiveTp3 : currentPrice <= effectiveTp3) : false;
            if (tp3Reached) {
              exitReason = 'TP3';
              console.log(`🚀 [PositionMonitor] VCB Home Run TP3 reached for ${pos.symbol}! Locking in full macro move.`);
            }
          }

          // Check TP2 (Core Structural Target - 35% scale-out)
          if (!pos.tp2Hit && !exitReason && pos.tp2) {
            const tp2Reached = isLong ? currentPrice >= effectiveTp2 : currentPrice <= effectiveTp2;
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
            const tpReached = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
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
            
            const oldSl = pos.sl || 0;
            const newSl = isLong ? Math.max(pos.sl || 0, candidate) : Math.min(pos.sl || 999999, candidate);
            if (isLong ? newSl > (pos.sl || 0) : newSl < (pos.sl || 999999)) {
              pos.sl = newSl;
              safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, pos.id), { sl: newSl }).catch(() => {});
              writeLocalJson('positions.json', this.activePositions);
              this.notifyPositionListeners();
              telegramService.notifyTrailingStop(pos, oldSl, newSl, currentPrice).catch(() => {});
            }
          }

          // Check if Stop Loss or Chandelier Stop is hit
          if (!exitReason) {
            const stopHit = isLong ? currentPrice <= effectiveSl : currentPrice >= effectiveSl;
            if (stopHit) {
              exitReason = pos.initialTpHit ? 'CHANDELIER_SL' : 'SL';
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
          const tp2Reached = pos.tp2 && (isLong ? currentPrice >= effectiveTp2 : currentPrice <= effectiveTp2);
          if (tp2Reached && !pos.tp2Hit && !exitReason) {
             pos.tp2Hit = true;
             pos.sl = isLong ? Math.max(pos.sl || 0, pos.entry_price) : Math.min(pos.sl || 999999, pos.entry_price); // move SL to breakeven (if not already better)
             console.log(`🎯 [PositionMonitor] Aggressive 1:3 TP2 hit on ${pos.symbol}. Securing 60%.`);
             // Persist tp2Hit + breakeven SL to Firestore immediately to prevent re-trigger after refresh
             safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, pos.id), { tp2Hit: true, sl: pos.sl }).catch(() => {});
             oms.partialClosePosition(pos.id, currentPrice, 0.60, 'TP2_1_3_PARTIAL')
               .then(() => this.refreshOpenPositions())
               .catch(err => console.log('Partial error:', err));
          }

          if (isLong) {
            if (pos.tp1 && currentPrice >= effectiveTp1) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const chandelierMult = pos.macroColor === 'GREEN' ? 3.0 : 2.0; // Dynamic trailing based on macro
              const candidate = pos.extremeSinceEntry - chandelierMult * entryAtr;
              const newSl = Math.max(pos.entry_price, candidate, pos.sl || 0);
              
              if (newSl > (pos.sl || 0)) {
                const oldSl = pos.sl || 0;
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
                writeLocalJson('positions.json', this.activePositions);
                this.notifyPositionListeners();
                // C4 fix: Update exchange stop-loss to match trailed stop
                executionAdapter.replaceStopOrder(pos.symbol, 'sell', pos.quantity, newSl)
                  .catch(err => console.warn(`[PositionMonitor] Failed to update exchange SL for ${pos.symbol}:`, err));
                telegramService.notifyTrailingStop(pos, oldSl, newSl, currentPrice).catch(() => {});
              }
            }

            if (pos.tp3 && currentPrice >= effectiveTp3) {
              exitReason = 'TP3';
            } else if (pos.sl && currentPrice <= effectiveSl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          } else {
            if (pos.tp1 && currentPrice <= effectiveTp1) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const chandelierMult = pos.macroColor === 'GREEN' ? 3.0 : 2.0; // Dynamic trailing based on macro
              const candidate = pos.extremeSinceEntry + chandelierMult * entryAtr;
              const newSl = Math.min(pos.entry_price, candidate, pos.sl || 999999);
              
              if (newSl < (pos.sl || 999999)) {
                const oldSl = pos.sl || 999999;
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                safeUpdateDoc(doc(db, COLLECTIONS.POSITIONS, pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
                writeLocalJson('positions.json', this.activePositions);
                this.notifyPositionListeners();
                // C4 fix: Update exchange stop-loss to match trailed stop
                executionAdapter.replaceStopOrder(pos.symbol, 'buy', pos.quantity, newSl)
                  .catch(err => console.warn(`[PositionMonitor] Failed to update exchange SL for ${pos.symbol}:`, err));
                telegramService.notifyTrailingStop(pos, oldSl, newSl, currentPrice).catch(() => {});
              }
            }

            if (pos.tp3 && currentPrice <= effectiveTp3) {
              exitReason = 'TP3';
            } else if (pos.sl && currentPrice >= effectiveSl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          }
        }

        if (exitReason) {
          this.closingSet.add(pos.id);
          console.log(`⚡ [24/7 PositionMonitor] AUTO CLOSE triggered:
  - Symbol: ${pos.symbol} (${pos.direction})
  - Exit Reason: ${exitReason}
  - Exec Price (Last Tick): ${currentPrice}
  - Entry Price: ${pos.entry_price}
  - Spread Buffer Applied: ${(spreadBuffer).toFixed(5)}
  - Effective SL Evaluated: ${effectiveSl}
  - True SL in DB: ${pos.sl}
  - Condition: ${isLong ? (exitReason === 'SL' || exitReason === 'TRAIL_BE' ? `${currentPrice} <= ${effectiveSl}` : `${currentPrice} >= ${effectiveTp1 || effectiveTp3}`) : (exitReason === 'SL' || exitReason === 'TRAIL_BE' ? `${currentPrice} >= ${effectiveSl}` : `${currentPrice} <= ${effectiveTp1 || effectiveTp3}`)}`);
          
          // Execute closing via OMS with recorded MFE/MAE (OMS handles telegram notifyTradeClose)
          oms.closePosition(pos.id, currentPrice, exitReason, { mfe: (pos as any).mfe, mae: (pos as any).mae })
            .then(async () => {
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
}

export const positionMonitor = new PositionMonitor();
