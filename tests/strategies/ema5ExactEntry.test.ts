// tests/strategies/ema5ExactEntry.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for EMA 5 EXACT PRICE ACTION ENTRY (EMA5_EXACT_ENTRY_V1)
// Covers all 10 acceptance test cases mandated in Section 46.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  evaluateEma5ExactEntry,
  detectExactEMA5Setup,
  createEeeState,
  determine15mStructure,
  backtestEma5ExactEntry,
  EeeCandle,
} from '../../src/utils/strategies/ema5ExactEntry.js';

// Helper to create synthetic 5m candles
function generate5mCandles(count: number, basePrice = 100, trend: 'up' | 'down' | 'flat' = 'up'): EeeCandle[] {
  const candles: EeeCandle[] = [];
  let price = basePrice;
  const now = 1700000000000;

  for (let i = 0; i < count; i++) {
    const time = now + i * 300 * 1000;
    const delta = trend === 'up' ? 0.2 : trend === 'down' ? -0.2 : 0;
    price += delta;
    const open = price - 0.1;
    const close = price + 0.1;
    const high = price + 0.3;
    const low = price - 0.3;
    const volume = 1000;

    candles.push({ time, open, high, low, close, volume });
  }

  return candles;
}

// Helper to generate 15m candles with specific structure
function generate15mCandles(regime: 'BULLISH' | 'BEARISH' | 'NEUTRAL', count = 25): EeeCandle[] {
  const candles: EeeCandle[] = [];
  let price = 100;
  const now = 1700000000000;

  for (let i = 0; i < count; i++) {
    const time = now + i * 900 * 1000;
    let step = 0;
    if (regime === 'BULLISH') {
      step = 0.4; // Clear higher highs and higher lows
    } else if (regime === 'BEARISH') {
      step = -0.4; // Clear lower highs and lower lows
    } else {
      step = i % 2 === 0 ? 0.3 : -0.3; // Oscillating / ranging
    }

    price += step;
    candles.push({
      time,
      open: price - 0.2,
      close: price + 0.2,
      high: price + 0.5,
      low: price - 0.5,
      volume: 5000,
    });
  }

  return candles;
}

describe('EMA 5 Exact Price Action Entry (EMA5_EXACT_ENTRY_V1)', () => {
  // ── TEST 1: Exact marked EMA5 setup + bullish regime + acceptable volume → MUST ENTER LONG ──
  it('TEST 1: Exact marked EMA5 setup + bullish regime + acceptable volume MUST ENTER LONG', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    // Craft exact setup candle:
    // EMA 5 will be around 106.7. Candle opens at 106.7, dips to 106.5 (rejection of EMA5), closes at 107.2 (bullish body >= 50%, upper 60%).
    const lastIdx = candles5m.length - 1;
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 106.4,
      high: 106.9,
      low: 106.3,
      close: 106.7,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5, // Interacted with EMA 5 via rejection wick
      close: 107.2, // Strong bullish close
      volume: 1500, // Volume ratio 1.5x > 1.05
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, { debugMode: false }, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('LONG');
    expect(signal?.rejectionReason).toBeNull();
    expect(signal?.entryPrice).toBe(107.2);
    expect(signal?.sl).toBeLessThan(107.2);
    expect(signal?.tp1).toBeGreaterThan(107.2);
    expect(signal?.tp2).toBeGreaterThan(signal?.tp1 || 0);
  });

  // ── TEST 2: Exact marked EMA5 setup + bearish regime → MUST NOT ENTER LONG ──
  it('TEST 2: Exact marked EMA5 setup + bearish regime MUST NOT ENTER LONG (REGIME_MISMATCH)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BEARISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 106.4,
      high: 106.9,
      low: 106.3,
      close: 106.7,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5,
      close: 107.2,
      volume: 1500,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.rejectionReason).toBe('REGIME_MISMATCH');
  });

  // ── TEST 3: Simple EMA5 crossover without the marked price action → MUST NOT ENTER ──
  it('TEST 3: Simple EMA5 crossover without marked price action MUST NOT ENTER', () => {
    const candles5m = generate5mCandles(35, 100, 'flat');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // Tiny candle with small body (body ratio < 0.50) that merely straddles EMA5
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 99.95,
      high: 100.5,
      low: 99.5,
      close: 100.05, // Tiny body: 0.1 on 1.0 range (10% body)
      volume: 1500,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    // Should return null (Stage A rejects)
    expect(signal).toBeNull();
  });

  // ── TEST 4: Correct price action but very low volume → MUST FILTER ──
  it('TEST 4: Correct price action but very low volume MUST FILTER (LOW_VOLUME)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 106.4,
      high: 106.9,
      low: 106.3,
      close: 106.7,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5,
      close: 107.2,
      volume: 200, // Very low volume (prior average is 1000)
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.rejectionReason).toBe('LOW_VOLUME');
  });

  // ── TEST 5: Correct setup but highly extended price → MUST FILTER ──
  it('TEST 5: Correct setup but highly extended price MUST FILTER (OVEREXTENDED)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // Giant candle that is 5x the normal 5-bar range (0.6)
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.5,
      high: 112.0, // Range = 5.5
      low: 106.5,
      close: 111.5,
      volume: 2000,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.rejectionReason).toBe('OVEREXTENDED');
  });

  // ── TEST 6: Correct setup inside obvious sideways/choppy EMA5 conditions → MUST FILTER ──
  it('TEST 6: Correct setup inside choppy EMA5 conditions MUST FILTER (CHOPPY_MARKET)', () => {
    const candles5m = generate5mCandles(35, 100, 'flat');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // Create alternating zigzag in last 10 candles so EMA 5 crossings > 3
    for (let i = lastIdx - 10; i < lastIdx; i++) {
      const isEven = i % 2 === 0;
      candles5m[i].open = isEven ? 101.5 : 98.5;
      candles5m[i].close = isEven ? 101.8 : 98.2;
      candles5m[i].high = isEven ? 102.0 : 99.0;
      candles5m[i].low = isEven ? 101.0 : 98.0;
    }

    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 99.9,
      high: 100.8,
      low: 99.5,
      close: 100.7,
      volume: 1500,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, { maxEmaCrosses: 3 }, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.rejectionReason).toBe('CHOPPY_MARKET');
  });

  // ── TEST 7: Correct setup but stop is excessively large → MUST FILTER ──
  it('TEST 7: Correct setup but stop is excessively large MUST FILTER (STOP_TOO_LARGE)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // Average 5-bar range is around 0.6. Create an abnormally deep prior wick making setup swing low far away
    candles5m[lastIdx - 1].low = 90.0; // 17 points away!

    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5,
      close: 107.4,
      volume: 1500,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.rejectionReason).toBe('STOP_TOO_LARGE');
  });

  // ── TEST 8: Same setup candle processed twice → MUST NOT create duplicate order ──
  it('TEST 8: Same setup candle processed twice MUST NOT create duplicate order (DUPLICATE_SIGNAL)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 106.4,
      high: 106.9,
      low: 106.3,
      close: 106.7,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5,
      close: 107.2,
      volume: 1500,
    };

    // First call: succeeds
    const signal1 = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'ETHUSDT');
    expect(signal1).not.toBeNull();
    expect(signal1?.rejectionReason).toBeNull();

    // Second call on identical candle time: rejected as duplicate
    const signal2 = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'ETHUSDT');
    expect(signal2).not.toBeNull();
    expect(signal2?.rejectionReason).toBe('DUPLICATE_SIGNAL');
  });

  // ── TEST 9: Correct setup occurs and then price moves far away before execution → MUST NOT enter late ──
  it('TEST 9: Price far away from EMA5 MUST NOT enter late (EMA_DISTANCE_TOO_LARGE)', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // EMA 5 is ~106.8. If close is 108.8, distance is 2.0 (well above average range 0.6)
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 108.0,
      high: 108.9,
      low: 107.9,
      close: 108.8,
      volume: 1500,
    };

    const setup = detectExactEMA5Setup(candles5m, { maxEmaDistanceRatio: 1.0 });
    // Distance too large -> rejected in Stage A
    expect(setup).toBeNull();
  });

  // ── TEST 10: Correct setup on one symbol MUST NOT affect another symbol ──
  it('TEST 10: State is isolated per symbol', () => {
    const candles5m = generate5mCandles(35, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 25);

    const stateSOL = createEeeState();
    const stateBNB = createEeeState();

    const lastIdx = candles5m.length - 1;
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 106.4,
      high: 106.9,
      low: 106.3,
      close: 106.7,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 106.7,
      high: 107.5,
      low: 106.5,
      close: 107.2,
      volume: 1500,
    };

    // Trade on SOL
    const sigSOL = evaluateEma5ExactEntry(candles5m, candles15m, {}, stateSOL, 'SOLUSDT');
    expect(sigSOL?.rejectionReason).toBeNull();
    expect(stateSOL.state).toBe('ENTRY_READY');

    // BNB state remains fresh IDLE
    expect(stateBNB.state).toBe('IDLE');
    expect(stateBNB.lastTradedCandleTime).toBe(0);
  });

  // ── SHORT Setup Verification ──
  it('verifies exact SHORT setup triggers when 15m structure is bearish', () => {
    const candles5m = generate5mCandles(35, 100, 'down');
    const candles15m = generate15mCandles('BEARISH', 25);
    const state = createEeeState();

    const lastIdx = candles5m.length - 1;
    // EMA 5 is around 93.2. Candle tests EMA 5 with upper wick and closes firmly down
    candles5m[lastIdx - 1] = {
      time: 1700000000000 + (lastIdx - 1) * 300000,
      open: 93.6,
      high: 93.7,
      low: 93.1,
      close: 93.3,
      volume: 1000,
    };
    candles5m[lastIdx] = {
      time: 1700000000000 + lastIdx * 300000,
      open: 93.3,
      high: 93.5, // Tested EMA 5
      low: 92.5,
      close: 92.8, // Bearish body >= 50%, lower 60%
      volume: 1600,
    };

    const signal = evaluateEma5ExactEntry(candles5m, candles15m, {}, state, 'BTCUSDT');

    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe('SHORT');
    expect(signal?.rejectionReason).toBeNull();
    expect(signal?.entryPrice).toBe(92.8);
    expect(signal?.sl).toBeGreaterThan(92.8);
    expect(signal?.tp1).toBeLessThan(92.8);
  });

  // ── Backtest Funnel Accounting ──
  it('runs backtest and reports filter funnel breakdown', () => {
    const candles5m = generate5mCandles(100, 100, 'up');
    const candles15m = generate15mCandles('BULLISH', 40);

    const summary = backtestEma5ExactEntry(candles5m, candles15m, {}, 'BTCUSDT');

    expect(summary).toBeDefined();
    expect(summary.funnel.totalBars).toBe(100);
    expect(typeof summary.winRatePct).toBe('number');
    expect(typeof summary.profitFactor).toBe('number');
    expect(typeof summary.netPnLR).toBe('number');
    expect(summary.funnel.rejectionCounts).toBeDefined();
  });
});
