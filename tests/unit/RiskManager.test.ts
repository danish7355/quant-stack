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
});
