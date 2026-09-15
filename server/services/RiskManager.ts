export class RiskManager {
  private maxLeverage = 20;
  private maxExposurePct = 1.0; // Allow up to 80% total exposure across concurrent positions
  private currentExposure = 0;
  private consecutiveLosses = 0;
  private maxConsecutiveLosses = 4;
  private dailyLossLimitPct = -10.0;
  private currentDailyLossPct = 0;
  private killSwitchActive = false;
  private lastResetDate = new Date().toISOString().split('T')[0];

  public updateSettings(limitPct?: number, maxLosses?: number, maxExposure?: number) {
    if (limitPct !== undefined && limitPct !== null) {
      this.dailyLossLimitPct = -Math.abs(limitPct); // Ensure it's negative
    }
    if (maxLosses !== undefined && maxLosses !== null) {
      this.maxConsecutiveLosses = maxLosses;
    }
    if (maxExposure !== undefined && maxExposure !== null && maxExposure > 0) {
      this.maxExposurePct = maxExposure > 1 ? maxExposure / 100 : maxExposure;
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

    if (this.currentDailyLossPct <= this.dailyLossLimitPct) {
      return { allowed: false, reason: `Daily loss limit reached (${this.currentDailyLossPct.toFixed(2)}%)` };
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

  public calculatePositionSize(balance: number, riskPct: number, leverage: number, entryPrice: number): { allocatedBalance: number, quantity: number, actualLeverage: number } {
    const actualLeverage = Math.min(leverage, this.maxLeverage);
    const allocatedBalance = balance * (riskPct / 100);
    const totalPositionSize = allocatedBalance * actualLeverage;
    const quantity = totalPositionSize / entryPrice;
    
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
    spec?: { contractValue?: number; maintenanceMarginRate?: number; maxLeverage?: number; maxAllocation?: number },
    riskPercent: number = 0.01
  ): { contracts: number; leverage: number; liquidationPrice: number; allocatedBalance: number; rejected: boolean; reason?: string } {
    const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
    if (stopDistancePct === 0) {
      return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Stop price identical to entry price.' };
    }

    const contractVal = spec?.contractValue || 1;
    const mmr = spec?.maintenanceMarginRate || 0.005; // 0.5% base MMR
    const maxLev = spec?.maxLeverage ? Math.min(spec.maxLeverage, this.maxLeverage) : this.maxLeverage;
    const minLiqBuffer = 1.3;

    // Hard Caps for Risk Filtering
    const MAX_ACCOUNT_EXPOSURE_MULTIPLIER = 5; // e.g. Max 5x account size for any single position
    const MIN_STOP_DISTANCE_PCT = 0.005; // 0.5% minimum viable stop distance for sizing math

    const effectiveStopDistancePct = Math.max(stopDistancePct, MIN_STOP_DISTANCE_PCT);
    let desiredNotional = (accountEquity * riskPercent) / effectiveStopDistancePct;

    // Apply Notional Cap
    const maxNotional = accountEquity * MAX_ACCOUNT_EXPOSURE_MULTIPLIER;
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
        let contracts = Math.floor((desiredNotional / entryPrice) / contractVal);

        // Ensure allocated margin (positionNotional / lev) does not exceed max allowed allocation
        const maxContractsByAlloc = Math.floor((maxAllocation * lev) / (contractVal * entryPrice));
        if (contracts > maxContractsByAlloc) {
          contracts = maxContractsByAlloc;
        }

        if (contracts < 1) {
          return { contracts: 0, leverage: 0, liquidationPrice: 0, allocatedBalance: 0, rejected: true, reason: 'Position size exceeds allocation/exposure limit (rounds to 0 contracts).' };
        }
        const positionNotional = contracts * contractVal * entryPrice;
        const allocatedBalance = positionNotional / lev;
        return { contracts, leverage: lev, liquidationPrice: liqPrice, allocatedBalance, rejected: false };
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
}

export const riskManager = new RiskManager();
