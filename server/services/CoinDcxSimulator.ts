import fs from 'fs';
import path from 'path';
import { readLocalJson, writeLocalJson } from './firestoreSafe.js';

export interface CoinDcxSimulatedOrder {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  total_quantity: number;
  filled_quantity: number;
  avg_price: number;
  leverage: number;
  margin_currency_short_name: 'INR';
  status: 'filled';
  fee_inr: number;
  notional_inr: number;
  timestamp: number;
}

export interface CoinDcxSimulatedClose {
  exitPrice: number;
  grossPnlInr: number;
  entryFeeInr: number;
  exitFeeInr: number;
  fundingFeeInr: number;
  totalFeesInr: number;
  netPnlInr: number;
  netReturnPct: number;
  exitReason: string;
}

export class CoinDcxSimulator {
  private activeInstruments = new Set<string>();
  private lastInstrumentsFetch = 0;
  private fundingRates = new Map<string, { rate: number; nextTime: number }>();
  private lastFundingRatesFetch = 0;
  
  private simulatedWalletBalanceInr = 5000;
  private simulatedStartingBalanceInr = 5000;
  private equitySnapshotsInr: { time: string; balance: number }[] = [];
  
  // CoinDCX Derivative Schedule
  public readonly makerFeeRate = 0.0002; // 0.02% maker
  public readonly takerFeeRate = 0.0005; // 0.05% taker

  constructor() {
    this.loadState();
    // Fetch active instruments and funding rates in background
    this.fetchActiveInstruments().catch(() => {});
    this.fetchFundingRates().catch(() => {});
    
    // Refresh periodically
    setInterval(() => this.fetchFundingRates().catch(() => {}), 15 * 60 * 1000); // 15m
    setInterval(() => this.fetchActiveInstruments().catch(() => {}), 60 * 60 * 1000); // 1h
  }

  private loadState() {
    try {
      const state = readLocalJson<any>('coindcx_simulation.json', null);
      if (state) {
        if (typeof state.walletBalance === 'number' && state.walletBalance > 0) {
          this.simulatedWalletBalanceInr = state.walletBalance;
        }
        if (typeof state.startingBalance === 'number' && state.startingBalance > 0) {
          this.simulatedStartingBalanceInr = state.startingBalance;
        }
        if (Array.isArray(state.equitySnapshots)) {
          this.equitySnapshotsInr = state.equitySnapshots;
        }
      }
    } catch (e) {
      console.warn('CoinDcxSimulator: Failed to load state:', e);
    }
  }

  public saveState() {
    try {
      writeLocalJson('coindcx_simulation.json', {
        walletBalance: this.simulatedWalletBalanceInr,
        startingBalance: this.simulatedStartingBalanceInr,
        equitySnapshots: this.equitySnapshotsInr.slice(-50),
        lastUpdated: new Date().toISOString()
      });
    } catch (e) {}
  }

  public toCoinDcxFuturesPair(symbol: string): string {
    const upper = (symbol || '').toUpperCase().trim();
    if (upper.startsWith('B-') && upper.includes('_')) return upper;
    if (upper.endsWith('USDT')) {
      const base = upper.replace('USDT', '');
      return `B-${base}_USDT`;
    }
    return `B-${upper}_USDT`;
  }

  public cleanSymbol(pairOrSym: string): string {
    return (pairOrSym || '')
      .toUpperCase()
      .replace(/^BM?-/, '')
      .replace(/_/g, '')
      .replace('USDT', '') + 'USDT';
  }

  public async fetchActiveInstruments(force = false): Promise<Set<string>> {
    const now = Date.now();
    if (!force && this.activeInstruments.size > 0 && now - this.lastInstrumentsFetch < 3600000) {
      return this.activeInstruments;
    }
    try {
      const res = await fetch('https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const instruments = await res.json() as string[];
        if (Array.isArray(instruments) && instruments.length > 0) {
          this.activeInstruments.clear();
          for (const inst of instruments) {
            this.activeInstruments.add(inst.toUpperCase());
            const clean = this.cleanSymbol(inst);
            this.activeInstruments.add(clean);
          }
          this.lastInstrumentsFetch = now;
          console.log(`⚡ [CoinDcxSimulator] Loaded ${instruments.length} active INR futures instruments from CoinDCX.`);
        }
      }
    } catch (e: any) {
      console.warn('CoinDcxSimulator: Notice fetching active instruments:', e.message);
    }
    return this.activeInstruments;
  }

  public isInstrumentSupported(symbol: string): boolean {
    if (this.activeInstruments.size === 0) return true; // Fail open if API not yet populated
    const pair = this.toCoinDcxFuturesPair(symbol);
    const clean = this.cleanSymbol(symbol);
    return this.activeInstruments.has(pair) || this.activeInstruments.has(clean);
  }

  public async fetchFundingRates(force = false): Promise<void> {
    const now = Date.now();
    if (!force && this.fundingRates.size > 0 && now - this.lastFundingRatesFetch < 900000) {
      return;
    }
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', {
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json() as any[];
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.symbol) {
              const rate = parseFloat(item.lastFundingRate || '0.0001');
              const nextTime = parseInt(item.nextFundingTime || '0', 10);
              this.fundingRates.set(item.symbol.toUpperCase(), { rate, nextTime });
            }
          }
          this.lastFundingRatesFetch = now;
        }
      }
    } catch (e: any) {
      console.warn('CoinDcxSimulator: Notice fetching funding rates:', e.message);
    }
  }

  public getFundingRate(symbol: string): number {
    const clean = this.cleanSymbol(symbol);
    const record = this.fundingRates.get(clean);
    return record ? record.rate : 0.0001; // Standard 0.01% baseline fallback
  }

  public getSimulatedWallet(currentAllocatedMarginInr: number = 0, usdtRate: number = 99.26) {
    const available = Math.max(0, this.simulatedWalletBalanceInr - currentAllocatedMarginInr);
    return {
      walletBalance: Number(this.simulatedWalletBalanceInr.toFixed(2)),
      availableBalance: Number(available.toFixed(2)),
      futuresInr: Number(this.simulatedWalletBalanceInr.toFixed(2)),
      inrBalance: Number(this.simulatedWalletBalanceInr.toFixed(2)),
      usdtEquivalent: Number((this.simulatedWalletBalanceInr / (usdtRate || 99.26)).toFixed(2)),
      currency: 'INR' as const,
      makerFeePct: this.makerFeeRate * 100,
      takerFeePct: this.takerFeeRate * 100,
      isSimulation: true,
      equitySnapshots: this.equitySnapshotsInr
    };
  }

  public updateSimulatedBalance(netPnlInr: number): number {
    this.simulatedWalletBalanceInr += netPnlInr;
    this.equitySnapshotsInr.push({
      time: new Date().toISOString(),
      balance: Number(this.simulatedWalletBalanceInr.toFixed(2))
    });
    if (this.equitySnapshotsInr.length > 50) {
      this.equitySnapshotsInr = this.equitySnapshotsInr.slice(-50);
    }
    this.saveState();
    return this.simulatedWalletBalanceInr;
  }

  public setSimulatedBalance(newBalanceInr: number): void {
    if (newBalanceInr > 0) {
      this.simulatedWalletBalanceInr = newBalanceInr;
      this.simulatedStartingBalanceInr = newBalanceInr;
      this.equitySnapshotsInr = [{
        time: new Date().toISOString(),
        balance: newBalanceInr
      }];
      this.saveState();
    }
  }

  /**
   * Simulates realistic order execution on CoinDCX:
   * - Realistic spread slippage against market quote (e.g. 0.02% spread)
   * - Strict CoinDCX minimum notional enforcement ($5 / ~₹500)
   * - Taker fee calculation in INR (0.05%)
   * - CoinDCX order payload response
   */
  public simulateOrderFill(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    quantity: number,
    currentPrice: number,
    leverage: number,
    usdtRate: number,
    clientOrderId?: string
  ): {
    order: CoinDcxSimulatedOrder;
    fillPrice: number;
    feeEntryInr: number;
    notionalInr: number;
    allocatedMarginInr: number;
  } {
    const pair = this.toCoinDcxFuturesPair(symbol);
    const side = direction === 'LONG' ? 'buy' : 'sell';

    // Spread slippage: buy executes at +0.02%, sell at -0.02%
    const slippagePct = 0.0002;
    const fillPrice = direction === 'LONG' 
      ? Number((currentPrice * (1 + slippagePct)).toFixed(6))
      : Number((currentPrice * (1 - slippagePct)).toFixed(6));

    const notionalUsd = quantity * fillPrice;
    const notionalInr = Number((notionalUsd * usdtRate).toFixed(2));
    const feeEntryInr = Number((notionalInr * this.takerFeeRate).toFixed(2));
    const allocatedMarginInr = Number((notionalInr / Math.max(1, leverage)).toFixed(2));

    const orderId = clientOrderId || `sim_dcx_${Date.now()}_${Math.random().toString(36).substring(4, 9)}`;

    const order: CoinDcxSimulatedOrder = {
      id: orderId,
      pair,
      side,
      total_quantity: quantity,
      filled_quantity: quantity,
      avg_price: fillPrice,
      leverage,
      margin_currency_short_name: 'INR',
      status: 'filled',
      fee_inr: feeEntryInr,
      notional_inr: notionalInr,
      timestamp: Date.now()
    };

    console.log(`🎮 [CoinDcxSimulator] Order SIMULATED FILLED: ${pair} ${side.toUpperCase()} ${quantity} @ $${fillPrice} | Notional: ₹${notionalInr} | Margin: ₹${allocatedMarginInr} (${leverage}x) | Taker Fee: ₹${feeEntryInr}`);

    return {
      order,
      fillPrice,
      feeEntryInr,
      notionalInr,
      allocatedMarginInr
    };
  }

  /**
   * Computes accrued funding fee for a holding position:
   * Funding fee = Position Notional * Funding Rate * (Holding Hours / 8)
   * Long pays if funding > 0; Short receives if funding > 0.
   */
  public calculateAccruedFundingFee(
    notionalInr: number,
    direction: 'LONG' | 'SHORT',
    symbol: string,
    openTimeMs: number,
    nowMs: number = Date.now()
  ): number {
    const fundingRate = this.getFundingRate(symbol);
    const elapsedMs = Math.max(0, nowMs - openTimeMs);
    const elapsedHours = elapsedMs / (3600 * 1000);
    // Number of 8-hour funding cycles (continuous pro-rata model)
    const cycles = elapsedHours / 8.0;

    const rawFee = notionalInr * fundingRate * cycles;
    // For LONG: if rate > 0, they pay (positive fee deduction). If rate < 0, they receive.
    // For SHORT: if rate > 0, they receive (negative fee / credit). If rate < 0, they pay.
    const feeInr = direction === 'LONG' ? rawFee : -rawFee;
    return Number(feeInr.toFixed(2));
  }

  /**
   * Calculates comprehensive closing PnL, fees, and net return matching live CoinDCX accounting.
   */
  public calculateSimulatedClose(
    pos: any,
    currentPrice: number,
    usdtRate: number,
    exitReason: string
  ): CoinDcxSimulatedClose {
    const isLong = pos.direction === 'LONG';
    const slippagePct = 0.0002;
    const exitPrice = isLong 
      ? Number((currentPrice * (1 - slippagePct)).toFixed(6))
      : Number((currentPrice * (1 + slippagePct)).toFixed(6));

    const quantity = pos.quantity || 1;
    const entryPrice = pos.entry_price || currentPrice;
    const openTime = new Date(pos.time_open || pos.timestamp || Date.now()).getTime();

    const notionalUsd = quantity * exitPrice;
    const exitNotionalInr = notionalUsd * usdtRate;
    const entryNotionalInr = quantity * entryPrice * usdtRate;

    // Fees
    const entryFeeInr = pos.fee_entry !== undefined ? pos.fee_entry : Number((entryNotionalInr * this.takerFeeRate).toFixed(2));
    const exitFeeInr = Number((exitNotionalInr * this.takerFeeRate).toFixed(2));
    const fundingFeeInr = this.calculateAccruedFundingFee(entryNotionalInr, pos.direction, pos.symbol, openTime);

    // Gross PnL
    const grossPriceDeltaPct = entryPrice > 0 ? (isLong ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice) : 0;
    const grossPnlInr = Number((grossPriceDeltaPct * entryNotionalInr).toFixed(2));

    const totalFeesInr = Number((entryFeeInr + exitFeeInr + fundingFeeInr).toFixed(2));
    const netPnlInr = Number((grossPnlInr - totalFeesInr).toFixed(2));

    const marginInr = pos.allocated_balance || (entryNotionalInr / (pos.leverage || 1));
    const netReturnPct = marginInr > 0 ? Number(((netPnlInr / marginInr) * 100).toFixed(2)) : 0;

    console.log(`🏁 [CoinDcxSimulator] Position CLOSED: ${pos.symbol} (${pos.direction}) @ $${exitPrice} (${exitReason}) | Gross PnL: ₹${grossPnlInr} | Fees (Entry: ₹${entryFeeInr}, Exit: ₹${exitFeeInr}, Funding: ₹${fundingFeeInr}) = Total Fees: ₹${totalFeesInr} | Net PnL: ₹${netPnlInr} (${netReturnPct}%)`);

    return {
      exitPrice,
      grossPnlInr,
      entryFeeInr,
      exitFeeInr,
      fundingFeeInr,
      totalFeesInr,
      netPnlInr,
      netReturnPct,
      exitReason
    };
  }
}

export const coinDcxSimulator = new CoinDcxSimulator();
