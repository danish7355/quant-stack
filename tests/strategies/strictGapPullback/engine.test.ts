// tests/strategies/strictGapPullback/engine.test.ts
import { evaluateStrictGapPullback } from "../../../src/utils/strategies/strictGapPullback/engine";
import { formatSignalOutput } from "../../../src/utils/strategies/strictGapPullback/formatter";
import { Candle } from "../../../src/utils/strategies/strictGapPullback/types";

function risingCandles(n: number, start: number, step: number, vol = 1000): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return { time: i * 900_000, open: c - step * 0.1, high: c + step * 0.3, low: c - step * 0.1, close: c, volume: vol };
  });
}

function fallingCandles(n: number, start: number, step: number, vol = 1000): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start - i * step;
    return { time: i * 900_000, open: c + step * 0.1, high: c + step * 0.1, low: c - step * 0.3, close: c, volume: vol };
  });
}

function flatCandles(n: number, mid: number, vol = 500): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i * 900_000, open: mid, high: mid + 0.5, low: mid - 0.5, close: mid, volume: vol,
  }));
}

describe("evaluateStrictGapPullback — engine integration", () => {
  it("returns NO_TRADE when BTC is choppy", () => {
    const btc1h = flatCandles(100, 50000);
    const btc4h = flatCandles(60, 50000);
    const coin15m = risingCandles(80, 1.0, 0.01);
    const coin1h = risingCandles(120, 1.0, 0.01);
    const coin4h = risingCandles(60, 1.0, 0.04);

    const result = evaluateStrictGapPullback({
      coin: "ETHUSDT", candles15m: coin15m, coin1h, coin4h,
      btc1h, btc4h, accountEquity: 10000,
    });

    expect(result.status).toBe("NO_TRADE");
    if (result.status === "NO_TRADE") {
      expect(result.failedGate).toBe("Market Regime");
    }
  });

  it("returns NO_TRADE when coin is bearish but BTC is bullish (LONG attempt)", () => {
    const btc1h = risingCandles(120, 50000, 20);
    const btc4h = risingCandles(60, 50000, 80);
    const coin1h = fallingCandles(120, 2.0, 0.01);
    const coin4h = fallingCandles(60, 2.0, 0.04);
    const coin15m = fallingCandles(80, 2.0, 0.005);

    const result = evaluateStrictGapPullback({
      coin: "ALTUSDT", candles15m: coin15m, coin1h, coin4h,
      btc1h, btc4h, accountEquity: 10000,
    });

    expect(result.status).toBe("NO_TRADE");
    if (result.status === "NO_TRADE") {
      expect(result.failedGate).toBe("Coin Regime");
    }
  });

  it("always returns either NO_TRADE or a complete ValidSignal shape", () => {
    const btc1h = risingCandles(120, 50000, 20);
    const btc4h = risingCandles(60, 50000, 80);
    const coin1h = risingCandles(120, 1.0, 0.01);
    const coin4h = risingCandles(60, 1.0, 0.04);
    const coin15m = risingCandles(80, 1.0, 0.005);

    const result = evaluateStrictGapPullback({
      coin: "SOLUSDT", candles15m: coin15m, coin1h, coin4h,
      btc1h, btc4h, accountEquity: 10000,
    });

    if (result.status === "NO_TRADE") {
      expect(result).toHaveProperty("failedGate");
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("whatIsRequiredNext");
    } else {
      expect(result).toHaveProperty("entryZone");
      expect(result).toHaveProperty("stopLoss");
      expect(result).toHaveProperty("tpFinal");
      expect(result).toHaveProperty("confidence");
      expect(["A", "B"]).toContain(result.confidence);
    }
  });

  it("formatSignalOutput produces non-empty text for NO_TRADE", () => {
    const btc1h = flatCandles(100, 50000);
    const btc4h = flatCandles(60, 50000);
    const coin15m = risingCandles(80, 1.0, 0.01);
    const coin1h = risingCandles(120, 1.0, 0.01);
    const coin4h = risingCandles(60, 1.0, 0.04);

    const result = evaluateStrictGapPullback({
      coin: "DOTUSDT", candles15m: coin15m, coin1h, coin4h,
      btc1h, btc4h, accountEquity: 10000,
    });

    const text = formatSignalOutput(result);
    expect(text).toContain("STATUS: NO TRADE");
    expect(text).toContain("DOTUSDT");
    expect(text).toContain("FAILED GATE:");
    expect(text).toContain("WHAT IS REQUIRED NEXT:");
  });
});
