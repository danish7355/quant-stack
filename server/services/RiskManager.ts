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
  maxTradeMarginInr?: number;
  maxRiskPerTradeInr?: number;
  enforceInrCapsInLive?: boolean;
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
  private minStopDistancePct = 0.01; // 1.0% min stop loss distance
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
  private maxTradeMarginInr = 200; // Hard max margin per trade in INR (default ₹200)
  private maxRiskPerTradeInr = 100; // Hard max risk/loss at SL in INR (default ₹100)
  private enforceInrCapsInLive = true; // Enforce INR margin and risk limits
  private postSlCooldownMinutes = 30; // 30m cooling-off after Stop Loss
  private antiWhipsawEnabled = true; // Block immediate opposite trade
  private maxConsecutiveLossesPerSymbol = 2; // Quarantine after 2 consecutive SLs
  private consecutiveLossQuarantineMinutes = 120; // 2 hour quarantine
  private peakBalance = 0;
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
      if (s.maxTradeMarginInr !== undefined && s.maxTradeMarginInr !== null) {
        this.maxTradeMarginInr = Math.max(10, Number(s.maxTradeMarginInr));
      }
      if (s.maxRiskPerTradeInr !== undefined && s.maxRiskPerTradeInr !== null) {
        this.maxRiskPerTradeInr = Math.max(5, Number(s.maxRiskPerTradeInr));
      }
      if (s.enforceInrCapsInLive !== undefined) {
        this.enforceInrCapsInLive = Boolean(s.enforceInrCapsInLive);
      }
      if (s.postSlCooldownMinutes !== undefined && s.postSlCooldownMinutes !== null) {
        this.postSlCooldownMinutes = Math.max(5, Number(s.postSlCooldownMinutes));
      }
      if (s.antiWhipsawEnabled !== undefined) {
        this.antiWhipsawEnabled = Boolean(s.antiWhipsawEnabled);
      }
      if (s.maxConsecutiveLossesPerSymbol !== undefined && s.maxConsecutiveLossesPerSymbol !== null) {
        this.maxConsecutiveLossesPerSymbol = Math.max(1, Number(s.maxConsecutiveLossesPerSymbol));
      }
      if (s.consecutiveLossQuarantineMinutes !== undefined && s.consecutiveLossQuarantineMinutes !== null) {
        this.consecutiveLossQuarantineMinutes = Math.max(10, Number(s.consecutiveLossQuarantineMinutes));
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
    stopPrice?: number,
    inrOptions?: { maxMarginInr?: number; maxRiskInr?: number; usdtToInrRate?: number; isMarginInr?: boolean }
  ): { allocatedBalance: number, quantity: number, actualLeverage: number } {
    const actualLeverage = Math.min(leverage, this.maxLeverage);
    const dollarRisk = balance * (riskPct / 100);
    const stopDistance = stopPrice ? Math.abs(entryPrice - stopPrice) : 0;
    const usdtRate = inrOptions?.usdtToInrRate || 99.26;
    const maxMarginInr = inrOptions?.maxMarginInr !== undefined ? inrOptions.maxMarginInr : this.maxTradeMarginInr;
    const maxRiskInr = inrOptions?.maxRiskInr !== undefined ? inrOptions.maxRiskInr : this.maxRiskPerTradeInr;
    
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

    // Strictly enforce INR caps (<= 200 RS margin, <= 100 RS risk) only when trading in INR margin
    if (this.enforceInrCapsInLive && inrOptions?.isMarginInr) {
      if (stopDistance > 0 && maxRiskInr > 0) {
        const maxQtyFromRisk = maxRiskInr / (stopDistance * usdtRate);
        if (quantity > maxQtyFromRisk) {
          quantity = maxQtyFromRisk;
          allocatedBalance = (quantity * entryPrice) / actualLeverage;
        }
      }
      if (maxMarginInr > 0) {
        const maxAllocUsdt = maxMarginInr / usdtRate;
        if (allocatedBalance > maxAllocUsdt) {
          allocatedBalance = maxAllocUsdt;
          quantity = (allocatedBalance * actualLeverage) / entryPrice;
        }
      }
    }
    
    return {
      allocatedBalance,
      quantity,
      actualLeverage
    };
  }

  public calculateSlCalibratedPositionSize(
    accountEquity: number,
    entryPrice: number,
    stopPrice: number,
    direction: 'LONG' | 'SHORT',
    options?: {
      marginAllocationPct?: number; // % of total account margin to allocate (default 10)
      slPctOfAllocatedMargin?: number; // % of allocated margin risked at SL (default 100)
      maxLeverage?: number; // Max leverage cap (e.g. 50)
      minNotional?: number; // Minimum exchange order notional (e.g. 5.0 USDT)
      contractValue?: number;
      maintenanceMarginRate?: number;
      maxMarginInr?: number; // e.g. 200 RS
      maxRiskInr?: number; // e.g. 100 RS
      usdtToInrRate?: number;
      isMarginInr?: boolean;
    }
  ): { contracts: number; leverage: number; allocatedBalance: number; liquidationPrice: number; rejected: boolean; reason?: string } {
    if (!stopPrice || isNaN(stopPrice) || stopPrice <= 0) {
      return { contracts: 0, leverage: 1, allocatedBalance: 0, liquidationPrice: 0, rejected: true, reason: 'Valid stop price required for leverage calibration.' };
    }

    if (direction === 'LONG' && stopPrice >= entryPrice) {
      return { contracts: 0, leverage: 1, allocatedBalance: 0, liquidationPrice: 0, rejected: true, reason: `Inaccurate setup: Long stop price ($${stopPrice}) must be strictly below entry price ($${entryPrice}).` };
    }
    if (direction === 'SHORT' && stopPrice <= entryPrice) {
      return { contracts: 0, leverage: 1, allocatedBalance: 0, liquidationPrice: 0, rejected: true, reason: `Inaccurate setup: Short stop price ($${stopPrice}) must be strictly above entry price ($${entryPrice}).` };
    }

    const stopDistancePct = Math.abs(entryPrice - stopPrice) / entryPrice;
    if (stopDistancePct <= 0) {
      return { contracts: 0, leverage: 1, allocatedBalance: 0, liquidationPrice: 0, rejected: true, reason: 'Stop price identical to entry price.' };
    }

    const marginPct = (options?.marginAllocationPct !== undefined && options.marginAllocationPct > 0)
      ? options.marginAllocationPct
      : 10;
    const slRiskPct = (options?.slPctOfAllocatedMargin !== undefined && options.slPctOfAllocatedMargin > 0)
      ? options.slPctOfAllocatedMargin
      : 100;
    const maxLevCap = options?.maxLeverage !== undefined && options.maxLeverage > 0
      ? options.maxLeverage
      : 50;
    const minNotional = options?.minNotional || 5.0;
    const contractVal = options?.contractValue || 1;
    const mmr = options?.maintenanceMarginRate || 0.005;
    const usdtRate = options?.usdtToInrRate || 99.26;
    const maxMarginInr = options?.maxMarginInr !== undefined ? options.maxMarginInr : this.maxTradeMarginInr;
    const maxRiskInr = options?.maxRiskInr !== undefined ? options.maxRiskInr : this.maxRiskPerTradeInr;

    // Formula: Leverage = (slPctOfAllocatedMargin / 100) / stopDistancePct
    // e.g. With 100% SL risk and 2% stop distance: 1.0 / 0.02 = 50x leverage
    const rawLeverage = (slRiskPct / 100) / stopDistancePct;
    let targetLeverage = Math.max(1, Math.min(maxLevCap, Math.round(rawLeverage)));

    // Base Allocated Margin in USDT equivalent
    let allocatedMargin = accountEquity * (marginPct / 100);

    // Strictly enforce Max Margin Ceiling in INR (only when trading in INR margin, e.g. CoinDCX)
    if (options?.isMarginInr && this.enforceInrCapsInLive && maxMarginInr > 0) {
      const maxMarginUsdt = maxMarginInr / usdtRate;
      allocatedMargin = Math.min(allocatedMargin, maxMarginUsdt);
    }

    let notional = allocatedMargin * targetLeverage;

    // Strictly enforce Max Risk Ceiling in INR (only when trading in INR margin, e.g. CoinDCX)
    if (options?.isMarginInr && this.enforceInrCapsInLive && maxRiskInr > 0 && stopDistancePct > 0) {
      const maxNotionalFromRiskUsdt = (maxRiskInr / usdtRate) / stopDistancePct;
      if (notional > maxNotionalFromRiskUsdt) {
        notional = maxNotionalFromRiskUsdt;
        allocatedMargin = notional / targetLeverage;
      }
    }

    // Ensure notional >= minNotional (Exchange minimum order notional)
    if (notional < minNotional) {
      const maxMarginUsdt = (options?.isMarginInr && this.enforceInrCapsInLive && maxMarginInr > 0) ? (maxMarginInr / usdtRate) : allocatedMargin;
      const neededLev = Math.ceil(minNotional / maxMarginUsdt);
      if (neededLev <= maxLevCap) {
        targetLeverage = Math.max(targetLeverage, neededLev);
        allocatedMargin = Math.min(accountEquity, minNotional / targetLeverage);
        notional = allocatedMargin * targetLeverage;
      } else {
        // Even at maximum leverage cap, meeting minNotional requires more margin than maxMarginInr
        if (options?.isMarginInr && this.enforceInrCapsInLive && maxMarginInr > 0) {
          const minRequiredMarginInr = (minNotional / maxLevCap) * usdtRate;
          return {
            contracts: 0,
            leverage: maxLevCap,
            allocatedBalance: 0,
            liquidationPrice: 0,
            rejected: true,
            reason: `Minimum order notional ($${minNotional.toFixed(1)} / ₹${(minNotional * usdtRate).toFixed(1)}) requires ₹${minRequiredMarginInr.toFixed(1)} margin at max ${maxLevCap}x leverage, exceeding your ₹${maxMarginInr} threshold.`
          };
        } else {
          return {
            contracts: 0,
            leverage: maxLevCap,
            allocatedBalance: 0,
            liquidationPrice: 0,
            rejected: true,
            reason: `Minimum order notional ($${minNotional.toFixed(1)}) requires more margin ($${(minNotional / maxLevCap).toFixed(2)}) than available allocation.`
          };
        }
      }
    }

    // Final safety clamp: guarantee margin does not exceed maxMarginInr when trading in INR
    if (options?.isMarginInr && this.enforceInrCapsInLive && maxMarginInr > 0) {
      const maxMarginUsdt = maxMarginInr / usdtRate;
      if (allocatedMargin > maxMarginUsdt) {
        allocatedMargin = maxMarginUsdt;
        notional = allocatedMargin * targetLeverage;
      }
    }

    const contracts = parseFloat(((notional / entryPrice) / contractVal).toFixed(4));
    if (contracts <= 0) {
      return { contracts: 0, leverage: targetLeverage, allocatedBalance: 0, liquidationPrice: 0, rejected: true, reason: 'Position size rounds to 0 contracts.' };
    }

    const liqDistancePct = Math.max(0, 1 / targetLeverage - mmr);
    const liqPrice = direction === 'LONG' ? entryPrice * (1 - liqDistancePct) : entryPrice * (1 + liqDistancePct);

    return {
      contracts,
      leverage: targetLeverage,
      allocatedBalance: allocatedMargin,
      liquidationPrice: liqPrice,
      rejected: false
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
      maxMarginInr?: number;
      maxRiskInr?: number;
      usdtToInrRate?: number;
      isMarginInr?: boolean;
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
    const usdtRate = spec?.usdtToInrRate || 99.26;
    const maxMarginInr = spec?.maxMarginInr !== undefined ? spec.maxMarginInr : this.maxTradeMarginInr;
    const maxRiskInr = spec?.maxRiskInr !== undefined ? spec.maxRiskInr : this.maxRiskPerTradeInr;

    // Hard Caps for Risk Filtering
    const maxAccountExposureMult = spec?.maxAccountExposureMultiplier || this.maxAccountExposureMultiplier;

    let desiredNotional = (accountEquity * riskPercent) / stopDistancePct;

    // Strictly enforce Max Risk In INR (only when trading in INR margin, e.g. CoinDCX)
    if (spec?.isMarginInr && this.enforceInrCapsInLive && maxRiskInr > 0) {
      const maxNotionalFromRisk = (maxRiskInr / usdtRate) / stopDistancePct;
      if (desiredNotional > maxNotionalFromRisk) {
        desiredNotional = maxNotionalFromRisk;
      }
    }

    // Apply Notional Cap
    const maxNotional = accountEquity * maxAccountExposureMult;
    if (desiredNotional > maxNotional) {
        desiredNotional = maxNotional;
    }

    // Determine max single position allocation
    let maxAllocation = spec?.maxAllocation !== undefined && spec.maxAllocation > 0
      ? spec.maxAllocation
      : (accountEquity * this.maxExposurePct);

    // Strictly enforce Max Margin In INR (only when trading in INR margin, e.g. CoinDCX)
    if (spec?.isMarginInr && this.enforceInrCapsInLive && maxMarginInr > 0) {
      const maxAllocUsdt = maxMarginInr / usdtRate;
      maxAllocation = Math.min(maxAllocation, maxAllocUsdt);
    }

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

  public getMaxTradeMarginInr(): number {
    return this.maxTradeMarginInr || 200;
  }

  public getMaxRiskPerTradeInr(): number {
    return this.maxRiskPerTradeInr || 100;
  }

  public getEnforceInrCaps(): boolean {
    return this.enforceInrCapsInLive;
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

  public reset(balance: number = 0) {
    this.currentExposure = 0;
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.currentDrawdownPct = 0;
    this.tradesToday = 0;
    this.killSwitchActive = false;
    this.peakBalance = balance > 0 ? balance : 0;
  }

  public activateKillSwitch() {
    this.killSwitchActive = true;
  }

  public setKillSwitch(active: boolean) {
    this.killSwitchActive = active;
  }

  public resetCircuitBreakers(balance: number = 0) {
    this.consecutiveLosses = 0;
    this.currentDailyLossPct = 0;
    this.currentDrawdownPct = 0;
    this.tradesToday = 0;
    this.killSwitchActive = false;
    this.peakBalance = balance > 0 ? balance : 0;
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
      postSlCooldownMinutes: this.postSlCooldownMinutes,
      antiWhipsawEnabled: this.antiWhipsawEnabled,
      maxConsecutiveLossesPerSymbol: this.maxConsecutiveLossesPerSymbol,
      consecutiveLossQuarantineMinutes: this.consecutiveLossQuarantineMinutes,
      correlationFilterEnabled: this.correlationFilterEnabled,
      maxCorrelation: this.maxCorrelation,
      btcMacroRegimeFilter: this.btcMacroRegimeFilter,
      enforceStrictSl: this.enforceStrictSl,
    };
  }
}

export const riskManager = new RiskManager();
