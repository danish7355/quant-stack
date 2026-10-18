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

  it('allows entry after minor consecutive losses below threshold', () => {
    riskManager.recordTradeResult(-50, 10000);
    riskManager.recordTradeResult(-50, 10000);
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);
  });

  it('blocks entry when max consecutive losses reached', () => {
    riskManager.recordTradeResult(-50, 10000);
    riskManager.recordTradeResult(-50, 10000);
    riskManager.recordTradeResult(-50, 10000);
    riskManager.recordTradeResult(-50, 10000);
    
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });

  it('enforces dynamic risk sizing formula: contracts * |entry - sl| <= equity * riskPct', () => {
    const equity = 10000;
    const entry = 50000;
    const sl = 49000; // $1,000 risk per contract (2%)
    const riskPct = 0.015; // 1.5% = $150 risk
    const result = riskManager.calculateSafePositionSize(equity, entry, sl, 'LONG', { maxLeverage: 10 }, riskPct);
    expect(result.rejected).toBe(false);
    const actualDollarRisk = result.contracts * Math.abs(entry - sl);
    expect(actualDollarRisk).toBeLessThanOrEqual(equity * riskPct + 0.01);
  });

  it('blocks entry when kill switch active', () => {
    riskManager.activateKillSwitch();
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });
});
