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

  it('allows entry after consecutive losses since cooldown risk management is removed', () => {
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    riskManager.recordTradeResult(-100, 10000);
    
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(true);
  });

  it('blocks entry when kill switch active', () => {
    riskManager.activateKillSwitch();
    expect(riskManager.checkEntryAllowed(10000, 200, 0).allowed).toBe(false);
  });
});
