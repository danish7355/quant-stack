// tests/strategies/core/positionSizer.test.ts
import { computePositionSize, AccountState, SizingSettings } from "../../../src/utils/strategies/core/positionSizer";

function makeAccount(overrides: Partial<AccountState> = {}): AccountState {
  return {
    equity: 100_000,
    sessionPnl: 0,
    openPositions: 0,
    totalOpenNotional: 0,
    killSwitchActive: false,
    ...overrides,
  };
}

const settings: SizingSettings = {
  riskFraction: 0.01,  // 1%
  maxQty: 1000,
  maxNotional: 50_000,
  maxOpenPositions: 5,
  dailyLossLimitFraction: 0.03,
};

describe("computePositionSize", () => {
  it("blocks when kill switch is active", () => {
    const r = computePositionSize(100, 2, makeAccount({ killSwitchActive: true }), settings);
    expect(r.quantity).toBe(0);
    expect(r.capReason).toBe("kill_switch_active");
  });

  it("blocks when daily loss limit is hit", () => {
    const r = computePositionSize(100, 2, makeAccount({ sessionPnl: -4000 }), settings);
    expect(r.quantity).toBe(0);
    expect(r.capReason).toBe("daily_loss_limit_hit");
  });

  it("blocks when max open positions reached", () => {
    const r = computePositionSize(100, 2, makeAccount({ openPositions: 5 }), settings);
    expect(r.quantity).toBe(0);
    expect(r.capReason).toBe("max_open_positions");
  });

  it("computes correct base quantity", () => {
    // equity = 100k, riskFraction = 0.01 → riskAmount = 1000, riskPerUnit = 2 → qty = 500
    const r = computePositionSize(100, 2, makeAccount(), settings);
    expect(r.quantity).toBeCloseTo(500);
  });

  it("caps at maxQty", () => {
    const r = computePositionSize(100, 0.1, makeAccount(), { ...settings, maxQty: 100 });
    expect(r.quantity).toBe(100);
    expect(r.capReason).toBe("max_qty");
  });

  it("caps at maxNotional", () => {
    // qty * entry > maxNotional → reduced
    const r = computePositionSize(100, 0.5, makeAccount(), { ...settings, maxNotional: 10_000 });
    expect(r.notional).toBeLessThanOrEqual(10_001);
  });

  it("returns quantity 0 for invalid riskPerUnit", () => {
    const r = computePositionSize(100, 0, makeAccount(), settings);
    expect(r.quantity).toBe(0);
  });
});
