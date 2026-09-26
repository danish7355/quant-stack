// tests/strategies/core/signalValidator.test.ts
import { clearSignalDedup, validateSignal } from "../../../src/utils/strategies/core/signalValidator";
import { StrategySignal } from "../../../src/utils/strategies/core/StrategySignal";
import { MarketContext } from "../../../src/utils/strategies/core/StrategySignal";

function makeSignal(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    signalId: "NIFTY:5m:emaGap:long:1720000000000",
    direction: "long",
    entry: 100,
    sl: 98,
    tp1: 102,
    tp2: 103,
    riskPerUnit: 2,
    rr1: 1,
    rr2: 1.5,
    bufferApplied: 0.4,
    setupScore: 80,
    regimeConfidence: 70,
    riskQualityScore: 60,
    strategy: "emaGapPullback",
    reason: "5 EMA gap pullback",
    candleTime: 1720000000000,
    atr: 2,
    rejectionReason: null,
    ...overrides,
  };
}

function makeContext(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    regime: "trend",
    trendDirection: "bullish",
    volatility: "normal",
    confidence: 70,
    htfAgreement: true,
    ...overrides,
  };
}

beforeEach(() => clearSignalDedup());

describe("validateSignal", () => {
  it("accepts a valid signal", () => {
    const result = validateSignal(makeSignal(), makeContext());
    expect(result.isValid).toBe(true);
    expect(result.rejectionReason).toBeNull();
  });

  it("rejects duplicate signalId", () => {
    const sig = makeSignal();
    const ctx = makeContext();
    validateSignal(sig, ctx); // first – accepted
    const second = validateSignal(sig, ctx); // duplicate
    expect(second.isValid).toBe(false);
    expect(second.rejectionReason).toContain("duplicate");
  });

  it("rejects on regime mismatch", () => {
    const result = validateSignal(
      makeSignal(),
      makeContext({ regime: "range" }),
      { allowedRegimes: ["trend"] }
    );
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("regime_mismatch");
  });

  it("rejects when HTF agreement required but absent", () => {
    const result = validateSignal(
      makeSignal(),
      makeContext({ htfAgreement: false }),
      { requireHtfAgreement: true }
    );
    expect(result.isValid).toBe(false);
  });

  it("rejects for non-finite entry", () => {
    const result = validateSignal(
      makeSignal({ entry: NaN }),
      makeContext()
    );
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toBe("non_finite_levels");
  });

  it("rejects for non-positive risk", () => {
    const result = validateSignal(
      makeSignal({ riskPerUnit: 0 }),
      makeContext()
    );
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toBe("non_positive_risk");
  });

  it("attaches a compositeScore", () => {
    const result = validateSignal(makeSignal(), makeContext());
    expect(result.compositeScore).toBeGreaterThan(0);
  });
});
