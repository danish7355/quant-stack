import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager } from '../../server/services/RiskManager';

describe('RiskManager', () => {
  let riskManager: RiskManager;
  
  beforeEach(() => {
    riskManager = new RiskManager();
  });

  it('calculates position size correctly', () => {
    const { allocatedBalance, quantity, actualLeverage } = riskManager.calculatePositionSize(10000, 2, 10, 50000);
    expect(allocatedBalance).toBe(200); // 2% of 10k
    expect(actualLeverage).toBe(10);
    expect(quantity).toBe((200 * 10) / 50000); // 0.04
  });

  it('blocks entry after max consecutive losses', () => {
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });

  it('blocks entry when kill switch active', () => {
    riskManager.activateKillSwitch();
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });

  it('blocks entry when position count reaches maxSimultaneousTrades (default 10)', () => {
    // 9 positions allowed
    expect(riskManager.checkEntryAllowed(10000, 200, 9).allowed).toBe(true);
    // 10 positions blocked
    const check = riskManager.checkEntryAllowed(10000, 200, 10);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Max simultaneous positions (10) reached');
  });

  it('allows user to customize maxSimultaneousTrades via updateSettings', () => {
    // Set custom limit to 15 positions
    riskManager.updateSettings(undefined, undefined, undefined, 15);
    expect(riskManager.getMaxSimultaneousTrades()).toBe(15);
    
    // 12 positions is now allowed
    expect(riskManager.checkEntryAllowed(10000, 200, 12).allowed).toBe(true);
    // 15 positions is blocked
    expect(riskManager.checkEntryAllowed(10000, 200, 15).allowed).toBe(false);
  });

  it('allows user to modify and bypass max positions limit entirely via bypassMaxPositions', () => {
    // Set bypass to true
    riskManager.updateSettings(undefined, undefined, undefined, undefined, true);
    expect(riskManager.isBypassMaxPositions()).toBe(true);

    // Even with 5, 10, or 50 existing positions, entry is NOT blocked for position count
    const check5 = riskManager.checkEntryAllowed(100000, 200, 5);
    expect(check5.allowed).toBe(true);

    const check10 = riskManager.checkEntryAllowed(100000, 200, 10);
    expect(check10.allowed).toBe(true);

    const check50 = riskManager.checkEntryAllowed(100000, 200, 50);
    expect(check50.allowed).toBe(true);

    // Toggling bypass back to false restores the ceiling
    riskManager.setBypassMaxPositions(false);
    expect(riskManager.checkEntryAllowed(100000, 200, 10).allowed).toBe(false);
  });

  it('allows user to customize maxConsecutiveLosses via updateSettings', () => {
    // Set custom consecutive losses limit to 6
    riskManager.updateSettings(undefined, 6);
    expect(riskManager.getMaxConsecutiveLosses()).toBe(6);

    // Record 5 losses
    for (let i = 0; i < 5; i++) {
      riskManager.recordTradeResult(-10, 10000);
    }
    // 5 losses is allowed under limit of 6
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);

    // 6th loss hits the limit
    riskManager.recordTradeResult(-10, 10000);
    const check = riskManager.checkEntryAllowed(10000, 200, 0);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Max consecutive losses (6) reached');
  });

  it('allows user to bypass consecutive losses limit via bypassMaxConsecutiveLosses', () => {
    // Record 4 losses (default limit is 4)
    for (let i = 0; i < 4; i++) {
      riskManager.recordTradeResult(-10, 10000);
    }
    // Initially blocked at default 4
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);

    // Enable bypass
    riskManager.updateSettings(undefined, undefined, undefined, undefined, undefined, true);
    expect(riskManager.isBypassMaxConsecutiveLosses()).toBe(true);

    // Entry is now allowed despite losing streak
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);

    // Disabling bypass re-enforces the check
    riskManager.setBypassMaxConsecutiveLosses(false);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });

  it('allows resetting consecutive loss streak on demand', () => {
    // Record 4 losses
    for (let i = 0; i < 4; i++) {
      riskManager.recordTradeResult(-10, 10000);
    }
    expect(riskManager.getConsecutiveLosses()).toBe(4);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);

    // Reset streak
    riskManager.resetConsecutiveLosses();
    expect(riskManager.getConsecutiveLosses()).toBe(0);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);
  });

  it('blocks entry when daily loss limit is hit, and allows bypass via bypassDailyLossLimit', () => {
    // Default daily loss limit is -3%
    riskManager.recordTradeResult(-400, 10000); // -4% daily loss
    const check1 = riskManager.checkEntryAllowed(10000, 200, 0);
    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain('Daily loss limit reached');

    // Enable bypass
    riskManager.setBypassDailyLossLimit(true);
    expect(riskManager.isBypassDailyLossLimit()).toBe(true);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);

    // Reset daily loss stats
    riskManager.setBypassDailyLossLimit(false);
    riskManager.resetDailyLoss();
    expect(riskManager.getDailyLossPct()).toBe(0);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);
  });

  it('allows customizing and bypassing total portfolio exposure limit', () => {
    // Fill up exposure to 100% (10,000)
    riskManager.updateCurrentExposure(10000);
    
    // Additional 500 allocation is blocked (proposed exposure 105%)
    const checkBlocked = riskManager.checkEntryAllowed(10000, 500, 1);
    expect(checkBlocked.allowed).toBe(false);
    expect(checkBlocked.reason).toContain('Exposure limit exceeded');

    // Bypass exposure limit
    riskManager.setBypassExposureLimit(true);
    expect(riskManager.isBypassExposureLimit()).toBe(true);
    expect(riskManager.checkEntryAllowed(10000, 500, 1).allowed).toBe(true);

    // Can also expand max exposure to 200%
    riskManager.setBypassExposureLimit(false);
    riskManager.setMaxExposurePct(200);
    expect(riskManager.getMaxExposurePct()).toBe(2.0);
    expect(riskManager.checkEntryAllowed(10000, 500, 1).allowed).toBe(true);
  });

  it('allows user to bypass liquidation safety buffer and fallback to 1x leverage', () => {
    // Wide stop: Entry 100, Stop 20 (80% stop distance)
    const strictResult = riskManager.calculateSafePositionSize(
      10000,
      100,
      20, // 80% stop distance
      'LONG',
      { maxLeverage: 10, maxAllocation: 1000 },
      0.02
    );
    // Buffer = 0.995 / 0.8 = 1.24 < 1.3 -> rejected under default 1.3
    expect(strictResult.rejected).toBe(true);
    expect(strictResult.reason).toContain('Stop distance too wide to leverage safely');

    // Enable bypass liquidation buffer
    riskManager.setBypassLiquidationBuffer(true);
    const bypassedResult = riskManager.calculateSafePositionSize(
      10000,
      100,
      20,
      'LONG',
      { maxLeverage: 10, maxAllocation: 1000 },
      0.02
    );
    expect(bypassedResult.rejected).toBe(false);
    expect(bypassedResult.leverage).toBe(1);
    expect(bypassedResult.contracts).toBeGreaterThan(0);
  });

  it('allows fractional contracts so high-priced coins are not rejected with rounds to 0 contracts', () => {
    // High-priced coin: $60,000 entry, $59,000 stop (1.66% stop)
    // Small account $500, 1% risk ($5) -> desired notional $300 -> 300 / 60000 = 0.005 BTC
    const result = riskManager.calculateSafePositionSize(
      500,
      60000,
      59000,
      'LONG',
      { maxLeverage: 5, maxAllocation: 100, allowFractional: true },
      0.01
    );
    expect(result.rejected).toBe(false);
    expect(result.contracts).toBe(0.005);
    expect(result.allocatedBalance).toBeGreaterThan(0);
  });

  it('allows emergency kill switch to be engaged and disengaged', () => {
    expect(riskManager.isKillSwitchActive()).toBe(false);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);

    riskManager.activateKillSwitch();
    expect(riskManager.isKillSwitchActive()).toBe(true);
    const blocked = riskManager.checkEntryAllowed(10000, 200, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Kill switch is active');

    riskManager.deactivateKillSwitch();
    expect(riskManager.isKillSwitchActive()).toBe(false);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);
  });
});
