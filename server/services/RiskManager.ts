export interface RiskSettingsPayload {
  limitPct?: number;
  maxLosses?: number;
  maxExposure?: number;
  maxTrades?: number;
  bypassMaxPositions?: boolean;
  bypassMaxConsecutiveLosses?: boolean;
  bypassDailyLossLimit?: boolean;
  bypassExposureLimit?: boolean;
  bypassLiquidationBuffer?: boolean;
  minLiquidationBuffer?: number;
  maxSinglePositionExposureMult?: number;
  minStopDistancePct?: number;
  allowFractionalContracts?: boolean;
  killSwitchActive?: boolean;
}

export class RiskManager {
  private maxLeverage = 20;
  private maxExposurePct = 1.0; // Allow up to 100% total exposure across concurrent positions by default
  private bypassExposureLimit = false;
  private maxSimultaneousTrades = 10;
  private bypassMaxPositions = false;
  private currentExposure = 0;
  private consecutiveLosses = 0;
  private maxConsecutiveLosses = 4;
  private bypassMaxConsecutiveLosses = false;
  private dailyLossLimitPct = -3.0;
  private bypassDailyLossLimit = false;
  private currentDailyLossPct = 0;
  private killSwitchActive = false;
  private minLiquidationBuffer = 1.3;
  private bypassLiquidationBuffer = false;
  private maxSinglePositionExposureMult = 5;
  private minStopDistancePct = 0.005;
  private allowFractionalContracts = true;
  private lastResetDate = new Date().toISOString().split('T')[0];

  public updateSettings(
    limitPctOrOpts?: number | RiskSettingsPayload, 
    maxLosses?: number, 
    maxExposure?: number, 
    maxTrades?: number, 
    bypassMaxPositions?: boolean,
    bypassMaxConsecutiveLosses?: boolean,
    bypassDailyLossLimit?: boolean,
    bypassExposureLimit?: boolean
  ) {
    if (typeof limitPctOrOpts === 'object' && limitPctOrOpts !== null) {
      const opts = limitPctOrOpts;
      if (opts.limitPct !== undefined && opts.limitPct !== null) {
        this.dailyLossLimitPct = -Math.abs(opts.limitPct);
      }
      if (opts.maxLosses !== undefined && opts.maxLosses !== null && opts.maxLosses > 0) {
        this.maxConsecutiveLosses = opts.maxLosses;
      }
      if (opts.maxExposure !== undefined && opts.maxExposure !== null && opts.maxExposure > 0) {
        this.maxExposurePct = opts.maxExposure > 1 ? opts.maxExposure / 100 : opts.maxExposure;
      }
      if (opts.maxTrades !== undefined && opts.maxTrades !== null && opts.maxTrades > 0) {
        this.maxSimultaneousTrades = opts.maxTrades;
      }
      if (opts.bypassMaxPositions !== undefined && opts.bypassMaxPositions !== null) {
        this.bypassMaxPositions = Boolean(opts.bypassMaxPositions);
      }
      if (opts.bypassMaxConsecutiveLosses !== undefined && opts.bypassMaxConsecutiveLosses !== null) {
        this.bypassMaxConsecutiveLosses = Boolean(opts.bypassMaxConsecutiveLosses);
      }
      if (opts.bypassDailyLossLimit !== undefined && opts.bypassDailyLossLimit !== null) {
        this.bypassDailyLossLimit = Boolean(opts.bypassDailyLossLimit);
      }
      if (opts.bypassExposureLimit !== undefined && opts.bypassExposureLimit !== null) {
        this.bypassExposureLimit = Boolean(opts.bypassExposureLimit);
      }
      if (opts.bypassLiquidationBuffer !== undefined && opts.bypassLiquidationBuffer !== null) {
        this.bypassLiquidationBuffer = Boolean(opts.bypassLiquidationBuffer);
      }
      if (opts.minLiquidationBuffer !== undefined && opts.minLiquidationBuffer !== null && opts.minLiquidationBuffer > 1.0) {
        this.minLiquidationBuffer = opts.minLiquidationBuffer;
      }
      if (opts.maxSinglePositionExposureMult !== undefined && opts.maxSinglePositionExposureMult !== null && opts.maxSinglePositionExposureMult > 0) {
        this.maxSinglePositionExposureMult = opts.maxSinglePositionExposureMult;
      }
      if (opts.minStopDistancePct !== undefined && opts.minStopDistancePct !== null && opts.minStopDistancePct > 0) {
        this.minStopDistancePct = opts.minStopDistancePct;
      }
      if (opts.allowFractionalContracts !== undefined && opts.allowFractionalContracts !== null) {
        this.allowFractionalContracts = Boolean(opts.allowFractionalContracts);
      }
      if (opts.killSwitchActive !== undefined && opts.killSwitchActive !== null) {
        this.killSwitchActive = Boolean(opts.killSwitchActive);
      }
      return;
    }

    if (typeof limitPctOrOpts === 'number') {
      this.dailyLossLimitPct = -Math.abs(limitPctOrOpts); // Ensure it's negative
    }
    if (maxLosses !== undefined && maxLosses !== null && maxLosses > 0) {
      this.maxConsecutiveLosses = maxLosses;
    }
    if (maxExposure !== undefined && maxExposure !== null && maxExposure > 0) {
      this.maxExposurePct = maxExposure > 1 ? maxExposure / 100 : maxExposure;
    }
    if (maxTrades !== undefined && maxTrades !== null && maxTrades > 0) {
      this.maxSimultaneousTrades = maxTrades;
    }
    if (bypassMaxPositions !== undefined && bypassMaxPositions !== null) {
      this.bypassMaxPositions = Boolean(bypassMaxPositions);
    }
    if (bypassMaxConsecutiveLosses !== undefined && bypassMaxConsecutiveLosses !== null) {
      this.bypassMaxConsecutiveLosses = Boolean(bypassMaxConsecutiveLosses);
    }
    if (bypassDailyLossLimit !== undefined && bypassDailyLossLimit !== null) {
      this.bypassDailyLossLimit = Boolean(bypassDailyLossLimit);
    }
    if (bypassExposureLimit !== undefined && bypassExposureLimit !== null) {
      this.bypassExposureLimit = Boolean(bypassExposureLimit);
    }
  }

  private checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      this.currentDailyLossPct = 0;
      this.consecutiveLosses = 0;
      this.lastResetDate = today;
      console.log('RiskManager: Daily stats reset');
    }
  }

  public getDailyLossPct(): number {
    this.checkDailyReset();
    return this.currentDailyLossPct;
  }

  public getRemainingExposure(balance: number = 10000): number {
    if (this.bypassExposureLimit) return balance * 100;
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
      return { allowed: false, reason: "Kill switch is active" };
    }

    if (!this.bypassDailyLossLimit && this.currentDailyLossPct <= this.dailyLossLimitPct) {
      return { allowed: false, reason: `Daily loss limit reached (${this.currentDailyLossPct.toFixed(2)}%)` };
    }

    if (!this.bypassMaxConsecutiveLosses && this.maxConsecutiveLosses > 0 && this.consecutiveLosses >= this.maxConsecutiveLosses) {
      return { allowed: false, reason: `Max consecutive losses (${this.maxConsecutiveLosses}) reached.` };
    }
    
    if (!this.bypassMaxPositions && this.maxSimultaneousTrades > 0 && currentPositionsCount >= this.maxSimultaneousTrades) {
      return { allowed: false, reason: `Max simultaneous positions (${this.maxSimultaneousTrades}) reached.` };
    }

    const proposedExposure = (this.currentExposure + requestedAllocation) / (balance || 10000);
    if (!this.bypassExposureLimit && proposedExposure > this.maxExposurePct) {
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
    spec?: { contractValue?: number; maintenanceMarginRate?: number; maxLeverage?: number; maxAllocation?: number; allowFractional?: boolean },
    riskPercent: number = 0.01
  ): { contracts: number; leverage: number; liquidationPrice: number; allocatedBalance: number; rejected: boolean; reason?: string } {
    const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
    if (stopDistancePct === 0) {
      return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop price identical to entry price.' };
    }

    const contractVal = spec?.contractValue || 1;
    const mmr = spec?.maintenanceMarginRate || 0.005; // 0.5% base MMR
    const maxLev = spec?.maxLeverage ? Math.min(spec.maxLeverage, this.maxLeverage) : this.maxLeverage;
    const effectiveMinLiqBuffer = this.bypassLiquidationBuffer ? 1.01 : this.minLiquidationBuffer;

    // Sizing caps from configurable settings
    const effectiveStopDistancePct = Math.max(stopDistancePct, this.minStopDistancePct);
    let desiredNotional = (accountEquity * riskPercent) / effectiveStopDistancePct;

    // Apply Notional Cap
    const maxNotional = accountEquity * this.maxSinglePositionExposureMult;
    if (desiredNotional > maxNotional) {
      desiredNotional = maxNotional;
    }

    // Determine max single position allocation
    const maxAllocation = spec?.maxAllocation !== undefined && spec.maxAllocation > 0
      ? spec.maxAllocation
      : (this.bypassExposureLimit ? (accountEquity * 10) : (accountEquity * this.maxExposurePct));

    const canUseFractional = spec?.allowFractional !== undefined ? spec.allowFractional : this.allowFractionalContracts;

    for (let lev = maxLev; lev >= 1; lev--) {
      const liqDistancePct = 1 / lev - mmr;
      if (liqDistancePct <= 0) continue;
      const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
      const liqDistanceFromEntry = Math.abs(entryPrice - liqPrice) / entryPrice;

      if (liqDistanceFromEntry / stopDistancePct >= effectiveMinLiqBuffer) {
        let contracts = Math.floor((desiredNotional / entryPrice) / contractVal);

        // Ensure allocated margin (positionNotional / lev) does not exceed max allowed allocation
        const maxContractsByAlloc = Math.floor((maxAllocation * lev) / (contractVal * entryPrice));
        if (contracts > maxContractsByAlloc) {
          contracts = maxContractsByAlloc;
        }

        if (contracts < 1) {
          if (canUseFractional) {
            const rawDesired = (desiredNotional / entryPrice) / contractVal;
            const rawMaxByAlloc = (maxAllocation * lev) / (contractVal * entryPrice);
            const frac = Number(Math.min(rawDesired, rawMaxByAlloc).toFixed(4));
            if (frac > 0) {
              contracts = frac;
            } else {
              return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Position size exceeds allocation/exposure limit (rounds to 0 contracts).' };
            }
          } else {
            return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Position size exceeds allocation/exposure limit (rounds to 0 contracts).' };
          }
        }
        const positionNotional = contracts * contractVal * entryPrice;
        const allocatedBalance = positionNotional / lev;
        return { contracts, leverage: lev, liquidationPrice: liqPrice, allocatedBalance, rejected: false };
      }
    }

    // If buffer wasn't met but user bypassed the liquidation buffer, fallback to 1x unleveraged entry
    if (this.bypassLiquidationBuffer) {
      const lev = 1;
      const liqDistancePct = 1 - mmr;
      const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);
      let contracts = Math.floor((desiredNotional / entryPrice) / contractVal);
      const maxContractsByAlloc = Math.floor((maxAllocation * lev) / (contractVal * entryPrice));
      if (contracts > maxContractsByAlloc) contracts = maxContractsByAlloc;
      if (contracts < 1 && canUseFractional) {
        const rawDesired = (desiredNotional / entryPrice) / contractVal;
        const rawMaxByAlloc = (maxAllocation * lev) / (contractVal * entryPrice);
        const frac = Number(Math.min(rawDesired, rawMaxByAlloc).toFixed(4));
        if (frac > 0) contracts = frac;
      }
      if (contracts > 0) {
        const positionNotional = contracts * contractVal * entryPrice;
        return { contracts, leverage: 1, liquidationPrice: liqPrice, allocatedBalance: positionNotional, rejected: false };
      }
    }

    return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop distance too wide to leverage safely.' };
  }

  public recordTradeResult(pnl: number, totalBalance: number) {
    this.checkDailyReset();
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.currentDailyLossPct += (pnl / totalBalance) * 100;
    } else {
      this.consecutiveLosses = 0;
      this.currentDailyLossPct += (pnl / totalBalance) * 100;
    }
  }

  public reset() {
    this.currentExposure = 0;
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.killSwitchActive = false;
  }

  public activateKillSwitch() {
    this.killSwitchActive = true;
  }

  public deactivateKillSwitch() {
    this.killSwitchActive = false;
  }

  public isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  public setKillSwitch(active: boolean) {
    this.killSwitchActive = Boolean(active);
  }

  public getMaxSimultaneousTrades(): number {
    return this.maxSimultaneousTrades;
  }

  public setMaxSimultaneousTrades(maxTrades: number) {
    this.maxSimultaneousTrades = Math.max(1, maxTrades);
  }

  public isBypassMaxPositions(): boolean {
    return this.bypassMaxPositions;
  }

  public setBypassMaxPositions(bypass: boolean) {
    this.bypassMaxPositions = Boolean(bypass);
  }

  public getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  public resetConsecutiveLosses() {
    this.consecutiveLosses = 0;
  }

  public getMaxConsecutiveLosses(): number {
    return this.maxConsecutiveLosses;
  }

  public setMaxConsecutiveLosses(val: number) {
    this.maxConsecutiveLosses = Math.max(1, val);
  }

  public isBypassMaxConsecutiveLosses(): boolean {
    return this.bypassMaxConsecutiveLosses;
  }

  public setBypassMaxConsecutiveLosses(val: boolean) {
    this.bypassMaxConsecutiveLosses = Boolean(val);
  }

  public isBypassDailyLossLimit(): boolean {
    return this.bypassDailyLossLimit;
  }

  public setBypassDailyLossLimit(val: boolean) {
    this.bypassDailyLossLimit = Boolean(val);
  }

  public resetDailyLoss() {
    this.currentDailyLossPct = 0;
  }

  public getDailyLossLimitPct(): number {
    return this.dailyLossLimitPct;
  }

  public setDailyLossLimitPct(val: number) {
    this.dailyLossLimitPct = -Math.abs(val);
  }

  public isBypassExposureLimit(): boolean {
    return this.bypassExposureLimit;
  }

  public setBypassExposureLimit(val: boolean) {
    this.bypassExposureLimit = Boolean(val);
  }

  public setMaxExposurePct(val: number) {
    this.maxExposurePct = val > 1 ? val / 100 : val;
  }

  public isBypassLiquidationBuffer(): boolean {
    return this.bypassLiquidationBuffer;
  }

  public setBypassLiquidationBuffer(val: boolean) {
    this.bypassLiquidationBuffer = Boolean(val);
  }

  public getMinLiquidationBuffer(): number {
    return this.minLiquidationBuffer;
  }

  public setMinLiquidationBuffer(val: number) {
    this.minLiquidationBuffer = Math.max(1.01, val);
  }

  public getMaxSinglePositionExposureMult(): number {
    return this.maxSinglePositionExposureMult;
  }

  public setMaxSinglePositionExposureMult(val: number) {
    this.maxSinglePositionExposureMult = Math.max(1, val);
  }

  public getMinStopDistancePct(): number {
    return this.minStopDistancePct;
  }

  public setMinStopDistancePct(val: number) {
    this.minStopDistancePct = Math.max(0.0005, val);
  }

  public isAllowFractionalContracts(): boolean {
    return this.allowFractionalContracts;
  }

  public setAllowFractionalContracts(val: boolean) {
    this.allowFractionalContracts = Boolean(val);
  }
}

export const riskManager = new RiskManager();
