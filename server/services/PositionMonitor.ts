import { db } from '../firebase.js';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { priceStream } from './PriceStream.js';
import { oms } from './OMS.js';
import { telegramService } from './TelegramService.js';
import { riskManager } from './RiskManager.js';

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

  constructor() {
    this.init();
  }

  public async init() {
    await this.refreshOpenPositions();

    // Subscribe to real-time price updates (evaluates every tick 24/7)
    priceStream.subscribe((prices) => {
      this.evaluatePositions(prices);
    });

    // Refresh positions from Firestore every 4 seconds to catch new trades or manual adjustments
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      this.refreshOpenPositions();
    }, 4000);
  }

  public async refreshOpenPositions() {
    try {
      const q = query(collection(db, 'positions'), where('status', '==', 'OPEN'));
      const snapshot = await getDocs(q);
      this.activePositions = snapshot.docs.map(doc => doc.data() as MonitoredPosition);
      const totalAllocated = this.activePositions.reduce((sum, p) => sum + (p.allocated_balance || 0), 0);
      riskManager.updateCurrentExposure(totalAllocated);
    } catch (e) {
      console.warn('PositionMonitor: Error refreshing positions from Firestore:', e);
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

        let exitReason: string | null = null;

        // VCB specific trend-following & validation logic
        if (pos.strategy === 'EARLY_COIL_BREAKOUT') {
          const maxSetupAge = 6; 
          const entryAtr = pos.entryAtr || (pos.entry_price * 0.02);
          const unrealizedMove = isLong ? (currentPrice - pos.entry_price) : (pos.entry_price - currentPrice);
          const unrealizedR = unrealizedMove / Math.abs(pos.entry_price - pos.sl);
          
          if (barsOpen > maxSetupAge && unrealizedR < 0.3) {
            exitReason = 'STALL_TIMEOUT';
          }
          
          if (!exitReason) {
            const stopHit = isLong ? currentPrice <= pos.sl : currentPrice >= pos.sl;
            if (stopHit) exitReason = 'SL';
            const tp1Hit = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
            const tp2Hit = pos.tp2 && (isLong ? currentPrice >= pos.tp2 : currentPrice <= pos.tp2);
            if (tp2Hit) exitReason = 'TP2';
            else if (tp1Hit && !pos.initialTpHit) {
              pos.initialTpHit = true;
              oms.partialClosePosition(pos.id, currentPrice, 0.35, 'INITIAL_TP_35PCT');
              pos.sl = pos.entry_price;
            }
          }
        } else 
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
            const tp3Reached = isLong ? currentPrice >= pos.tp3 : currentPrice <= pos.tp3;
            if (tp3Reached) {
              exitReason = 'TP3';
              console.log(`🚀 [PositionMonitor] VCB Home Run TP3 reached for ${pos.symbol}! Locking in full macro move.`);
            }
          }

          // Check TP2 (Core Structural Target - 35% scale-out)
          if (!pos.tp2Hit && !exitReason && pos.tp2) {
            const tp2Reached = isLong ? currentPrice >= pos.tp2 : currentPrice <= pos.tp2;
            if (tp2Reached) {
              pos.tp2Hit = true;
              console.log(`🎯 [PositionMonitor] VCB TP2 reached for ${pos.symbol}. Securing 35% profit and locking in TP1 as floor stop.`);
              // Lock stop to TP1 level
              pos.sl = pos.tp1;
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
              pos.sl = pos.entry_price;

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
            const stopHit = isLong ? currentPrice <= pos.sl : currentPrice >= pos.sl;
            if (stopHit) {
              exitReason = pos.initialTpHit ? 'CHANDELIER_SL' : 'SL';
            }
          }
        } else {
          // Standard / Climax Strategy management
          // Initialize extremeSinceEntry if missing
          if (pos.extremeSinceEntry === undefined) pos.extremeSinceEntry = pos.entry_price;
          
          if (isLong) {
            if (currentPrice > pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
            if (pos.tp1 && currentPrice >= pos.tp1) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const chandelierMult = 2.5; // Custom ATR Multiplier
              const candidate = pos.extremeSinceEntry - chandelierMult * entryAtr;
              const newSl = Math.max(pos.entry_price, candidate, pos.sl || 0);
              
              if (newSl > (pos.sl || 0)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                updateDoc(doc(db, 'positions', pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
              }
            }

            // Check TP3 Target Hit
            if (pos.tp3 && currentPrice >= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.sl && currentPrice <= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          } else {
            if (currentPrice < pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
            if (pos.tp1 && currentPrice <= pos.tp1) {
              const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);
              const chandelierMult = 2.5; // Custom ATR Multiplier
              const candidate = pos.extremeSinceEntry + chandelierMult * entryAtr;
              const newSl = Math.min(pos.entry_price, candidate, pos.sl || 999999);
              
              if (newSl < (pos.sl || 999999)) {
                pos.sl = newSl;
                pos.trailing_stop_active = 1;
                updateDoc(doc(db, 'positions', pos.id), { sl: newSl, trailing_stop_active: 1, extremeSinceEntry: pos.extremeSinceEntry }).catch(() => {});
              }
            }

            // Check TP3 Target Hit
            if (pos.tp3 && currentPrice <= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.sl && currentPrice >= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          }
        }

        if (exitReason) {
          this.closingSet.add(pos.id);
          console.log(`⚡ [24/7 PositionMonitor] Triggering AUTO CLOSE for ${pos.symbol} (${pos.direction}) at $${currentPrice} [Reason: ${exitReason}]`);
          
          // Execute closing via OMS
          oms.closePosition(pos.id, currentPrice, exitReason)
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
}

export const positionMonitor = new PositionMonitor();
