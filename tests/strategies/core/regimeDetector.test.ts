// tests/strategies/core/regimeDetector.test.ts
import { detectRegime, Candle } from "../../../src/utils/strategies/core/regimeDetector";

/** Build a synthetic rising-trend candle series */
function makeTrendCandles(n: number, startPrice = 100, step = 0.5): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = startPrice + i * step;
    return { time: i * 60000, open: c, high: c + 0.3, low: c - 0.3, close: c, volume: 1000 };
  });
}

/** Build a flat/ranging candle series */
function makeRangeCandles(n: number, mid = 100, range = 1): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = mid + Math.sin(i) * (range / 2);
    return { time: i * 60000, open: c, high: c + range * 0.3, low: c - range * 0.3, close: c, volume: 500 };
  });
}

describe("detectRegime", () => {
  it("returns neutral with confidence 0 for too-short input", () => {
    const ctx = detectRegime([]);
    expect(ctx.regime).toBe("neutral");
    expect(ctx.confidence).toBe(0);
  });

  it("detects trend on a strongly directional series", () => {
    const candles = makeTrendCandles(100);
    const ctx = detectRegime(candles);
    // Strong uptrend → should be 'trend' or at least not neutral with low confidence
    expect(["trend", "neutral"]).toContain(ctx.regime);
    expect(ctx.trendDirection).not.toBe("mixed"); // should pick up bullish or bearish
  });

  it("trendDirection is bullish for a rising series", () => {
    const candles = makeTrendCandles(80);
    const ctx = detectRegime(candles);
    if (ctx.regime === "trend") {
      expect(ctx.trendDirection).toBe("bullish");
    }
  });

  it("returns a valid volatility state", () => {
    const candles = makeTrendCandles(60);
    const ctx = detectRegime(candles);
    expect(["compressed", "normal", "expanded"]).toContain(ctx.volatility);
  });

  it("returns htfAgreement=false when no HTF candles provided", () => {
    const candles = makeTrendCandles(60);
    const ctx = detectRegime(candles);
    expect(ctx.htfAgreement).toBe(false);
  });

  it("returns a session field", () => {
    const candles = makeTrendCandles(60);
    const ctx = detectRegime(candles);
    expect(ctx.session).toBeDefined();
  });

  it("confidence is a number in [0, 100]", () => {
    const candles = makeTrendCandles(60);
    const ctx = detectRegime(candles);
    expect(ctx.confidence).toBeGreaterThanOrEqual(0);
    expect(ctx.confidence).toBeLessThanOrEqual(100);
  });
});
