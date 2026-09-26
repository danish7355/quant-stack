// tests/strategies/core/riskManager.test.ts
import { applyRiskBuffer, computeRiskQualityScore } from "../../../src/utils/strategies/core/riskManager";

describe("applyRiskBuffer", () => {
  it("returns null when risk is zero", () => {
    expect(applyRiskBuffer(100, 100, 1, "long")).toBeNull();
  });

  it("returns null when risk is below ATR floor (0.15×ATR)", () => {
    // raw risk = 0.1 × ATR; buffer = 0.2 × ATR → adjusted sl moves stop further → risk = 0.3 * ATR > 0.15 * ATR
    // actually we need a case where riskPerUnit < 0.15 * atr
    // With atr = 10, entry = 100, rawSl = 99.9 (risk 0.1), buffer = 2 → adjustedSl = 97.9, risk = 2.1 → passes
    // Let's use entry=100, rawSl=99.99 (risk 0.01), buffer = 0 * 10 = 0, atr = 10
    const result = applyRiskBuffer(100, 99.99, 10, "long", { bufferMultiplier: 0 });
    // risk = 0.01, minRiskFloor = 0.15 * 10 = 1.5 → should be null
    expect(result).toBeNull();
  });

  it("pushes stop further away for LONG", () => {
    const atr = 2;
    const result = applyRiskBuffer(100, 98, atr, "long", { bufferMultiplier: 0.5, minRR: 1.0 });
    // buffer = 0.5 * 2 = 1; adjustedSl = 98 - 1 = 97
    expect(result).not.toBeNull();
    expect(result!.sl).toBeCloseTo(97);
    expect(result!.bufferApplied).toBeCloseTo(1);
  });

  it("pushes stop further away for SHORT", () => {
    const atr = 2;
    const result = applyRiskBuffer(100, 102, atr, "short", { bufferMultiplier: 0.5, minRR: 1.0 });
    // buffer = 1; adjustedSl = 102 + 1 = 103
    expect(result).not.toBeNull();
    expect(result!.sl).toBeCloseTo(103);
  });

  it("recalculates TPs so R-multiples are preserved", () => {
    const result = applyRiskBuffer(100, 98, 2, "long", {
      bufferMultiplier: 0,
      tp1RMultiple: 1,
      tp2RMultiple: 2,
      tp3RMultiple: 3,
      minRR: 1.0,
    });
    // risk = 2, tp1 = 102, tp2 = 104, tp3 = 106
    expect(result).not.toBeNull();
    expect(result!.tp1).toBeCloseTo(102);
    expect(result!.tp2).toBeCloseTo(104);
    expect(result!.tp3).toBeCloseTo(106);
    expect(result!.rr1).toBeCloseTo(1);
    expect(result!.rr2).toBeCloseTo(2);
  });

  it("rejects when RR is below minRR", () => {
    // With tp1Mult = 0.5 which is < minRR = 1.5
    const result = applyRiskBuffer(100, 98, 2, "long", {
      bufferMultiplier: 0,
      tp1RMultiple: 0.5,
      minRR: 1.5,
    });
    expect(result).toBeNull();
  });

  it("returns all required fields", () => {
    // risk = 5 (entry=100, sl=95), atr=2, buffer=0 → riskPerUnit=5 > 0.15*2=0.3 ✓; rr1=1.5 ≥ minRR=1.5 ✓
    const result = applyRiskBuffer(100, 95, 2, "long", { bufferMultiplier: 0, minRR: 1.0 })!;
    expect(result).toHaveProperty("entry");
    expect(result).toHaveProperty("sl");
    expect(result).toHaveProperty("tp1");
    expect(result).toHaveProperty("tp2");
    expect(result).toHaveProperty("tp3");
    expect(result).toHaveProperty("riskPerUnit");
    expect(result).toHaveProperty("rr1");
    expect(result).toHaveProperty("rr2");
    expect(result).toHaveProperty("bufferApplied");
  });
});

describe("computeRiskQualityScore", () => {
  it("returns 0 for RR below minRR", () => {
    expect(computeRiskQualityScore(1, 1.5)).toBe(0);
  });

  it("returns 100 for RR ≥ 4", () => {
    expect(computeRiskQualityScore(4, 1.5)).toBe(100);
  });

  it("returns intermediate value for mid-range RR", () => {
    const score = computeRiskQualityScore(2.75, 1.5);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
