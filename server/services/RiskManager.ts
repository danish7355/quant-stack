export interface RiskSettings {
  maxLeverage?: number;
  maxExposurePct?: number; // e.g. 0.8 (80%) or 1.0 (100%)
  maxSimultaneousTrades?: number; // e.g. 5
  maxConsecutiveLosses?: number; // e.g. 4
  dailyLossLimitPct?: number; // e.g. -5.0%
  maxDrawdownPct?: number; // e.g. 10.0%
  minLiqBuffer?: number; // e.g. 1.3
  maxAccountExposureMultiplier?: number; // e.g. 5
  minStopDistancePct?: number; // e.g. 0.005 (0.5%)
  maxStopDistancePct?: number; // e.g. 0.04 (4.0%)
  killSwitchActive?: boolean;
  maxTradesPerDay?: number; // e.g. 25
  enforceStrictSl?: boolean;
  minRRRatio?: number;
  maxSpread?: number;
  maxFundingRate?: number;
  tradeCooldownMinutes?: number;
  correlationFilterEnabled?: boolean;
  maxCorrelation?: number;
  btcMacroRegimeFilter?: boolean;
}

export class RiskManager {
  private maxLeverage = 20;
  private maxExposurePct = 0.8; // Allow up to 80% total exposure across concurrent positions
  private maxSimultaneousTrades = 5;
  private currentExposure = 0;
  private consecutiveLosses = 0;
  private maxConsecutiveLosses = 4;
  private dailyLossLimitPct = -5.0; // Stop trading after 5% daily loss
  private currentDailyLossPct = 0;
  private maxDrawdownPct = 10.0; // Stop trading after 10% total drawdown
  private currentDrawdownPct = 0;
  private minLiqBuffer = 1.3; // Min buffer ratio between liquidation price & SL
  private maxAccountExposureMultiplier = 5; // Cap total notional at 5x account size
  private minStopDistancePct = 0.005; // 0.5% min stop loss distance
  private maxStopDistancePct = 0.04; // 4.0% max stop loss distance
  private maxTradesPerDay = 25;
  private tradesToday = 0;
  private enforceStrictSl = true;
  private minRRRatio = 1.5;
  private maxSpread = 0.2; // 0.2% max spread
  private maxFundingRate = 0.05; // 0.05% max funding rate
  private tradeCooldownMinutes = 15;
  private correlationFilterEnabled = true;
  private maxCorrelation = 0.75;
  private btcMacroRegimeFilter = false;
  private peakBalance = 10000;
  private killSwitchActive = false;
  private lastResetDate = new Date().toISOString().split('T')[0];

  public updateSettings(settingsOrLimit?: any, maxLosses?: number, maxExposure?: number) {
    if (typeof settingsOrLimit === 'object' && settingsOrLimit !== null) {
      const s = settingsOrLimit;
      if (s.dailyLossLimitPct !== undefined && s.dailyLossLimitPct !== null) {
        this.dailyLossLimitPct = -Math.abs(Number(s.dailyLossLimitPct));
      }
      if (s.maxDrawdownPct !== undefined && s.maxDrawdownPct !== null) {
        this.maxDrawdownPct = Math.abs(Number(s.maxDrawdownPct));
      }
      if (s.maxConsecutiveLosses !== undefined && s.maxConsecutiveLosses !== null) {
        this.maxConsecutiveLosses = Math.max(1, Number(s.maxConsecutiveLosses));
      }
      if (s.maxConcurrentTrades !== undefined && s.maxConcurrentTrades !== null) {
        this.maxSimultaneousTrades = Math.max(1, Number(s.maxConcurrentTrades));
      } else if (s.maxSimultaneousTrades !== undefined && s.maxSimultaneousTrades !== null) {
        this.maxSimultaneousTrades = Math.max(1, Number(s.maxSimultaneousTrades));
      }
      if (s.maxExposurePct !== undefined && s.maxExposurePct !== null && Number(s.maxExposurePct) > 0) {
        const val = Number(s.maxExposurePct);
        this.maxExposurePct = val > 1 ? val / 100 : val;
      }
      if (s.leverage !== undefined && s.leverage !== null) {
        this.maxLeverage = Math.max(1, Number(s.leverage));
      } else if (s.maxLeverage !== undefined && s.maxLeverage !== null) {
        this.maxLeverage = Math.max(1, Number(s.maxLeverage));
      }
      if (s.minLiqBuffer !== undefined && s.minLiqBuffer !== null) {
        this.minLiqBuffer = Math.max(1.0, Number(s.minLiqBuffer));
      }
      if (s.maxAccountExposureMultiplier !== undefined && s.maxAccountExposureMultiplier !== null) {
        this.maxAccountExposureMultiplier = Math.max(1, Number(s.maxAccountExposureMultiplier));
      }
      if (s.minStopDistancePct !== undefined && s.minStopDistancePct !== null) {
        const val = Number(s.minStopDistancePct);
        this.minStopDistancePct = val > 1 ? val / 100 : val;
      }
      if (s.maxStopDistancePct !== undefined && s.maxStopDistancePct !== null) {
        const val = Number(s.maxStopDistancePct);
        this.maxStopDistancePct = val > 1 ? val / 100 : val;
      }
      if (s.maxTradesPerDay !== undefined && s.maxTradesPerDay !== null) {
        this.maxTradesPerDay = Math.max(1, Number(s.maxTradesPerDay));
      }
      if (s.killSwitchActive !== undefined) {
        this.killSwitchActive = Boolean(s.killSwitchActive);
      }
      if (s.enforceStrictSl !== undefined) {
        this.enforceStrictSl = Boolean(s.enforceStrictSl);
      }
      if (s.minRRRatio !== undefined && s.minRRRatio !== null) {
        this.minRRRatio = Math.max(0.5, Number(s.minRRRatio));
      }
      if (s.maxSpread !== undefined && s.maxSpread !== null) {
        this.maxSpread = Number(s.maxSpread);
      }
      if (s.maxFundingRate !== undefined && s.maxFundingRate !== null) {
        this.maxFundingRate = Number(s.maxFundingRate);
      }
      if (s.tradeCooldownMinutes !== undefined && s.tradeCooldownMinutes !== null) {
        this.tradeCooldownMinutes = Math.max(1, Number(s.tradeCooldownMinutes));
      }
      if (s.correlationFilterEnabled !== undefined) {
        this.correlationFilterEnabled = Boolean(s.correlationFilterEnabled);
      }
      if (s.maxCorrelation !== undefined && s.maxCorrelation !== null) {
        this.maxCorrelation = Number(s.maxCorrelation);
      }
      if (s.btcMacroRegimeFilter !== undefined) {
        this.btcMacroRegimeFilter = Boolean(s.btcMacroRegimeFilter);
      }
    } else {
      if (settingsOrLimit !== undefined && settingsOrLimit !== null) {
        this.dailyLossLimitPct = -Math.abs(settingsOrLimit); // Ensure it's negative
      }
      if (maxLosses !== undefined && maxLosses !== null) {
        this.maxConsecutiveLosses = maxLosses;
      }
      if (maxExposure !== undefined && maxExposure !== null && maxExposure > 0) {
        this.maxExposurePct = maxExposure > 1 ? maxExposure / 100 : maxExposure;
      }
    }
  }

  private checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      this.currentDailyLossPct = 0;
      this.consecutiveLosses = 0;
      this.tradesToday = 0;
      this.lastResetDate = today;
      console.log('RiskManager: Daily stats reset');
    }
  }

  public getDailyLossPct(): number {
    this.checkDailyReset();
    return this.currentDailyLossPct;
  }

  public getRemainingExposure(balance: number = 10000): number {
    const maxAllowed = (balance || 10000) * this.maxExposurePct;
    return Math.max(0, maxAllowed - this.currentExposure);
  }

  public getCurrentExposure(): number {
    return this.currentExposure;
  }

  public getMaxExposurePct(): number {
    return this.maxExposurePct;
  }

  public checkEntryAllowed(balance: number, requestedAllocation: number, currentPositionsCount: number): { allowed: boolean; reason?: string } {
    this.checkDailyReset();
    if (this.killSwitchActive) {
      return { allowed: false, reason: "Emergency Risk Kill Switch is active. All trade execution is halted." };
    }

    if (this.currentDailyLossPct <= this.dailyLossLimitPct) {
      return { allowed: false, reason: `Daily loss limit reached (${this.currentDailyLossPct.toFixed(2)}% <= ${this.dailyLossLimitPct.toFixed(2)}%). New trades paused.` };
    }

    if (this.currentDrawdownPct >= this.maxDrawdownPct) {
      return { allowed: false, reason: `Max account drawdown reached (${this.currentDrawdownPct.toFixed(2)}% >= ${this.maxDrawdownPct.toFixed(2)}%). Execution paused.` };
    }

    if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
      return { allowed: false, reason: `Max consecutive losses reached (${this.consecutiveLosses}/${this.maxConsecutiveLosses}). Trading halted for cool-off.` };
    }

    if (this.tradesToday >= this.maxTradesPerDay) {
      return { allowed: false, reason: `Daily trade cap reached (${this.tradesToday}/${this.maxTradesPerDay} trades). Trading paused until daily reset.` };
    }
    
    if (currentPositionsCount >= this.maxSimultaneousTrades) {
      return { allowed: false, reason: `Max simultaneous open positions (${this.maxSimultaneousTrades}) reached.` };
    }

    const proposedExposure = (this.currentExposure + requestedAllocation) / (balance || 10000);
    if (proposedExposure > this.maxExposurePct) {
      return { allowed: false, reason: `Exposure limit exceeded. Max: ${(this.maxExposurePct * 100).toFixed(0)}%, Proposed: ${(proposedExposure * 100).toFixed(1)}%` };
    }

    return { allowed: true };
  }

  public updateCurrentExposure(totalAllocated: number) {
    this.currentExposure = Math.max(0, totalAllocated);
  }

  public calculatePositionSize(
    balance: number, 
    riskPct: number, 
    leverage: number, 
    entryPrice: number,
    stopPrice?: number
  ): { allocatedBalance: number, quantity: number, actualLeverage: number } {
    const actualLeverage = Math.min(leverage, this.maxLeverage);
    const dollarRisk = balance * (riskPct / 100);
    const stopDistance = stopPrice ? Math.abs(entryPrice - stopPrice) : 0;
    
    let quantity: number;
    let allocatedBalance: number;

    if (stopDistance > 0) {
      // True risk-based sizing: quantity = (balance * riskPct/100) / stopDistance
      quantity = dollarRisk / stopDistance;
      const notional = quantity * entryPrice;
      const maxNotional = balance * actualLeverage;
      if (notional > maxNotional) {
        quantity = maxNotional / entryPrice;
      }
      allocatedBalance = (quantity * entryPrice) / actualLeverage;
    } else {
      allocatedBalance = balance * (riskPct / 100);
      const totalPositionSize = allocatedBalance * actualLeverage;
      quantity = totalPositionSize / entryPrice;
    }
    
    return {
      allocatedBalance,
      quantity,
      actualLeverage
    };
  }

  public calculateSafePositionSize(
    accountEquity: number,
    entryPrice: number,
    stopPrice: number,
    direction: 'LONG' | 'SHORT',
    spec?: { 
      contractValue?: number; 
      maintenanceMarginRate?: number; 
      maxLeverage?: number; 
      maxAllocation?: number;
      minLiqBuffer?: number;
      maxAccountExposureMultiplier?: number;
      minStopDistancePct?: number;
      maxStopDistancePct?: number;
    },
    riskPercent: number = 0.015
  ): { contracts: number; leverage: number; liquidationPrice: number; allocatedBalance: number; rejected: boolean; reason?: string } {
    if (this.enforceStrictSl && (!stopPrice || isNaN(stopPrice) || stopPrice <= 0)) {
      return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Strict Stop-Loss Gate: Valid stop price required for execution.' };
    }

    const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
    if (stopDistancePct === 0) {
      return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop price identical to entry price.' };
    }

    const minStopDist = spec?.minStopDistancePct !== undefined ? spec.minStopDistancePct : this.minStopDistancePct;
    if (stopDistancePct < minStopDist) {
      return { 
        contracts: 0, 
        leverage: 0, 
        liquidationPrice: 0, 
        allocatedBalance: 0, 
        rejected: true, 
        reason: `Stop distance (${(stopDistancePct * 100).toFixed(2)}%) is below minimum viable threshold (${(minStopDist * 100).toFixed(2)}%).` 
      };
    }

    const maxStopDist = spec?.maxStopDistancePct !== undefined ? spec.maxStopDistancePct : this.maxStopDistancePct;
    if (stopDistancePct > maxStopDist) {
      return { 
        contracts: 0, 
        leverage: 0, 
        liquidationPrice: 0, 
        allocatedBalance: 0, 
        rejected: true, 
        reason: `Stop distance (${(stopDistancePct * 100).toFixed(2)}%) exceeds max allowed risk threshold (${(maxStopDist * 100).toFixed(2)}%).` 
      };
    }

    const contractVal = spec?.contractValue || 1;
    const mmr = spec?.maintenanceMarginRate || 0.005; // 0.5% base MMR
    const maxLev = spec?.maxLeverage ? Math.min(spec.maxLeverage, this.maxLeverage) : this.maxLeverage;
    const minLiqBuffer = spec?.minLiqBuffer || this.minLiqBuffer;

    // Hard Caps for Risk Filtering
    const maxAccountExposureMult = spec?.maxAccountExposureMultiplier || this.maxAccountExposureMultiplier;

    let desiredNotional = (accountEquity * riskPercent) / stopDistancePct;

    // Apply Notional Cap
    const maxNotional = accountEquity * maxAccountExposureMult;
    if (desiredNotional > maxNotional) {
        desiredNotional = maxNotional;
    }

    // Determine max single position allocation
    const maxAllocation = spec?.maxAllocation !== undefined && spec.maxAllocation > 0
      ? spec.maxAllocation
      : (accountEquity * this.maxExposurePct);

    for (let lev = maxLev; lev >= 1; lev--) {
      const liqDistancePct = 1 / lev - mmr;
      if (liqDistancePct <= 0) continue;
      const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
      const liqDistanceFromEntry = Math.abs(entryPrice - liqPrice) / entryPrice;

      if (liqDistanceFromEntry / stopDistancePct >= minLiqBuffer) {
        let contracts = parseFloat(((desiredNotional / entryPrice) / contractVal).toFixed(4));

        // Ensure allocated margin (positionNotional / lev) does not exceed max allowed allocation
        const maxContractsByAlloc = parseFloat(((maxAllocation * lev) / (contractVal * entryPrice)).toFixed(4));
        if (contracts > maxContractsByAlloc) {
          contracts = maxContractsByAlloc;
        }

        if (contracts <= 0) {
          return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Position size exceeds allocation/exposure limit (rounds to 0 contracts).' };
        }
        const positionNotional = contracts * contractVal * entryPrice;
        const allocatedBalance = positionNotional / lev;
        return { contracts, leverage: lev, liquidationPrice: liqPrice, allocatedBalance, rejected: false };
      }
    }

    return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: `Liquidation buffer violation: liquidation price too close to stop loss (requires >= ${minLiqBuffer.toFixed(1)}x buffer).` };
  }

  public recordTradeResult(pnl: number, totalBalance: number) {
    this.checkDailyReset();
    this.tradesToday++;
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.currentDailyLossPct += (pnl / totalBalance) * 100;
    } else {
      this.consecutiveLosses = 0;
      this.currentDailyLossPct += (pnl / totalBalance) * 100;
    }

    if (totalBalance > this.peakBalance) {
      this.peakBalance = totalBalance;
    }
    if (this.peakBalance > 0) {
      this.currentDrawdownPct = Math.max(0, ((this.peakBalance - totalBalance) / this.peakBalance) * 100);
    }
  }

  public reset() {
    this.currentExposure = 0;
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.currentDrawdownPct = 0;
    this.tradesToday = 0;
    this.killSwitchActive = false;
  }

  public activateKillSwitch() {
    this.killSwitchActive = true;
  }

  public setKillSwitch(active: boolean) {
    this.killSwitchActive = active;
  }

  public resetCircuitBreakers() {
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.currentDrawdownPct = 0;
    this.tradesToday = 0;
    this.killSwitchActive = false;
  }

  public getRiskStatus(balance: number = 10000) {
    this.checkDailyReset();
    return {
      killSwitchActive: this.killSwitchActive,
      currentDailyLossPct: parseFloat(this.currentDailyLossPct.toFixed(2)),
      dailyLossLimitPct: parseFloat(this.dailyLossLimitPct.toFixed(2)),
      currentDrawdownPct: parseFloat(this.currentDrawdownPct.toFixed(2)),
      maxDrawdownPct: parseFloat(this.maxDrawdownPct.toFixed(2)),
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.maxConsecutiveLosses,
      currentExposure: parseFloat(this.currentExposure.toFixed(2)),
      maxExposurePct: parseFloat((this.maxExposurePct * 100).toFixed(1)),
      remainingExposure: parseFloat(this.getRemainingExposure(balance).toFixed(2)),
      maxSimultaneousTrades: this.maxSimultaneousTrades,
      tradesToday: this.tradesToday,
      maxTradesPerDay: this.maxTradesPerDay,
      maxLeverage: this.maxLeverage,
      minLiqBuffer: this.minLiqBuffer,
      minStopDistancePct: parseFloat((this.minStopDistancePct * 100).toFixed(2)),
      maxStopDistancePct: parseFloat((this.maxStopDistancePct * 100).toFixed(2)),
      minRRRatio: this.minRRRatio,
      maxSpread: this.maxSpread,
      maxFundingRate: this.maxFundingRate,
      tradeCooldownMinutes: this.tradeCooldownMinutes,
      correlationFilterEnabled: this.correlationFilterEnabled,
      maxCorrelation: this.maxCorrelation,
      btcMacroRegimeFilter: this.btcMacroRegimeFilter,
      enforceStrictSl: this.enforceStrictSl,
    };
  }
}

export const riskManager = new RiskManager();
