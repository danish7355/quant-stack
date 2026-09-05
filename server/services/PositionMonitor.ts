import { db } from '../firebase.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { priceStream } from './PriceStream.js';
import { oms } from './OMS.js';
import { telegramService } from './TelegramService.js';

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
  trailing_stop_active?: number;
  time_open: string;
  status: 'OPEN' | 'CLOSED';
}

export class PositionMonitor {
  private activePositions: MonitoredPosition[] = [];
  private isProcessing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private closingSet = new Set<string>();
  private settings: any = {
    timeBasedExitEnabled: true,
    timeBasedExitCandles: 3
  };

  constructor() {
    this.init();
  }

  public updateSettings(s: any) {
    if (s) {
      this.settings = { ...this.settings, ...s };
    }
  }

  public async loadSettings() {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'bot_config'));
      if (docSnap.exists()) {
        this.settings = { ...this.settings, ...docSnap.data() };
      }
    } catch (e) {
      console.warn('PositionMonitor: Could not load settings from Firestore:', e);
    }
  }

  public async init() {
    await this.loadSettings();
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

          const entryAtr = pos.entryAtr || (Math.abs(pos.tp1 - pos.entry_price) / 1.5) || (pos.entry_price * 0.015);

          // 2. Initial TP (25% Partial Profit Take) (Section 11)
          if (!pos.initialTpHit && !exitReason) {
            const tpReached = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
            if (tpReached) {
              pos.initialTpHit = true;
              console.log(`🎯 [PositionMonitor] VCB Initial TP reached for ${pos.symbol}. Securing 25% profit.`);
              
              // Move stop to fee-safe breakeven (+0.3x ATR in profit, guaranteed fee & slippage cover)
              const feeSafeOffset = Math.max(pos.entry_price * 0.002, 0.30 * entryAtr);
              pos.sl = isLong ? pos.entry_price + feeSafeOffset : pos.entry_price - feeSafeOffset;

              // Execute 25% partial market close via OMS
              oms.partialClosePosition(pos.id, currentPrice, 0.25, 'INITIAL_TP_25PCT')
                .then(() => this.refreshOpenPositions())
                .catch(err => console.error('PositionMonitor: Error in partialClosePosition:', err));
            } else {
              // 3. Stall Check (Section 11) - 8 bars open and < 1.0 ATR progress
              if (barsOpen >= 8) {
                const unrealizedMoveInAtr = isLong 
                  ? (currentPrice - pos.entry_price) / entryAtr 
                  : (pos.entry_price - currentPrice) / entryAtr;
                if (unrealizedMoveInAtr < 1.0) {
                  exitReason = 'STALL_TIMEOUT';
                  console.log(`⏱️ [PositionMonitor] VCB Stall Exit triggered on ${pos.symbol} (${barsOpen} bars, move: ${unrealizedMoveInAtr.toFixed(2)} ATR)`);
                }
              }
            }
          } else if (pos.initialTpHit && !exitReason) {
            // 4. Chandelier Stop Trail (Section 11) - 3.0 * ATR behind extreme, ratchets favorably only
            const chandelierAtrMult = 3.0;
            const candidate = isLong 
              ? pos.extremeSinceEntry - chandelierAtrMult * entryAtr
              : pos.extremeSinceEntry + chandelierAtrMult * entryAtr;
            
            pos.sl = isLong ? Math.max(pos.sl || 0, candidate) : Math.min(pos.sl || 999999, candidate);
          }

          // Check if TP3 or Stop Loss or Chandelier Stop is hit
          if (!exitReason) {
            if (pos.tp3 && (isLong ? currentPrice >= pos.tp3 : currentPrice <= pos.tp3)) {
              exitReason = 'TP3';
            } else {
              const stopHit = isLong ? currentPrice <= pos.sl : currentPrice >= pos.sl;
              if (stopHit) {
                exitReason = pos.initialTpHit ? 'CHANDELIER_SL' : 'SL';
              }
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
            if (pos.tp3 && currentPrice >= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.tp1 && currentPrice >= pos.tp1) {
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

            if (!exitReason && pos.sl && currentPrice <= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          } else {
            if (currentPrice < pos.extremeSinceEntry) {
              pos.extremeSinceEntry = currentPrice;
            }
            if (pos.tp3 && currentPrice <= pos.tp3) {
              exitReason = 'TP3';
            } else if (pos.tp1 && currentPrice <= pos.tp1) {
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

            if (!exitReason && pos.sl && currentPrice >= pos.sl) {
              exitReason = pos.trailing_stop_active === 1 ? 'TRAIL_BE' : 'SL';
            }
          }
        }

        // Time-Based Exit for Stagnant / Unprofitable Positions
        if (!exitReason && this.settings.timeBasedExitEnabled) {
          const limitCandles = Number(this.settings.timeBasedExitCandles) || 3;
          if (barsOpen >= limitCandles) {
            const isProfitable = isLong ? currentPrice > pos.entry_price : currentPrice < pos.entry_price;
            if (!isProfitable) {
              exitReason = 'TIME_EXIT_UNPROFITABLE';
              console.log(`⏱️ [PositionMonitor] Time-based exit on ${pos.symbol} (${barsOpen} bars >= ${limitCandles} limit, unprofitable)`);
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
